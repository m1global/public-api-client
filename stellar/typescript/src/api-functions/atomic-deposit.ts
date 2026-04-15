import {
    StellarAtomicDepositBody,
    StellarDepositPermit,
    StellarPriceAttestation
} from "../interfaces";
import { postToAPI } from "./post-to-api";

/**********************************************************************************
 * Typescript function that calls the M1 API Stellar endpoint for atomic deposits
 * and returns a transaction ready for signing and submission.
 *
 * @param {string} depositorAddress The address of the depositor.
 * @param {string} recipientAddress The address of the recipient of the deposit.
 * @param {string} collateralAddress The collateral being deposited.
 * @param {string} amount The amount of the deposit.
 * @param {string} tokenCode The code of the token being requested in return, i.e. USDM0 or USDM1.
 * @param {StellarPriceAttestation} collateralAttestation The price attestation for the collateral.
 * @param {StellarPriceAttestation} tokenAttestation The price attestation for the token being requested.
 * @param {StellarDepositPermit} depositPermit The deposit permit for the transaction.
 * @param {boolean} isTestnet Flag to switch betwen Testnet and Public.
 *
 * @returns {Promise<string | undefined>} A base-64 XDR string
 *  or undefined if an error occurs.
 */
export async function atomicDeposit(
    depositorAddress: string,
    recipientAddress: string,
    collateralAddress: string,
    amount: string,
    tokenCode: string,
    collateralAttestation: StellarPriceAttestation,
    tokenAttestation: StellarPriceAttestation,
    depositPermit: StellarDepositPermit,
    isTestnet = false,
): Promise<string | undefined> {

    // The base url for the M1 API must be added to the environment.
    if (!process.env.M1_API_BASE_URL) {
        console.error("no M1_API_BASE_URL set in environemnt!");
        return;
    }

    // The API endpoint to call.
    const url = `${process.env.M1_API_BASE_URL}/stellar/atomic-broker/deposits`;

    // POST payload
    const body: StellarAtomicDepositBody = {
        depositor: depositorAddress,
        recipient: recipientAddress,
        collateral: collateralAddress,
        amount: amount,
        tokenCode,
        collateralAttestation,
        tokenAttestation,
        depositPermit,
        isTestnet,
    }

    return await postToAPI(url, body);
}
