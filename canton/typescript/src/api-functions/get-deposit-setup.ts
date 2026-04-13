import type { CantonBrokerConfig } from "../interfaces";
import { getFromAPI } from "./get-from-api";

/**********************************************************************************
 * Fetches static Canton broker metadata from the M1 API.
 *
 * @returns {Promise<CantonBrokerConfig | undefined>} The broker metadata or
 *  undefined if the request fails.
 */
export async function getDepositSetup(): Promise<CantonBrokerConfig | undefined> {
    const baseUrl = process.env["M1_API_BASE_URL"];
    if (!baseUrl) {
        console.error("M1_API_BASE_URL is not set");
        return undefined;
    }

    const url = `${baseUrl}/canton/broker`;
    return getFromAPI<CantonBrokerConfig>(url, true);
}
