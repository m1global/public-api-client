import { Allowance } from "../interfaces";
import { getFromAPI } from "./get-from-api";

/**********************************************************************************
 * Typescript function that calls the M1 API Ethereum endpoint for asset allowances.
 * 
 * @param {string} contractAddress The address of the asset (must be an ERC-20).
 * @param {string} ownerAddress The owner of the asset.
 * @param {string} spenderAddress The address holding the allownace.
 * @param {boolean} isTestnet Flag to switch betwen Sepolia and Mainnet.
 * 
 * @returns {Promise<Allowance | undefined>} An allowance object or undefined if
 *  an error occurs.
 */
export async function getAllowance(
    contractAddress: string,
    ownerAddress: string,
    spenderAddress: string,
    isTestnet = false): Promise<Allowance | undefined> {

    // The base url for the M1 API must be added to the environment.
    if (!process.env.M1_API_BASE_URL) {
        console.error("no M1_API_BASE_URL set in environemnt!");
        return;
    }

    // The API endpoint to call.
    let url = `${process.env.M1_API_BASE_URL}/ethereum/assets/${contractAddress}/allowances/${ownerAddress}/${spenderAddress}`;

    if (isTestnet) {
        url = `${url}?isTestnet=true`;
    }

    return await getFromAPI<Allowance>(url, true)
}