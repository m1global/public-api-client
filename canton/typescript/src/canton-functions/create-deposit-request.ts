import { CantonCreatedEvent, CantonDepositSetup, CantonTransactionResult, DisclosedContract } from "../interfaces";
import { submitCommand } from "./submit-command";

/**********************************************************************************
 * Exercises AtomicBroker::CreateDepositRequest on behalf of the customer.
 *
 * CreateDepositRequest is a nonconsuming choice — it:
 *   1. Calls TransferFactory_Transfer on the collateral AllocationFactory, which
 *      creates a pending TransferInstruction (collateral moves to the broker).
 *   2. Creates a DepositRequest recording the depositor, recipient, and the
 *      pending TransferInstruction CID. The USDM instrument is derived by the
 *      broker from its own contract state.
 *
 * The broker admin later calls ProcessDepositAtomic to settle the collateral
 * transfer and mint USDM to the recipient.
 *
 * @param {string} baseUrl The Canton participant base URL.
 * @param {string} jwt Bearer JWT for the customer (actAs: customerParty).
 * @param {string} customerParty The customer's Canton party ID.
 * @param {string} userId The customer's Keycloak user ID (sub claim).
 * @param {number} collateralAmount The amount of collateral to deposit.
 * @param {CantonDepositSetup} setup Broker contract info from GET /canton/deposit-setup.
 * @param {CantonCreatedEvent} holdingEvent The customer's collateral Holding contract.
 * @param {CantonCreatedEvent} instrumentConfigEvent Collateral InstrumentConfiguration.
 * @param {CantonCreatedEvent | undefined} transferRuleEvent Collateral TransferRule (may be
 *  undefined if none exists for this instrument).
 *
 * @returns {Promise<{ depositRequestCid: string; transactionResult: CantonTransactionResult }>}
 *  The CID of the created DepositRequest plus the raw transaction result.
 */
export async function createDepositRequest(
    baseUrl: string,
    jwt: string,
    customerParty: string,
    userId: string,
    collateralAmount: number,
    setup: CantonDepositSetup,
    holdingEvent: CantonCreatedEvent,
    instrumentConfigEvent: CantonCreatedEvent,
    transferRuleEvent: CantonCreatedEvent | undefined,
): Promise<{ depositRequestCid: string; transactionResult: CantonTransactionResult }> {

    const collateralExtraArgs = buildCollateralExtraArgs(
        instrumentConfigEvent.contractId,
        transferRuleEvent?.contractId,
    );

    const command = {
        ExerciseCommand: {
            templateId: `${setup.brokerPackageId}:M1G.Broker.AtomicBroker:AtomicBroker`,
            contractId: setup.atomicBrokerCid,
            choice: "CreateDepositRequest",
            choiceArgument: {
                depositor: customerParty,
                recipient: customerParty,
                collateralAmount,
                collateralInstrumentId: {
                    admin: setup.collateralRegistrar,
                    id: setup.collateralInstrumentId,
                },
                holdingCids: [holdingEvent.contractId],
                transferFactoryCid: setup.collateralAllocationFactoryCid,
                collateralExtraArgs,
            },
        },
    };

    // Build disclosed contracts — only include those that have a blob.
    const candidates: Array<{ event: CantonCreatedEvent | undefined; override?: Partial<CantonCreatedEvent> }> = [
        {
            event: {
                contractId: setup.atomicBrokerCid,
                templateId: setup.atomicBrokerTemplateId,
                createdEventBlob: setup.atomicBrokerBlob,
            },
        },
        { event: holdingEvent },
        {
            event: {
                contractId: setup.collateralAllocationFactoryCid,
                templateId: setup.collateralAllocationFactoryTemplateId,
                createdEventBlob: setup.collateralAllocationFactoryBlob,
            },
        },
        { event: instrumentConfigEvent },
        ...(transferRuleEvent ? [{ event: transferRuleEvent }] : []),
    ];

    const disclosedContracts: DisclosedContract[] = candidates
        .map((c) => c.event)
        .filter((e): e is CantonCreatedEvent => Boolean(e?.createdEventBlob))
        .map((e) => ({
            contractId: e.contractId,
            templateId: e.templateId,
            createdEventBlob: e.createdEventBlob!,
        }));

    const result: CantonTransactionResult = await submitCommand(
        baseUrl,
        jwt,
        [command],
        [customerParty],
        "create-deposit-request",
        userId,
        disclosedContracts,
    );

    // The exercised event result contains the DepositRequest CID.
    const depositRequestCreatedEvent = result.transaction.events
        .map((e) => e.CreatedEvent)
        .find((e): e is CantonCreatedEvent =>
            Boolean(e) && Boolean(e!.templateId?.endsWith(":DepositRequest")),
        );

    const depositRequestCid = depositRequestCreatedEvent?.contractId ?? "";

    return { depositRequestCid, transactionResult: result };
}

/**
 * Builds the collateralExtraArgs value for the CreateDepositRequest choice.
 * Matches the mkCollateralExtraArgs shape used by the reference broker client.
 */
function buildCollateralExtraArgs(
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
