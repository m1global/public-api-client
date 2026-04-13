import axios from "axios";

/**********************************************************************************
 * Generic Typescript function that executes a GET on an M1 API endpoint.
 *
 * @template T The expected shape of the response data.
 * @param {string} url The full M1 API url to GET.
 * @param {boolean} secure Whether to include the M1_API_JWT bearer token.
 *
 * @returns {Promise<T>} The parsed response body.
 */
export async function getFromAPI<T>(url: string, secure = true): Promise<T> {

    // The base url for the M1 API must be added to the environment.
    if (!process.env.M1_API_BASE_URL) {
        throw new Error("no M1_API_BASE_URL set in environment");
    }

    // Your M1 API Client JWT must be added to the environment.
    if (secure && !process.env.M1_API_JWT) {
        throw new Error("no M1_API_JWT set in environment");
    }

    try {
        const headers: Record<string, string> = { "Content-Type": "application/json" };
        if (secure) {
            headers["Authorization"] = `Bearer ${process.env.M1_API_JWT}`;
        }

        console.log(`==> ${url}`);
        const apiResp = await axios.get<T>(url, { headers });

        if (!apiResp || !apiResp.data) {
            throw new Error("no response from server");
        }

        console.log(`<== ${JSON.stringify(apiResp.data)}`);
        return apiResp.data;
    } catch (err) {
        if (axios.isAxiosError(err)) {
            throw new Error(`GET ${url} failed: ${JSON.stringify(err.response?.data)} with status ${err.response?.status}`);
        } else {
            throw err;
        }
    }
}
