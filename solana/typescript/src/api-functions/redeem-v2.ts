import { getM1ApiV2BaseUrl } from "./api-base";


import {
    SerializedInstruction,
    SolanaPriceAttestationInput,
    SolanaRedeemPermit,
    SolanaRedemptionBody,
} from "../interfaces-v2";
import { postToAPI } from "./post-to-api-v2";

/**********************************************************************************
 * Typescript function that calls the M1 API Solana endpoint for redemptions
 * and returns a transaction ready for signing and submission.
 * 
 * @param {string} redeemerAddress The address of the redeemer.
 * @param {string} tokenCode The code of the token being redeemed,
 *  i.e. USDM0 or USDM1.
 * @param {string} amount The amount of the redemption.
 * @param {string} collateralAddress The collateral being requested.
 * @param {booelan} isTestnet Flag to switch betwen Devnet and Mainnet.
 *
 * @returns {Promise<SerializedInstruction | undefined>} A prepared Solana
 *  SerializedInstruction or undefined if an error occurs.
 */
export async function redeem(
    redeemerAddress: string,
    recipientAddress: string,
    tokenCode: string,
    amount: string,
    collateralAddress: string,
    collateralAttestation: SolanaPriceAttestationInput | undefined,
    tokenAttestation: SolanaPriceAttestationInput | undefined,
    redeemPermit: SolanaRedeemPermit,
    isTestnet = false,
): Promise<SerializedInstruction[] | undefined> {

    const url = `${getM1ApiV2BaseUrl()}/solana/treasury/redemptions`;

    // POST payload
    const body: SolanaRedemptionBody = {
        redeemer: redeemerAddress,
        recipient: recipientAddress,
        tokenCode,
        amount,
        collateral: collateralAddress,
        redeemPermit,
        isTestnet,
    }
    if (collateralAttestation !== undefined) {
        body.collateralAttestation = collateralAttestation;
    }
    if (tokenAttestation !== undefined) {
        body.tokenAttestation = tokenAttestation;
    }

    console.info(`redeem request: ${JSON.stringify(body)}`);

    return await postToAPI<SerializedInstruction[]>(url, body);
}
