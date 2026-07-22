import { SerializedInstruction, SolanaPriceAttestationInput, SolanaSwapBody, SolanaSwapPermit } from "../interfaces-v2";
import { postToAPI } from "./post-to-api-v2";

import { getM1ApiV2BaseUrl } from "./api-base";
/**********************************************************************************
 * Typescript function that calls the M1 API Solana endpoint for swaps
 * and returns a transaction ready for signing and submission.
 * 
 * @param {string} swapperAddress The address of the swapper.
 * @param {string} inputTokenCode The code of the token being swapped, 
 *  i.e. USDM0 or USDM1.
 * @param {string} amount The amount of the swap.
 * @param {booelan} isTestnet Flag to switch betwen Sepolia and Mainnet.
 * 
 * @returns {Promise<ContractTransaction | undefined>} A prepared ethers
 *  ContractTransaction or undefined if an error occurs.
 */
export async function swap(
    swapperAddress: string,
    inputTokenCode: string,
    amount: string,
    tokenAttestation: SolanaPriceAttestationInput,
    swapPermit: SolanaSwapPermit,
    isTestnet = false): Promise<SerializedInstruction[] | undefined> {

    const url = `${getM1ApiV2BaseUrl()}/solana/treasury/swaps`;

    const body: SolanaSwapBody = {
        swapper: swapperAddress,
        inputTokenCode,
        amount,
        tokenAttestation,
        swapPermit,
        isTestnet,
    }

    return await postToAPI<SerializedInstruction[]>(url, body)

}
