import { StellarAtomicBrokerConfig } from "../interfaces";
import { getFromAPI } from "./get-from-api";

/**********************************************************************************
 * Typescript function that calls the M1 API Stellar endpoint for the Atomic Broker
 * contract configuration.
 *
 * @param {booelan} isTestnet Flag to switch betwen Testnet and Public.
 *
 * @returns {Promise<StellarAtomicBrokerConfig | undefined>} A config object or undefined
 *  if an error occurs.
 */
export async function getAtomicBrokerConfig(isTestnet = false): Promise<StellarAtomicBrokerConfig | undefined> {

    // The base url for the M1 API must be added to the environment.
    if (!process.env.M1_API_BASE_URL) {
        console.error("no M1_API_BASE_URL set in environemnt!");
        return;
    }

    // The API endpoint to call.
    let url = `${process.env.M1_API_BASE_URL}/stellar/atomic-broker`;

    if (isTestnet) {
        url += "?isTestnet=true"
    }

    return await getFromAPI<StellarAtomicBrokerConfig>(url, false);
}
