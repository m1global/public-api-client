import {
    Keypair,
    Networks,
    rpc,
} from "@stellar/stellar-sdk";

import { Command } from "commander-ts";

import "dotenv/config";

import { USDM1_TOKEN_CODE } from "./consts";
import {
    StellarBrokerConfig,
    WhitelistStatus
} from "./interfaces";
import { approve } from "./api-functions/approve";
import { deposit } from "./api-functions/deposit";
import { faucet } from "./api-functions/faucet";
import { getAllowance } from "./api-functions/get-allowance";
import { getBalance } from "./api-functions/get-balance";
import {
    getDepositRecord,
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
import {
    readBalance,
    validateHeuristicBalanceChange,
} from "./balance-validation";

/**********************************************************************************
 * Node comand to peform a deposit of mock collateral for USDM1 on Stellar Testnet.
 * 
 * Checks collateral balance and attempts to request mock collateral from 
 * the M1 Stellar faucet which is rate limited to 
 * 1 request every 24 hours per token per chain. 
 * 
 * Checks the Broker"s allowance of the depositor"s collateral and 
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
    .description("Issue a deposit of collateral for USDM token")
    .requiredOption("-s --secret <secret for Stellar keypair>")
    .parse(process.argv);

const options = pgm.opts();

(async () => {

    // make sure there is an rpc endpoint to talk to
    if (!process.env.STELLAR_TESTNET_RPC_URL) {
        console.error("no STELLAR_TESTNET_RPC_URL set in environment");
        return;
    }

    // set a default amount of $100
    // (the mock collaterel is a standard Stellar asset and has 7 decimals)
    const amount = "1000000000";

    const keypair = Keypair.fromSecret(options.secret);
    const publicKey = keypair.publicKey();
    console.info(`operating as ${publicKey}`);
    console.info(`[stellar] network=testnet rpc=${process.env.STELLAR_TESTNET_RPC_URL}`);
    console.info(`[stellar] api base url=${process.env.M1_API_BASE_URL}`);
    console.info(`[stellar] flow=deposit amount=${amount} inputToken=MOCK outputToken=${USDM1_TOKEN_CODE}`);

    const server = new rpc.Server(process.env.STELLAR_TESTNET_RPC_URL!);
    const stellarNetwork = Networks.TESTNET;

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

    // Fetch the M1 broker config on Sepolia.
    const brokerConfig: StellarBrokerConfig | undefined = await getBrokerConfig(true);

    if (!brokerConfig) {
        console.error("no broker config");
        return;
    }

    // Ensure there are collaterals supported by the broker.
    if (!brokerConfig.collaterals || brokerConfig.collaterals.length == 0) {
        console.error("no collaterals supported by broker");
        return;
    }

    // Identify the mock collateral from the collection.
    const mock = brokerConfig.collaterals.find(col => col.symbol?.toLowerCase() == "mock");
    if (!mock) {
        console.error("no mock collateral supported by broker");
        return;
    }

    // Check the trustlines for the keypair.
    // Note: even balance checks will fail with an error if the keypair holds no
    // trustlines to the assets in the deposit transaction.
    let trustline = await getTrustline(mock.symbol!, mock.issuer!, publicKey, true);
    if (!trustline) {
        console.info("No trustline for MOCK");

        // Create a trustline for MOCK
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

    trustline = await getTrustline(brokerConfig.usdm1?.symbol!, brokerConfig.usdm1!.issuer!, publicKey, true);
    if (!trustline) {
        console.error("No trustline for USDM1");

        // Create a trustline for USDM1
        const xdr = await createTrustline(
            brokerConfig.usdm1!.symbol!,
            brokerConfig.usdm1!.issuer!,
            publicKey,
            true
        );
        console.info(`[stellar] trustline xdr length for USDM1: ${xdr?.length ?? 0}`);

        if (!xdr) {
            console.error("no create trustline transaction to sign");
            return;
        }

        const txHash = await signAndSendTx(server, xdr, stellarNetwork, keypair); //throws
        await waitForTx(server, txHash!);
    }

    // Fetch and report balances of both mock and USDM1.
    // The same block will be run at the end to see the final result.
    let mockBalance = await getBalance(mock.symbol!, publicKey, true);
    if (!mockBalance) {
        console.error("failed to fetch balance for MOCK");
        return;
    }
    console.info(`balance of mock: ${mockBalance?.balance}`);
    let usdm1Balance = await getBalance(brokerConfig.usdm1?.symbol!, publicKey, true);
    if (!usdm1Balance) {
        console.error("failed to fetch balance for USDM1");
        return;
    }
    console.info(`balance of USDM1: ${usdm1Balance?.balance}`);

    // Check that there is enough mock for the deposit.
    if (BigInt(mockBalance.balance) < BigInt(amount)) {

        console.error("Insufficient mock balance.")

        // Attempt a faucet request.
        // Returns an operation id that needs to be polled 
        // (the internal M1 service that perfoms the faucet
        // request is async and message driven and therefore
        // does not return anything).
        // THis is a slightly different request to the API,
        // as we're asking it to perform a blockchain operation
        // using it's own wallets, hence no transaction is
        // returned.
        const opId = await faucet("MOCK", publicKey);
        if (!opId) {
            console.error("faucet failure");
            return;
        }

        // sleep for one block
        await sleep(5000);
        const txHash = await getOperation(opId);
        if (!txHash) {
            console.error("faucet transaction did not get broadcast");
            return;
        }

        await waitForTx(server, txHash);

        mockBalance = await getBalance(mock.symbol!, publicKey, true);
        if (!mockBalance) {
            console.error("failed to fetch balance for MOCK after faucet");
            return;
        }
        console.info(`balance of mock after faucet: ${mockBalance.balance}`);
    }

    const balancesBeforeDeposit = {
        MOCK: readBalance(mockBalance, "MOCK"),
        USDM1: readBalance(usdm1Balance, "USDM1"),
    };

    // Fetch the allowance the Broker has on the owner"s mock collateral.
    const allowance = await getAllowance(
        mock.address,
        publicKey,
        brokerConfig.address,
        true);

    // Check if the allowance is sufficient
    if (!allowance || BigInt(allowance.allowance) < BigInt(amount)) {

        // Allowance is not sufficient.
        // Request an allowance in the amount of the deposit.
        const xdr = await approve(
            mock.address,
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

    // Fetch a deposit transaction from the api.
    const xdr = await deposit(
        publicKey,
        mock.address,
        amount,
        USDM1_TOKEN_CODE,
        true);

    if (!xdr) {
        console.error("no deposit transaction to sign");
        return;
    }

    console.info(`[stellar] deposit transaction xdr length=${xdr.length}`);

    let txHash = await prepareSignAndSendTx(server, xdr, stellarNetwork, keypair);
    await waitForTx(server, txHash!);

    const depositRecord = await getDepositRecord(server, brokerConfig.address, publicKey, true);
    logBrokerRecordSnapshot("deposit record after submit", depositRecord);

    // Re-fetch the balances.
    // mock should be 0 because it was transferred.
    // USDM1 should be 0 becuase it hasn't been minted yet.
    mockBalance = await getBalance("MOCK", publicKey, true);
    console.info(`balance of mock: ${mockBalance?.balance}`);
    usdm1Balance = await getBalance("USDM1", publicKey, true);
    console.info(`balance of USDM1: ${usdm1Balance?.balance}`);
    validateHeuristicBalanceChange({
        chainTag: "[stellar]",
        operation: "deposit",
        stage: "after-submit",
        before: balancesBeforeDeposit,
        after: {
            MOCK: readBalance(mockBalance, "MOCK"),
            USDM1: readBalance(usdm1Balance, "USDM1"),
        },
        inputToken: "MOCK",
        inputAmount: BigInt(amount),
        outputToken: "USDM1",
        requireOutputIncrease: false,
    });

    // Sleep for 15 seconds to wait for the cross-chain messaging.
    console.info("sleeping for 15 seconds to wait for cross-chain messaging...");
    await sleep(15 * 1000);

    // MOCK should be 0.
    // USDM1 should be a value close to but less than 1000000000.
    // (If the deposit fails, mock will be 1000000000 and USDM1 will be 0)
    mockBalance = await getBalance("MOCK", publicKey, true);
    console.info(`balance of mock: ${mockBalance?.balance}`);
    usdm1Balance = await getBalance("USDM1", publicKey, true);
    console.info(`balance of USDM1: ${usdm1Balance?.balance}`);
    validateHeuristicBalanceChange({
        chainTag: "[stellar]",
        operation: "deposit",
        stage: "after-settlement",
        before: balancesBeforeDeposit,
        after: {
            MOCK: readBalance(mockBalance, "MOCK"),
            USDM1: readBalance(usdm1Balance, "USDM1"),
        },
        inputToken: "MOCK",
        inputAmount: BigInt(amount),
        outputToken: "USDM1",
        requireOutputIncrease: true,
    });
})();
