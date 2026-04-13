import axios from "axios";

import { CantonCreatedEvent } from "../interfaces";

/**
 * Shared helper — POST to /v2/state/active-contracts and extract createdEvents.
 */
async function postActiveContracts(
    baseUrl: string,
    jwt: string,
    payload: unknown,
): Promise<CantonCreatedEvent[]> {
    const resp = await axios.post<Record<string, unknown>[]>(
        `${baseUrl}/v2/state/active-contracts`,
        payload,
        {
            headers: {
                Authorization: `Bearer ${jwt}`,
                "Content-Type": "application/json",
            },
        },
    );

    const raw = resp.data;
    // Canton v2 may return: an array directly, or a wrapper { result: [...] }
    const rows: Record<string, unknown>[] = Array.isArray(raw)
        ? raw
        : Array.isArray((raw as Record<string, unknown>)["result"])
            ? ((raw as Record<string, unknown>)["result"] as Record<string, unknown>[])
            : [];

    return rows
        .map((row) => {
            const entry = row["contractEntry"] as Record<string, unknown> | undefined;
            const active = entry?.["JsActiveContract"] as Record<string, unknown> | undefined;
            return active?.["createdEvent"] as CantonCreatedEvent | undefined;
        })
        .filter((e): e is CantonCreatedEvent => Boolean(e));
}

/**********************************************************************************
 * Queries the Canton ACS for all active contracts of a given template
 * visible to the specified party at the given ledger offset.
 *
 * @param {string} baseUrl The Canton participant base URL.
 * @param {string} jwt The bearer JWT obtained from Keycloak.
 * @param {string} party The Canton party ID whose ACS is queried.
 * @param {string} templateId The fully-qualified template ID
 *  (e.g. "pkgHash:Module.Name:TemplateName").
 * @param {string} activeAtOffset The ledger end offset from getLedgerEnd().
 *
 * @returns {Promise<CantonCreatedEvent[]>} The created events for all matching
 *  active contracts.
 */
export async function queryActiveContracts(
    baseUrl: string,
    jwt: string,
    party: string,
    templateId: string,
    activeAtOffset: string,
): Promise<CantonCreatedEvent[]> {

    const payload = {
        verbose: true,
        activeAtOffset,
        filter: {
            filtersByParty: {
                [party]: {
                    cumulative: [
                        {
                            identifierFilter: {
                                TemplateFilter: {
                                    value: {
                                        templateId,
                                        includeCreatedEventBlob: true,
                                        includeInterfaceView: true,
                                    },
                                },
                            },
                        },
                    ],
                },
            },
        },
    };

    return postActiveContracts(baseUrl, jwt, payload);
}

