import { getM1ApiV2BaseUrl } from "./api-base";


import {
    SerializedInstruction,
    SolanaDepositBody,
    SolanaDepositPermit,
    SolanaPriceAttestationInput,
} from "../interfaces-v2";
import { postToAPI } from "./post-to-api-v2";

/**********************************************************************************
 * Typescript function that calls the M1 API Solana endpoint for deposits
 * and returns a transaction ready for signing and submission.
 * 
 * @param {string} depositorAddress The address of the depositor.
 * @param {string} collateralAddress The collateral being deposited.
 * @param {string} amount The amount of the deposit.
 * @param {string} tokenCode The code of the token being requested in return, 
 *  i.e. USDM0 or USDM1.
 * @param {booelan} isTestnet Flag to switch betwen Sepolia and Mainnet.
 * 
 * @returns {Promise<SerializedInstruction | undefined>} A prepared ethers
 *  ContractTransaction or undefined if an error occurs.
 */
export async function deposit(
    depositorAddress: string,
    recipientAddress: string,
    collateralAddress: string,
    amount: string,
    tokenCode: string,
    collateralAttestation: SolanaPriceAttestationInput | undefined,
    tokenAttestation: SolanaPriceAttestationInput,
    depositPermit: SolanaDepositPermit,
    isTestnet = false,
): Promise<SerializedInstruction[] | undefined> {

    // The base url for the M1 API must be added to the environment.
    const url = `${getM1ApiV2BaseUrl()}/solana/treasury/deposits`;

    // POST payload
    const body: SolanaDepositBody = {
        depositor: depositorAddress,
        recipient: recipientAddress,
        collateral: collateralAddress,
        amount,
        tokenCode,
        tokenAttestation,
        depositPermit,
        isTestnet,
    }
    if (collateralAttestation !== undefined) {
        body.collateralAttestation = collateralAttestation;
    }

    return await postToAPI<SerializedInstruction[]>(url, body);
}
