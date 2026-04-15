import { StellarDepositPermit } from "../interfaces";
import { postToAPI } from "./post-to-api";

/**********************************************************************************
 * Typescript function that calls the M1 API Stellar endpoint for deposit permits.
 *
 * @param {string} sourceAddress The address that owns the permit context.
 * @param {string} recipientAddress The address that will receive minted USDM.
 * @param {string} tokenCode The token code (USDM0 or USDM1).
 * @param {string} collateral The collateral address.
 * @param {string} amount The amount of the deposit.
 * @param {boolean} isTestnet Flag to switch between Testnet and Public.
 *
 * @returns {Promise<StellarDepositPermit | undefined>} A signed permit or undefined if
 *  an error occurs.
 */
export async function getStellarDepositPermit(
    sourceAddress: string,
    recipientAddress: string,
    tokenCode: string,
    collateral: string,
    amount: string,
    isTestnet = false): Promise<StellarDepositPermit | undefined> {

    if (!process.env.M1_API_BASE_URL) {
        console.error("no M1_API_BASE_URL set in environemnt!");
        return;
    }

    const url = `${process.env.M1_API_BASE_URL}/permits/stellar/deposits`;

    return await postToAPI<StellarDepositPermit>(
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
