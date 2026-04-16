import fs from "fs";

import { Command } from "commander-ts";
import {
    JsonRpcProvider,
    Wallet
} from "ethers";
import "dotenv/config"

import { USDM0_TOKEN_CODE, USDM1_TOKEN_CODE } from "./consts";
import {
    EvmAtomicBrokerConfig,
    WhitelistStatus
} from "./interfaces";
import { approve } from "./api-functions/approve";
import { getAllowance } from "./api-functions/get-allowance";
import { getBalance } from "./api-functions/get-balance";
import { safeStringify, sleep } from "./api-functions/util";
import { getAtomicBrokerWhitelistStatus } from "./api-functions/get-atomic-broker-whitelist-status";
import { getWhitelistStatus } from "./api-functions/get-whitelist-status";
import { getAtomicBrokerConfig } from "./api-functions/get-atomic-broker-config";
import { getUsdm1PriceAttestation } from "./api-functions/get-usdm1-price-attestation";
import { atomicRedeem } from "./api-functions/atomic-redeem";
import { getAtomicBrokerRedemption } from "./api-functions/get-atomic-broker-redemption";
import { getEthereumRedeemPermit } from "./api-functions/get-ethereum-redeem-permit";
import {
    readBalance,
    validateOneToOneRedemption,
} from "./balance-validation";

/**********************************************************************************
 * Node command to perform an atomic redemption of USDM0 for mock collateral.
 * 
 * Checks USDM0 balance.
 * 
 * Checks the Broker"s allowance of the redeemer"s USDM0 and 
 * requests allowance if insufficient.
 * 
 * Fetches a price attestation for USDM1 from the API and includes it in the redemption request.
 * Fetches a price attestation for MOCK from the API and includes it in the redemption request.
 *
 * Fetches an ethers ContractTransaction from the API,
 * which is subsequently signed and submitted.
 * 
 * Uses a preconfigured wallet that is created by the create-wallet.ts node script.
 * The public address of this wallet MUST be whitelisted by M1 Global,
 * otherwise the redemption will fail.
 * 
 * Create the wallet first and then contact M1 Global for your client JWT for API access
 * and let us know what your Sepolia wallet public address is.
 * 
 * USDM1 tokens are minted to your wallet when you execute the deposit script.
 * The swap exchanges USDM1 for USDM0.
 * Call deposit first to receive USDM1 tokens, then swap to receive USDM0 tokens
 *  that can be redeemed for collateral.
 * 
 * Must be transpiled (npm run build).
 */

const pgm = new Command();

pgm.version("0.0.1")
    .description("Issue an atomic redemption of USDM0 for mock collateral")
    .requiredOption("-wp --walletPassword <password to decrypt the wallet json>")
    .parse(process.argv);

const options = pgm.opts();

(async () => {

    // Make sure there is an rpc endpoint to talk to.
    if (!process.env.ETHEREUM_SEPOLIA_RPC_URL) {
        console.error("no ETHEREUM_SEPOLIA_RPC_URL set in environment");
        return;
    }

    // Set a default amount of $10.
    // (USDM0 has 18 decimals)
    const amount = "10000000000000000000";

    const walletPath = "./wallet.json"

    // Check that the wallet exists
    if (!fs.existsSync(walletPath)) {
        console.error(`wallet file ${walletPath} missing. have you created a wallet using create-wallet.js?`);
        return;
    }

    // Load the wallet.
    const json = fs.readFileSync(walletPath, "utf-8");
    const wallet = Wallet.fromEncryptedJsonSync(json, options.walletPassword)
    console.info(`operating as ${wallet.address}`);

    // Init the json rpc provider.
    const provider = new JsonRpcProvider(process.env.ETHEREUM_SEPOLIA_RPC_URL);

    // Init the signer.
    const signer = wallet.connect(provider);

    // First things first, check both whitelist systems.
    let whitelistStatus: WhitelistStatus | undefined;
    let atomicWhitelistStatus: WhitelistStatus | undefined;
    try {
        whitelistStatus = await getWhitelistStatus("ethereum-sepolia", wallet.address);
        atomicWhitelistStatus = await getAtomicBrokerWhitelistStatus(wallet.address, true);
    } catch (err) {
        if ((err as Error).message == "unauthorized") {
            console.error("Your JWT is invalid.");
        } else {
            console.error(`an error occurred: ${err}`);
        }
        return;
    }

    if (!whitelistStatus ||
        !whitelistStatus.status ||
        whitelistStatus.status.toLowerCase() != "Whitelisted".toLocaleLowerCase()) {
        console.error(`Address ${wallet.address} on ethereum-sepolia is not whitelisted in the Solana-backed M1 whitelist. Contact M1 Global for access.`);
        return;
    }

    if (!atomicWhitelistStatus ||
        !atomicWhitelistStatus.status ||
        atomicWhitelistStatus.status.toLowerCase() != "Whitelisted".toLocaleLowerCase()) {
        console.error(`Address ${wallet.address} is not whitelisted in the Ethereum atomic broker contract whitelist. Contact M1 Global for access.`);
        return;
    }

    // Fetch the M1 atomic broker config on Sepolia.
    const brokerConfig: EvmAtomicBrokerConfig | undefined = await getAtomicBrokerConfig(true);

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
    const mock = brokerConfig.collaterals.find(col => col.symbol == "mock");
    if (!mock) {
        console.error("no mock collateral supported by broker");
        return;
    }

    // Fetch and report balances of both USDM0 and mock.
    // The same block will be run a the end to see the final result.
    let usdm0Balance = await getBalance("USDM0", wallet.address, true);
    if (!usdm0Balance) {
        console.error("failed to fetch balance for USDM0");
        return;
    }
    console.info(`balance of USDM0: ${usdm0Balance?.balance}`);
    let mockBalance = await getBalance("mock", wallet.address, true);
    console.info(`balance of mock: ${mockBalance?.balance}`);
    const balancesBeforeRedemption = {
        USDM0: readBalance(usdm0Balance, "USDM0"),
        mock: readBalance(mockBalance, "mock"),
    };

    // Check that there is enough USDM0 for the redemption.
    if (BigInt(usdm0Balance.balance) < BigInt(amount)) {
        console.error("Insufficient USDM0 balance.")
        return;
    }

    // Fetch the allowance the Broker has on the owner"s USDM0.
    const allowance = await getAllowance(
        brokerConfig.usdm0!.address,
        wallet.address,
        brokerConfig.address,
        true);

    // Check if the allowance is sufficient.
    if (!allowance || BigInt(allowance.allowance) < BigInt(amount)) {

        // Allowance is not sufficient,
        // request an allowance in the amount of the redemption.
        console.info(`Reqeusting approval for ${amount} USDM0`)
        const contractTransaction = await approve(
            brokerConfig.usdm0!.address,
            wallet.address,
            brokerConfig.address,
            amount,
            true
        )

        if (!contractTransaction) {
            console.error("no approve transaction to sign");
            return;
        }

        let resp = await signer.sendTransaction(contractTransaction);
        await resp.wait();
    }

    // create an empty attestation for MOCK
    const EMPTY_ATTESTATION = {
        token: mock.address,
        index: "0",
        notBefore: "0",
        notAfter: "0",
        seq: "0",
        signature: "0x"
    };

    // Fetch a price attestation for USDM1 from the API.
    const usdm1Attestation = await getUsdm1PriceAttestation(wallet.address, true);
    if (!usdm1Attestation) {
        console.error("failed to fetch price attestation for USDM1");
        return;
    }

    const redeemPermit = await getEthereumRedeemPermit(
        wallet.address,
        wallet.address,
        USDM0_TOKEN_CODE,
        mock.address,
        BigInt(amount),
        true);
    if (!redeemPermit) {
        console.error("failed to fetch a redeem permit");
        return;
    }

    // Fetch a redemption transaction from the api.
    // Note that the parameters are flipped from deposit().
    const contractTransaction = await atomicRedeem(
        wallet.address,
        USDM0_TOKEN_CODE,
        amount,
        mock.address,
        wallet.address, // the recipient is the redeemer
        EMPTY_ATTESTATION,
        usdm1Attestation,
        redeemPermit,
        true);
    console.debug(safeStringify(contractTransaction))

    if (!contractTransaction) {
        console.error("no redemption transaction to sign");
        return;
    }

    // Sign and submit the transaction.
    const txResp = await signer.sendTransaction(contractTransaction);
    if (!txResp) {
        console.error("transaction failed to submit");
        console.info(txResp);
        return;
    }

    // Request a transaction receipt for confirmation.
    const txReceipt = await txResp.wait();
    console.info(`redemption confirmed in ${txReceipt?.blockNumber}`);

    // Fetch the redemption.
    let redemptionRecord = await getAtomicBrokerRedemption(wallet.address, true);
    console.info("redemption record:");
    console.info(safeStringify(redemptionRecord));

    // Sleep briefly to allow the RPC node to reflect the confirmed state.
    console.info("sleeping 120 seconds for redemption processing.");
    await sleep(120000);

    // Re-fetch the balances.
    // USDM0 should be 0.
    // mock should be 0.
    usdm0Balance = await getBalance("USDM0", wallet.address, true);
    console.info(`balance of USDM0: ${usdm0Balance?.balance}`);
    mockBalance = await getBalance("mock", wallet.address, true);
    console.info(`balance of mock: ${mockBalance?.balance}`);
    validateOneToOneRedemption({
        chainTag: "[evm]",
        stage: "after-submit",
        before: balancesBeforeRedemption,
        after: {
            USDM0: readBalance(usdm0Balance, "USDM0"),
            mock: readBalance(mockBalance, "mock"),
        },
        inputToken: "USDM0",
        inputAmount: BigInt(amount),
        inputDecimals: brokerConfig.usdm0?.decimals,
        outputToken: "mock",
        outputDecimals: mock.decimals,
        requireOutputIncrease: true,
    });
})();
