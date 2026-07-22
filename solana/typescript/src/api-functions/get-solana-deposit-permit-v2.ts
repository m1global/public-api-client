import { SolanaDepositPermit } from "../interfaces-v2";
import { postToAPI } from "./post-to-api-v2";

import { getM1ApiV2BaseUrl } from "./api-base";
/**********************************************************************************
 * Typescript function that calls the M1 API Solana endpoint for deposit permits.
 *
 * @param {string} sourceAddress The address that owns the permit context.
 * @param {string} recipientAddress The address that receives minted USDM.
 * @param {string} tokenCode The USDM token code.
 * @param {string} collateral The collateral token mint.
 * @param {string} amount The deposit amount.
 * @param {boolean} isTestnet Flag to switch between Devnet and Mainnet.
 *
 * @returns {Promise<SolanaDepositPermit | undefined>} A signed permit or
 *  undefined if an error occurs.
 */
export async function getSolanaDepositPermit(
    sourceAddress: string,
    recipientAddress: string,
    tokenCode: string,
    collateral: string,
    amount: string,
    isTestnet = false): Promise<SolanaDepositPermit | undefined> {

    const url = `${getM1ApiV2BaseUrl()}/permits/solana/deposits`;

    return await postToAPI<SolanaDepositPermit>(
        url,
        {
            sourceAddress,
            recipientAddress,
            tokenCode,
            collateral,
            amount,
            isTestnet,
        },
        { returnRaw: true }
    );
}
