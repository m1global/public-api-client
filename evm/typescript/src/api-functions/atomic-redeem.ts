import { ContractTransaction } from "ethers";

import {
    EvmAtomicRedemptionBody,
    PriceAttestation,
    RedeemPermit
} from "../interfaces";
import { postToAPI } from "./post-to-api";

/**********************************************************************************
 * Typescript function that calls the M1 API Ethereum endpoint for deposits
 * and returns a transaction ready for signing and submission.
 * 
 * @param {string} redeemerAddress The address of the redeemer.
 * @param {string} tokenCode The code of the token being redeemed.
 * @param {string} amount The amount of the redemption.
 * @param {string} collateralAddress The collateral being requested, i.e. USDM0 or USDM1.
 * @param {string} recipientAddress The address of the recipient of the collateral.
 * @param {PriceAttestation} collateralAttestation The price attestation for the collateral.
 * @param {PriceAttestation} tokenAttestation The price attestation for the token being requested.
 * @param {RedeemPermit} redeemPermit The redeem permit for the transaction.
 * @param {booelan} isTestnet Flag to switch betwen Sepolia and Mainnet.
 * 
 * @returns {Promise<ContractTransaction | undefined>} A prepared ethers
 *  ContractTransaction or undefined if an error occurs.
 */
export async function atomicRedeem(
    redeemerAddress: string,
    tokenCode: string,
    amount: string,
    collateralAddress: string,
    recipientAddress: string,
    collateralAttestation: PriceAttestation,
    tokenAttestation: PriceAttestation,
    redeemPermit: RedeemPermit,
    isTestnet = false,
): Promise<ContractTransaction | undefined> {

    // The base url for the M1 API must be added to the environment.
    if (!process.env.M1_API_BASE_URL) {
        console.error("no M1_API_BASE_URL set in environemnt!");
        return;
    }

    // The API endpoint to call.
    const url = `${process.env.M1_API_BASE_URL}/ethereum/atomic-broker/redemptions`;

    // POST payload
    const body: EvmAtomicRedemptionBody = {
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