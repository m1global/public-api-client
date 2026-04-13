import axios from "axios";

/**********************************************************************************
 * Typescript function that calls the M1 API Solana endpoint for faucets
 * and returns an operation id.
 * 
 * @param {string} symbol The symbol of the token being requested.
 * @param {string} recipientAddress The recipient of the faucet tokens.
 * 
 * @returns {Promise<string | undefined>} The operation id associated with the
 *  request or undefined if an error occurs.
 * 
 * @dev The operation id can be used to fetch the associated Solana devnet transaction hash.
 */
export async function faucet(symbol: string, recipientAddress: string): Promise<string | undefined> {

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

    // Note: we do not append isTestnet because faucet endpoints are only supported on testnets.
    const url = `${process.env.M1_API_BASE_URL}/solana/faucet/${symbol}/${recipientAddress}`;

    try {
        const apiResp = await axios.post(url,
            undefined,
            {
                headers: {
                    "Content-Type": "application/json",
                    "Authorization": `Bearer ${process.env.M1_API_JWT}`,
                }
            });
        if (!apiResp || !apiResp.data || !apiResp.data.opId) {
            throw new Error("no response from server");
        }
        return apiResp.data.opId;
    } catch (err) {
        if (axios.isAxiosError(err)) {
            console.error(`post to faucet endpoint failed: ${JSON.stringify(err.response?.data)} with status ${err.response?.status}`);
        } else {
            console.log(err);
        }
    }
}