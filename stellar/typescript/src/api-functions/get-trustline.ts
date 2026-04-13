import { Balance } from "../interfaces";
import { getBrokerConfig } from "./get-broker-config";
import { getFromAPI } from "./get-from-api";

/**********************************************************************************
 * Typescript function that calls the M1 API Stellar endpoint for asset trustlines.
 * 
 * @param {string} assetCode The Stellar asset code.
 * @param {string} ownerAddress The owner of the asset, i.e. account holding the trustline.
 * @param {boolean} isTestnet Flag to switch betwen Testnet and Public.
 * 
 * @returns {Promise<Balance | undefined>} A Balance object or undefined if an error
 *  occurs.
 * 
 * @dev The asset assetCode must either be "USDM0", "USDM1", or a collateral supported
 *  by the Broker contract.
 * @dev See get-broker-config.ts
 */
export async function getTrustline(
    assetCode: string,
    issuer: string,
    ownerAddress: string,
    isTestnet: boolean,
): Promise<Balance | undefined> {

    const config = await getBrokerConfig(isTestnet);

    var url: string;

    // The base url for the M1 API must be added to the environment.
    if (!process.env.M1_API_BASE_URL) {
        console.error("no M1_API_BASE_URL set in environemnt!");
        return;
    }

    url = `${process.env.M1_API_BASE_URL}/stellar/trustlines/${assetCode}/${issuer}/${ownerAddress}`;

    if (isTestnet) {
        url = `${url}?isTestnet=true`;
    }
    return await getFromAPI<Balance>(url, true)
}