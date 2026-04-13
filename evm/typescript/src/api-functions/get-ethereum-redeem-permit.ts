import { RedeemPermit } from "../interfaces";
import { postToAPI } from "./post-to-api";

/**********************************************************************************
 * Typescript function that calls the M1 API Ethereum endpoint for redemption permits.
 *
 * @param {string} sourceAddress The address that owns the permit context.
 * @param {string} recipientAddress The address that will receive collateral payout.
 * @param {BigInt} amount The amount of the redemption.
 * @param {boolean} isTestnet Flag to switch between Sepolia and Mainnet.
 *
 * @returns {Promise<RedeemPermit | undefined>} A signed permit or undefined if
 *  an error occurs.
 */
export async function getEthereumRedeemPermit(
    sourceAddress: string,
    recipientAddress: string,
    tokenCode: string,
    collateral: string,
    amount: BigInt,
    isTestnet = false): Promise<RedeemPermit | undefined> {

    if (!process.env.M1_API_BASE_URL) {
        console.error("no M1_API_BASE_URL set in environemnt!");
        return;
    }

    const url = `${process.env.M1_API_BASE_URL}/permits/ethereum/redemptions`;

    return await postToAPI<RedeemPermit>(
        url,
        {
            sourceAddress,
            recipientAddress,
            tokenCode,
            collateral,
            amount: amount.toString(),
            isTestnet,
        },
        { returnRaw: true }
    );
}
