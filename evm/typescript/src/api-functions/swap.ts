
import { ContractTransaction } from "ethers";

import { EvmSwapBody } from "../interfaces";
import { postToAPI } from "./post-to-api";

/**********************************************************************************
 * Typescript function that calls the M1 API Ethereum endpoint for swaps
 * and returns a transaction ready for signing and submission.
 * 
 * @param {string} swapperAddress The address of the swapper.
 * @param {string} inputTokenCode The code of the token being swapped, 
 *  i.e. USDM0 or USDM1.
 * @param {string} amount The amount of the swap.
 * @param {booelan} isTestnet Flag to switch betwen Sepolia and Mainnet.
 * 
 * @returns {Promise<ContractTransaction | undefined>} A prepared ethers
 *  ContractTransaction or undefined if an error occurs.
 */
export async function swap(
    swapperAddress: string,
    inputTokenCode: string,
    amount: string,
    isTestnet = false): Promise<ContractTransaction | undefined> {

    // The base url for the M1 API must be added to the environment.
    if (!process.env.M1_API_BASE_URL) {
        console.error("no M1_API_BASE_URL set in environemnt!");
        return;
    }

    // THe API endpoint to call.
    const url = `${process.env.M1_API_BASE_URL}/ethereum/broker/swaps`;

    const body: EvmSwapBody = {
        swapper: swapperAddress,
        inputTokenCode,
        amount,
        isTestnet,
    }

    return await postToAPI(url, body)

}