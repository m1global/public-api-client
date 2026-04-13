import axios from "axios";

/**********************************************************************************
 * Fetches the current ledger end offset from the Canton participant.
 * The returned offset is passed as activeAtOffset in ACS queries so that
 * all contract lookups are consistent at the same point in time.
 *
 * @param {string} baseUrl The Canton participant base URL.
 * @param {string} jwt The bearer JWT obtained from Keycloak.
 *
 * @returns {Promise<string>} The ledger end offset string.
 */
export async function getLedgerEnd(baseUrl: string, jwt: string): Promise<string> {

    const resp = await axios.get<Record<string, unknown>>(
        `${baseUrl}/v2/state/ledger-end`,
        { headers: { Authorization: `Bearer ${jwt}` } },
    );

    const offset = resp.data["offset"] ?? resp.data["ledgerEnd"] ?? resp.data["ledger_end"];
    if (!offset) {
        throw new Error("missing ledger-end in response");
    }

    return String(offset);
}
