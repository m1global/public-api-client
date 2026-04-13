import { Swap } from "../interfaces";
import { getFromAPI } from "./get-from-api";

/**********************************************************************************
 * Typescript function that calls the M1 API Stellar endpoint for swaps and
 *  returns a Swap object.
 * 
 * @param {string} swapperAddress The address of a depositor.
 * @param {booelan} isTestnet Flag to switch betwen Testnet and Public.
 * 
 * @returns {Promise<Swap | undefined>} A Swap object or undefined 
 *  if an error occurs.
 * 
 * @dev Used for troubleshooting.
 */
export async function getSwap(
    swapperAddress: string,
    isTestnet = false): Promise<Swap | undefined> {

    // The base url for the M1 API must be added to the environment.
    if (!process.env.M1_API_BASE_URL) {
        console.error("no M1_API_BASE_URL set in environemnt!");
        return;
    }

    // The API endpoint to call.
    let url = `${process.env.M1_API_BASE_URL}/stellar/broker/swaps/${swapperAddress}`;

    if (isTestnet) {
        url = `${url}?isTestnet=true`;
    }

    return await getFromAPI<Swap>(url, true)
}