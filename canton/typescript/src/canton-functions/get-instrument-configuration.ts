import { CantonCreatedEvent } from "../interfaces";
import { queryActiveContracts } from "./query-active-contracts";

/**********************************************************************************
 * Queries the Canton ACS for an InstrumentConfiguration contract matching the
 * given collateral instrument ID.
 *
 * The InstrumentConfiguration is required as a disclosed contract when
 * exercising choices that validate instrument parameters (e.g. accepting a
 * TransferOffer).
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
export async function getInstrumentConfiguration(
    baseUrl: string,
    jwt: string,
    party: string,
    activeAtOffset: string,
    utilityRegistryV0PackageId: string,
    instrumentId: string,
): Promise<CantonCreatedEvent | undefined> {

    const templateId = `${utilityRegistryV0PackageId}:Utility.Registry.V0.Configuration.Instrument:InstrumentConfiguration`;
    const events = await queryActiveContracts(baseUrl, jwt, party, templateId, activeAtOffset);

    return events.find((e) => {
        const args = (e.createArgument ?? e.createArguments ?? {}) as Record<string, unknown>;
        const defaultId = (args["defaultIdentifier"] as Record<string, unknown> | undefined);  // { source, id }
        const instrumentIdField = (args["instrumentId"] as Record<string, unknown> | undefined);
        const id = String(defaultId?.["id"] ?? instrumentIdField?.["id"] ?? args["id"] ?? "").trim();
        // The registrar field sits at createArgument.registrar in this template.
        return id === instrumentId;
    });
}
