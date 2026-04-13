import { Deposit, Redemption } from "../interfaces";
import { getFromAPI } from "./get-from-api";

/**********************************************************************************
 * Typescript function that calls the M1 API Stellar endpoint for redemptions and
 *  returns a Redemption object.
 * 
 * @param {string} redeemerAddress The address of a redeemer.
 * @param {booelan} isTestnet Flag to switch betwen Testnet and Public.
 * 
 * @returns {Promise<Deposit | undefined>} A Redemption object or undefined 
 *  if an error occurs.
 * 
 * @dev Used for troubleshooting.
 */
export async function getRedemption(
    redeemerAddress: string,
    isTestnet = false): Promise<Redemption | undefined> {

    // The base url for the M1 API must be added to the environment.
    if (!process.env.M1_API_BASE_URL) {
        console.error("no M1_API_BASE_URL set in environemnt!");
        return;
    }

    // The API endpoint to call.
    let url = `${process.env.M1_API_BASE_URL}/stellar/broker/redemptions/${redeemerAddress}`;

    if (isTestnet) {
        url = `${url}?isTestnet=true`;
    }

    return await getFromAPI<Redemption>(url, true)
}