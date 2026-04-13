import fs from "fs";

import { Command } from "commander-ts";
import { JsonRpcProvider, Wallet } from "ethers";
import "dotenv/config"

import { USDM1_TOKEN_CODE } from "./consts";
import { EvmBrokerConfig, WhitelistStatus } from "./interfaces";
import { approve } from "./api-functions/approve";
import { deposit } from "./api-functions/deposit";
import { faucet } from "./api-functions/faucet";
import { getAllowance } from "./api-functions/get-allowance";
import { getBalance } from "./api-functions/get-balance";
import { getBrokerConfig } from "./api-functions/get-broker-config";
import { getDeposit } from "./api-functions/get-deposit";
import { safeStringify, sleep } from "./api-functions/util";
import { getWhitelistStatus } from "./api-functions/get-whitelist-status";
import {
    readBalance,
    validateHeuristicBalanceChange,
} from "./balance-validation";

/**********************************************************************************
 * Node command to perform a deposit of mock collateral for USDM1 on Ethereum Sepolia.
 * 
 * Checks collateral balance and attempts to request mock collateral from 
 * the M1 Sepolia faucet which is rate limited to 
 * 1 request every 24 hours per token per chain. 
 * 
 * Checks the Broker"s allowance of the depositor"s collateral and 
 * requests allowance if insufficient.
 * 
 * Fetches an ethers ContractTransaction from the API
 * which is subsequently signed and submitted.
 * 
 * Uses a preconfigured wallet that is created by the create-wallet.ts node script.
 * The public address of this wallet MUST be whitelisted by M1 Global,
 * otherwise the deposit will fail.
 * 
 * Create the wallet first and then contact M1 Global for your client JWT for API access
 * and let us know what your Sepolia wallet public address is.
 * 
 * Must be transpiled (npm run build).
 */

const pgm = new Command();

pgm.version("0.0.1")
    .description("Issue a deposit of collateral for USDM token")
    .requiredOption("-wp --walletPassword <password to decrypt the wallet json>")
    .parse(process.argv);

const options = pgm.opts();

(async () => {

    // make sure there is an rpc endpoint to talk to
    if (!process.env.ETHEREUM_SEPOLIA_RPC_URL) {
        console.error("no ETHEREUM_SEPOLIA_RPC_URL set in environment");
        return;
    }

    // set a default amount of $100
    // (the mock collaterel should have 6 decimals to simulate USDC)
    const amount = "100000000";

    const walletPath = "./wallet.json"

    // Check that the wallet exists.
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
    console.info(`[evm] flow=deposit amount=${amount} inputToken=mock outputToken=${USDM1_TOKEN_CODE}`);

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
            console.error(`an error occurred: ${err}`)
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

    // Fetch and report balances of both mock and USDM1.
    // The same block will be run at the end to see the final result.
    let mockBalance = await getBalance("mock", wallet.address, true);
    if (!mockBalance) {
        console.error("failed to fetch balance for mock");
        return;
    }
    console.info(`balance of mock: ${mockBalance?.balance}`);
    let usdm1Balance = await getBalance("USDM1", wallet.address, true);
    console.info(`balance of USDM1: ${usdm1Balance?.balance}`);

    // Check that there is enough mock for the deposit.
    if (BigInt(mockBalance.balance) < BigInt(amount)) {

        console.error("Insufficient mock balance.")

        // Attempt a faucet request.
        // Returns an operation id that needs to be polled 
        // (the internal M1 service that perfoms the faucet
        // request is async and message driven and therefore
        // does not return anything).
        const faucetResult = await faucet("MOCK", wallet.address);
        if (!faucetResult) {
            console.error("faucet failure");
            return;
        }
        console.info(`[evm] faucet tx=${faucetResult.tx}`);
        if (faucetResult.txUrl) {
            console.info(`[evm] faucet txUrl=${faucetResult.txUrl}`);
        }

        // sleep for one block
        await sleep(12000);

        // wait for 2 blocks of confirmation, adjust as necessary
        await provider.waitForTransaction(faucetResult.tx, 2);

        mockBalance = await getBalance("mock", wallet.address, true);
        if (!mockBalance) {
            console.error("failed to fetch balance for mock after faucet");
            return;
        }
        console.info(`balance of mock after faucet: ${mockBalance.balance}`);
    }

    const balancesBeforeDeposit = {
        mock: readBalance(mockBalance, "mock"),
        USDM1: readBalance(usdm1Balance, "USDM1"),
    };

    // Fetch the allowance the Broker has on the owner"s mock collateral.
    const allowance = await getAllowance(
        mock.address,
        wallet.address,
        brokerConfig.address,
        true);

    // Check if the allowance is sufficient
    if (!allowance || BigInt(allowance.allowance) < BigInt(amount)) {

        // Allowance is not sufficient.
        // Request an allowance in the amount of the deposit.
        const contractTransaction = await approve(
            mock.address,
            wallet.address,
            brokerConfig.address,
            amount,
            true
        )

        if (!contractTransaction) {
            console.error("no approve transaction to sign");
            return;
        }

        console.info(
            `[evm] approval transaction to=${contractTransaction.to ?? "unknown"} ` +
            `dataLength=${contractTransaction.data?.length ?? 0} value=${contractTransaction.value?.toString() ?? "0"}`
        );
        console.info("[evm] sending approval transaction");

        const resp = await signer.sendTransaction(contractTransaction);
        console.info(`[evm] approval transaction hash=${resp.hash}`);
        console.info("[evm] waiting for approval confirmation");

        const approvalReceipt = await resp.wait();
        console.info(`approval confirmed in ${approvalReceipt?.blockNumber}`);
    }

    // Fetch a deposit transaction from the api.
    const contractTransaction = await deposit(
        wallet.address,
        mock.address,
        amount,
        USDM1_TOKEN_CODE,
        true);

    if (!contractTransaction) {
        console.error("no deposit transaction to sign");
        return;
    }

    console.info(
        `[evm] deposit transaction to=${contractTransaction.to ?? "unknown"} ` +
        `dataLength=${contractTransaction.data?.length ?? 0} value=${contractTransaction.value?.toString() ?? "0"}`
    );

    // Sign and submit the transaction.
    const txResp = await signer.sendTransaction(contractTransaction);
    if (!txResp) {
        console.error("transaction failed to submit");
        console.log(txResp);
        return;
    }

    // Request a transaction receipt for confirmation.
    const txReceipt = await txResp.wait();
    console.info(`deposit confirmed in ${txReceipt?.blockNumber}`);

    // Fetch the despoit.
    // The amountApproved should be zero as the cross-chain messaging
    // hasn't completed yet.
    let depositRecord = await getDeposit(wallet.address, true);
    console.info("deposit record:");
    console.info(safeStringify(depositRecord));

    // Re-fetch the balances.
    // mock should be 0 because it was transferred.
    // USDM1 should be 0 becuase it hasn't been minted yet.
    mockBalance = await getBalance("mock", wallet.address, true);
    console.info(`balance of mock: ${mockBalance?.balance}`);
    usdm1Balance = await getBalance("USDM1", wallet.address, true);
    console.info(`balance of USDM1: ${usdm1Balance?.balance}`);
    validateHeuristicBalanceChange({
        chainTag: "[evm]",
        operation: "deposit",
        stage: "after-submit",
        before: balancesBeforeDeposit,
        after: {
            mock: readBalance(mockBalance, "mock"),
            USDM1: readBalance(usdm1Balance, "USDM1"),
        },
        inputToken: "mock",
        inputAmount: BigInt(amount),
        outputToken: "USDM1",
        requireOutputIncrease: false,
    });

    // Sleep for 300 seconds to wait for finality in the cross-chain messaging.
    console.info("sleeping for 5 minutes. go get a cup of coffee...");
    await sleep(300 * 1000);

    // Re-fetch the despoit.
    // (This should be all zeros as processing the deposit destroys the on-chain struct)
    depositRecord = await getDeposit(wallet.address, true);
    console.info("deposit record:");
    console.info(safeStringify(depositRecord));

    // Re-fetch the balances.
    // mock should be 0.
    // USDM1 should be a value close to but less than 100000000000000000000.
    // (If the deposit fails, mock will be 100 and USDM1 will be 0)
    mockBalance = await getBalance("mock", wallet.address, true);
    console.info(`balance of mock: ${mockBalance?.balance}`);
    usdm1Balance = await getBalance("USDM1", wallet.address, true);
    console.info(`balance of USDM1: ${usdm1Balance?.balance}`);
    validateHeuristicBalanceChange({
        chainTag: "[evm]",
        operation: "deposit",
        stage: "after-settlement",
        before: balancesBeforeDeposit,
        after: {
            mock: readBalance(mockBalance, "mock"),
            USDM1: readBalance(usdm1Balance, "USDM1"),
        },
        inputToken: "mock",
        inputAmount: BigInt(amount),
        outputToken: "USDM1",
        requireOutputIncrease: true,
    });
})();
