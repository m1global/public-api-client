import { Balance } from "../interfaces-v2";
import { getTresasuryConfig } from "./get-treasury-config-v2";
import { getFromAPI } from "./get-from-api-v2";

import { getM1ApiV2BaseUrl } from "./api-base";
/**********************************************************************************
 * Typescript function that calls the M1 API Solana endpoint for either 
 *  asset balances of USDM token balances.
 * 
 * @param {string} symbol The symbol of the asset.
 * @param {string} ownerAddress The owner of the asset.
 * @param {boolean} isTestnet Flag to switch betwen Devnet and Mainnet.
 * 
 * @returns {Promise<Balance | undefined>} A Balance object or undefined if an error
 *  occurs.
 * 
 * @dev The asset symbol must either be "USDM0", "USDM1", or a collateral supported
 *  by the Treasury contract.
 * @dev See get-treasury-config.ts
 */
export async function getBalance(
    symbol: string,
    ownerAddress: string,
    isTestnet: boolean,
): Promise<Balance | undefined> {

    const config = await getTresasuryConfig(isTestnet);
    if (!config) {
        console.log("no treasury config");
        return;
    }
    var url: string;

    if (symbol == "USDM0" || symbol == "USDM1") {
        // symbol is a USDM token
        const tokenId = +symbol.charAt(4);
        url = `${getM1ApiV2BaseUrl()}/solana/usdm/${tokenId}/balances/${ownerAddress}`;
    } else {
        // Check if the symbol is a collateral supported by the Treasury
        const collateral = config?.collaterals?.find(col => col.symbol?.toLowerCase() == symbol.toLowerCase());
        if (!collateral) {
            console.error(`symbol ${symbol} is not a valid collateral`);
            return;
        }
        url = `${getM1ApiV2BaseUrl()}/solana/collaterals/${collateral.symbol}/balances/${ownerAddress}`;
    }

    if (isTestnet) {
        url = `${url}?isTestnet=true`;
    }
    return await getFromAPI<Balance>(url, true)
}