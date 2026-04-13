import {
    Keypair,
    Networks,
    rpc,
} from "@stellar/stellar-sdk";

import { Command } from "commander-ts";

import "dotenv/config";

import {
    StellarBrokerConfig,
    WhitelistStatus,
} from "./interfaces";
import { approve } from "./api-functions/approve";
import { deposit } from "./api-functions/deposit";
import { faucet } from "./api-functions/faucet";
import { getAllowance } from "./api-functions/get-allowance";
import { getBalance } from "./api-functions/get-balance";
import {
    getRedemptionRecord,
    logBrokerRecordSnapshot,
} from "./api-functions/get-broker-record";
import { getBrokerConfig } from "./api-functions/get-broker-config";
import { getOperation } from "./api-functions/get-operation";
import {
    prepareSignAndSendTx,
    signAndSendTx,
    sleep,
    waitForTx
} from "./api-functions/util";
import { getWhitelistStatus } from "./api-functions/get-whitelist-status";
import { getTrustline } from "./api-functions/get-trustline";
import { createTrustline } from "./api-functions/trustline";
import { redeem } from "./api-functions/redeem";
import {
    readBalance,
    validateOneToOneRedemption,
} from "./balance-validation";

/**********************************************************************************
 * Node comand to peform a redemption of USDM0 for Mock collateral on Stellar Testnet.
 * 
 * Checks the Broker"s allowance of the depositor"s USDM0 and 
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
    .description("Issue a redemption of USDM0 for Mock")
    .requiredOption("-s --secret <secret for Stellar keypair>")
    .parse(process.argv);

const options = pgm.opts();

(async () => {

    // make sure there is an rpc endpoint to talk to
    if (!process.env.STELLAR_TESTNET_RPC_URL) {
        console.error("no STELLAR_TESTNET_RPC_URL set in environment");
        return;
    }

    // set a default amount of $10
    // (both USDEM tokens are standard Stellar assets and has 7 decimals)
    const amount = "100000000";

    const keypair = Keypair.fromSecret(options.secret);
    const publicKey = keypair.publicKey();
    console.info(`operating as ${publicKey}`);
    console.info(`[stellar] network=testnet rpc=${process.env.STELLAR_TESTNET_RPC_URL}`);
    console.info(`[stellar] api base url=${process.env.M1_API_BASE_URL}`);
    console.info(`[stellar] flow=redeem amount=${amount} inputToken=USDM0 outputToken=MOCK`);

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

    // Identify the mock collateral from the collection.
    const mock = brokerConfig.collaterals?.find(col => col.symbol?.toLowerCase() == "mock");
    if (!mock) {
        console.error("no mock collateral supported by broker");
        return;
    }

    // First things first, check the whitelist status.
    var whitelistStatus: WhitelistStatus | undefined;
    try {
        whitelistStatus = await getWhitelistStatus("stellar-testnet", publicKey);
    } catch (err) {
        if ((err as Error).message == "unauthorized") {
            console.error("Your JWT is invalid.")
        } else {
            console.error(`an error occurred: ${err}`)
        }
        return;
    }
    if (!whitelistStatus ||
        !whitelistStatus.status ||
        whitelistStatus?.status.toLowerCase() != "Whitelisted".toLocaleLowerCase()) {
        console.error(`Address ${publicKey} on stellar-testnet is not whitelisted. Contact M1 Global for access.`);
        return;
    }

    // We shouldn't have to check trustlines if you've already deposited and swapped.
    // Check the trustlines for the keypair anyway.
    // Note: even balance checks will fail with an error if the keypair holds no
    // trustlines to the assets in the deposit transaction.
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

    trustline = await getTrustline(mock.symbol!, mock.issuer!, publicKey, true);
    if (!trustline) {
        console.info("No trustline for MOCK");

        // The API swap function will also perform a trustline verification for the output token
        // and prepend a change trust operation. 

        // Create a trustline for USDM0
        const xdr = await createTrustline(
            mock.symbol!,
            mock.issuer!,
            publicKey,
            true
        );
        console.info(`[stellar] trustline xdr length for MOCK: ${xdr?.length ?? 0}`);

        if (!xdr) {
            console.error("no create trustline transaction to sign");
            return;
        }

        const txHash = await signAndSendTx(server, xdr, stellarNetwork, keypair); //throws
        await waitForTx(server, txHash!);
    }

    // Fetch and report balances of both USDM0 and Mock.
    // The same block will be run at the end to see the final result.
    let usdm0Balance = await getBalance("USDM0", publicKey, true);
    if (!usdm0Balance) {
        console.error("failed to fetch balance for USDM0");
        return;
    }
    console.info(`balance of USDM0: ${usdm0Balance?.balance}`);
    let mockBalance = await getBalance("Mock", publicKey, true);
    if (!mockBalance) {
        console.error("failed to fetch balance for MOCK");
        return;
    }
    console.info(`balance of MOCK: ${mockBalance?.balance}`);
    const balancesBeforeRedemption = {
        USDM0: readBalance(usdm0Balance, "USDM0"),
        MOCK: readBalance(mockBalance, "MOCK"),
    };

    // Check that there is enough USDM1 for the swap.
    if (BigInt(mockBalance.balance) < BigInt(amount)) {

        console.error("Insufficient USDM0 balance.")
        return;
    }

    // Fetch the allowance the Broker has on the owner"s USDM0 collateral.
    const allowance = await getAllowance(
        brokerConfig.usdm0!.address,
        publicKey,
        brokerConfig.address,
        true);

    // Check if the allowance is sufficient
    if (!allowance || BigInt(allowance.allowance) < BigInt(amount)) {

        // Allowance is not sufficient.
        // Request an allowance in the amount of the deposit.
        const xdr = await approve(
            brokerConfig.usdm0!.address,
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
    const xdr = await redeem(
        publicKey,
        "USDM0",
        amount,
        mock.address,
        true);

    if (!xdr) {
        console.error("no swap transaction to sign");
        return;
    }

    console.info(`[stellar] redemption transaction xdr length=${xdr.length}`);

    let txHash = await prepareSignAndSendTx(server, xdr, stellarNetwork, keypair);
    await waitForTx(server, txHash!);

    const redemptionRecord = await getRedemptionRecord(server, brokerConfig.address, publicKey, true);
    logBrokerRecordSnapshot("redemption record after submit", redemptionRecord);

    // Re-fetch the balances.
    // USDM0 should be less by 900000000 because it was transferred.
    // Mock should be 0 becuase it hasn't been minted yet.
    usdm0Balance = await getBalance(brokerConfig.usdm0.symbol!, publicKey, true);
    console.info(`balance of USDM0: ${usdm0Balance?.balance}`);
    mockBalance = await getBalance(mock.symbol!, publicKey, true);
    console.info(`balance of MOCK: ${mockBalance?.balance}`);
    validateOneToOneRedemption({
        chainTag: "[stellar]",
        stage: "after-submit",
        before: balancesBeforeRedemption,
        after: {
            USDM0: readBalance(usdm0Balance, "USDM0"),
            MOCK: readBalance(mockBalance, "MOCK"),
        },
        inputToken: "USDM0",
        inputAmount: BigInt(amount),
        inputDecimals: brokerConfig.usdm0?.decimals,
        outputToken: "MOCK",
        outputDecimals: mock.decimals,
        requireOutputIncrease: false,
    });


    // Sleep for 60 seconds to wait for the cross-chain messaging.
    console.info("sleeping for 60 seconds to wait for cross-chain messaging...");
    await sleep(60 * 1000);

    // USDM0 should be a value close to but larger than 0.
    // MOCK should be 900000000,
    usdm0Balance = await getBalance(brokerConfig.usdm0.symbol!, publicKey, true);
    console.info(`balance of USDM0: ${usdm0Balance?.balance}`);
    mockBalance = await getBalance(mock.symbol!, publicKey, true);
    console.info(`balance of MOCK: ${mockBalance?.balance}`);
    validateOneToOneRedemption({
        chainTag: "[stellar]",
        stage: "after-settlement",
        before: balancesBeforeRedemption,
        after: {
            USDM0: readBalance(usdm0Balance, "USDM0"),
            MOCK: readBalance(mockBalance, "MOCK"),
        },
        inputToken: "USDM0",
        inputAmount: BigInt(amount),
        inputDecimals: brokerConfig.usdm0?.decimals,
        outputToken: "MOCK",
        outputDecimals: mock.decimals,
        requireOutputIncrease: true,
    });
})();
