import { SolanaSwapPermit } from "../interfaces-v2";
import { postToAPI } from "./post-to-api-v2";

import { getM1ApiV2BaseUrl } from "./api-base";
/**********************************************************************************
 * Typescript function that calls the M1 API Solana endpoint for swap permits.
 *
 * @param {string} sourceAddress The address that owns the permit context.
 * @param {string} inputTokenCode The USDM token code being swapped in.
 * @param {string} outputTokenCode The USDM token code being swapped out.
 * @param {string} amount The swap amount.
 * @param {boolean} isTestnet Flag to switch between Devnet and Mainnet.
 *
 * @returns {Promise<SolanaSwapPermit | undefined>} A signed permit or
 *  undefined if an error occurs.
 */
export async function getSolanaSwapPermit(
    sourceAddress: string,
    inputTokenCode: string,
    outputTokenCode: string,
    amount: string,
    isTestnet = false): Promise<SolanaSwapPermit | undefined> {

    const url = `${getM1ApiV2BaseUrl()}/permits/solana/swaps`;

    return await postToAPI<SolanaSwapPermit>(
        url,
        {
            sourceAddress,
            inputTokenCode,
            outputTokenCode,
            amount,
            isTestnet,
        },
        { returnRaw: true }
    );
}
