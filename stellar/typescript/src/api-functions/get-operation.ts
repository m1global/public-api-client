import axios from "axios";

import { sleep } from "./util";
import { postToAPI } from "./post-to-api";
import { TxResult } from "../interfaces";
import { getFromAPI } from "./get-from-api";

/**********************************************************************************
 * Typescript function that polls the M1 API endpoint for operations
 *  and returns a transaction hash, if available.
 * 
 * @param {string} opId The M1 API operation id.
 * @param {number} numPools The number of polls to execute with 1 second sleep in 
 *  between.
 * 
 * @returns {Promise<string | undefined>} The transacdtion hash  or undefined 
 *  if an error occurs.
 */
export async function getOperation(opId: string): Promise<string | undefined> {

    const url = `${process.env.M1_API_BASE_URL}/operations/${opId}`;

    const txResult = await getFromAPI<TxResult>(url, undefined);
    if (!txResult) {
        console.error("no transaction response");
        return;
    }
    return txResult.tx;
}
