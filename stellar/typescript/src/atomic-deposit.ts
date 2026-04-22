import {
    Keypair,
    Networks,
    rpc,
} from "@stellar/stellar-sdk";

import { Command } from "commander-ts";

import "dotenv/config";

import { USDM1_TOKEN_CODE } from "./consts";
import {
    StellarAtomicBrokerConfig,
    StellarPriceAttestation,
    WhitelistStatus
} from "./interfaces";
import { approve } from "./api-functions/approve";
import { faucet } from "./api-functions/faucet";
import { getAllowance } from "./api-functions/get-allowance";
import { getBalance } from "./api-functions/get-balance";
import { getAtomicBrokerConfig } from "./api-functions/get-atomic-broker-config";
import { getUsdm1PriceAttestation } from "./api-functions/get-usdm1-price-attestation";
import { getStellarDepositPermit } from "./api-functions/get-stellar-deposit-permit";
import { atomicDeposit } from "./api-functions/atomic-deposit";
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
 * Node command to perform an atomic deposit of mock collateral for USDM1 on Stellar Testnet.
 *
 * Checks collateral balance and attempts to request mock collateral from
 * the M1 Stellar faucet which is rate limited to
 * 1 request every 24 hours per token per chain.
 *
 * Checks the Broker's allowance of the depositor's collateral and
 * requests allowance if insufficient.
 *
 * Fetches a price attestation for USDM1 and a deposit permit from the API.
 *
 * Fetches a transaction as a base-64 encoded XDR string from the API
 * which is subsequently signed and submitted.
 *
 * Uses a preconfigured wallet that is created via the Stellar CLI.
 * To create a wallet: stellar keys generate alice
 * Next fund the wallet: stellar keys fund alice
 * (or use Stellar Labs' friendbot)
 *
 * Inject your keypair secret via the command line via: node dist/atomic-deposit.js -s "$(stellar keys secret alice)"
 *
 * Create the wallet first and then contact M1 Global for your client JWT for API access
 * and let us know what your Stellar testnet wallet public address is.
 *
 * This script and others in this directory require a .env file read by dotenv at the root level,
 * i.e. where package.json lives.
 * Copy the .env.example and fill in the missing fields.
 *
 * Must be transpiled (npm run build).
 */

const pgm = new Command();

pgm.version("0.0.1")
    .description("Issue an atomic deposit of collateral for USDM token")
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
    // (the mock collateral is a standard Stellar asset and has 7 decimals)
    const amount = "1000000000";

    const keypair = Keypair.fromSecret(options.secret);
    const publicKey = keypair.publicKey();
    console.info(`operating as ${publicKey}`);
    console.info(`[stellar] network=testnet rpc=${process.env.STELLAR_TESTNET_RPC_URL}`);
    console.info(`[stellar] api base url=${process.env.M1_API_BASE_URL}`);
    console.info(`[stellar] flow=atomic-deposit amount=${amount} inputToken=MOCK outputToken=${USDM1_TOKEN_CODE}`);

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

    // Fetch the M1 atomic broker config on Stellar testnet.
    const brokerConfig: StellarAtomicBrokerConfig | undefined = await getAtomicBrokerConfig(true);

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
    let trustline = await getTrustline(mock.symbol!, mock.issuer!, publicKey, true);
    if (!trustline) {
        console.info("No trustline for MOCK");

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

        const txHash = await signAndSendTx(server, xdr, stellarNetwork, keypair);
        await waitForTx(server, txHash!);
    }

    trustline = await getTrustline(brokerConfig.usdm1?.symbol!, brokerConfig.usdm1!.issuer!, publicKey, true);
    if (!trustline) {
        console.info("No trustline for USDM1");

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

        const txHash = await signAndSendTx(server, xdr, stellarNetwork, keypair);
        await waitForTx(server, txHash!);
    }

    // Fetch and report balances of both mock and USDM1.
    let mockBalance = await getBalance(mock.symbol!, publicKey, true, brokerConfig);
    if (!mockBalance) {
        console.error("failed to fetch balance for MOCK");
        return;
    }
    console.info(`balance of mock: ${mockBalance?.balance}`);
    let usdm1Balance = await getBalance(brokerConfig.usdm1?.symbol!, publicKey, true, brokerConfig);
    if (!usdm1Balance) {
        console.error("failed to fetch balance for USDM1");
        return;
    }
    console.info(`balance of USDM1: ${usdm1Balance?.balance}`);

    // Check that there is enough mock for the deposit.
    if (BigInt(mockBalance.balance) < BigInt(amount)) {

        console.error("Insufficient mock balance.")

        const opId = await faucet("MOCK", publicKey);
        if (!opId) {
            console.error("faucet failure");
            return;
        }

        await sleep(5000);
        const txHash = await getOperation(opId);
        if (!txHash) {
            console.error("faucet transaction did not get broadcast");
            return;
        }

        await waitForTx(server, txHash);

        mockBalance = await getBalance(mock.symbol!, publicKey, true, brokerConfig);
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

    // Fetch the allowance the Broker has on the owner's mock collateral.
    const allowance = await getAllowance(
        mock.address,
        publicKey,
        brokerConfig.address,
        true);

    // Check if the allowance is sufficient
    if (!allowance || BigInt(allowance.allowance) < BigInt(amount)) {

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

        const txHash = await prepareSignAndSendTx(server, xdr, stellarNetwork, keypair);
        await waitForTx(server, txHash!);
    }

    // Create an empty attestation for MOCK (no attestation required).
    const EMPTY_ATTESTATION: StellarPriceAttestation = {
        index: "0",
        notBefore: "0",
        notAfter: "0",
        seq: "0",
        publicKey: "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=",
        signature: "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA==",
    };

    // Fetch a price attestation for USDM1 from the API.
    const usdm1Attestation = await getUsdm1PriceAttestation(publicKey, true);
    if (!usdm1Attestation) {
        console.error("failed to fetch price attestation for USDM1");
        return;
    }

    // Fetch a deposit permit from the API.
    const depositPermit = await getStellarDepositPermit(
        publicKey,
        publicKey,
        USDM1_TOKEN_CODE,
        mock.address,
        amount,
        true);
    if (!depositPermit) {
        console.error("failed to fetch a deposit permit");
        return;
    }

    if (depositPermit.usdm !== brokerConfig.usdm1?.address) {
        console.error(
            `[stellar] deposit permit usdm mismatch: expected ${brokerConfig.usdm1?.address}, got ${depositPermit.usdm}`,
        );
        return;
    }

    // Fetch a deposit transaction from the API.
    const xdr = await atomicDeposit(
        publicKey,
        publicKey, // the recipient is the depositor
        mock.address,
        amount,
        USDM1_TOKEN_CODE,
        EMPTY_ATTESTATION,
        usdm1Attestation,
        depositPermit,
        true);

    if (!xdr) {
        console.error("no deposit transaction to sign");
        return;
    }

    console.info(`[stellar] atomic deposit transaction xdr length=${xdr.length}`);

    let txHash = await prepareSignAndSendTx(server, xdr, stellarNetwork, keypair);
    await waitForTx(server, txHash!);

    // Re-fetch the balances.
    // mock should decrease by the deposit amount.
    // USDM1 should increase (minted atomically).
    mockBalance = await getBalance("MOCK", publicKey, true, brokerConfig);
    console.info(`balance of mock: ${mockBalance?.balance}`);
    usdm1Balance = await getBalance("USDM1", publicKey, true, brokerConfig);
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
        requireOutputIncrease: true,
    });
})();
