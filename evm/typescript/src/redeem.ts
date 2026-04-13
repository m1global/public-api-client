import fs from "fs";

import { Command } from "commander-ts";
import { Interface, JsonRpcProvider, Wallet } from "ethers";
import "dotenv/config"

import { USDM0_TOKEN_CODE } from "./consts";
import { EvmBrokerConfig, WhitelistStatus } from "./interfaces";
import { approve } from "./api-functions/approve";
import { getAllowance } from "./api-functions/get-allowance";
import { getBalance } from "./api-functions/get-balance";
import { getBrokerConfig } from "./api-functions/get-broker-config";
import { safeStringify, sleep } from "./api-functions/util";
import { getWhitelistStatus } from "./api-functions/get-whitelist-status";
import { redeem } from "./api-functions/redeem";
import { getRedemption } from "./api-functions/get-redemption";
import {
    readBalance,
    validateOneToOneRedemption,
} from "./balance-validation";

/**********************************************************************************
 * Node command to perform a redemption of USDM0 for mock collateral.
 * 
 * Checks USDM0 balance.
 * 
 * Checks the Broker"s allowance of the redeemer"s USDM0 and 
 * requests allowance if insufficient.
 * 
 * Fetches an ethers ContractTransaction from the API
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
    .description("Issue a redemption of USDM0 for mock collateral")
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
    console.info(`[evm] chain=ethereum-sepolia rpc=${process.env.ETHEREUM_SEPOLIA_RPC_URL}`);
    console.info(`[evm] api base url=${process.env.M1_API_BASE_URL}`);
    console.info(`[evm] flow=redeem amount=${amount} inputToken=${USDM0_TOKEN_CODE} outputToken=mock`);

    // Init the json rpc provider.
    const provider = new JsonRpcProvider(process.env.ETHEREUM_SEPOLIA_RPC_URL);

    // Init the signer.
    const signer = wallet.connect(provider);

    // First things first, check the whitelist status.
    var whitelistStatus: WhitelistStatus | undefined;
    try {
        whitelistStatus = await getWhitelistStatus("ethereum-sepolia", wallet.address);
    } catch (err) {
        if ((err as Error).message == "unauthorized") {
            console.error("Your JWT is invalid.")
        } else {
            console.info(`an error occurred: ${err}`)
        }
        return;
    }

    if (!whitelistStatus ||
        !whitelistStatus.status ||
        whitelistStatus?.status.toLowerCase() != "Whitelisted".toLocaleLowerCase()) {
        console.error(`Address ${wallet.address} on ethereum-sepolia is not whitelisted. Contact M1 Global for access.`);
        return;
    }

    // Fetch the M1 broker config on Sepolia.
    const brokerConfig: EvmBrokerConfig | undefined = await getBrokerConfig(true);

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

    // Fetch a redemption transaction from the api.
    // Note that the parameters are flipped from deposit().
    const contractTransaction = await redeem(
        wallet.address,
        USDM0_TOKEN_CODE,
        amount,
        mock.address,
        true);
    console.info(`[evm] prepared redemption transaction: ${safeStringify(contractTransaction)}`)

    if (!contractTransaction) {
        console.error("no redemption transaction to sign");
        return;
    }

    console.info(
        `[evm] redemption transaction to=${contractTransaction.to ?? "unknown"} ` +
        `dataLength=${contractTransaction.data?.length ?? 0} value=${contractTransaction.value?.toString() ?? "0"}`
    );

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
    let redemptionRecord = await getRedemption(wallet.address, true);
    console.info("redemption record:");
    console.info(safeStringify(redemptionRecord));

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
        requireOutputIncrease: false,
    });

    // Sleep for 5 minutes to wait for finality in the cross-chain messaging.
    console.info("sleeping for 5 minutes to wait for cross-chain finality. grab a coffee?");
    await sleep(300 * 1000);
    // Re-fetch the redemption.
    // The redemption should be approve and should have a non-zero amountApproved value.
    redemptionRecord = await getRedemption(wallet.address, true);
    console.info("redemption record:");
    console.info(safeStringify(redemptionRecord));

    // Sleep for another 5 minutes to allow the fulfillment transaction
    // and indexer state to catch up.
    console.info("sleeping for another 5 minutes to wait for redemption fulfillment...");
    await sleep(300 * 1000);

    redemptionRecord = await getRedemption(wallet.address, true);
    console.info("redemption record:");
    console.info(safeStringify(redemptionRecord));
    // Re-fetch the balances.
    // USDM0 should be 0.
    // mock should be 10000000.
    // as USDM0 is swapped 1:1.
    // (If the redemption fails, mock will be 100 and USDM0 will be 0)
    usdm0Balance = await getBalance("USDM0", wallet.address, true);
    console.info(`balance of USDM0: ${usdm0Balance?.balance}`);
    mockBalance = await getBalance("mock", wallet.address, true);
    console.info(`balance of mock: ${mockBalance?.balance}`);
    validateOneToOneRedemption({
        chainTag: "[evm]",
        stage: "after-settlement",
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
