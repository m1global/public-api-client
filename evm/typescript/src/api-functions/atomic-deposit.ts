import { ContractTransaction } from "ethers";

import {
    DepositPermit,
    EvmAtomicDepositBody,
    PriceAttestation
} from "../interfaces";
import { postToAPI } from "./post-to-api";

/**********************************************************************************
 * Typescript function that calls the M1 API Ethereum endpoint for deposits
 * and returns a transaction ready for signing and submission.
 * 
 * @param {string} depositorAddress The address of the depositor.
 * @param {string} recipientAddress The address of the recipient of the deposit.
 * @param {string} collateralAddress The collateral being deposited.
 * @param {string} amount The amount of the deposit.
 * @param {string} tokenCode The code of the token being requested in return, i.e. USDM0 or USDM1.
 * @param {PriceAttestation} collateralAttestation The raw price attestation for the collateral.
 * @param {PriceAttestation} tokenAttestation The raw price attestation for the token being requested.
 * @param {DepositPermit} depositPermit The raw deposit permit for the transaction.
 * @param {booelan} isTestnet Flag to switch betwen Sepolia and Mainnet.
 * 
 * @returns {Promise<ContractTransaction | undefined>} A prepared ethers
 *  ContractTransaction or undefined if an error occurs.
 */
export async function atomicDeposit(
    depositorAddress: string,
    recipientAddress: string,
    collateralAddress: string,
    amount: string,
    tokenCode: string,
    collateralAttestation: PriceAttestation,
    tokenAttestation: PriceAttestation,
    depositPermit: DepositPermit,
    isTestnet = false,
): Promise<ContractTransaction | undefined> {

    // The base url for the M1 API must be added to the environment.
    if (!process.env.M1_API_BASE_URL) {
        console.error("no M1_API_BASE_URL set in environemnt!");
        return;
    }

    // The API endpoint to call.
    const url = `${process.env.M1_API_BASE_URL}/ethereum/atomic-broker/deposits`;

    // POST payload
    const body: EvmAtomicDepositBody = {
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