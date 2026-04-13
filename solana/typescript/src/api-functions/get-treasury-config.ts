import { TreasuryConfig } from "../interfaces";
import { getFromAPI } from "./get-from-api";

/**********************************************************************************
 * Typescript function that calls the M1 API Ethereum endpoint for the Broker 
 * contract configuration.
 * 
 * @returns {Promise<Balance | undefined>} An EvmBrokerConfig object or undefined 
 *  if an error occurs.
 * 
 * @dev The Broker configuration lists its address, data on the USDM tokens,
 *  and all collaterals supported by the Broker. 
 */
export async function getTresasuryConfig(isTestnet = false): Promise<TreasuryConfig | undefined> {

    let url = `${process.env.M1_API_BASE_URL}/solana/treasury`;

    if (isTestnet) {
        url += "?isTestnet=true"
    }

    return await getFromAPI<TreasuryConfig>(url, false);
}