import { Balance } from "../interfaces";
import { getBrokerConfig } from "./get-broker-config";
import { getFromAPI } from "./get-from-api";

/**********************************************************************************
 * Typescript function that calls the M1 API Ethereum endpoint for either 
 *  asset balances of USDM token balances.
 * 
 * @param {string} symbol The ERC-20 synbol of the asset.
 * @param {string} ownerAddress The owner of the asset.
 * @param {boolean} isTestnet Flag to switch betwen Sepolia and Mainnet.
 * 
 * @returns {Promise<Balance | undefined>} A Balance object or undefined if an error
 *  occurs.
 * 
 * @dev The asset symbol must either be "USDM0", "USDM1", or a collateral supported
 *  by the Broker contract.
 * @dev See get-broker-config.ts
 */
export async function getBalance(
    symbol: string,
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

    // Figure out which endpoint we're calling.
    if (symbol == "USDM0" || symbol == "USDM1") {
        // symbol is a USDM token
        const tokenId = +symbol.charAt(4);
        url = `${process.env.M1_API_BASE_URL}/ethereum/usdm/${tokenId}/balances/${ownerAddress}`;
    } else {
        // Check if the symbol is a collateral supported by the Broker
        const collateral = config?.collaterals?.find(col => col.symbol?.toLowerCase() == symbol.toLowerCase());
        if (!collateral) {
            console.error(`symbol ${symbol} is not a valid collateral`);
            return;
        }
        url = `${process.env.M1_API_BASE_URL}/ethereum/assets/${collateral.address}/balances/${ownerAddress}`;
    }

    if (isTestnet) {
        url = `${url}?isTestnet=true`;
    }
    return await getFromAPI<Balance>(url, true)
}

/**********************************************************************************
 * Typescript function that fetches the balance of any ERC-20 token by its contract
 * address. Use this when the token address is known directly (e.g. from the Atomic
 * Broker config) rather than via the standard Broker's token registry.
 *
 * @param {string} tokenAddress The ERC-20 contract address of the token.
 * @param {string} ownerAddress The owner of the asset.
 * @param {boolean} isTestnet Flag to switch between Sepolia and Mainnet.
 *
 * @returns {Promise<Balance | undefined>} A Balance object or undefined if an error
 *  occurs.
 */
export async function getBalanceByAddress(
    tokenAddress: string,
    ownerAddress: string,
    isTestnet: boolean,
): Promise<Balance | undefined> {

    if (!process.env.M1_API_BASE_URL) {
        console.error("no M1_API_BASE_URL set in environment!");
        return;
    }

    let url = `${process.env.M1_API_BASE_URL}/ethereum/assets/${tokenAddress}/balances/${ownerAddress}`;
    if (isTestnet) {
        url = `${url}?isTestnet=true`;
    }
    return await getFromAPI<Balance>(url, true);
}