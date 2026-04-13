import { Deposit } from "../interfaces";
import { getFromAPI } from "./get-from-api";

/**********************************************************************************
 * Typescript function that calls the M1 API Ethereum endpoint for deposits and
 *  returns a Deposit object.
 * 
 * @param {string} depositorAddress The address of a depositor.
 * @param {booelan} isTestnet Flag to switch betwen Sepolia and Mainnet.
 * 
 * @returns {Promise<Deposit | undefined>} A Deposit object or undefined 
 *  if an error occurs.
 * 
 * @dev Used for troubleshooting.
 */
export async function getDeposit(
    depositorAddress: string,
    isTestnet = false): Promise<Deposit | undefined> {

    let url = `${process.env.M1_API_BASE_URL}/ethereum/broker/deposits/${depositorAddress}`;

    if (isTestnet) {
        url = `${url}?isTestnet=true`;
    }

    return await getFromAPI<Deposit>(url, true)
}