import axios from "axios";

import {
    Allowance,
    Balance,
    Deposit,
    DepositPermit,
    EvmBrokerConfig,
    PriceAttestation,
    RedeemPermit,
    Redemption,
    Swap,
    TxResult,
    WhitelistStatus
} from "../interfaces";
import { logRequest, logResponse } from "./util";

/**********************************************************************************
 * Generic Typescript function that executes a GET on an M1 API Ethereum endpoint.
 * 
 * @template T The expected response type.
 * @param {string} url The full M1 API URL to GET.
 * @param {boolean} isSecure Whether to include the M1_API_JWT bearer token.
 * 
 * @returns {Promise<T | undefined>} The parsed response body or undefined if an
 *  error occurs.
 */
export async function getFromAPI<T extends EvmBrokerConfig | Allowance |
    Deposit | Redemption | Swap | Balance | WhitelistStatus | TxResult |
    PriceAttestation | DepositPermit | RedeemPermit>(
        url: string,
        isSecure = true): Promise<T | undefined> {

    // The base url for the M1 API must be added to the environment.
    if (!process.env.M1_API_BASE_URL) {
        console.error("no M1_API_BASE_URL set in environment!");
        return;
    }

    // Your M1 API Client JWT must be added to the environment.
    if (isSecure && !process.env.M1_API_JWT) {
        console.error("no M1_API_JWT set in environment!");
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
            console.error(`call to getter endpoint ${url} failed: ${JSON.stringify(err.response?.data)} with status ${err.response?.status}`);
            if (err.response?.status == 401) {
                throw new Error("unauthorized");
            }
        } else {
            console.log(err);
        }
    }
} 
