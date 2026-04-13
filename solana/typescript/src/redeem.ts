import fs from "fs";

import * as anchor from "@coral-xyz/anchor";
import {
    Connection,
    Keypair,
    PublicKey,
    TransactionInstruction,
} from "@solana/web3.js";

import "dotenv/config";

import { Command } from "commander-ts";

import { getWhitelistStatus } from "./api-functions/get-whitelist-status";
import { TreasuryConfig } from "./interfaces";
import { getTresasuryConfig } from "./api-functions/get-treasury-config";
import { SOLANA_MOCK_SYMBOL, USDM0_TOKEN_CODE } from "./consts";
import { getBalance } from "./api-functions/get-balance";
import { createAssociatedTokenAccountIdempotentInstruction } from "@solana/spl-token";
import { deserializeAccountMetas, signAndSendInstructions } from "./funcs";
import { sleep } from "./api-functions/util";
import { redeem } from "./api-functions/redeem";
import {
    readBalance,
    validateOneToOneRedemption,
} from "./balance-validation";

/**********************************************************************************
 * Node comand to peform a redemption of USDM0 for mock collateral on Solana Devnet.
 * 
 * Checks USDM0 balance.
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
 * Call deposit first to receive USDM1 that can be swapped for USDM0.
 * Call swap next to receive USDM0.
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
    const connection = new Connection(process.env.SOLANA_DEVNET_RPC_URL!, "confirmed");
    const amount = "100000000";

    console.info(`operating as ${keypair.publicKey.toBase58()}`);
    console.info(`[solana] cluster=devnet rpc=${process.env.SOLANA_DEVNET_RPC_URL}`);
    console.info(`[solana] api base url=${process.env.M1_API_BASE_URL}`);
    console.info(`[solana] flow=redeem amount=${amount} inputToken=${USDM0_TOKEN_CODE}`);

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

    // Fetch and report balances of both USDM0 and MOCK.
    // The same block will be run a the end to see the final result
    let usdm0Balance = await getBalance(
        USDM0_TOKEN_CODE,
        keypair.publicKey.toBase58(),
        true);
    if (!usdm0Balance) {
        console.error("failed to fetch balance for USDM0");
        return;
    }
    console.info(`balance of USDM0: ${usdm0Balance?.balance}`);

    let mockBalance = await getBalance(
        SOLANA_MOCK_SYMBOL,
        keypair.publicKey.toBase58(),
        true);
    if (!mockBalance) {
        console.error("failed to fetch balance for MOCK");
        return;
    }
    console.info(`balance of MOCK: ${mockBalance?.balance}`);
    const balancesBeforeRedemption = {
        USDM0: readBalance(usdm0Balance, USDM0_TOKEN_CODE),
        MOCK: readBalance(mockBalance, SOLANA_MOCK_SYMBOL),
    };

    // Check that there is enough USDM0 for the redemption
    if (BigInt(usdm0Balance.balance) < BigInt(amount)) {

        console.error("Insufficient USDM0 balance.");
    }

    console.info(`redeeming ${amount} of ${USDM0_TOKEN_CODE} for collateral ${mock.mintAddress} (${mock.symbol})`);
    const serializedIx = await redeem(
        keypair.publicKey.toBase58(),
        USDM0_TOKEN_CODE,
        amount,
        mock.mintAddress,
        true
    );

    if (!serializedIx) {
        console.error("no transaction from server");
        return;
    }

    // queueRedemption expects the redemption escrow ATA to already exist.
    // The API returns the queue instruction only, so create the escrow ATA
    // client-side using the account metas already encoded in the instruction.
    const ixKeys = deserializeAccountMetas(serializedIx.keys);
    const redemption = ixKeys[3]?.pubkey;
    const mint = ixKeys[7]?.pubkey;
    const redemptionEscrowAccount = ixKeys[10]?.pubkey;
    const tokenProgram = ixKeys[13]?.pubkey;

    if (!redemption || !mint || !redemptionEscrowAccount || !tokenProgram) {
        console.error("redemption instruction missing expected accounts");
        return;
    }

    const createEscrowAtaIx = createAssociatedTokenAccountIdempotentInstruction(
        keypair.publicKey,
        redemptionEscrowAccount,
        redemption,
        mint,
        tokenProgram,
    );

    const redemptionIx: TransactionInstruction = {
        keys: ixKeys,
        programId: new PublicKey(serializedIx.programId),
        data: Buffer.from(serializedIx.data, "base64"),
    };

    console.info(
        `[solana] redeem instruction program=${serializedIx.programId} ` +
        `accounts=${serializedIx.keys.length} dataLength=${serializedIx.data.length}`
    );
    console.info(
        `[solana] redemption accounts redemption=${redemption.toBase58()} ` +
        `escrowAta=${redemptionEscrowAccount.toBase58()} mint=${mint.toBase58()}`
    );
    await signAndSendInstructions(connection, [createEscrowAtaIx, redemptionIx], keypair);

    // Re-fetch and report balances of both USDM0 and MOCK.
    usdm0Balance = await getBalance(
        USDM0_TOKEN_CODE,
        keypair.publicKey.toBase58(),
        true);
    console.info(`balance of USDM0: ${usdm0Balance?.balance}`);
    mockBalance = await getBalance(
        SOLANA_MOCK_SYMBOL,
        keypair.publicKey.toBase58(),
        true);
    console.info(`balance of MOCK: ${mockBalance?.balance}`);
    validateOneToOneRedemption({
        chainTag: "[solana]",
        stage: "after-submit",
        before: balancesBeforeRedemption,
        after: {
            USDM0: readBalance(usdm0Balance, USDM0_TOKEN_CODE),
            MOCK: readBalance(mockBalance, SOLANA_MOCK_SYMBOL),
        },
        inputToken: USDM0_TOKEN_CODE,
        inputAmount: BigInt(amount),
        inputDecimals: config.usdm0?.decimals,
        outputToken: "MOCK",
        outputDecimals: mock.decimals,
        requireOutputIncrease: false,
    });

    // Wait for the API to pick up the queued redemption and process it.
    // On devnet, a background task polls for queued redemptions and fulfills them for mock collateral.
    console.info("sleeping for 90 seconds to wait for redemption processing...");
    await sleep(90 * 1000);

    // Re-fetch balances to check if the redemption was fulfilled.
    usdm0Balance = await getBalance(
        USDM0_TOKEN_CODE,
        keypair.publicKey.toBase58(),
        true);
    console.info(`balance of USDM0: ${usdm0Balance?.balance}`);
    mockBalance = await getBalance(
        SOLANA_MOCK_SYMBOL,
        keypair.publicKey.toBase58(),
        true);
    console.info(`balance of MOCK: ${mockBalance?.balance}`);
    validateOneToOneRedemption({
        chainTag: "[solana]",
        stage: "after-settlement",
        before: balancesBeforeRedemption,
        after: {
            USDM0: readBalance(usdm0Balance, USDM0_TOKEN_CODE),
            MOCK: readBalance(mockBalance, SOLANA_MOCK_SYMBOL),
        },
        inputToken: USDM0_TOKEN_CODE,
        inputAmount: BigInt(amount),
        inputDecimals: config.usdm0?.decimals,
        outputToken: "MOCK",
        outputDecimals: mock.decimals,
        requireOutputIncrease: true,
    });

})();
