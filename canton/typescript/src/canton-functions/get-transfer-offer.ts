import { CantonCreatedEvent } from "../interfaces";
import { queryActiveContracts } from "./query-active-contracts";

/**********************************************************************************
 * Queries the Canton ACS for a TransferOffer addressed to the given receiver
 * party for the specified collateral instrument.
 *
 * After the M1 Canton faucet operation completes, the admin creates a
 * TransferOffer on the Canton ledger with the customer as receiver.
 * The customer must accept this offer to take custody of the collateral.
 *
 * @param {string} baseUrl The Canton participant base URL.
 * @param {string} jwt The bearer JWT obtained from Keycloak.
 * @param {string} receiverParty The customer's Canton party ID.
 * @param {string} activeAtOffset The ledger end offset from getLedgerEnd().
 * @param {string} utilityRegistryAppV0PackageId Package ID for utility-registry-app-v0.
 * @param {string} instrumentId The collateral instrument ID (e.g. "MOCK").
 * @param {string} collateralRegistrar The Canton party ID of the collateral registrar.
 *
 * @returns {Promise<CantonCreatedEvent | undefined>} The matching created event
 *  or undefined if no offer is found yet.
 */
export async function getTransferOffer(
    baseUrl: string,
    jwt: string,
    receiverParty: string,
    activeAtOffset: string,
    utilityRegistryAppV0PackageId: string,
    instrumentId: string,
    collateralRegistrar: string,
): Promise<CantonCreatedEvent | undefined> {

    const templateId = `${utilityRegistryAppV0PackageId}:Utility.Registry.App.V0.Model.Transfer:TransferOffer`;
    const events = await queryActiveContracts(baseUrl, jwt, receiverParty, templateId, activeAtOffset);

    return events.find((e) => {
        const args = (e.createArgument ?? e.createArguments ?? {}) as Record<string, unknown>;
        const instrument = (args["instrumentId"] as Record<string, unknown> | undefined) ?? {};
        return (
            String(args["receiver"] ?? "").trim() === receiverParty
            && String(instrument["id"] ?? "").trim() === instrumentId
            && String(instrument["admin"] ?? "").trim() === collateralRegistrar
        );
    });
}
