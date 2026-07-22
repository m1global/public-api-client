import { TreasuryConfig } from "../interfaces-v2";
import { getFromAPI } from "./get-from-api-v2";

import { getM1ApiV2BaseUrl } from "./api-base";
/**********************************************************************************
 * Typescript function that calls the M1 API Solana endpoint for the Treasury
 * configuration.
 * 
 * @returns {Promise<TreasuryConfig | undefined>} A TreasuryConfig object or undefined
 *  if an error occurs.
 * 
 * @dev The Treasury configuration lists its address, data on the USDM tokens,
 *  and all collaterals supported by the Treasury.
 */
export async function getTresasuryConfig(isTestnet = false): Promise<TreasuryConfig | undefined> {

    let url = `${getM1ApiV2BaseUrl()}/solana/treasury`;

    if (isTestnet) {
        url += "?isTestnet=true"
    }

    return await getFromAPI<TreasuryConfig>(url, false);
}
