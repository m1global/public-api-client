import axios from "axios";

import {
    SerializedInstructionResponse,
    SolanaDepositBody,
    SolanaPermitRequestBody,
    SolanaRedemptionBody,
    SolanaSwapBody,
} from "../interfaces-v2";
import { logRequest, logResponse } from "./util";

type PostBody = SolanaDepositBody | SolanaSwapBody | SolanaRedemptionBody |
    SolanaPermitRequestBody | Record<string, unknown> | undefined;

type PostOptions = {
    returnRaw?: boolean;
};

/**********************************************************************************
 * Generic Typescript function that executes a POST on an M1 API Solana endpoint
 *  and returns a transaction instruction to add to a transaction.
 * 
 * @param {string} url The M1 API url.
 * @param {PostBody} body The POST body.
 * 
 * @returns {Promise<SerializedInstruction | undefined>} A Balance object or undefined if an error
 *  occurs.
 */
export async function postToAPI<T = SerializedInstructionResponse>(
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
            throw new Error("no response from server")
        }
        logResponse("POST", url, apiResp.data);

        if (options?.returnRaw) {
            return apiResp.data as T;
        }

        if (!apiResp.data.ix) {
            throw new Error("no ix in response from server");
        }

        return apiResp.data.ix as T;

    } catch (err) {
        if (axios.isAxiosError(err)) {
            console.error(`post to endpoint ${url} failed: ${JSON.stringify(err.response?.data)} with status ${err.response?.status}`);
        } else {
            console.log(err);
        }
    }
}
