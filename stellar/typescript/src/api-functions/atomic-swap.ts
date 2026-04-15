import { StellarAtomicSwapBody, StellarPriceAttestation } from "../interfaces";
import { postToAPI } from "./post-to-api";

/**********************************************************************************
 * Typescript function that calls the M1 API Stellar endpoint for atomic swaps
 * and returns a transaction ready for signing and submission.
 *
 * @param {string} swapperAddress The address of the swapper.
 * @param {string} inputTokenCode The code of the token being swapped, i.e. USDM0 or USDM1.
 * @param {string} amount The amount of the swap.
 * @param {StellarPriceAttestation} tokenAttestation The price attestation for the token.
 * @param {boolean} isTestnet Flag to switch betwen Testnet and Public.
 *
 * @returns {Promise<string | undefined>} A base-64 XDR string
 *  or undefined if an error occurs.
 */
export async function atomicSwap(
    swapperAddress: string,
    inputTokenCode: string,
    amount: string,
    tokenAttestation: StellarPriceAttestation,
    isTestnet = false): Promise<string | undefined> {

    // The base url for the M1 API must be added to the environment.
    if (!process.env.M1_API_BASE_URL) {
        console.error("no M1_API_BASE_URL set in environemnt!");
        return;
    }

    // The API endpoint to call.
    const url = `${process.env.M1_API_BASE_URL}/stellar/atomic-broker/swaps`;

    const body: StellarAtomicSwapBody = {
        swapper: swapperAddress,
        inputTokenCode,
        amount,
        tokenAttestation,
        isTestnet,
    }

    return await postToAPI(url, body);
}
