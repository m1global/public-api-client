import {
    CantonCreatedEvent,
    CantonDepositSetup,
    CantonTransactionResult,
    DisclosedContract,
} from "../interfaces";
import { submitCommand } from "./submit-command";

/**
 * Builds the extraArgs value for AllocationFactory_RequestMint.
 * Supplies the InstrumentConfiguration CID and empty credential lists
 * required by the Daml interface choice.
 *
 * @param {string} instrumentConfigurationCid CID of the collateral InstrumentConfiguration contract.
 * @returns {Record<string, unknown>} The extraArgs object expected by the choice.
 */
function buildMintExtraArgs(instrumentConfigurationCid: string): Record<string, unknown> {
    return {
        context: {
            values: {
                "utility.digitalasset.com/instrument-configuration": {
                    tag: "AV_ContractId",
                    value: instrumentConfigurationCid,
                },
                "utility.digitalasset.com/issuer-credentials": {
                    tag: "AV_List",
                    value: [],
                },
            },
        },
        meta: { values: {} },
    };
}

/**********************************************************************************
 * Exercises AllocationFactory_RequestMint on behalf of the customer, creating a
 * MintRequest contract on the Canton ledger.
 *
 * The MintRequest CID is subsequently passed to the M1 API Canton faucet, which
 * triggers the admin to approve the mint and transfer collateral to the customer.
 *
 * @param {string} baseUrl The Canton participant base URL.
 * @param {string} jwt Bearer JWT for the customer (actAs: customerParty).
 * @param {string} customerParty The customer's Canton party ID.
 * @param {string} userId The customer's Keycloak user ID (sub claim).
 * @param {number} collateralAmount The amount of collateral to mint.
 * @param {CantonDepositSetup} setup Broker contract info from GET /canton/deposit-setup.
 * @param {CantonCreatedEvent} instrumentConfigEvent The collateral InstrumentConfiguration
 *  created event (required as a disclosed contract).
 *
 * @returns {Promise<CantonCreatedEvent>} The MintRequest created event.
 */
export async function requestMintCollateral(
    baseUrl: string,
    jwt: string,
    customerParty: string,
    userId: string,
    collateralAmount: number,
    setup: CantonDepositSetup,
    instrumentConfigEvent: CantonCreatedEvent,
): Promise<CantonCreatedEvent> {

    const requestedAt = new Date();
    const executeBefore = new Date(requestedAt.getTime() + 2 * 60 * 60 * 1000);

    const command = {
        ExerciseCommand: {
            templateId: setup.collateralAllocationFactoryTemplateId,
            contractId: setup.collateralAllocationFactoryCid,
            choice: "AllocationFactory_RequestMint",
            choiceArgument: {
                expectedAdmin: setup.collateralRegistrar,
                mint: {
                    instrumentId: {
                        admin: setup.collateralRegistrar,
                        id: setup.collateralInstrumentId,
                    },
                    amount: collateralAmount,
                    holder: customerParty,
                    reference: `deposit-mint-${Date.now()}`,
                    requestedAt: requestedAt.toISOString(),
                    executeBefore: executeBefore.toISOString(),
                    meta: { values: {} },
                },
                extraArgs: buildMintExtraArgs(instrumentConfigEvent.contractId),
            },
        },
    };

    const disclosedContracts: DisclosedContract[] = [
        {
            contractId: setup.collateralAllocationFactoryCid,
            templateId: setup.collateralAllocationFactoryTemplateId,
            createdEventBlob: setup.collateralAllocationFactoryBlob,
        },
        {
            contractId: instrumentConfigEvent.contractId,
            templateId: instrumentConfigEvent.templateId,
            createdEventBlob: instrumentConfigEvent.createdEventBlob!,
        },
    ];

    const result: CantonTransactionResult = await submitCommand(
        baseUrl,
        jwt,
        [command],
        [customerParty],
        "request-mint-collateral",
        userId,
        disclosedContracts,
    );

    const mintRequestEvent = result.transaction.events
        .map((e) => e.CreatedEvent)
        .find((e): e is CantonCreatedEvent => Boolean(e?.templateId?.endsWith(":MintRequest")));

    if (!mintRequestEvent) {
        throw new Error("MintRequest created event not found in transaction response");
    }

    return mintRequestEvent;
}
