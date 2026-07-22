import { SolanaRedeemPermit } from "../interfaces-v2";
import { postToAPI } from "./post-to-api-v2";

import { getM1ApiV2BaseUrl } from "./api-base";
/**********************************************************************************
 * Typescript function that calls the M1 API Solana endpoint for redemption permits.
 *
 * @param {string} sourceAddress The address that owns the permit context.
 * @param {string} recipientAddress The collateral payout recipient.
 * @param {string} tokenCode The USDM token code.
 * @param {string} collateral The collateral token mint.
 * @param {string} amount The redemption amount.
 * @param {boolean} isTestnet Flag to switch between Devnet and Mainnet.
 *
 * @returns {Promise<SolanaRedeemPermit | undefined>} A signed permit or
 *  undefined if an error occurs.
 */
export async function getSolanaRedeemPermit(
    sourceAddress: string,
    recipientAddress: string,
    tokenCode: string,
    collateral: string,
    amount: string,
    isTestnet = false): Promise<SolanaRedeemPermit | undefined> {

    const url = `${getM1ApiV2BaseUrl()}/permits/solana/redemptions`;

    return await postToAPI<SolanaRedeemPermit>(
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
