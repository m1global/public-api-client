import {
    Keypair,
    Networks,
    rpc,
} from "@stellar/stellar-sdk";

import { Command } from "commander-ts";

import "dotenv/config";

import {
    StellarBrokerConfig,
} from "./interfaces";
import { approve } from "./api-functions/approve";
import { getAllowance } from "./api-functions/get-allowance";
import { getBalance } from "./api-functions/get-balance";
import {
    getSwapRecord,
    logBrokerRecordSnapshot,
} from "./api-functions/get-broker-record";
import { getBrokerConfig } from "./api-functions/get-broker-config";
import {
    prepareSignAndSendTx,
    signAndSendTx,
    sleep,
    waitForTx
} from "./api-functions/util";
import { getTrustline } from "./api-functions/get-trustline";
import { createTrustline } from "./api-functions/trustline";
import { swap } from "./api-functions/swap";
import {
    readBalance,
    validateHeuristicBalanceChange,
} from "./balance-validation";

/**********************************************************************************
 * Node comand to peform a swap of USDM1 for USDM0 on Stellar Testnet.
 * 
 * Checks the Broker"s allowance of the depositor"s USDM1 and 
 * requests sllowance if insufficient.
 * 
 * Fetches a transaction as a base-64 endoed XDR string from the API
 * which is subsequently signed and submitted.
 * 
 * Uses a preconfigured wallet that is created via the Stellar CLI.
 * To create a wallet: stellar keys generate alice
 * Next fund the wallet: stellar keys fund alice
 * (or use Stellar Labs' friendbot)
 * 
 * Inject your keypair secret via the command line via: node dist/deposit.js -s "$(stellar keys secret alice)"
 * 
 * Create the wallet first and then contact M1 Global for your client JWT for API access
 * and let us know what your Sepolia wallet public address is.
 * 
 * This script and others in this directory require a .env file read by dotenv at the root level,
 * i.e. where package.json lives.
 * Copy the .env.example and fill in the missing fields.
 * 
 * Must be transpiled (npm run build).
 */

const pgm = new Command();

pgm.version("0.0.1")
    .description("Issue a swap of USDM1 for USDM0")
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
    // (both USDEM tokens are standard Stellar assets and has 7 decimals)
    const amount = "900000000";

    const keypair = Keypair.fromSecret(options.secret);
    const publicKey = keypair.publicKey();
    console.info(`operating as ${publicKey}`);
    console.info(`[stellar] network=testnet rpc=${process.env.STELLAR_TESTNET_RPC_URL}`);
    console.info(`[stellar] api base url=${process.env.M1_API_BASE_URL}`);
    console.info(`[stellar] flow=swap amount=${amount} inputToken=USDM1 outputToken=USDM0`);

    const server = new rpc.Server(process.env.STELLAR_TESTNET_RPC_URL!);
    const stellarNetwork = Networks.TESTNET;

    // Fetch the M1 broker config on Stellar testnet.
    const brokerConfig: StellarBrokerConfig | undefined = await getBrokerConfig(true);

    if (!brokerConfig) {
        console.error("no broker config");
        return;
    }

    // Ensure borh tokens are supported by the broker.
    if (!brokerConfig.usdm0) {
        console.error("No USDM0 token support in broker");
        return;

    } if (!brokerConfig.usdm1) {
        console.error("No USDM1 token support in broker");
        return;
    }

    // Check the trustlines for the keypair.
    let trustline = await getTrustline(brokerConfig.usdm0?.symbol!, brokerConfig.usdm0?.issuer!, publicKey, true);
    if (!trustline) {
        console.info("No trustline for USDM0");

        // The API swap function will also perform a trustline verification for the output token
        // and prepend a change trust operation. 

        // Create a trustline for USDM0
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

        const txHash = await signAndSendTx(server, xdr, stellarNetwork, keypair); //throws
        await waitForTx(server, txHash!);
    }

    // Fetch and report balances of both USDM1 and USDM0.
    // The same block will be run at the end to see the final result.
    let usdm1Balance = await getBalance("USDM1", publicKey, true);
    if (!usdm1Balance) {
        console.error("failed to fetch balance for USDM1");
        return;
    }
    console.info(`balance of USDM1: ${usdm1Balance?.balance}`);
    let usdm0Balance = await getBalance("USDM0", publicKey, true);
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

    // Fetch the allowance the Broker has on the owner"s USDM1 collateral.
    const allowance = await getAllowance(
        brokerConfig.usdm1!.address,
        publicKey,
        brokerConfig.address,
        true);

    // Check if the allowance is sufficient
    if (!allowance || BigInt(allowance.allowance) < BigInt(amount)) {

        // Allowance is not sufficient.
        // Request an allowance in the amount of the deposit.
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

        const txHash = await prepareSignAndSendTx(server, xdr, stellarNetwork, keypair); //throws
        await waitForTx(server, txHash!);
    }

    // Fetch a swap transaction from the api.
    const xdr = await swap(
        publicKey,
        "USDM1",
        amount,
        true);

    if (!xdr) {
        console.error("no swap transaction to sign");
        return;
    }

    console.info(`[stellar] swap transaction xdr length=${xdr.length}`);

    let txHash = await prepareSignAndSendTx(server, xdr, stellarNetwork, keypair);
    await waitForTx(server, txHash!);

    const swapRecord = await getSwapRecord(server, brokerConfig.address, publicKey, true);
    logBrokerRecordSnapshot("swap record after submit", swapRecord);

    // Re-fetch the balances.
    // USDM1 should be less by 900000000 because it was transferred.
    // USDM0 should be 0 becuase it hasn't been minted yet.
    usdm1Balance = await getBalance(brokerConfig.usdm1!.symbol!, publicKey, true);
    console.info(`balance of USDM1: ${usdm1Balance?.balance}`);
    usdm0Balance = await getBalance(brokerConfig.usdm0.symbol!, publicKey, true);
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
        requireOutputIncrease: false,
    });


    // Sleep for 15 seconds to wait for the cross-chain messaging.
    console.info("sleeping for 15 seconds to wait for cross-chain messaging...");
    await sleep(15 * 1000);

    // USDM1 should be less by the swap amount.
    // USDM0 should be a value close to but less than 1000000000.
    usdm1Balance = await getBalance(brokerConfig.usdm1!.symbol!, publicKey, true);
    console.info(`balance of USDM1: ${usdm1Balance?.balance}`);
    usdm0Balance = await getBalance(brokerConfig.usdm0.symbol!, publicKey, true);
    console.info(`balance of USDM0: ${usdm0Balance?.balance}`);
    validateHeuristicBalanceChange({
        chainTag: "[stellar]",
        operation: "swap",
        stage: "after-settlement",
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
