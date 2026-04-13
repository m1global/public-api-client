import { CantonCreatedEvent, CantonTransactionResult, DisclosedContract } from "../interfaces";
import { queryActiveContracts } from "./query-active-contracts";
import { submitCommand } from "./submit-command";

/**********************************************************************************
 * Queries the Canton ACS for an existing RecipientMintAuth contract owned by the
 * customer, or creates one if none is found.
 *
 * RecipientMintAuth is a standing-authorisation contract that allows the broker
 * admin to burn collateral and mint USDM to the recipient in a single atomic
 * transaction.  The recipient (customer) is the signatory, so they must create
 * it and they can read it from their own ACS.
 *
 * @param {string} baseUrl The Canton participant base URL.
 * @param {string} jwt The bearer JWT obtained from Keycloak.
 * @param {string} customerParty The customer's Canton party ID (both actAs and
 *  the `recipient` field of the contract).
 * @param {string} adminParty The broker admin's Canton party ID (the `admin`
 *  field of the contract, i.e. the m1validator party).
 * @param {string} userId The Keycloak user ID (sub claim) of the customer.
 * @param {string} brokerPackageId The broker DAR package ID.
 * @param {string} activeAtOffset The current ledger end offset.
 *
 * @returns {Promise<CantonCreatedEvent>} The existing or newly-created
 *  RecipientMintAuth created event.
 */
export async function getOrCreateRecipientMintAuth(
    baseUrl: string,
    jwt: string,
    customerParty: string,
    adminParty: string,
    userId: string,
    brokerPackageId: string,
    activeAtOffset: string,
): Promise<CantonCreatedEvent> {

    const templateId = `${brokerPackageId}:M1G.Broker.AtomicBroker:RecipientMintAuth`;

    // Check whether one already exists in the customer's ACS.
    const existing = await queryActiveContracts(
        baseUrl, jwt, customerParty, templateId, activeAtOffset,
    );

    const found = existing.find((e) => {
        const args = (e.createArgument ?? e.createArguments ?? {}) as Record<string, unknown>;
        return String(args["admin"] ?? "").trim() === adminParty
            && String(args["recipient"] ?? "").trim() === customerParty;
    });

    if (found) {
        console.info(`RecipientMintAuth found: ${found.contractId}`);
        return found;
    }

    console.info("no RecipientMintAuth found — creating one...");

    const command = {
        CreateCommand: {
            templateId,
            createArguments: {
                admin: adminParty,
                recipient: customerParty,
            },
        },
    };

    const result: CantonTransactionResult = await submitCommand(
        baseUrl,
        jwt,
        [command],
        [customerParty],
        "create-recipient-mint-auth",
        userId,
        [] as DisclosedContract[],
    );

    const created = result.transaction.events
        .map((e) => e.CreatedEvent)
        .find((e): e is CantonCreatedEvent =>
            Boolean(e) && Boolean(e!.templateId?.endsWith(":RecipientMintAuth")),
        );

    if (!created) {
        throw new Error("RecipientMintAuth created event not found in transaction response");
    }

    console.info(`RecipientMintAuth created: ${created.contractId}`);
    return created;
}
