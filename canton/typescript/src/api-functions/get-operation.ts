import { TxResult } from "../interfaces";
import { getFromAPI } from "./get-from-api";

/**********************************************************************************
 * Typescript function that queries the M1 API operations endpoint and returns
 * the opaque transaction reference once the operation has settled.
 *
 * @param {string} opId The M1 API operation id returned by the faucet endpoint.
 *
 * @returns {Promise<string | undefined>} The transaction reference string or
 *  undefined if the operation is not yet complete or an error occurs.
 *
 * @dev Call this in a retry loop with a sleep between attempts since the M1
 *  internal executor is asynchronous and message-driven.
 */
export async function getOperation(opId: string): Promise<string | undefined> {

    const url = `${process.env.M1_API_BASE_URL}/operations/${opId}`;
    console.info(`[operation:${opId}] GET ${url}`);

    const txResult = await getFromAPI<TxResult>(url);
    console.info(`[operation:${opId}] payload: ${JSON.stringify(txResult)}`);

    // Not settled yet: operations endpoint may return an empty object.
    if (!Object.prototype.hasOwnProperty.call(txResult as object, "tx")) {
        console.info(`[operation:${opId}] pending: tx field missing`);
        return;
    }

    const rawTx = (txResult as unknown as { tx?: unknown }).tx;
    if (rawTx === null) {
        console.info(`[operation:${opId}] pending: tx is null`);
        return;
    }

    if (typeof rawTx !== "string") {
        throw new Error(`operation ${opId} settled with non-string tx: type=${typeof rawTx} payload=${JSON.stringify(txResult)}`);
    }

    const tx = rawTx.trim();
    if (!tx) {
        console.info(`[operation:${opId}] pending: tx is empty string`);
        return;
    }

    console.info(`[operation:${opId}] settled: tx=${tx}`);

    return tx;
}
