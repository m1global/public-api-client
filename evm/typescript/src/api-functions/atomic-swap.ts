import { ContractTransaction } from "ethers";

import { EvmAtomicDepositBody, EvmAtomicSwapBody, EvmDepositBody, PriceAttestation } from "../interfaces";
import { postToAPI } from "./post-to-api";

/**********************************************************************************
 * Typescript function that calls the M1 API Ethereum endpoint for swaps
 * and returns a transaction ready for signing and submission.
 * 
 * @param {string} swapperAddress The address of the swapper.
 * @param {number} inputTokenId The id of the token being swapped.
 * @param {string} amount The amount of the swap.
 * @param {PriceAttestation} tokenAttestation The price attestation for the token being requested.
 * @param {booelan} isTestnet Flag to switch betwen Sepolia and Mainnet.
 * 
 * @returns {Promise<ContractTransaction | undefined>} A prepared ethers
 *  ContractTransaction or undefined if an error occurs.
 */
export async function atomicSwap(
    swapperAddress: string,
    inputTokenCode: string,
    amount: string,
    tokenAttestation: PriceAttestation,
    isTestnet = false,
): Promise<ContractTransaction | undefined> {

    // The base url for the M1 API must be added to the environment.
    if (!process.env.M1_API_BASE_URL) {
        console.error("no M1_API_BASE_URL set in environemnt!");
        return;
    }

    // The API endpoint to call.
    const url = `${process.env.M1_API_BASE_URL}/ethereum/atomic-broker/swaps`;

    // POST payload
    const body: EvmAtomicSwapBody = {
        swapper: swapperAddress,
        inputTokenCode,
        amount: amount,
        tokenAttestation,
        isTestnet,
    }

    return await postToAPI(url, body);
}