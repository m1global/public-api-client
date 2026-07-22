import {
    AttestationDirectionRequest,
    SolanaPriceAttestationResponse,
} from "../interfaces-v2";
import { postToAPI } from "./post-to-api-v2";

import { getM1ApiV2BaseUrl } from "./api-base";
/**********************************************************************************
 * Typescript function that calls the M1 API Solana endpoint for a USDM1 price
 * attestation.
 *
 * @param {string} requesterAddress The address requesting the attestation.
 * @param {AttestationDirectionRequest} direction The operation bound to the quote.
 * @param {string} collateral Optional collateral token address for deposit/redeem.
 * @param {boolean} isTestnet Flag to switch between Devnet and Mainnet.
 *
 * @returns {Promise<SolanaPriceAttestationResponse | undefined>} A signed
 *  attestation or undefined if an error occurs.
 */
export async function getSolanaUsdm1PriceAttestation(
    requesterAddress: string,
    direction: AttestationDirectionRequest,
    collateral?: string,
    isTestnet = false): Promise<SolanaPriceAttestationResponse | undefined> {

    const url = `${getM1ApiV2BaseUrl()}/price-attestations/usdm1/solana`;
    const body: Record<string, unknown> = {
        address: requesterAddress,
        direction,
        isTestnet,
    };
    if (collateral !== undefined) {
        body.collateral = collateral;
    }

    return await postToAPI<SolanaPriceAttestationResponse>(url, body, { returnRaw: true });
}
