import axios from "axios";

/**********************************************************************************
 * Typescript function that calls the M1 API Canton endpoint for faucets
 * and returns an operation id.
 *
 * @param {string} recipientPartyId The Canton party ID of the recipient.
 * @param {string} mintRequestCid The CID of the customer-created MintRequest.
 *
 * @returns {Promise<string | undefined>} The operation id associated with the
 *  request or undefined if an error occurs.
 *
 * @dev The operation id can be used to poll the M1 API for completion status.
 * @dev The faucet is rate-limited to 1 request every 24 hours per token per chain.
 */
export async function faucet(recipientPartyId: string, mintRequestCid: string): Promise<string | undefined> {

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
    const url = `${process.env.M1_API_BASE_URL}/canton/faucet`;

    try {
        const apiResp = await axios.post(url, {
            recipient: recipientPartyId,
            mintRequestCid,
        }, {
            headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${process.env.M1_API_JWT}`,
            },
        });

        if (!apiResp || !apiResp.data || !apiResp.data.opId) {
            throw new Error("no opId in response from server");
        }

        return apiResp.data.opId as string;
    } catch (err) {
        if (axios.isAxiosError(err)) {
            console.error(`faucet request failed: ${JSON.stringify(err.response?.data)} with status ${err.response?.status}`);
        } else {
            console.error(err);
        }
    }
}
