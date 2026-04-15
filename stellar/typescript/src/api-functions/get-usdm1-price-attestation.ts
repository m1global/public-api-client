import { StellarPriceAttestation } from "../interfaces";
import { getFromAPI } from "./get-from-api";

/**********************************************************************************
 * Typescript function that calls the M1 API Stellar endpoint for USDM1 price attestations.
 *
 * @param {string} requesterAddress The address requesting the attestation.
 * @param {boolean} isTestnet Flag to switch betwen Testnet and Public.
 *
 * @returns {Promise<StellarPriceAttestation | undefined>} A price attestation or undefined if
 *  an error occurs.
 */
export async function getUsdm1PriceAttestation(
    requesterAddress: string,
    isTestnet = false): Promise<StellarPriceAttestation | undefined> {

    // The base url for the M1 API must be added to the environment.
    if (!process.env.M1_API_BASE_URL) {
        console.error("no M1_API_BASE_URL set in environemnt!");
        return;
    }

    // The API endpoint to call.
    let url = `${process.env.M1_API_BASE_URL}/price-attestations/usdm1/stellar/${requesterAddress}`;

    if (isTestnet) {
        url = `${url}?isTestnet=true`;
    }

    return await getFromAPI<StellarPriceAttestation>(url, true)
}
