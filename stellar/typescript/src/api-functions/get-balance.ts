import { Balance, StellarAtomicBrokerConfig } from "../interfaces";
import { getFromAPI } from "./get-from-api";

/**********************************************************************************
 * Typescript function that calls the M1 API Stellar endpoint for either 
 *  asset balances of USDM token balances.
 * 
 * @param {string} assetCode The Stellar asset code.
 * @param {string} ownerAddress The owner of the asset.
 * @param {boolean} isTestnet Flag to switch betwen Testnet and Public.
 * 
 * @returns {Promise<Balance | undefined>} A Balance object or undefined if an error
 *  occurs.
 * 
 * @dev The asset assetCode must either be "USDM0", "USDM1", or a collateral supported
 *  by the Atomic Broker config supplied by the caller.
 */
export async function getBalance(
    assetCode: string,
    ownerAddress: string,
    isTestnet: boolean,
    brokerConfig?: StellarAtomicBrokerConfig,
): Promise<Balance | undefined> {

    var url: string;

    // The base url for the M1 API must be added to the environment.
    if (!process.env.M1_API_BASE_URL) {
        console.error("no M1_API_BASE_URL set in environemnt!");
        return;
    }

    // Figure out which endpoint we're calling.
    if (assetCode.startsWith("USDM")) {
        // assetCode is a USDM token
        const tokenId = +assetCode.charAt(4);
        url = `${process.env.M1_API_BASE_URL}/stellar/usdm/${tokenId}/balances/${ownerAddress}`;
    } else {
        if (!brokerConfig) {
            console.error(`atomic broker config is required to resolve collateral assetCode ${assetCode}`);
            return;
        }
        // Check if the assetCode is a collateral supported by the Atomic Broker.
        const collateral = brokerConfig.collaterals?.find(col => col.symbol?.toLowerCase() == assetCode.toLowerCase());
        if (!collateral) {
            console.error(`assetCode ${assetCode} is not a valid collateral`);
            return;
        }
        url = `${process.env.M1_API_BASE_URL}/stellar/assets/${collateral.address}/balances/${ownerAddress}`;
    }

    if (isTestnet) {
        url = `${url}?isTestnet=true`;
    }
    return await getFromAPI<Balance>(url, true)
}
