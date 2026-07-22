import fs from "fs";

import * as anchor from "@coral-xyz/anchor";

import "dotenv/config";

import { Command } from "commander-ts";
import { Connection, Keypair } from "@solana/web3.js";
import { getTresasuryConfig } from "./api-functions/get-treasury-config-v2";
import { createAssociatedTokenAccountIdempotent, TOKEN_2022_PROGRAM_ID } from "@solana/spl-token";
import { USDM0_TOKEN_CODE, USDM1_TOKEN_CODE } from "./consts";
import { swap } from "./api-functions/swap-v2";
import { getSolanaSwapPermit } from "./api-functions/get-solana-swap-permit-v2";
import { getBalance } from "./api-functions/get-balance-v2";
import { getSolanaUsdm1PriceAttestation } from "./api-functions/get-usdm1-price-attestation-v2";
import { deserializeAccountMetas, requireTreasuryLookupTableAddress, signAndSendInstructionsV0WithLookupTable } from "./funcs-v2";
import {
    readBalance,
    validateHeuristicBalanceChange,
} from "./balance-validation";

import { getM1ApiV2BaseUrl } from "./api-functions/api-base";
/**********************************************************************************
 * Node comand to peform a swap of USDM1 for USDM0 on Solana Devnet.
 * 
 * Checks USDM1 balance first. Run deposit.ts first to receive USDM1 tokens.
 * 
 * Fetches a Solana TransactionInstruction from the API
 * which is subsequently signed and submitted.
 * 
 * Uses a preconfigured keypair that is created by the create-keypair.ts node script.
 * The public address of this wallet MUST be whitelisted by M1X,
 * otherwise the deposit will fail.
 * 
 * Call deposit first to receive USDM1 that can be swapped for USDM0.
 * 
 * Must be transpiled (npm run build).
 */

const pgm = new Command();

pgm.version("0.0.1")
    .description("Swap USDM1 tokens for USDM0 tokens on Solana Devnet")
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
    const amount = "90000000000";

    console.info(`operating as ${keypair.publicKey.toBase58()}`);
    console.info(`[solana] cluster=devnet rpc=${process.env.SOLANA_DEVNET_RPC_URL}`);
    console.info(`[solana] api base url=${getM1ApiV2BaseUrl()}`);
    console.info(`[solana] flow=swap amount=${amount} inputToken=${USDM1_TOKEN_CODE} outputToken=${USDM0_TOKEN_CODE}`);

    const config = await getTresasuryConfig(true);
    if (!config) {
        console.error("no treasury config");
        return;
    }
    const lookupTableAddress = requireTreasuryLookupTableAddress(config);
    if (!config.usdm0 || !config.usdm0.mintAddress) {
        console.error("no USDM0 configured");
        return;
    }
    if (!config.usdm1 || !config.usdm1.mintAddress) {
        console.error("no USDM1 configured");
        return;
    }

    let usdm1Balance = await getBalance(
        USDM1_TOKEN_CODE,
        keypair.publicKey.toBase58(),
        true);
    if (!usdm1Balance) {
        console.error("no usdm1Balance retrieved");
        return;
    }
    console.info(`balance of USDM1: ${usdm1Balance?.balance}`);
    let usdm0Balance = await getBalance(
        USDM0_TOKEN_CODE,
        keypair.publicKey.toBase58(),
        true);
    console.info(`balance of USDM0: ${usdm0Balance?.balance}`);
    const balancesBeforeSwap = {
        USDM0: readBalance(usdm0Balance, USDM0_TOKEN_CODE),
        USDM1: readBalance(usdm1Balance, USDM1_TOKEN_CODE),
    };

    if (BigInt(usdm1Balance.balance) < BigInt(amount)) {
        console.error("insufficient USDM1 balance");
        return;
    }

    // We're assuming a swap from USDM1 to USDM0.
    // Therefore the wallet already has an ATA with USDM1.
    // But there is a chance there is no ATA with USDM0.
    await createAssociatedTokenAccountIdempotent(
        connection,
        keypair,
        new anchor.web3.PublicKey(config.usdm0.mintAddress),
        keypair.publicKey,
        undefined,
        TOKEN_2022_PROGRAM_ID
    );

    const tokenAttestation = await getSolanaUsdm1PriceAttestation(
        keypair.publicKey.toBase58(),
        "swap",
        undefined,
        true
    );
    if (!tokenAttestation) {
        console.error("failed to fetch price attestation for USDM1");
        return;
    }

    const swapPermit = await getSolanaSwapPermit(
        keypair.publicKey.toBase58(),
        USDM1_TOKEN_CODE,
        USDM0_TOKEN_CODE,
        amount,
        true
    );
    if (!swapPermit) {
        console.error("failed to fetch swap permit");
        return;
    }

    const serializedIx = await swap(
        keypair.publicKey.toBase58(),
        USDM1_TOKEN_CODE,
        amount,
        tokenAttestation,
        swapPermit,
        true
    );

    if (!serializedIx || !Array.isArray(serializedIx)) {
        console.error("no instruction from server");
        return;
    }

    const instructions = serializedIx.map((ix) => ({
        keys: deserializeAccountMetas(ix.keys),
        programId: new anchor.web3.PublicKey(ix.programId),
        data: Buffer.from(ix.data, "base64"),
    }));

    await signAndSendInstructionsV0WithLookupTable(
        connection,
        instructions,
        keypair,
        lookupTableAddress
    );

    // Re-fetch and report balances of both mock and USDM1
    usdm1Balance = await getBalance(
        USDM1_TOKEN_CODE,
        keypair.publicKey.toBase58(),
        true);
    console.info(`balance of USDM1: ${usdm1Balance?.balance}`);
    usdm0Balance = await getBalance(
        USDM0_TOKEN_CODE,
        keypair.publicKey.toBase58(),
        true);
    console.info(`balance of USDM0: ${usdm0Balance?.balance}`);
    validateHeuristicBalanceChange({
        chainTag: "[solana]",
        operation: "swap",
        stage: "after-submit",
        before: balancesBeforeSwap,
        after: {
            USDM0: readBalance(usdm0Balance, USDM0_TOKEN_CODE),
            USDM1: readBalance(usdm1Balance, USDM1_TOKEN_CODE),
        },
        inputToken: USDM1_TOKEN_CODE,
        inputAmount: BigInt(amount),
        outputToken: USDM0_TOKEN_CODE,
        requireOutputIncrease: true,
    });
})();
