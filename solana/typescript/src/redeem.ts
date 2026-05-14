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
import { SOLANA_MOCK_SYMBOL, USDM0_TOKEN_CODE } from "./consts";
import { getBalance } from "./api-functions/get-balance";
import { deserializeAccountMetas, signAndSendInstructions } from "./funcs";
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
 * The public address of this wallet MUST be whitelisted by M1X,
 * otherwise the deposit will fail.
 * 
 * Create the wallet first and then contact M1X for your client JWT for API access
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
const REDEMPTION_DETAILS_PATH = "redemption-details.json";

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

    if (!serializedIx || !Array.isArray(serializedIx)) {
        console.error("no transaction from server");
        return;
    }

    const instructions = serializedIx.map((ix) => ({
        keys: deserializeAccountMetas(ix.keys),
        programId: new anchor.web3.PublicKey(ix.programId),
        data: Buffer.from(ix.data, "base64"),
    }));

    await signAndSendInstructions(connection, instructions, keypair);

    fs.writeFileSync(REDEMPTION_DETAILS_PATH, JSON.stringify({
        chain: "solana",
        redeemer: keypair.publicKey.toBase58(),
        amount,
        inputToken: USDM0_TOKEN_CODE,
        inputDecimals: config.usdm0?.decimals,
        outputToken: SOLANA_MOCK_SYMBOL,
        outputDecimals: mock.decimals,
        collateralAddress: mock.mintAddress,
        before: {
            USDM0: balancesBeforeRedemption.USDM0.toString(),
            MOCK: balancesBeforeRedemption.MOCK.toString(),
        },
        timestamp: new Date().toISOString(),
    }, null, 2));

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

})();
