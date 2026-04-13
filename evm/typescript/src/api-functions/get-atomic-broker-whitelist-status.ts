import { EvmAtomicBrokerConfig, WhitelistStatus } from "../interfaces";
import { getFromAPI } from "./get-from-api";

/**********************************************************************************
 * Typescript function that calls the M1 API Ethereum endpoint for the Atomic Broker 
 * whitelist.
 * 
 * @returns {Promise<WhitelistStatus | undefined>} A boolean indicating whitelist status or undefined 
 *  if an error occurs.
 * 
 * @dev The Atomic Broker configuration lists its address, data on the USDM tokens,
 *  and all collaterals supported by the Broker. 
 */
export async function getAtomicBrokerWhitelistStatus(
    address: string,
    isTestnet = false): Promise<WhitelistStatus | undefined> {

    // The base url for the M1 API must be added to the environment.
    if (!process.env.M1_API_BASE_URL) {
        console.error("no M1_API_BASE_URL set in environemnt!");
        return;
    }

    // The API endpoint to call.
    let url = `${process.env.M1_API_BASE_URL}/ethereum/atomic-broker/whitelist/${address}`;

    if (isTestnet) {
        url += "?isTestnet=true"
    }

    return await getFromAPI<WhitelistStatus>(url, false);
}