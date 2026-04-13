import { StellarDepositBody } from "../interfaces";
import { postToAPI } from "./post-to-api";

/**********************************************************************************
 * Typescript function that calls the M1 API Stellar endpoint for deposits
 * and returns a transaction ready for signing and submission.
 * 
 * @param {string} depositorAddress The address of the depositor.
 * @param {string} collateralAddress The collateral being deposited.
 * @param {string} amount The amount of the deposit.
 * @param {string} tokenCode The code of the token being requested in return, 
 *  i.e. USDM0 or USDM1.
 * @param {booelan} isTestnet Flag to switch betwen Testnet and Public.
 * 
 * @returns {Promise<string | undefined>} A base-64 XDR string
 *  or undefined if an error occurs.
 */
export async function deposit(
    depositorAddress: string,
    collateralAddress: string,
    amount: string,
    tokenCode: string,
    isTestnet = false,
): Promise<string | undefined> {

    // The base url for the M1 API must be added to the environment.
    if (!process.env.M1_API_BASE_URL) {
        console.error("no M1_API_BASE_URL set in environemnt!");
        return;
    }

    // The API endpoint to call.
    const url = `${process.env.M1_API_BASE_URL}/stellar/broker/deposits`;

    // POST payload
    const body: StellarDepositBody = {
        depositor: depositorAddress,
        collateral: collateralAddress,
        amount: amount,
        tokenCode,
        isTestnet,
    }

    return await postToAPI(url, body);
}