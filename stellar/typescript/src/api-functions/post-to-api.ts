import axios from "axios";

import {
    StellarAllowanceBody,
    StellarAtomicDepositBody,
    StellarAtomicRedemptionBody,
    StellarAtomicSwapBody,
    StellarDepositBody,
    StellarRedemptionBody,
    StellarSwapBody
} from "../interfaces";
import { logRequest, logResponse } from "./util";

type PostBody = StellarAllowanceBody | StellarDepositBody | StellarSwapBody | StellarRedemptionBody |
    StellarAtomicDepositBody | StellarAtomicRedemptionBody | StellarAtomicSwapBody |
    Record<string, unknown> | undefined;

type PostOptions = {
    returnRaw?: boolean;
};

/**********************************************************************************
 * Generic Typescript function that executes a POST on an M1 API Stellar endpoint
 *  and returns base-64 encoded XDR representing a Stellar transaction.
 *
 * @param {string} url The M1 API url.
 * @param {PostBody} body The POST body.
 * @param {PostOptions} options Optional flags.
 *
 * @returns {Promise<string | undefined>} A base-64 XDR string or undefined if an error
 *  occurs.
 */
export async function postToAPI<T = string>(
    url: string,
    body: PostBody,
    options?: PostOptions):
    Promise<T | undefined> {

    // Your M1 API Client JWT must be added to the environment.
    if (!process.env.M1_API_JWT) {
        console.error("no M1_API_JWT set in environemnt!");
        return;
    }

    try {
        logRequest("POST", url, body);

        const apiResp = await axios.post(
            url,
            body,
            {
                headers: {
                    "Content-Type": "application/json",
                    "Authorization": `Bearer ${process.env.M1_API_JWT}`,
                }
            });

        if (!apiResp || !apiResp.data) {
            throw new Error("no response from server");
        }

        logResponse("POST", url, apiResp.data);

        if (options?.returnRaw) {
            return apiResp.data as T;
        }

        if (!apiResp.data.transactionEnvelope) {
            throw new Error("no transactionEnvelope in response from server");
        }

        return apiResp.data.transactionEnvelope as T;

    } catch (err) {
        if (axios.isAxiosError(err)) {
            console.error(`post to endpoint ${url} failed: ` +
                `${JSON.stringify(err.response?.data)} with status ${err.response?.status}`);
            if (err.response?.status == 401) {
                throw new Error("unauthorized");
            }
        } else {
            console.log(err);
        }
    }
}
