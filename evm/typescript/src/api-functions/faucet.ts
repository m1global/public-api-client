import axios from "axios";

export interface FaucetResponse {
    tx: string;
    txUrl?: string;
}

/**********************************************************************************
 * Typescript function that calls the M1 API Sepolia endpoint for faucets
 * and returns the submitted transaction details.
 * 
 * @param {string} erc20Symbol The ERC-20 symbol of the token being requested.
 * @param {string} recipientAddress The recipient of the faucet tokens.
 * 
 * @returns {Promise<FaucetResponse | undefined>} The faucet transaction details
 *  or undefined if an error occurs.
 */
export async function faucet(erc20Symbol: string, recipientAddress: string): Promise<FaucetResponse | undefined> {

    // The base url for the M1 API must be added to the environment.
    if (!process.env.M1_API_BASE_URL) {
        console.error("no M1_API_BASE_URL set in environment!");
        return;
    }

    // Your M1 API Client JWT must be added to the environment.
    if (!process.env.M1_API_JWT) {
        console.error("no M1_API_JWT set in environment!");
        return;
    }

    // The API endpoint to call.
    // Note: we do not append isTestnet because faucet endpoints are only supported on testnets.
    const url = `${process.env.M1_API_BASE_URL}/ethereum/faucet/${erc20Symbol}/${recipientAddress}`;

    try {
        const apiResp = await axios.post(url,
            undefined,
            {
                headers: {
                    "Content-Type": "application/json",
                    "Authorization": `Bearer ${process.env.M1_API_JWT}`,
                }
            });
        if (!apiResp || !apiResp.data || !apiResp.data.tx) {
            throw new Error("no response from server");
        }
        const response: FaucetResponse = {
            tx: String(apiResp.data.tx),
        };
        if (apiResp.data.txUrl) {
            response.txUrl = String(apiResp.data.txUrl);
        }
        return response;
    } catch (err) {
        if (axios.isAxiosError(err)) {
            console.error(`post to faucet endpoint failed: ${JSON.stringify(err.response?.data)} with status ${err.response?.status}`);
        } else {
            console.log(err);
        }
    }
}
