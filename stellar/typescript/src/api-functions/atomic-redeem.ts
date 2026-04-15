import {
    StellarAtomicRedemptionBody,
    StellarPriceAttestation,
    StellarRedeemPermit
} from "../interfaces";
import { postToAPI } from "./post-to-api";

/**********************************************************************************
 * Typescript function that calls the M1 API Stellar endpoint for atomic redemptions
 * and returns a transaction ready for signing and submission.
 *
 * @param {string} redeemerAddress The address of the redeemer.
 * @param {string} tokenCode The code of the token being redeemed.
 * @param {string} amount The amount of the redemption.
 * @param {string} collateralAddress The collateral being requested.
 * @param {string} recipientAddress The address of the recipient of the collateral.
 * @param {StellarPriceAttestation} collateralAttestation The price attestation for the collateral.
 * @param {StellarPriceAttestation} tokenAttestation The price attestation for the token.
 * @param {StellarRedeemPermit} redeemPermit The redeem permit for the transaction.
 * @param {boolean} isTestnet Flag to switch betwen Testnet and Public.
 *
 * @returns {Promise<string | undefined>} A base-64 XDR string
 *  or undefined if an error occurs.
 */
export async function atomicRedeem(
    redeemerAddress: string,
    tokenCode: string,
    amount: string,
    collateralAddress: string,
    recipientAddress: string,
    collateralAttestation: StellarPriceAttestation,
    tokenAttestation: StellarPriceAttestation,
    redeemPermit: StellarRedeemPermit,
    isTestnet = false,
): Promise<string | undefined> {

    // The base url for the M1 API must be added to the environment.
    if (!process.env.M1_API_BASE_URL) {
        console.error("no M1_API_BASE_URL set in environemnt!");
        return;
    }

    // The API endpoint to call.
    const url = `${process.env.M1_API_BASE_URL}/stellar/atomic-broker/redemptions`;

    // POST payload
    const body: StellarAtomicRedemptionBody = {
        redeemer: redeemerAddress,
        tokenCode,
        amount: amount,
        collateral: collateralAddress,
        recipient: recipientAddress,
        collateralAttestation,
        tokenAttestation,
        redeemPermit,
        isTestnet,
    }

    return await postToAPI(url, body);
}
