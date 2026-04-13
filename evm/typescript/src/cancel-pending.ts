import fs from "fs";

import { Command } from "commander-ts";
import { JsonRpcProvider, parseUnits, Wallet } from "ethers";
import "dotenv/config";

/**************************************************************************************
 * Node command to replace stuck pending EVM transactions by sending
 * 0 ETH self-transactions with the same nonces and higher fees.
 *
 * Example:
 * npm run cancel-pending -- -wp password -n 267,268,269
 *
 * Must be transpiled (npm run build).
 */

const DEFAULT_PRIORITY_FEE_GWEI = "3";
const DEFAULT_GAS_LIMIT = 21000n;

const pgm = new Command();

pgm.version("0.0.1")
    .description("Replace stuck pending EVM transactions with self-transfers")
    .requiredOption("-wp --walletPassword <password to decrypt the wallet json>")
    .requiredOption("-n --nonces <comma-separated transaction nonces>")
    .option("--maxFeeGwei <max fee per gas in gwei>")
    .option("--maxPriorityFeeGwei <max priority fee per gas in gwei>")
    .parse(process.argv);

const options = pgm.opts();

(async () => {
    if (!process.env.ETHEREUM_SEPOLIA_RPC_URL) {
        console.error("no ETHEREUM_SEPOLIA_RPC_URL set in environment");
        return;
    }

    const walletPath = "./wallet.json";
    if (!fs.existsSync(walletPath)) {
        console.error(`wallet file ${walletPath} missing. have you created a wallet using create-wallet.js?`);
        return;
    }

    const nonces = parseNonces(options.nonces);
    if (nonces.length === 0) {
        console.error("no valid nonces provided");
        return;
    }

    const json = fs.readFileSync(walletPath, "utf-8");
    const wallet = Wallet.fromEncryptedJsonSync(json, options.walletPassword);
    const provider = new JsonRpcProvider(process.env.ETHEREUM_SEPOLIA_RPC_URL);
    const signer = wallet.connect(provider);

    const latestNonce = await provider.getTransactionCount(wallet.address, "latest");
    const pendingNonce = await provider.getTransactionCount(wallet.address, "pending");

    console.info(`operating as ${wallet.address}`);
    console.info(`[evm] chain=ethereum-sepolia rpc=${process.env.ETHEREUM_SEPOLIA_RPC_URL}`);
    console.info(`[evm] latest nonce=${latestNonce} pending nonce=${pendingNonce}`);
    console.info(`[evm] replacement nonces=${nonces.join(",")}`);

    const feeData = await provider.getFeeData();
    const maxPriorityFeePerGas = options.maxPriorityFeeGwei
        ? parseUnits(options.maxPriorityFeeGwei, "gwei")
        : feeData.maxPriorityFeePerGas
            ? feeData.maxPriorityFeePerGas * 2n
            : parseUnits(DEFAULT_PRIORITY_FEE_GWEI, "gwei");
    const maxFeePerGas = options.maxFeeGwei
        ? parseUnits(options.maxFeeGwei, "gwei")
        : resolveMaxFeePerGas(feeData.maxFeePerGas, maxPriorityFeePerGas);

    console.info(
        `[evm] replacement fees maxFeePerGas=${maxFeePerGas.toString()} ` +
        `maxPriorityFeePerGas=${maxPriorityFeePerGas.toString()}`
    );

    for (const nonce of nonces) {
        console.info(`[evm] sending replacement transaction for nonce=${nonce}`);

        const txResp = await signer.sendTransaction({
            to: wallet.address,
            value: 0n,
            nonce,
            gasLimit: DEFAULT_GAS_LIMIT,
            maxFeePerGas,
            maxPriorityFeePerGas,
        });

        console.info(`[evm] replacement hash nonce=${nonce} hash=${txResp.hash}`);
        console.info(`[evm] waiting for replacement confirmation nonce=${nonce}`);

        const receipt = await txResp.wait();
        console.info(`[evm] replacement confirmed nonce=${nonce} block=${receipt?.blockNumber}`);
    }
})();

function parseNonces(raw: string): number[] {
    return raw
        .split(",")
        .map((value) => value.trim())
        .filter(Boolean)
        .map((value) => Number.parseInt(value, 10))
        .filter((value) => Number.isInteger(value) && value >= 0)
        .sort((a, b) => a - b);
}

function resolveMaxFeePerGas(
    feeSuggestion: bigint | null,
    maxPriorityFeePerGas: bigint,
): bigint {
    if (feeSuggestion) {
        return feeSuggestion * 2n;
    }

    return maxPriorityFeePerGas * 4n;
}
