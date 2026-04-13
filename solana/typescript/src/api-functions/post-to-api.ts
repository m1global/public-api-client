import axios from "axios";

import { SerializedInstruction, SolanaDepositBody, SolanaRedemptionBody, SolanaSwapBody } from "../interfaces";
import { logRequest, logResponse } from "./util";

/**********************************************************************************
 * Generic Typescript function that executes a POST on an M1 API Solana endpoint
 *  and returns a transaction instruction to add to a transaction.
 * 
 * @param {string} url The M1 API url.
 * @param {SolanaDepositBody | SolanaSwapBody | SolanaRedemptionBody | undefined} body The POST body.
 * 
 * @returns {Promise<SerializedInstruction | undefined>} A Balance object or undefined if an error
 *  occurs.
 */
export async function postToAPI(
    url: string,
    body: SolanaDepositBody | SolanaSwapBody | SolanaRedemptionBody | undefined):
    Promise<SerializedInstruction | undefined> {

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

        if (!apiResp || !apiResp.data || !apiResp.data.ix) {
            throw new Error("no response from server")
        }
        logResponse("POST", url, apiResp.data);
        return apiResp.data.ix;

    } catch (err) {
        if (axios.isAxiosError(err)) {
            console.error(`post to endpoint ${url} failed: ${JSON.stringify(err.response?.data)} with status ${err.response?.status}`);
        } else {
            console.log(err);
        }
    }
}
