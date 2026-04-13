import fs from "fs";

import * as anchor from "@coral-xyz/anchor";
import {
    Connection,
    Keypair,
} from "@solana/web3.js";

import "dotenv/config";

import { Command } from "commander-ts";

import { getWhitelistStatus } from "./api-functions/get-whitelist-status";
import { TreasuryConfig } from "./interfaces";
import { getTresasuryConfig } from "./api-functions/get-treasury-config";
import { SOLANA_MOCK_SYMBOL, USDM1_TOKEN_CODE } from "./consts";
import { getBalance } from "./api-functions/get-balance";
import { faucet } from "./api-functions/faucet";
import { getOperation } from "./api-functions/operations";
import { deposit } from "./api-functions/deposit";
import { createAssociatedTokenAccountIdempotent, getAssociatedTokenAddress } from "@solana/spl-token";
import { deserializeIxSignAndSend } from "./funcs";
import { sleep } from "./api-functions/util";
import {
    readBalance,
    validateHeuristicBalanceChange,
} from "./balance-validation";

/**********************************************************************************
 * Node comand to peform a deposit of mock collateral for USDM1 on Solana Devnet.
 * 
 * Checks collateral balance and attempts to request mock collateral from 
 * the M1 Solana faucet which is rate limited to
 * 10 requests per hour per token. 
 * 
 * Fetches a Solana TransactionInstruction from the API
 * which is subsequently signed and submitted.
 * 
 * Uses a preconfigured keypair that is created by the create-keypair.ts node script.
 * The public address of this wallet MUST be whitelisted by M1 Global,
 * otherwise the deposit will fail.
 * 
 * Create the wallet first and then contact M1 Global for your client JWT for API access
 * and let us know what your Solana wallet public address is.
 * 
 * Don't forget to put SOL in the wallet via a faucet (https://faucet.solana.com/).
 * 
 * Must be transpiled (npm run build).
 */

const pgm = new Command();

pgm.version("0.0.1")
    .description("Deposit mock collateral for USDM1 tokens on Solana Devnet")
    .parse(process.argv);

const options = pgm.opts();

(async () => {

    // make sure there is an rpc endpoint to talk to
    if (!process.env.SOLANA_DEVNET_RPC_URL) {
        console.error("no SOLANA_DEVNET_RPC_URL set in environment");
        return;
    }

    const keypairPath = "./id.json"

    // Check that the keypair exists
    if (!fs.existsSync(keypairPath)) {
        console.error(`keypair file ${keypairPath} missing. have you created a keypair using create-keypair.js?`);
        return;
    }

    const json = fs.readFileSync("id.json", "utf8");
    const secret = JSON.parse(json);
    const keypair = Keypair.fromSecretKey(Uint8Array.from(secret));
    const wallet = new anchor.Wallet(keypair);
    const connection = new Connection(process.env.SOLANA_DEVNET_RPC_URL!, "confirmed");
    const amount = "100000000";

    console.info(`operating as ${keypair.publicKey.toBase58()}`);
    console.info(`[solana] cluster=devnet rpc=${process.env.SOLANA_DEVNET_RPC_URL}`);
    console.info(`[solana] api base url=${process.env.M1_API_BASE_URL}`);
    console.info(`[solana] flow=deposit amount=${amount} token=${USDM1_TOKEN_CODE}`);

    // First things first, check the whitelist status.
    const whitelistStatus = await getWhitelistStatus("solana-devnet", keypair.publicKey.toBase58());
    if (!whitelistStatus ||
        !whitelistStatus.status ||
        whitelistStatus?.status.toLowerCase() != "Whitelisted".toLocaleLowerCase()) {
        console.error(`Address ${keypair.publicKey.toBase58()} on solana is not whitelisted. Contact M1 Global for access.`);
        return;
    }

    // Fetch the M1 treasury config on Solana Devnet
    const config: TreasuryConfig | undefined = await getTresasuryConfig(true);

    if (!config) {
        console.error("no treasury config");
        return;
    }

    if (!config.usdm1) {
        console.error("no usdm1 configured for treasury");
        return;
    }

    // Ensure there are collaterals supported by the broker
    if (!config.collaterals || config.collaterals.length == 0) {
        console.error("no collaterals supported by treasury");
        return;
    }

    // Identify the mock collateral from the collection
    const mock = config.collaterals.find(col => col.symbol == SOLANA_MOCK_SYMBOL);
    if (!mock) {
        console.error("no mock collateral supported by treasury");
        return;
    }

    // It's possible that there is no associated token account
    // created for the collateral or USDM1.
    // If not, the balance check will fail with a 
    // TokenAccountNotFound error.
    // Ergo, create them idempotently.
    await createAssociatedTokenAccountIdempotent(
        connection,
        keypair,
        new anchor.web3.PublicKey(mock.mintAddress),
        wallet.publicKey,
        undefined,
        new anchor.web3.PublicKey(mock.tokenProgramId!)
    );
    await createAssociatedTokenAccountIdempotent(
        connection,
        keypair,
        new anchor.web3.PublicKey(config.usdm1!.mintAddress),
        wallet.publicKey,
        undefined,
        new anchor.web3.PublicKey(config.usdm1!.tokenProgramId!)
    );

    // Fetch and report balances of both mock and USDM1
    // The same block will be run a the end to see the final result
    let mockBalance = await getBalance(
        SOLANA_MOCK_SYMBOL,
        keypair.publicKey.toBase58(),
        true);
    if (!mockBalance) {
        console.error("failed to fetch balance for MOCK");
        return;
    }
    console.info(`balance of MOCK: ${mockBalance?.balance}`);
    let usdm1Balance = await getBalance(
        USDM1_TOKEN_CODE,
        keypair.publicKey.toBase58(),
        true);
    console.info(`balance of USDM1: ${usdm1Balance?.balance}`);

    // Check that there is enough mock for the deposit
    if (BigInt(mockBalance.balance) < BigInt(amount)) {

        console.error("Insufficient collateral balance.")

        // Attempt a faucet request.
        // Returns an operation id that needs to be polled 
        // (the internal M1 service that perfoms the faucet
        // request is async and message driven and therefore
        // does not return anything).
        const opId = await faucet(SOLANA_MOCK_SYMBOL, keypair.publicKey.toBase58());
        if (!opId) {
            console.error("faucet failure");
            return;
        }

        // Poll the operation API endpoint for 10 seconds.
        const tx = await getOperation(opId, 10);
        if (!tx) {
            // If after 10 seconds there is no transaction, 
            // assume the request failed.
            console.error("faucet transaction did not get mined");
            return;
        }

        mockBalance = await getBalance(
            SOLANA_MOCK_SYMBOL,
            keypair.publicKey.toBase58(),
            true);
        if (!mockBalance) {
            console.error("failed to fetch balance for MOCK after faucet");
            return;
        }
        console.info(`balance of MOCK after faucet: ${mockBalance.balance}`);
    }

    const balancesBeforeDeposit = {
        MOCK: readBalance(mockBalance, SOLANA_MOCK_SYMBOL),
        USDM1: readBalance(usdm1Balance, USDM1_TOKEN_CODE),
    };

    // The ATA for receiving the USDM1 may not be initialized.
    // Create it idempotently.
    const rta = await createAssociatedTokenAccountIdempotent(
        connection,
        keypair,
        new anchor.web3.PublicKey(config.usdm1.mintAddress),
        new anchor.web3.PublicKey(keypair.publicKey),
        undefined,
        new anchor.web3.PublicKey(config.usdm1.tokenProgramId!)
    );

    const recipientUsdmTokenAccount = await getAssociatedTokenAddress(
        new anchor.web3.PublicKey(config.usdm1.mintAddress),
        new anchor.web3.PublicKey(keypair.publicKey),
        false,
        new anchor.web3.PublicKey(config.usdm1.tokenProgramId!)
    );

    // wait for the ATA
    console.info("waiting for ATA creation...");
    await sleep(5000);

    const serializedIx = await deposit(
        keypair.publicKey.toBase58(),
        mock.mintAddress,
        amount,
        USDM1_TOKEN_CODE,
        true
    );

    if (!serializedIx) {
        console.error("no transaction from server");
        return;
    }

    console.info(
        `[solana] deposit instruction program=${serializedIx.programId} ` +
        `accounts=${serializedIx.keys.length} dataLength=${serializedIx.data.length}`
    );
    await deserializeIxSignAndSend(connection, serializedIx, keypair);

    // Re-fetch and report balances of both mock and USDM1
    mockBalance = await getBalance(
        SOLANA_MOCK_SYMBOL,
        keypair.publicKey.toBase58(),
        true);
    console.info(`balance of MOCK: ${mockBalance?.balance}`);
    usdm1Balance = await getBalance(
        USDM1_TOKEN_CODE,
        keypair.publicKey.toBase58(),
        true);
    console.info(`balance of USDM1: ${usdm1Balance?.balance}`);
    validateHeuristicBalanceChange({
        chainTag: "[solana]",
        operation: "deposit",
        stage: "after-submit",
        before: balancesBeforeDeposit,
        after: {
            MOCK: readBalance(mockBalance, SOLANA_MOCK_SYMBOL),
            USDM1: readBalance(usdm1Balance, USDM1_TOKEN_CODE),
        },
        inputToken: "MOCK",
        inputAmount: BigInt(amount),
        outputToken: "USDM1",
        requireOutputIncrease: true,
    });

})();
