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
 */
export async function getWhitelistStatus(
    chain: string,
    address: string): Promise<WhitelistStatus | undefined> {

    let url = `${process.env.M1_API_BASE_URL}/solana/whitelist/${chain}/${address}`;

    return await getFromAPI<WhitelistStatus>(url, true)
}