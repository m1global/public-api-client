import { WhitelistStatus } from "../interfaces-v2";
import { getFromAPI } from "./get-from-api-v2";

import { getM1ApiV2BaseUrl } from "./api-base";
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

    let url = `${getM1ApiV2BaseUrl()}/solana/whitelist/${chain}/${address}`;

    return await getFromAPI<WhitelistStatus>(url, true)
}