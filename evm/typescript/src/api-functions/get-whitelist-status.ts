import { WhitelistStatus } from "../interfaces";
import { getFromAPI } from "./get-from-api";

/**********************************************************************************
 * Typescript function that calls the M1 API Solana endpoint for whitelist status
 *  and returns a WhitelistStatus object.
 * 
 * @param {string} chain The chain of the whitelisted address.
 * @param {string} address The address of the whitelisted address.
 * 
 * @returns {Promise<WhitelistStatus | undefined>} A WhitelistStatus object 
 *  or undefined if an error occurs.
 * 
 * @dev The whitelist for all chains is stored on-chain on Solana.
 * @dev The server will determine which Solana network to check depending on the 
 *  value of the chain path parameter.
 */
export async function getWhitelistStatus(
    chain: string,
    address: string): Promise<WhitelistStatus | undefined> {

    // The base url for the M1 API must be added to the environment.
    if (!process.env.M1_API_BASE_URL) {
        console.error("no M1_API_BASE_URL set in environemnt!");
        return;
    }

    // The API endpoint to call.
    let url = `${process.env.M1_API_BASE_URL}/solana/whitelist/${chain}/${address}`;

    return await getFromAPI<WhitelistStatus>(url, true)
}