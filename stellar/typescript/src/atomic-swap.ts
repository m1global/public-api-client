import {
    Keypair,
    Networks,
    rpc,
} from "@stellar/stellar-sdk";

import { Command } from "commander-ts";

import "dotenv/config";

import {
    StellarAtomicBrokerConfig,
} from "./interfaces";
import { approve } from "./api-functions/approve";
import { getAllowance } from "./api-functions/get-allowance";
import { getBalance } from "./api-functions/get-balance";
import { getAtomicBrokerConfig } from "./api-functions/get-atomic-broker-config";
import { getUsdm1PriceAttestation } from "./api-functions/get-usdm1-price-attestation";
import { atomicSwap } from "./api-functions/atomic-swap";
import {
    prepareSignAndSendTx,
    signAndSendTx,
    waitForTx
} from "./api-functions/util";
import { getTrustline } from "./api-functions/get-trustline";
import { createTrustline } from "./api-functions/trustline";
import {
    readBalance,
    validateHeuristicBalanceChange,
} from "./balance-validation";

/**********************************************************************************
 * Node command to perform an atomic swap of USDM1 for USDM0 on Stellar Testnet.
 *
 * Checks the Broker's allowance of the swapper's USDM1 and
 * requests allowance if insufficient.
 *
 * Fetches a USDM1 price attestation from the API and includes it in the swap request.
 *
 * Fetches a transaction as a base-64 encoded XDR string from the API
 * which is subsequently signed and submitted.
 *
 * Uses a preconfigured wallet that is created via the Stellar CLI.
 * To create a wallet: stellar keys generate alice
 * Next fund the wallet: stellar keys fund alice
 * (or use Stellar Labs' friendbot)
 *
 * Inject your keypair secret via the command line via: node dist/atomic-swap.js -s "$(stellar keys secret alice)"
 *
 * USDM1 tokens are minted to your wallet when you execute the atomic-deposit script.
 * Call atomic-deposit first to receive USDM1 tokens that can be swapped for USDM0 tokens.
 *
 * Must be transpiled (npm run build).
 */

const pgm = new Command();

pgm.version("0.0.1")
    .description("Issue an atomic swap of USDM1 for USDM0")
    .requiredOption("-s --secret <secret for Stellar keypair>")
    .parse(process.argv);

const options = pgm.opts();

(async () => {

    // make sure there is an rpc endpoint to talk to
    if (!process.env.STELLAR_TESTNET_RPC_URL) {
        console.error("no STELLAR_TESTNET_RPC_URL set in environment");
        return;
    }

    // set a default amount of $90
    // (both USDM tokens are standard Stellar assets and have 7 decimals)
    const amount = "900000000";

    const keypair = Keypair.fromSecret(options.secret);
    const publicKey = keypair.publicKey();
    console.info(`operating as ${publicKey}`);
    console.info(`[stellar] network=testnet rpc=${process.env.STELLAR_TESTNET_RPC_URL}`);
    console.info(`[stellar] api base url=${process.env.M1_API_BASE_URL}`);
    console.info(`[stellar] flow=atomic-swap amount=${amount} inputToken=USDM1 outputToken=USDM0`);

    const server = new rpc.Server(process.env.STELLAR_TESTNET_RPC_URL!);
    const stellarNetwork = Networks.TESTNET;

    // Swaps are not whitelisted.
    // All holders of USDM0 or USDM1 can access swap.

    // Fetch the M1 atomic broker config on Stellar testnet.
    const brokerConfig: StellarAtomicBrokerConfig | undefined = await getAtomicBrokerConfig(true);

    if (!brokerConfig) {
        console.error("no broker config");
        return;
    }

    // Ensure both tokens are supported by the broker.
    if (!brokerConfig.usdm0) {
        console.error("No USDM0 token support in broker");
        return;
    }
    if (!brokerConfig.usdm1) {
        console.error("No USDM1 token support in broker");
        return;
    }

    // Check the trustline for USDM0.
    let trustline = await getTrustline(brokerConfig.usdm0?.symbol!, brokerConfig.usdm0?.issuer!, publicKey, true);
    if (!trustline) {
        console.info("No trustline for USDM0");

        const xdr = await createTrustline(
            brokerConfig.usdm0?.symbol!,
            brokerConfig.usdm0?.issuer!,
            publicKey,
            true
        );
        console.info(`[stellar] trustline xdr length for USDM0: ${xdr?.length ?? 0}`);

        if (!xdr) {
            console.error("no create trustline transaction to sign");
            return;
        }

        const txHash = await signAndSendTx(server, xdr, stellarNetwork, keypair);
        await waitForTx(server, txHash!);
    }

    // Fetch and report balances of both USDM1 and USDM0.
    let usdm1Balance = await getBalance("USDM1", publicKey, true, brokerConfig);
    if (!usdm1Balance) {
        console.error("failed to fetch balance for USDM1");
        return;
    }
    console.info(`balance of USDM1: ${usdm1Balance?.balance}`);
    let usdm0Balance = await getBalance("USDM0", publicKey, true, brokerConfig);
    if (!usdm0Balance) {
        console.error("failed to fetch balance for USDM0");
        return;
    }
    console.info(`balance of USDM0: ${usdm0Balance?.balance}`);
    const balancesBeforeSwap = {
        USDM0: readBalance(usdm0Balance, "USDM0"),
        USDM1: readBalance(usdm1Balance, "USDM1"),
    };

    // Check that there is enough USDM1 for the swap.
    if (BigInt(usdm1Balance.balance) < BigInt(amount)) {
        console.error("Insufficient USDM1 balance.")
        return;
    }

    // Fetch the allowance the Broker has on the owner's USDM1.
    const allowance = await getAllowance(
        brokerConfig.usdm1!.address,
        publicKey,
        brokerConfig.address,
        true);

    // Check if the allowance is sufficient
    if (!allowance || BigInt(allowance.allowance) < BigInt(amount)) {

        const xdr = await approve(
            brokerConfig.usdm1!.address,
            publicKey,
            brokerConfig.address,
            amount,
            true
        )

        if (!xdr) {
            console.error("no approve transaction to sign");
            return;
        }

        const txHash = await prepareSignAndSendTx(server, xdr, stellarNetwork, keypair);
        await waitForTx(server, txHash!);
    }

    // Fetch a price attestation for USDM1 from the API.
    const usdm1Attestation = await getUsdm1PriceAttestation(publicKey, true);
    if (!usdm1Attestation) {
        console.error("failed to fetch price attestation for USDM1");
        return;
    }

    // Fetch a swap transaction from the API.
    const xdr = await atomicSwap(
        publicKey,
        "USDM1",
        amount,
        usdm1Attestation,
        true);

    if (!xdr) {
        console.error("no swap transaction to sign");
        return;
    }

    console.info(`[stellar] atomic swap transaction xdr length=${xdr.length}`);

    let txHash = await prepareSignAndSendTx(server, xdr, stellarNetwork, keypair);
    await waitForTx(server, txHash!);

    // Re-fetch the balances.
    // USDM1 should decrease by the swap amount.
    // USDM0 should increase (minted atomically).
    usdm1Balance = await getBalance(brokerConfig.usdm1!.symbol!, publicKey, true, brokerConfig);
    console.info(`balance of USDM1: ${usdm1Balance?.balance}`);
    usdm0Balance = await getBalance(brokerConfig.usdm0.symbol!, publicKey, true, brokerConfig);
    console.info(`balance of USDM0: ${usdm0Balance?.balance}`);
    validateHeuristicBalanceChange({
        chainTag: "[stellar]",
        operation: "swap",
        stage: "after-submit",
        before: balancesBeforeSwap,
        after: {
            USDM0: readBalance(usdm0Balance, "USDM0"),
            USDM1: readBalance(usdm1Balance, "USDM1"),
        },
        inputToken: "USDM1",
        inputAmount: BigInt(amount),
        outputToken: "USDM0",
        requireOutputIncrease: true,
    });
})();
