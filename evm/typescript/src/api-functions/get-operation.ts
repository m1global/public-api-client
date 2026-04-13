import axios from "axios";

import { sleep } from "./util";
import { postToAPI } from "./post-to-api";
import { TxResult } from "../interfaces";
import { getFromAPI } from "./get-from-api";

/**********************************************************************************
 * Typescript function that queries the M1 API endpoint for operations
 *  and returns a transaction hash once the operation has settled.
 * 
 * @param {string} opId The M1 API operation id.
 * 
 * @returns {Promise<string | undefined>} The transaction hash or undefined 
 *  if the operation is not yet complete or an error occurs.
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
