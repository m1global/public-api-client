import { Redemption } from "../interfaces";
import { getFromAPI } from "./get-from-api";

/**********************************************************************************
 * Typescript function that calls the M1 API Ethereum endpoint for atomic redemptions and
 *  returns a Redemption object.
 * 
 * @param {string} redeemerAddress The address of a redeemer.
 * @param {boolean} isTestnet Flag to switch between Sepolia and Mainnet.
 * 
 * @returns {Promise<Redemption | undefined>} A Redemption object or undefined 
 *  if an error occurs.
 * 
 * @dev Used for troubleshooting.
 */
export async function getAtomicBrokerRedemption(
    redeemerAddress: string,
    isTestnet = false): Promise<Redemption | undefined> {

    // The base url for the M1 API must be added to the environment.
    if (!process.env.M1_API_BASE_URL) {
        console.error("no M1_API_BASE_URL set in environemnt!");
        return;
    }

    // The API endpoint to call.
    let url = `${process.env.M1_API_BASE_URL}/ethereum/atomic-broker/redemptions/${redeemerAddress}`;

    if (isTestnet) {
        url = `${url}?isTestnet=true`;
    }

    return await getFromAPI<Redemption>(url, true)
}