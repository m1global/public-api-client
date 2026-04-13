import axios from "axios";
import { ContractTransaction } from "ethers";

import { EvmApproveBody, EvmAtomicDepositBody, EvmAtomicRedemptionBody, EvmAtomicSwapBody, EvmDepositBody, EvmRedemptionBody, EvmSwapBody } from "../interfaces";
import { logRequest, logResponse } from "./util";

type PostBody = EvmApproveBody | EvmDepositBody | EvmSwapBody | EvmRedemptionBody |
    EvmAtomicDepositBody | EvmAtomicRedemptionBody | EvmAtomicSwapBody |
    Record<string, unknown> | undefined;

type PostOptions = {
    returnRaw?: boolean;
};

/**********************************************************************************
 * Generic Typescript function that executes a POST on an M1 API Ethereum endpoint
 *  and returns a transaction ready for signing and submission.
 * 
 * @param {string} url The M1 API url.
 * @param {EvmApproveBody | EvmDepositBody | EvmSwapBody | EvmRedemptionBody |
 * EvmAtomicDepositBody | EvmAtomicRedemptionBody | EvmAtomicSwapBody | undefined} body The POST body.
 * @returns {Promise<ContractTransaction | undefined>} A ContractTransaction object 
 * or undefined if an error occurs.
 */
export async function postToAPI<T = ContractTransaction>(
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

        if (!apiResp.data.contractTransaction) {
            throw new Error("no contractTransaction in response from server");
        }

        return apiResp.data.contractTransaction as T;

    } catch (err) {
        if (axios.isAxiosError(err)) {
            console.error(`post to endpoint ${url} failed: ${JSON.stringify(err.response?.data)} with status ${err.response?.status}`);
            if (err.response?.status == 401) {
                throw new Error("unauthorized");
            }
        } else {
            console.log(err);
        }
    }
}
