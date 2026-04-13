import { CantonCreatedEvent, CantonTransactionResult, DisclosedContract } from "../interfaces";
import { TRANSFER_INSTRUCTION_V1_PACKAGE_ID } from "../consts";
import { submitCommand } from "./submit-command";

/**********************************************************************************
 * Exercises the TransferInstruction_Accept choice on a pending TransferOffer,
 * completing the transfer of collateral to the customer.
 *
 * TransferInstruction_Accept is an interface choice defined on
 * Splice.Api.Token.TransferInstructionV1:TransferInstruction.  The contractId
 * is the concrete TransferOffer CID; the templateId in the ExerciseCommand must
 * be the interface ID, not the concrete template ID.
 *
 * @param {string} baseUrl The Canton participant base URL.
 * @param {string} jwt The bearer JWT obtained from Keycloak.
 * @param {string} customerParty The customer's Canton party ID (actAs).
 * @param {string} userId The Keycloak user ID (sub claim) of the customer.
 * @param {CantonCreatedEvent} offerEvent The TransferOffer created event.
 * @param {CantonCreatedEvent} instrumentConfigEvent The InstrumentConfiguration
 *  created event (required as a disclosed contract).
 * @param {CantonCreatedEvent | undefined} transferRuleEvent The TransferRule
 *  created event, or undefined if none is available.
 *
 * @returns {Promise<CantonTransactionResult>} The completed transaction result.
 */
export async function acceptTransferOffer(
    baseUrl: string,
    jwt: string,
    customerParty: string,
    userId: string,
    offerEvent: CantonCreatedEvent,
    instrumentConfigEvent: CantonCreatedEvent,
    transferRuleEvent: CantonCreatedEvent | undefined,
): Promise<CantonTransactionResult> {

    // The choice lives on the TransferInstruction interface.
    const transferInstructionTid =
        `${TRANSFER_INSTRUCTION_V1_PACKAGE_ID}:Splice.Api.Token.TransferInstructionV1:TransferInstruction`;

    const extraArgs = buildExtraArgs(
        instrumentConfigEvent.contractId,
        transferRuleEvent?.contractId,
    );

    const command = {
        ExerciseCommand: {
            templateId: transferInstructionTid,
            contractId: offerEvent.contractId,
            choice: "TransferInstruction_Accept",
            choiceArgument: { extraArgs },
        },
    };

    // Only include a contract as disclosed if it has a createdEventBlob.
    const candidates: CantonCreatedEvent[] = [
        offerEvent,
        instrumentConfigEvent,
        ...(transferRuleEvent ? [transferRuleEvent] : []),
    ];

    const disclosedContracts: DisclosedContract[] = candidates
        .filter((e) => Boolean(e.createdEventBlob))
        .map((e) => ({
            contractId: e.contractId,
            templateId: e.templateId,
            createdEventBlob: e.createdEventBlob!,
        }));

    return submitCommand(
        baseUrl,
        jwt,
        [command],
        [customerParty],
        "accept-transfer-offer",
        userId,
        disclosedContracts,
    );
}

/**
 * Builds the extraArgs value for TransferInstruction_Accept.
 * Uses collateral extra-args (including transferRule) when available,
 * otherwise falls back to base extra-args.
 */
function buildExtraArgs(
    instrumentConfigCid: string,
    transferRuleCid?: string,
): Record<string, unknown> {
    const contextValues: Record<string, unknown> = {
        "utility.digitalasset.com/instrument-configuration": {
            tag: "AV_ContractId",
            value: instrumentConfigCid,
        },
        "utility.digitalasset.com/issuer-credentials": { tag: "AV_List", value: [] },
        "utility.digitalasset.com/receiver-credentials": { tag: "AV_List", value: [] },
        "utility.digitalasset.com/sender-credentials": { tag: "AV_List", value: [] },
    };

    if (transferRuleCid) {
        contextValues["utility.digitalasset.com/transfer-rule"] = {
            tag: "AV_ContractId",
            value: transferRuleCid,
        };
    }

    return {
        context: { values: contextValues },
        meta: { values: {} },
    };
}
