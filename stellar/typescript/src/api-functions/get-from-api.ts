import axios from "axios";

import {
    Allowance,
    Balance,
    Deposit,
    StellarBrokerConfig,
    Redemption,
    Swap,
    TxResult,
    WhitelistStatus,
    Trustline
} from "../interfaces";
import { logRequest, logResponse } from "./util";

/**********************************************************************************
 * Generic Typescript function that executes a GET on an M1 API Stellar endpoint.
 * 
 * @template {T extends StellarBrokerConfig | Trustline | Allowance | Deposit | 
 *  Swap | Balance | WhitelistStatus | TxResult} 
 * @param url The M1 API url.
 * @param ownerAddress The owner of the asset.
 * @param isTestnet Flag to switch betwen Testnet and Public.
 * 
 * @returns {Promise<Balance | undefined>} A Balance object or undefined if an error
 *  occurs.
 */
export async function getFromAPI<T extends StellarBrokerConfig | Trustline | Allowance |
    Deposit | Redemption | Swap | Balance | WhitelistStatus | TxResult>(
        url: string,
        isSecure = true): Promise<T | undefined> {

    // The base url for the M1 API must be added to the environment.
    if (!process.env.M1_API_BASE_URL) {
        console.error("no M1_API_BASE_URL set in environemnt!");
        return;
    }

    // Your M1 API Client JWT must be added to the environment.
    if (isSecure && !process.env.M1_API_JWT) {
        console.error("no M1_API_JWT set in environemnt!");
        return;
    }

    try {
        // Set up the headers
        const headers: any = { "Content-Type": "application/json", }
        if (isSecure) {
            headers["Authorization"] = `Bearer ${process.env.M1_API_JWT}`;
        }
        logRequest("GET", url);
        const apiResp = await axios.get(url, { headers });
        if (!apiResp || !apiResp.data) {
            throw new Error("no response from server")
        }
        logResponse("GET", url, apiResp.data);
        return apiResp.data as T;

    } catch (err) {
        if (axios.isAxiosError(err)) {
            console.error(`call to getter endpoint ${url} failed: ` +
                `${JSON.stringify(err.response?.data)} with status ${err.response?.status}`);
            if (err.response?.status == 401) {
                throw new Error("unauthorized");
            }
        } else {
            console.log(err);
        }
    }
} 
