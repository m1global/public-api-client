import axios from "axios";

/**********************************************************************************
 * Generic Typescript function that executes a POST on an M1 API endpoint.
 *
 * @template T The expected shape of the response data.
 * @param {string} url The full M1 API url to POST to.
 * @param {unknown} body The JSON body to include in the request.
 *
 * @returns {Promise<T | undefined>} The parsed response body or undefined if
 *  an error occurs.
 */
export async function postToAPI<T = unknown>(url: string, body: unknown): Promise<T | undefined> {

    // Your M1 API Client JWT must be added to the environment.
    if (!process.env.M1_API_JWT) {
        console.error("no M1_API_JWT set in environment!");
        return;
    }

    try {
        const apiResp = await axios.post<T>(url, body, {
            headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${process.env.M1_API_JWT}`,
            },
        });

        if (!apiResp || !apiResp.data) {
            throw new Error("no response from server");
        }

        console.log(JSON.stringify(apiResp.data));
        return apiResp.data;
    } catch (err) {
        if (axios.isAxiosError(err)) {
            console.error(`POST ${url} failed: ${JSON.stringify(err.response?.data)} with status ${err.response?.status}`);
        } else {
            console.error(err);
        }
    }
}
