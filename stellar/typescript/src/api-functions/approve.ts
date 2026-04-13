import { StellarAllowanceBody } from "../interfaces";
import { postToAPI } from "./post-to-api";

/**********************************************************************************
 * Typescript function that calls the M1 API STellar endpoint for asset allowances
 * and returns a transaction ready for signing and submission.
 * 
 * @param {string} contractAddress The address of the Stellar asset contract.
 * @param {string} ownerAddress The owner of the asset.
 * @param {string} spenderAddress The address holding the allownace.
 * @param {string} amount The amount of the allowance.
 * @param {booelan} isTestnet Flag to switch betwen Sepolia and Mainnet.
 * 
 * @returns {Promise<string | undefined>} A base-64 XDR string
 *  or undefined if an error occurs.
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
    isTestnet = false): Promise<string | undefined> {

    // The base url for the M1 API must be added to the environment.
    if (!process.env.M1_API_BASE_URL) {
        console.error("no M1_API_BASE_URL set in environemnt!");
        return;
    }

    // The API endpoint to call.
    const url = `${process.env.M1_API_BASE_URL}/stellar/assets/${contractAddress}/allowances`;

    const body: StellarAllowanceBody = {
        owner: ownerAddress,
        spender: spenderAddress,
        amount: amount,
        isTestnet: isTestnet,
    }

    return await postToAPI(url, body);
}