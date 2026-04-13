import { ContractTransaction } from "ethers";

import { EvmApproveBody } from "../interfaces";
import { postToAPI } from "./post-to-api";

/**********************************************************************************
 * Typescript function that calls the M1 API Ethereum endpoint for asset allowances
 * and returns a transaction ready for signing and submission.
 * 
 * @param {string} contractAddress The address of the asset (must be an ERC-20).
 * @param {string} ownerAddress The owner of the asset.
 * @param {string} spenderAddress The address holding the allowance.
 * @param {string} amount The amount of the allowance.
 * @param {boolean} isTestnet Flag to switch between Sepolia and Mainnet.
 * 
 * @returns {Promise<ContractTransaction | undefined>} A prepared ethers
 *  ContractTransaction or undefined if an error occurs.
 * 
 * @dev All Broker contract interactions such as deposit, redeem, and swap
 *  operate as an escrow. As such submitted assets are immediately transferred
 *  by the broker to itself requiring an allowance on those assets.
 */
export async function approve(
    contractAddress: string,
    ownerAddress: string,
    spenderAddress: string,
    amount: string,
    isTestnet = false): Promise<ContractTransaction | undefined> {

    // The base url for the M1 API must be added to the environment.
    if (!process.env.M1_API_BASE_URL) {
        console.error("no M1_API_BASE_URL set in environment!");
        return;
    }

    // The API endpoint to call.
    const url = `${process.env.M1_API_BASE_URL}/ethereum/assets/${contractAddress}/allowances`;

    const body: EvmApproveBody = {
        owner: ownerAddress,
        spender: spenderAddress,
        amount: amount,
        isTestnet: isTestnet,
    }

    return await postToAPI(url, body);
}