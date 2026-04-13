import { StellarAllowanceBody } from "../interfaces";
import { postToAPI } from "./post-to-api";

/**********************************************************************************
 * Typescript function that calls the M1 API Stellar endpoint for trustline creation
 * and returns a transaction ready for signing and submission.
 * 
 * @param {string} assetCode The Stellar asset code.
 * @param {string} issuerAddress The address of issuer of the asset.
 * @param {string} ownerAddress The owner of the trustline.
 * @param {booelan} isTestnet Flag to switch betwen Sepolia and Mainnet.
 * 
 * @returns {Promise<string | undefined>} A base-64 XDR string
 *  or undefined if an error occurs.
 */
export async function createTrustline(
    assetCode: string,
    issuerAddress: string,
    ownerAddress: string,
    isTestnet = false): Promise<string | undefined> {

    // The base url for the M1 API must be added to the environment.
    if (!process.env.M1_API_BASE_URL) {
        console.error("no M1_API_BASE_URL set in environemnt!");
        return;
    }

    // The API endpoint to call.
    let url = `${process.env.M1_API_BASE_URL}/stellar/trustlines/${assetCode}/${issuerAddress}/${ownerAddress}`;

    if (isTestnet) {
        url = `${url}?isTestnet=true`;
    }

    return await postToAPI(url, undefined);
}