
import { SerializedInstruction, SolanaDepositBody, SolanaRedemptionBody } from "../interfaces";
import { postToAPI } from "./post-to-api";

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
    tokenCode: string,
    amount: string,
    collateralAddress: string,
    isTestnet = false,
): Promise<SerializedInstruction | undefined> {

    // The base url for the M1 API must be added to the environment.
    if (!process.env.M1_API_BASE_URL) {
        console.error("no M1_API_BASE_URL set in environemnt!");
        return;
    }

    const url = `${process.env.M1_API_BASE_URL}/solana/treasury/redemptions`;

    // POST payload
    const body: SolanaRedemptionBody = {
        redeemer: redeemerAddress,
        tokenCode,
        amount,
        collateral: collateralAddress,
        isTestnet,
    }

    console.info(`redeem request: ${JSON.stringify(body)}`);

    return await postToAPI(url, body);
}