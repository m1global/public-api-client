import { ContractTransaction } from "ethers";

import { EvmDepositBody, EvmRedemptionBody } from "../interfaces";
import { postToAPI } from "./post-to-api";

/**********************************************************************************
 * Typescript function that calls the M1 API Ethereum endpoint for redemptions
 * and returns a transaction ready for signing and submission.
 * 
 * @param {string} redemeerAddress The address of the redeemer.
 * @param {string} tokenCode The code of the token being redeemed,  
 *  i.e. USDM0 or USDM1.
 * @param {string} amount The amount of the redemption.
 * @param {string} collateralAddress The collateral being requested.
 * @param {booelan} isTestnet Flag to switch betwen Sepolia and Mainnet.
 * 
 * @returns {Promise<ContractTransaction | undefined>} A prepared ethers
 *  ContractTransaction or undefined if an error occurs.
 */
export async function redeem(
    redeemerAddress: string,
    tokenCode: string,
    amount: string,
    collateralAddress: string,
    isTestnet = false,
): Promise<ContractTransaction | undefined> {

    // The base url for the M1 API must be added to the environment.
    if (!process.env.M1_API_BASE_URL) {
        console.error("no M1_API_BASE_URL set in environemnt!");
        return;
    }

    // The API endpoint to call.
    const url = `${process.env.M1_API_BASE_URL}/ethereum/broker/redemptions`;

    // POST payload
    const body: EvmRedemptionBody = {
        redeemer: redeemerAddress,
        tokenCode,
        amount: amount,
        collateral: collateralAddress,
        isTestnet: isTestnet,
    }

    return await postToAPI(url, body);
}