
import { SerializedInstruction, SolanaDepositBody } from "../interfaces";
import { postToAPI } from "./post-to-api";

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
    collateralAddress: string,
    amount: string,
    tokenCode: string,
    isTestnet = false,
): Promise<SerializedInstruction | undefined> {

    // The base url for the M1 API must be added to the environment.
    if (!process.env.M1_API_BASE_URL) {
        console.error("no M1_API_BASE_URL set in environemnt!");
        return;
    }

    // The base url for the M1 API must be added to the environment.
    const url = `${process.env.M1_API_BASE_URL}/solana/treasury/deposits`;

    // POST payload
    const body: SolanaDepositBody = {
        depositor: depositorAddress,
        collateral: collateralAddress,
        amount,
        tokenCode,
        isTestnet,
    }

    return await postToAPI(url, body);
}