import { StellarRedeemPermit } from "../interfaces";
import { postToAPI } from "./post-to-api";

/**********************************************************************************
 * Typescript function that calls the M1 API Stellar endpoint for redemption permits.
 *
 * @param {string} sourceAddress The address that owns the permit context.
 * @param {string} recipientAddress The address that will receive collateral payout.
 * @param {string} tokenCode The token code (USDM0 or USDM1).
 * @param {string} collateral The collateral address.
 * @param {string} amount The amount of the redemption.
 * @param {boolean} isTestnet Flag to switch between Testnet and Public.
 *
 * @returns {Promise<StellarRedeemPermit | undefined>} A signed permit or undefined if
 *  an error occurs.
 */
export async function getStellarRedeemPermit(
    sourceAddress: string,
    recipientAddress: string,
    tokenCode: string,
    collateral: string,
    amount: string,
    isTestnet = false): Promise<StellarRedeemPermit | undefined> {

    if (!process.env.M1_API_BASE_URL) {
        console.error("no M1_API_BASE_URL set in environemnt!");
        return;
    }

    const url = `${process.env.M1_API_BASE_URL}/permits/stellar/redemptions`;

    return await postToAPI<StellarRedeemPermit>(
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
