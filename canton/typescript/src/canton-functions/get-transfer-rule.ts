import { CantonCreatedEvent } from "../interfaces";
import { queryActiveContracts } from "./query-active-contracts";

/**********************************************************************************
 * Queries the Canton ACS for a TransferRule contract matching the given
 * collateral instrument ID.
 *
 * The TransferRule is an optional disclosed contract that, when present,
 * permits the transfer to proceed.  If no matching rule is found this
 * function returns undefined; callers should fall back to base extra-args.
 *
 * @param {string} baseUrl The Canton participant base URL.
 * @param {string} jwt The bearer JWT obtained from Keycloak.
 * @param {string} party The Canton party ID whose ACS is queried.
 * @param {string} activeAtOffset The ledger end offset from getLedgerEnd().
 * @param {string} utilityRegistryV0PackageId Package ID for utility-registry-v0.
 * @param {string} instrumentId The collateral instrument ID (e.g. "MOCK").
 *
 * @returns {Promise<CantonCreatedEvent | undefined>} The matching created event
 *  or undefined if not found.
 */
export async function getTransferRule(
    baseUrl: string,
    jwt: string,
    party: string,
    activeAtOffset: string,
    utilityRegistryV0PackageId: string,
    instrumentId: string,
): Promise<CantonCreatedEvent | undefined> {

    const templateId = `${utilityRegistryV0PackageId}:Utility.Registry.V0.Rule.Transfer:TransferRule`;
    const events = await queryActiveContracts(baseUrl, jwt, party, templateId, activeAtOffset);

    return events.find((e) => {
        const args = (e.createArgument ?? e.createArguments ?? {}) as Record<string, unknown>;
        const instrumentIdField = (args["instrumentId"] as Record<string, unknown> | undefined);
        const defaultId = (args["defaultIdentifier"] as Record<string, unknown> | undefined);
        const id = String(instrumentIdField?.["id"] ?? defaultId?.["id"] ?? args["id"] ?? "").trim();
        return id === instrumentId;
    });
}
