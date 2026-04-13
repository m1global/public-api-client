import { StellarBrokerConfig } from "../interfaces";
import { getFromAPI } from "./get-from-api";

/**********************************************************************************
 * Typescript function that calls the M1 API Stellar endpoint for the Broker 
 * contract configuration.
 * 
 * @param {booelan} isTestnet Flag to switch betwen Testnet and Public.
 *
 * @returns {Promise<Balance | undefined>} An StellarBrokerConfig object or undefined 
 *  if an error occurs.
 * 
 * @dev The Broker configuration lists its address, data on the USDM tokens,
 *  and all collaterals supported by the Broker. 
 */
export async function getBrokerConfig(isTestnet = false): Promise<StellarBrokerConfig | undefined> {

    // The base url for the M1 API must be added to the environment.
    if (!process.env.M1_API_BASE_URL) {
        console.error("no M1_API_BASE_URL set in environemnt!");
        return;
    }

    // The API endpoint to call.
    let url = `${process.env.M1_API_BASE_URL}/stellar/broker`;

    if (isTestnet) {
        url += "?isTestnet=true"
    }

    return await getFromAPI<StellarBrokerConfig>(url, false);
}