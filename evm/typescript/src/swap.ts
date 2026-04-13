import fs from "fs";

import { Command } from "commander-ts";
import { JsonRpcProvider, Wallet } from "ethers";
import "dotenv/config"

import { EvmBrokerConfig } from "./interfaces";
import { getBalance } from "./api-functions/get-balance";
import { USDM0_TOKEN_CODE, USDM1_TOKEN_CODE } from "./consts";
import { getAllowance } from "./api-functions/get-allowance";
import { getBrokerConfig } from "./api-functions/get-broker-config";
import { approve } from "./api-functions/approve";
import { safeStringify, sleep } from "./api-functions/util";
import { swap } from "./api-functions/swap";
import { getSwap } from "./api-functions/get-swap";
import {
    readBalance,
    validateHeuristicBalanceChange,
} from "./balance-validation";

/************************************************************************
 * Node command to swap USDM1 tokens for USDM0 on Ethereum Sepolia.
 * 
 * Checks USDM1 balance.
 * 
 * Checks the Broker"s allowance of the swapper"s USDM1 and 
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
 * USDM0 tokens are minted to your wallet when you execute the swap script. 
 * Call deposit first to receive USDM1 tokens that can be swapped for 
 *  USDM0 tokens.
 * 
 *  Must be transpiled.
 */

const pgm = new Command();

pgm.version("0.0.1")
    .description("Issue a swap of USDM1 for USDM0")
    .requiredOption("-wp --walletPassword <password to decrypt the wallet json>")
    .parse(process.argv);

const options = pgm.opts();

(async () => {

    // The result of the deposit for USDM1 will result is a value
    // less than 100.
    // Both USDM0 and USDM1 use the eth standard of 18 decimals.
    const amount = "90000000000000000000";

    // Load the wallet
    const json = fs.readFileSync("./wallet.json", "utf-8");
    const wallet = Wallet.fromEncryptedJsonSync(json, options.walletPassword)
    console.info(`operating as ${wallet.address}`);
    console.info(`[evm] chain=ethereum-sepolia rpc=${process.env.ETHEREUM_SEPOLIA_RPC_URL}`);
    console.info(`[evm] api base url=${process.env.M1_API_BASE_URL}`);
    console.info(`[evm] flow=swap amount=${amount} inputToken=${USDM1_TOKEN_CODE} outputToken=${USDM0_TOKEN_CODE}`);

    // Init the provider.
    const provider = new JsonRpcProvider(process.env.ETHEREUM_SEPOLIA_RPC_URL);

    // Init the signer.
    const signer = wallet.connect(provider);

    // Swaps are not whitelisted.
    // All holders of USDM0 or USDM1 can access swap.

    // Fetch the M1 broker config on Sepolia.
    const brokerConfig: EvmBrokerConfig | undefined = await getBrokerConfig(true);

    if (!brokerConfig) {
        console.error("no broker config");
        return;
    }

    // Make sure there are USDM tokens configured for the broker.
    // We don"t pass in anything related to USDM0 but the swap
    // will require that the Broker in control of the token.
    if (!brokerConfig.usdm0 || !brokerConfig.usdm0.address) {
        console.error("no usdm0 configured for broker");
        return;
    }
    if (!brokerConfig.usdm1 || !brokerConfig.usdm1.address) {
        console.error("no usdm1 configured for broker");
        return;
    }

    // Fetch and report balances of both USDM0 and USDM1.
    // The same block will be run a the end to see the final result.
    let usdm0Balance = await getBalance(USDM0_TOKEN_CODE, wallet.address, true);
    console.info(`balance of USDM0: ${usdm0Balance?.balance}`);
    let usdm1Balance = await getBalance(USDM1_TOKEN_CODE, wallet.address, true);
    console.info(`balance of USDM1: ${usdm1Balance?.balance}`);
    const balancesBeforeSwap = {
        USDM0: readBalance(usdm0Balance, USDM0_TOKEN_CODE),
        USDM1: readBalance(usdm1Balance, USDM1_TOKEN_CODE),
    };

    // Check USDM1 balance exist and is suffcient.
    if (!usdm1Balance || !usdm1Balance.balance) {
        console.error("no USDM1 balance");
        return;
    }
    if (BigInt(usdm1Balance!.balance) < BigInt(amount)) {
        console.error("USDM1 balance insufficent");
        return;
    }

    // Fetch the allowance the Broker has on the owner's USDM1.
    const allowance = await getAllowance(
        brokerConfig.usdm1.address,
        wallet.address,
        brokerConfig.address,
        true);

    // Check if the allowance is sufficient.
    if (!allowance || BigInt(allowance.allowance) < BigInt(amount)) {

        // Allowance is not sufficient.
        // Request an allowance in the amount of the deposit.
        const contractTransaction = await approve(
            brokerConfig.usdm1.address,
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

    const contractTransaction = await swap(
        wallet.address,
        USDM1_TOKEN_CODE,
        amount,
        true
    );

    if (!contractTransaction) {
        console.error("no swap transaction to sign");
        return;
    }

    console.info(
        `[evm] swap transaction to=${contractTransaction.to ?? "unknown"} ` +
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
    console.info(`swap confirmed in ${txReceipt?.blockNumber}`);

    // Fetch the swap.
    let swapRecord = await getSwap(wallet.address, true);
    console.info("swap record:");
    console.info(safeStringify(swapRecord));

    // re-fetch the balances
    usdm0Balance = await getBalance(USDM0_TOKEN_CODE, wallet.address, true);
    console.info(`balance of USDM0: ${usdm0Balance?.balance}`);
    usdm1Balance = await getBalance(USDM1_TOKEN_CODE, wallet.address, true);
    console.info(`balance of USDM1: ${usdm1Balance?.balance}`);
    validateHeuristicBalanceChange({
        chainTag: "[evm]",
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
        requireOutputIncrease: false,
    });

    // Sleep for 5 minutes to wait for the cross-chain messaging.
    console.info("sleeping for another 5 minutes. more coffee?");
    await sleep(300 * 1000);

    // Re-fetch the despoit.
    // (this should be all zeros as processing the deposit destroys the on-chain struct)
    swapRecord = await getSwap(wallet.address, true);
    console.info("swap record:");
    console.info(safeStringify(swapRecord));

    // re-fetch the balances
    // When swapping USDM1 to USDM0 the number of USDM0 tokens will always
    // exceed the input token amount because USDM1 has a monotonic increasing
    // price.
    usdm0Balance = await getBalance(USDM0_TOKEN_CODE, wallet.address, true);
    console.info(`balance of USDM0: ${usdm0Balance?.balance}`);
    usdm1Balance = await getBalance(USDM1_TOKEN_CODE, wallet.address, true);
    console.info(`balance of USDM1: ${usdm1Balance?.balance}`);
    validateHeuristicBalanceChange({
        chainTag: "[evm]",
        operation: "swap",
        stage: "after-settlement",
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
