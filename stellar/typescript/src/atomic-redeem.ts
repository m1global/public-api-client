import {
    Keypair,
    Networks,
    rpc,
} from "@stellar/stellar-sdk";

import { Command } from "commander-ts";

import "dotenv/config";

import { USDM0_TOKEN_CODE } from "./consts";
import {
    StellarAtomicBrokerConfig,
    StellarPriceAttestation,
    WhitelistStatus,
} from "./interfaces";
import { approve } from "./api-functions/approve";
import { getAllowance } from "./api-functions/get-allowance";
import { getBalance } from "./api-functions/get-balance";
import { getAtomicBrokerConfig } from "./api-functions/get-atomic-broker-config";
import { getUsdm1PriceAttestation } from "./api-functions/get-usdm1-price-attestation";
import { getStellarRedeemPermit } from "./api-functions/get-stellar-redeem-permit";
import { atomicRedeem } from "./api-functions/atomic-redeem";
import {
    prepareSignAndSendTx,
    signAndSendTx,
    waitForTx
} from "./api-functions/util";
import { getWhitelistStatus } from "./api-functions/get-whitelist-status";
import { getTrustline } from "./api-functions/get-trustline";
import { createTrustline } from "./api-functions/trustline";
import {
    readBalance,
    validateOneToOneRedemption,
} from "./balance-validation";
import { safeStringify } from "./api-functions/util";

/**********************************************************************************
 * Node command to perform an atomic redemption of USDM0 for mock collateral on Stellar Testnet.
 *
 * Checks USDM0 balance.
 *
 * Checks the Broker's allowance of the redeemer's USDM0 and
 * requests allowance if insufficient.
 *
 * Fetches price attestations and a redeem permit from the API.
 *
 * Fetches a transaction as a base-64 encoded XDR string from the API
 * which is subsequently signed and submitted.
 *
 * Uses a preconfigured wallet that is created via the Stellar CLI.
 * To create a wallet: stellar keys generate alice
 * Next fund the wallet: stellar keys fund alice
 * (or use Stellar Labs' friendbot)
 *
 * Inject your keypair secret via the command line via: node dist/atomic-redeem.js -s "$(stellar keys secret alice)"
 *
 * USDM1 tokens are minted to your wallet when you execute the atomic-deposit script.
 * The swap exchanges USDM1 for USDM0.
 * Call atomic-deposit first to receive USDM1 tokens, then atomic-swap to receive USDM0 tokens
 * that can be redeemed for collateral.
 *
 * Must be transpiled (npm run build).
 */

const pgm = new Command();

pgm.version("0.0.1")
    .description("Issue an atomic redemption of USDM0 for mock collateral")
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
    // (both USDM tokens are standard Stellar assets and have 7 decimals)
    const amount = "100000000";

    const keypair = Keypair.fromSecret(options.secret);
    const publicKey = keypair.publicKey();
    console.info(`operating as ${publicKey}`);
    console.info(`[stellar] network=testnet rpc=${process.env.STELLAR_TESTNET_RPC_URL}`);
    console.info(`[stellar] api base url=${process.env.M1_API_BASE_URL}`);
    console.info(`[stellar] flow=atomic-redeem amount=${amount} inputToken=USDM0 outputToken=MOCK`);

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

    // Ensure both tokens are supported by the broker.
    if (!brokerConfig.usdm0) {
        console.error("No USDM0 token support in broker");
        return;
    }
    if (!brokerConfig.usdm1) {
        console.error("No USDM1 token support in broker");
        return;
    }

    // Identify the mock collateral from the collection.
    const mock = brokerConfig.collaterals?.find(col => col.symbol?.toLowerCase() == "mock");
    if (!mock) {
        console.error("no mock collateral supported by broker");
        return;
    }

    // Check the trustlines for the keypair.
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

    trustline = await getTrustline(mock.symbol!, mock.issuer!, publicKey, true);
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

    // Fetch and report balances of both USDM0 and Mock.
    let usdm0Balance = await getBalance("USDM0", publicKey, true);
    if (!usdm0Balance) {
        console.error("failed to fetch balance for USDM0");
        return;
    }
    console.info(`balance of USDM0: ${usdm0Balance?.balance}`);
    let mockBalance = await getBalance("MOCK", publicKey, true);
    if (!mockBalance) {
        console.error("failed to fetch balance for MOCK");
        return;
    }
    console.info(`balance of MOCK: ${mockBalance?.balance}`);
    const balancesBeforeRedemption = {
        USDM0: readBalance(usdm0Balance, "USDM0"),
        MOCK: readBalance(mockBalance, "MOCK"),
    };

    // Check that there is enough USDM0 for the redemption.
    if (BigInt(usdm0Balance.balance) < BigInt(amount)) {
        console.error("Insufficient USDM0 balance.")
        return;
    }

    // Fetch the allowance the Broker has on the owner's USDM0.
    const allowance = await getAllowance(
        brokerConfig.usdm0!.address,
        publicKey,
        brokerConfig.address,
        true);

    // Check if the allowance is sufficient
    if (!allowance || BigInt(allowance.allowance) < BigInt(amount)) {

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

    // Fetch a redeem permit from the API.
    const redeemPermit = await getStellarRedeemPermit(
        publicKey,
        publicKey,
        USDM0_TOKEN_CODE,
        mock.address,
        amount,
        true);
    if (!redeemPermit) {
        console.error("failed to fetch a redeem permit");
        return;
    }

    // Fetch a redemption transaction from the API.
    const xdr = await atomicRedeem(
        publicKey,
        USDM0_TOKEN_CODE,
        amount,
        mock.address,
        publicKey, // the recipient is the redeemer
        EMPTY_ATTESTATION,
        usdm1Attestation,
        redeemPermit,
        true);
    console.debug(safeStringify(xdr));

    if (!xdr) {
        console.error("no redemption transaction to sign");
        return;
    }

    console.info(`[stellar] atomic redemption transaction xdr length=${xdr.length}`);

    let txHash = await prepareSignAndSendTx(server, xdr, stellarNetwork, keypair);
    await waitForTx(server, txHash!);

    // Re-fetch the balances.
    // USDM0 should decrease by the redemption amount (escrowed, pending process_redemption).
    // MOCK should remain the same until the redemption is processed by the operator.
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
})();
