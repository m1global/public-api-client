import "dotenv/config";

import { getDepositSetup } from "./api-functions/get-deposit-setup";
import { getJwt } from "./canton-functions/get-jwt";
import { getLedgerEnd } from "./canton-functions/get-ledger-end";
import { queryActiveContracts } from "./canton-functions/query-active-contracts";
import { submitCommand } from "./canton-functions/submit-command";
import { acceptTransferOffer } from "./canton-functions/accept-transfer-offer";
import { sleep } from "./api-functions/util";
import type {
    CantonAcceptedCollateral,
    CantonBrokerConfig,
    CantonCreatedEvent,
    DisclosedContract,
} from "./interfaces";
import {
    sumHoldingAmounts,
    validateCantonBalanceChange,
} from "./holding-validation";

/**********************************************************************************
 * Node command to perform a full Canton redemption of customer USDM1 via the
 * AtomicBroker and then accept the resulting collateral TransferOffer.
 *
 * Flow:
 *  1.  Authenticates against Keycloak to obtain a Canton bearer JWT.
 *  2.  Fetches static Canton broker metadata from the M1 API.
 *  3.  Resolves required contracts from broker bundle + customer ACS, validates
 *      selected USDM1 holding CID, and captures baseline TransferOffers.
 *  4.  Exercises AtomicBroker::CreateRedemptionRequest using the selected
 *      holding amount as usdmAmount.
 *  5.  Polls customer ACS for a newly created collateral TransferOffer matching
 *      the RedemptionRequest recipient and collateral instrument.
 *  6.  Exercises TransferInstruction_Accept on that offer to complete delivery
 *      of collateral to the customer.
 *
 * Required environment variables:
 *   M1_API_BASE_URL, M1_API_JWT
 *   CANTON_BASE_URL, CANTON_KEYCLOAK_URL, CANTON_KEYCLOAK_CLIENT_ID,
 *   CANTON_KEYCLOAK_CLIENT_SECRET, CANTON_PARTY_ID, CANTON_USER_ID,
 *   CANTON_USERNAME, CANTON_PASSWORD, CANTON_COLLATERAL_REGISTRAR
 *
 * Must be transpiled (npm run build) then run with:
 *   node dist/redeem.js <USDM1_HOLDING_CID>
 */

interface CantonRedemptionSetup {
    adminParty: string;
    brokerPackageId: string;
    atomicBrokerCid: string;
    atomicBrokerTemplateId: string;
    atomicBrokerBlob: string;
    collateralInstrumentId: string;
    collateralRegistrar: string;
    collateralInstrumentConfigCid: string;
    collateralInstrumentConfigTemplateId: string;
    collateralInstrumentConfigBlob: string;
    collateralTransferRuleCid: string;
    collateralTransferRuleTemplateId: string;
    collateralTransferRuleBlob: string;
    usdm1InstrumentId: string;
    usdm1Registrar: string;
    usdm1AllocationFactoryCid: string;
    usdm1AllocationFactoryTemplateId: string;
    usdm1AllocationFactoryBlob: string;
    usdm1InstrumentConfigCid: string;
    usdm1InstrumentConfigTemplateId: string;
    usdm1InstrumentConfigBlob: string;
    usdm1TransferRuleCid: string;
    usdm1TransferRuleTemplateId: string;
    usdm1TransferRuleBlob: string;
}

function parseAmount(value: unknown): number {
    if (typeof value === "number") {
        return value;
    }
    if (typeof value === "string") {
        const parsed = Number(value);
        return Number.isFinite(parsed) ? parsed : 0;
    }
    return 0;
}

function selectCollateral(bundle: CantonBrokerConfig): CantonAcceptedCollateral {
    const acceptedCollaterals = Array.isArray(bundle.acceptedCollaterals) ? bundle.acceptedCollaterals : [];
    const selectedCollateral = acceptedCollaterals.find((entry) => entry.enabled)
        ?? acceptedCollaterals.find((entry) => Boolean(String(entry.id ?? "").trim()));
    if (!selectedCollateral) {
        throw new Error("broker config missing acceptedCollaterals");
    }
    return selectedCollateral;
}

function toRedemptionSetupFromBundle(bundle: CantonBrokerConfig, collateral: CantonAcceptedCollateral): CantonRedemptionSetup {
    const requiredBundleFields: Array<keyof CantonBrokerConfig> = [
        "adminParty",
        "brokerPackageId",
        "atomicBrokerCid",
        "atomicBrokerTemplateId",
        "atomicBrokerBlob",
        "usdm1InstrumentId",
        "usdm1Registrar",
        "usdm1AllocationFactoryCid",
        "usdm1AllocationFactoryTemplateId",
        "usdm1AllocationFactoryBlob",
        "usdm1InstrumentConfigCid",
        "usdm1InstrumentConfigTemplateId",
        "usdm1InstrumentConfigBlob",
        "usdm1TransferRuleCid",
        "usdm1TransferRuleTemplateId",
        "usdm1TransferRuleBlob",
    ];

    for (const field of requiredBundleFields) {
        const value = String(bundle[field] ?? "").trim();
        if (!value) {
            throw new Error(`broker config missing ${String(field)}`);
        }
    }

    const requiredCollateralFields: Array<keyof CantonAcceptedCollateral> = [
        "id",
        "collateralRegistrar",
        "collateralInstrumentConfigCid",
        "collateralInstrumentConfigTemplateId",
        "collateralInstrumentConfigBlob",
        "collateralTransferRuleCid",
        "collateralTransferRuleTemplateId",
        "collateralTransferRuleBlob",
    ];
    for (const field of requiredCollateralFields) {
        const value = String(collateral[field] ?? "").trim();
        if (!value) {
            throw new Error(`selected collateral missing ${String(field)}`);
        }
    }

    return {
        adminParty: bundle.adminParty,
        brokerPackageId: bundle.brokerPackageId,
        atomicBrokerCid: bundle.atomicBrokerCid,
        atomicBrokerTemplateId: bundle.atomicBrokerTemplateId,
        atomicBrokerBlob: bundle.atomicBrokerBlob,
        collateralInstrumentId: collateral.id,
        collateralRegistrar: collateral.collateralRegistrar,
        collateralInstrumentConfigCid: collateral.collateralInstrumentConfigCid,
        collateralInstrumentConfigTemplateId: collateral.collateralInstrumentConfigTemplateId,
        collateralInstrumentConfigBlob: collateral.collateralInstrumentConfigBlob,
        collateralTransferRuleCid: collateral.collateralTransferRuleCid,
        collateralTransferRuleTemplateId: collateral.collateralTransferRuleTemplateId,
        collateralTransferRuleBlob: collateral.collateralTransferRuleBlob,
        usdm1InstrumentId: bundle.usdm1InstrumentId,
        usdm1Registrar: bundle.usdm1Registrar,
        usdm1AllocationFactoryCid: bundle.usdm1AllocationFactoryCid,
        usdm1AllocationFactoryTemplateId: bundle.usdm1AllocationFactoryTemplateId,
        usdm1AllocationFactoryBlob: bundle.usdm1AllocationFactoryBlob,
        usdm1InstrumentConfigCid: bundle.usdm1InstrumentConfigCid,
        usdm1InstrumentConfigTemplateId: bundle.usdm1InstrumentConfigTemplateId,
        usdm1InstrumentConfigBlob: bundle.usdm1InstrumentConfigBlob,
        usdm1TransferRuleCid: bundle.usdm1TransferRuleCid,
        usdm1TransferRuleTemplateId: bundle.usdm1TransferRuleTemplateId,
        usdm1TransferRuleBlob: bundle.usdm1TransferRuleBlob,
    };
}

function isUnlockedHolding(event: CantonCreatedEvent): boolean {
    const args = (event.createArgument ?? event.createArguments ?? {}) as Record<string, unknown>;
    const lock = (args["lock"] as Record<string, unknown> | undefined) ?? undefined;
    if (!lock) {
        return true;
    }
    const lockers = ((lock["lockers"] as Record<string, unknown> | undefined)?.["map"] as unknown[] | undefined) ?? [];
    return lockers.length === 0;
}

function toDisclosed(event: CantonCreatedEvent): DisclosedContract {
    if (!event.createdEventBlob) {
        throw new Error(`Missing createdEventBlob for ${event.contractId}`);
    }
    return {
        contractId: event.contractId,
        templateId: event.templateId,
        createdEventBlob: event.createdEventBlob,
    };
}

function dedupeDisclosed(contracts: DisclosedContract[]): DisclosedContract[] {
    const seen = new Set<string>();
    const result: DisclosedContract[] = [];

    for (const contract of contracts) {
        const key = `${contract.contractId}|${contract.templateId}`;
        if (seen.has(key)) {
            continue;
        }
        seen.add(key);
        result.push(contract);
    }

    return result;
}

function buildUsdm1ExtraArgs(instrumentConfigurationCid: string, transferRuleCid: string): Record<string, unknown> {
    return {
        context: {
            values: {
                "utility.digitalasset.com/instrument-configuration": {
                    tag: "AV_ContractId",
                    value: instrumentConfigurationCid,
                },
                "utility.digitalasset.com/issuer-credentials": { tag: "AV_List", value: [] },
                "utility.digitalasset.com/receiver-credentials": { tag: "AV_List", value: [] },
                "utility.digitalasset.com/sender-credentials": { tag: "AV_List", value: [] },
                "utility.digitalasset.com/transfer-rule": {
                    tag: "AV_ContractId",
                    value: transferRuleCid,
                },
            },
        },
        meta: { values: {} },
    };
}

function asRecord(value: unknown): Record<string, unknown> {
    return typeof value === "object" && value !== null ? (value as Record<string, unknown>) : {};
}

function readText(value: unknown): string {
    if (typeof value === "string") {
        return value.trim();
    }
    if (typeof value === "number") {
        return String(value);
    }
    return "";
}

function getHoldingIdentity(event: CantonCreatedEvent): { owner: string; instrumentId: string; instrumentAdmin: string } {
    const args = asRecord(event.createArgument ?? event.createArguments ?? {});
    const ownerRaw = args["owner"];
    const ownerObj = asRecord(ownerRaw);
    const owner = readText(ownerRaw)
        || readText(ownerObj["party"])
        || readText(ownerObj["value"])
        || readText(ownerObj["unpack"]);

    const instrument = asRecord(args["instrument"] ?? args["instrumentId"] ?? args["identifier"]);
    const defaultIdentifier = asRecord(instrument["defaultIdentifier"]);
    const instrumentId = readText(instrument["id"]) || readText(defaultIdentifier["id"]);
    const instrumentAdmin = readText(instrument["admin"]) || readText(instrument["source"]) || readText(defaultIdentifier["source"]);

    return { owner, instrumentId, instrumentAdmin };
}

function getRequestedCollateralInstrumentId(redemptionRequest: CantonCreatedEvent): string {
    const args = asRecord(redemptionRequest.createArgument ?? redemptionRequest.createArguments ?? {});
    const instrument = asRecord(args["collateralInstrumentId"] ?? args["collateralInstrument"] ?? args["collateral"]);
    const id = readText(instrument["id"]);
    if (!id) {
        throw new Error("RedemptionRequest missing collateralInstrumentId.id");
    }
    return id;
}

function getRequestedCollateralInstrumentAdmin(redemptionRequest: CantonCreatedEvent): string {
    const args = asRecord(redemptionRequest.createArgument ?? redemptionRequest.createArguments ?? {});
    const instrument = asRecord(args["collateralInstrumentId"] ?? args["collateralInstrument"] ?? args["collateral"]);
    const admin = readText(instrument["admin"]) || readText(instrument["source"]);
    if (!admin) {
        throw new Error("RedemptionRequest missing collateralInstrumentId admin/source");
    }
    return admin;
}

function getRequestedRecipientParty(redemptionRequest: CantonCreatedEvent): string {
    const args = asRecord(redemptionRequest.createArgument ?? redemptionRequest.createArguments ?? {});
    const recipientRaw = args["recipient"];
    const recipientObj = asRecord(recipientRaw);
    const recipient = readText(recipientRaw)
        || readText(recipientObj["party"])
        || readText(recipientObj["value"])
        || readText(recipientObj["unpack"]);
    if (!recipient) {
        throw new Error("RedemptionRequest missing recipient");
    }
    return recipient;
}

function filterHoldingsByOwnerInstrument(
    holdings: CantonCreatedEvent[],
    ownerParty: string,
    instrumentId: string,
): CantonCreatedEvent[] {
    return holdings.filter((event) => {
        const identity = getHoldingIdentity(event);
        return identity.owner === ownerParty && identity.instrumentId === instrumentId;
    });
}

function getTransferOfferIdentity(event: CantonCreatedEvent): {
    receiver: string;
    instrumentId: string;
    instrumentAdmin: string;
    amount: number;
} {
    const args = asRecord(event.createArgument ?? event.createArguments ?? {});
    const transfer = asRecord(args["transfer"]);

    const receiverRaw = transfer["receiver"] ?? args["receiver"];
    const receiverObj = asRecord(receiverRaw);
    const receiver = readText(receiverRaw)
        || readText(receiverObj["party"])
        || readText(receiverObj["value"])
        || readText(receiverObj["unpack"]);

    const instrument = asRecord(transfer["instrumentId"] ?? transfer["instrumentIdentifier"] ?? args["instrumentId"]);
    const instrumentId = readText(instrument["id"]);
    const instrumentAdmin = readText(instrument["admin"]) || readText(instrument["source"]);
    const amount = parseAmount(transfer["amount"] ?? args["amount"]);

    return { receiver, instrumentId, instrumentAdmin, amount };
}

function filterTransferOffersByReceiverInstrument(
    offers: CantonCreatedEvent[],
    receiverParty: string,
    instrumentId: string,
): CantonCreatedEvent[] {
    return offers.filter((event) => {
        const identity = getTransferOfferIdentity(event);
        return identity.receiver === receiverParty && identity.instrumentId === instrumentId;
    });
}

function findUsdm1HoldingByCid(
    holdings: CantonCreatedEvent[],
    requestedHoldingCid: string,
    ownerParty: string,
    usdm1InstrumentId: string,
    usdm1Registrar: string,
): CantonCreatedEvent {
    const holding = holdings.find((event) => event.contractId === requestedHoldingCid);

    if (!holding) {
        throw new Error(`USDM1 holding ${requestedHoldingCid} is not visible in customer ACS`);
    }

    const identity = getHoldingIdentity(holding);
    const owner = identity.owner;
    const id = identity.instrumentId;
    const admin = identity.instrumentAdmin;

    if (owner !== ownerParty) {
        throw new Error(`holding ${requestedHoldingCid} owner mismatch: expected ${ownerParty}, found ${owner}`);
    }
    if (id !== usdm1InstrumentId) {
        throw new Error(`holding ${requestedHoldingCid} instrument mismatch: expected ${usdm1InstrumentId}, found ${id}`);
    }
    if (admin && admin !== usdm1Registrar) {
        throw new Error(`holding ${requestedHoldingCid} registrar mismatch: expected ${usdm1Registrar}, found ${admin}`);
    }
    if (!holding.createdEventBlob) {
        throw new Error(`holding ${requestedHoldingCid} is missing createdEventBlob`);
    }
    if (!isUnlockedHolding(holding)) {
        throw new Error(`holding ${requestedHoldingCid} is locked and cannot be used for redemption`);
    }

    return holding;
}

function getBrokerMaxAtomicRedemptionUsdm(bundle: CantonBrokerConfig): number {
    const maxValue = parseAmount(bundle.maxAtomicRedemptionUsdm);
    if (!Number.isFinite(maxValue) || maxValue <= 0) {
        throw new Error("broker config maxAtomicRedemptionUsdm is missing or invalid");
    }
    return maxValue;
}

function getRequiredHoldingCidArg(): string {
    const holdingCid = String(process.argv[2] ?? "").trim();
    if (!holdingCid) {
        throw new Error("missing holding CID argument; usage: node dist/redeem.js <USDM1_HOLDING_CID>");
    }
    return holdingCid;
}

(async () => {
    // Validate required environment variables up-front.
    const requiredEnv = [
        "M1_API_BASE_URL",
        "M1_API_JWT",
        "CANTON_BASE_URL",
        "CANTON_KEYCLOAK_URL",
        "CANTON_KEYCLOAK_CLIENT_ID",
        "CANTON_KEYCLOAK_CLIENT_SECRET",
        "CANTON_PARTY_ID",
        "CANTON_USER_ID",
        "CANTON_USERNAME",
        "CANTON_PASSWORD",
        "CANTON_COLLATERAL_REGISTRAR",
    ];

    for (const key of requiredEnv) {
        if (!process.env[key]) {
            throw new Error(`${key} is not set in environment`);
        }
    }

    const cantonBaseUrl = process.env["CANTON_BASE_URL"]!;
    const partyId = process.env["CANTON_PARTY_ID"]!;
    const userId = process.env["CANTON_USER_ID"]!;
    const selectedUsdmHoldingCid = getRequiredHoldingCidArg();

    console.info(`operating as Canton party: ${partyId}`);
    console.info(`selected USDM1 holding: ${selectedUsdmHoldingCid}`);

    // -------------------------------------------------------------------------
    // Step 1: Obtain a Canton JWT for the customer via Keycloak.
    // -------------------------------------------------------------------------
    console.info("\n[1/6] obtaining Canton JWT for customer...");
    const jwtResponse = await getJwt(
        process.env["CANTON_KEYCLOAK_URL"]!,
        process.env["CANTON_KEYCLOAK_CLIENT_ID"]!,
        process.env["CANTON_KEYCLOAK_CLIENT_SECRET"]!,
        process.env["CANTON_USERNAME"]!,
        process.env["CANTON_PASSWORD"]!,
    );
    const jwt = jwtResponse.access_token;
    if (!jwt) {
        throw new Error("failed to obtain Canton JWT from Keycloak");
    }

    // -------------------------------------------------------------------------
    // Step 2: Fetch static broker metadata from the M1 API.
    // -------------------------------------------------------------------------
    console.info("\n[2/6] fetching Canton broker metadata...");
    const brokerConfig = await getDepositSetup();
    if (!brokerConfig) {
        throw new Error("failed to fetch Canton broker config from M1 API");
    }
    const redemptionSetup = toRedemptionSetupFromBundle(brokerConfig, selectCollateral(brokerConfig));
    console.info(`AtomicBroker: ${redemptionSetup.atomicBrokerCid}`);
    console.info(`USDM1 instrument: ${redemptionSetup.usdm1InstrumentId}`);

    // -------------------------------------------------------------------------
    // Step 3: Resolve setup contracts and customer ACS state required to create
    // redemption, then validate selected holding against current ACS.
    // -------------------------------------------------------------------------
    console.info("\n[3/6] resolving contracts for redemption and capturing baseline holdings...");
    const ledgerEnd = await getLedgerEnd(cantonBaseUrl, jwt);
    console.info(`ledger end: ${ledgerEnd}`);

    const atomicBroker: CantonCreatedEvent = {
        contractId: redemptionSetup.atomicBrokerCid,
        templateId: redemptionSetup.atomicBrokerTemplateId,
        createdEventBlob: redemptionSetup.atomicBrokerBlob,
    };
    if (!atomicBroker.createdEventBlob) {
        throw new Error(`AtomicBroker ${atomicBroker.contractId} is missing createdEventBlob`);
    }
    console.info(`AtomicBroker (bundle): ${atomicBroker.contractId}`);
    const maxAtomicRedemptionUsdm = getBrokerMaxAtomicRedemptionUsdm(brokerConfig);
    console.info(`broker maxAtomicRedemptionUsdm: ${maxAtomicRedemptionUsdm}`);

    const usdm1InstrumentConfig: CantonCreatedEvent = {
        contractId: redemptionSetup.usdm1InstrumentConfigCid,
        templateId: redemptionSetup.usdm1InstrumentConfigTemplateId,
        createdEventBlob: redemptionSetup.usdm1InstrumentConfigBlob,
    };
    if (!usdm1InstrumentConfig?.createdEventBlob) {
        throw new Error(`USDM1 InstrumentConfiguration not found for ${redemptionSetup.usdm1InstrumentId}`);
    }

    const usdm1TransferRule: CantonCreatedEvent = {
        contractId: redemptionSetup.usdm1TransferRuleCid,
        templateId: redemptionSetup.usdm1TransferRuleTemplateId,
        createdEventBlob: redemptionSetup.usdm1TransferRuleBlob,
    };
    if (!usdm1TransferRule?.createdEventBlob) {
        throw new Error(`USDM1 TransferRule not found for ${redemptionSetup.usdm1InstrumentId}`);
    }

    const usdm1AllocationFactory: CantonCreatedEvent = {
        contractId: redemptionSetup.usdm1AllocationFactoryCid,
        templateId: redemptionSetup.usdm1AllocationFactoryTemplateId,
        createdEventBlob: redemptionSetup.usdm1AllocationFactoryBlob,
    };
    if (!usdm1AllocationFactory?.createdEventBlob) {
        throw new Error(`USDM1 AllocationFactory not found for registrar ${redemptionSetup.usdm1Registrar}`);
    }

    const collateralInstrumentConfig: CantonCreatedEvent = {
        contractId: redemptionSetup.collateralInstrumentConfigCid,
        templateId: redemptionSetup.collateralInstrumentConfigTemplateId,
        createdEventBlob: redemptionSetup.collateralInstrumentConfigBlob,
    };
    if (!collateralInstrumentConfig?.createdEventBlob) {
        throw new Error(`Collateral InstrumentConfiguration not found for ${redemptionSetup.collateralInstrumentId}`);
    }

    const collateralTransferRule: CantonCreatedEvent = {
        contractId: redemptionSetup.collateralTransferRuleCid,
        templateId: redemptionSetup.collateralTransferRuleTemplateId,
        createdEventBlob: redemptionSetup.collateralTransferRuleBlob,
    };
    if (!collateralTransferRule?.createdEventBlob) {
        throw new Error(`Collateral TransferRule not found for ${redemptionSetup.collateralInstrumentId}`);
    }

    const holdingTemplateId =
        `${brokerConfig.utilityRegistryHoldingV0PackageId}:Utility.Registry.Holding.V0.Holding:Holding`;
    const transferOfferTemplateId =
        `${brokerConfig.utilityRegistryAppV0PackageId}:Utility.Registry.App.V0.Model.Transfer:TransferOffer`;
    const baselineLedgerEnd = await getLedgerEnd(cantonBaseUrl, jwt);
    console.info(`baseline ledger end: ${baselineLedgerEnd}`);
    const holdings = await queryActiveContracts(cantonBaseUrl, jwt, partyId, holdingTemplateId, baselineLedgerEnd);
    const baselineTransferOffers = await queryActiveContracts(
        cantonBaseUrl,
        jwt,
        partyId,
        transferOfferTemplateId,
        baselineLedgerEnd,
    );
    const baselineTransferOfferIds = new Set(baselineTransferOffers.map((event) => event.contractId));
    const baselineCollateralHoldings = filterHoldingsByOwnerInstrument(
        holdings,
        partyId,
        redemptionSetup.collateralInstrumentId,
    );
    const baselineCollateralTransferOffers = filterTransferOffersByReceiverInstrument(
        baselineTransferOffers,
        partyId,
        redemptionSetup.collateralInstrumentId,
    );
    const baselineUsdm1Holdings = filterHoldingsByOwnerInstrument(
        holdings,
        partyId,
        redemptionSetup.usdm1InstrumentId,
    );
    console.info(`baseline visible holdings (all instruments): ${holdings.length}`);
    console.info(`baseline collateral holdings: ${baselineCollateralHoldings.length}`);
    console.info(`baseline USDM1 holdings: ${baselineUsdm1Holdings.length}`);
    console.info(`baseline transfer offers (all instruments): ${baselineTransferOffers.length}`);
    console.info(`baseline collateral transfer offers: ${baselineCollateralTransferOffers.length}`);
    if (baselineCollateralHoldings.length === 0 && holdings.length > 0) {
        const sample = holdings.slice(0, 5).map((event) => {
            const identity = getHoldingIdentity(event);
            return `${event.contractId}:{owner=${identity.owner},id=${identity.instrumentId},admin=${identity.instrumentAdmin}}`;
        }).join("; ");
        console.info(`baseline holding identity sample: ${sample}`);
    }

    const selectedUsdmHolding = findUsdm1HoldingByCid(
        holdings,
        selectedUsdmHoldingCid,
        partyId,
        redemptionSetup.usdm1InstrumentId,
        redemptionSetup.usdm1Registrar,
    );
    const selectedHoldingArgs = (selectedUsdmHolding.createArgument ?? selectedUsdmHolding.createArguments ?? {}) as Record<string, unknown>;
    const selectedHoldingAmount = parseAmount(selectedHoldingArgs["amount"]);
    const preRedemptionCollateralSum = sumHoldingAmounts(baselineCollateralHoldings);
    const preRedemptionUsdm1Sum = sumHoldingAmounts(baselineUsdm1Holdings);
    console.info(`pre-redemption collateral balance: ${preRedemptionCollateralSum}`);
    console.info(`pre-redemption USDM1 balance: ${preRedemptionUsdm1Sum}`);

    if (!Number.isFinite(selectedHoldingAmount) || selectedHoldingAmount <= 0) {
        throw new Error(`selected holding amount is invalid: ${selectedHoldingAmount}`);
    }

    console.info(`using USDM holding: ${selectedUsdmHolding.contractId}`);
    console.info(`selected holding amount: ${selectedHoldingAmount}`);

    const redemptionAmount = selectedHoldingAmount;
    if (!(redemptionAmount < maxAtomicRedemptionUsdm)) {
        throw new Error(
            `selected holding amount (${redemptionAmount}) must be strictly less than maxAtomicRedemptionUsdm (${maxAtomicRedemptionUsdm}) for atomic close`,
        );
    }
    console.info(`redemption amount (from holding): ${redemptionAmount}`);

    // -------------------------------------------------------------------------
    // Step 4: Exercise AtomicBroker::CreateRedemptionRequest.
    // -------------------------------------------------------------------------
    console.info("\n[4/6] submitting CreateRedemptionRequest...");
    const requestId = `atomic-redemption-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
    const command = {
        ExerciseCommand: {
            templateId: `${redemptionSetup.brokerPackageId}:M1G.Broker.AtomicBroker:AtomicBroker`,
            contractId: atomicBroker.contractId,
            choice: "CreateRedemptionRequest",
            choiceArgument: {
                redeemer: partyId,
                recipient: partyId,
                requestId,
                usdmInstrumentId: {
                    admin: redemptionSetup.usdm1Registrar,
                    id: redemptionSetup.usdm1InstrumentId,
                },
                collateralInstrumentId: {
                    admin: redemptionSetup.collateralRegistrar,
                    id: redemptionSetup.collateralInstrumentId,
                },
                usdmAmount: redemptionAmount,
                usdmInputHoldingCids: [selectedUsdmHolding.contractId],
                transferFactoryCid: redemptionSetup.usdm1AllocationFactoryCid,
                usdmExtraArgs: buildUsdm1ExtraArgs(usdm1InstrumentConfig.contractId, usdm1TransferRule.contractId),
            },
        },
    };

    const disclosedContracts = dedupeDisclosed([
        toDisclosed(atomicBroker),
        toDisclosed(selectedUsdmHolding),
        toDisclosed(usdm1AllocationFactory),
        toDisclosed(usdm1InstrumentConfig),
        toDisclosed(usdm1TransferRule),
    ]);

    const result = await submitCommand(
        cantonBaseUrl,
        jwt,
        [command],
        [partyId],
        "create-redemption-request",
        userId,
        disclosedContracts,
    );

    const createdEvents = result.transaction.events
        .map((event) => event.CreatedEvent)
        .filter((event): event is CantonCreatedEvent => Boolean(event));
    const exercisedCount = result.transaction.events.filter((event) => Boolean(event.ExercisedEvent)).length;
    console.info(`Canton transaction events: total=${result.transaction.events.length} created=${createdEvents.length} exercised=${exercisedCount}`);
    if (createdEvents.length > 0) {
        console.info("created templates:");
        for (const created of createdEvents) {
            console.info(`  - ${created.templateId} :: ${created.contractId}`);
        }
    }

    const redemptionRequest = result.transaction.events
        .map((event) => event.CreatedEvent)
        .find((event): event is CantonCreatedEvent => Boolean(event?.templateId?.endsWith(":RedemptionRequest")));

    if (!redemptionRequest) {
        throw new Error("CreateRedemptionRequest submitted, but no RedemptionRequest event was found");
    }
    const requestedCollateralInstrumentId = getRequestedCollateralInstrumentId(redemptionRequest);
    const requestedCollateralInstrumentAdmin = getRequestedCollateralInstrumentAdmin(redemptionRequest);
    const requestedRecipientParty = getRequestedRecipientParty(redemptionRequest);
    console.info(`RedemptionRequest collateral instrument id: ${requestedCollateralInstrumentId}`);
    console.info(`RedemptionRequest collateral instrument admin: ${requestedCollateralInstrumentAdmin}`);
    console.info(`RedemptionRequest recipient party: ${requestedRecipientParty}`);

    // -------------------------------------------------------------------------
    // Step 5: Poll customer ACS for the new collateral TransferOffer that
    // corresponds to this RedemptionRequest output.
    // -------------------------------------------------------------------------
    console.info("\n[5/6] polling customer ACS for new collateral TransferOffer...");
    let pendingCollateralTransferOffer: CantonCreatedEvent | undefined;
    const OFFER_POLL_ATTEMPTS = 12;
    const OFFER_POLL_INTERVAL_MS = 5_000;

    for (let attempt = 1; attempt <= OFFER_POLL_ATTEMPTS; attempt++) {
        const freshLedgerEnd = await getLedgerEnd(cantonBaseUrl, jwt);
        const transferOffers = await queryActiveContracts(
            cantonBaseUrl,
            jwt,
            partyId,
            transferOfferTemplateId,
            freshLedgerEnd,
        );

        const collateralTransferOffers = filterTransferOffersByReceiverInstrument(
            transferOffers.filter((event) => !baselineTransferOfferIds.has(event.contractId)),
            requestedRecipientParty,
            requestedCollateralInstrumentId,
        ).filter((event) => {
            const identity = getTransferOfferIdentity(event);
            return !identity.instrumentAdmin || identity.instrumentAdmin === requestedCollateralInstrumentAdmin;
        });

        pendingCollateralTransferOffer = collateralTransferOffers[0];
        if (pendingCollateralTransferOffer) {
            break;
        }

        const newVisibleTransferOffers = transferOffers.filter((event) => !baselineTransferOfferIds.has(event.contractId));

        console.info(
            `  poll ${attempt}/${OFFER_POLL_ATTEMPTS} — ledgerEnd=${freshLedgerEnd} totalVisibleTransferOffers=${transferOffers.length} newVisibleTransferOffers=${newVisibleTransferOffers.length} collateralTransferOffers=${collateralTransferOffers.length}`,
        );
        if (newVisibleTransferOffers.length > 0) {
            const sample = newVisibleTransferOffers.slice(0, 3).map((event) => {
                const identity = getTransferOfferIdentity(event);
                return `${event.contractId}:{receiver=${identity.receiver},id=${identity.instrumentId},admin=${identity.instrumentAdmin},amount=${identity.amount}}`;
            }).join("; ");
            console.info(`    new transfer-offer identity sample: ${sample}`);
        }

        await sleep(OFFER_POLL_INTERVAL_MS);
    }

    if (!pendingCollateralTransferOffer) {
        throw new Error(
            `no new collateral TransferOffer found in customer ACS after polling (expected receiver ${requestedRecipientParty}, instrument ${requestedCollateralInstrumentAdmin}:${requestedCollateralInstrumentId})`,
        );
    }

    console.info(`pending collateral TransferOffer: ${pendingCollateralTransferOffer.contractId}`);

    // -------------------------------------------------------------------------
    // Step 6: Accept the pending collateral TransferOffer as customer.
    // -------------------------------------------------------------------------
    console.info("\n[6/6] accepting collateral TransferOffer...");
    const acceptResult = await acceptTransferOffer(
        cantonBaseUrl,
        jwt,
        partyId,
        userId,
        pendingCollateralTransferOffer,
        collateralInstrumentConfig,
        collateralTransferRule,
    );

    const acceptedCreatedEvents = acceptResult.transaction.events
        .map((event) => event.CreatedEvent)
        .filter((event): event is CantonCreatedEvent => Boolean(event));

    const acceptedHolding = acceptedCreatedEvents.find((event) => {
        if (!event.templateId?.includes(":Holding")) {
            return false;
        }
        const identity = getHoldingIdentity(event);
        return identity.owner === requestedRecipientParty && identity.instrumentId === requestedCollateralInstrumentId;
    });

    if (acceptedHolding) {
        console.info(`accepted collateral Holding: ${acceptedHolding.contractId}`);
    }
    const postRedemptionLedgerEnd = await getLedgerEnd(cantonBaseUrl, jwt);
    const postRedemptionHoldings = await queryActiveContracts(
        cantonBaseUrl,
        jwt,
        partyId,
        holdingTemplateId,
        postRedemptionLedgerEnd,
    );
    const postRedemptionCollateralSum = sumHoldingAmounts(
        filterHoldingsByOwnerInstrument(
            postRedemptionHoldings,
            partyId,
            redemptionSetup.collateralInstrumentId,
        ),
    );
    const postRedemptionUsdm1Sum = sumHoldingAmounts(
        filterHoldingsByOwnerInstrument(
            postRedemptionHoldings,
            partyId,
            redemptionSetup.usdm1InstrumentId,
        ),
    );
    console.info(`post-redemption collateral balance: ${postRedemptionCollateralSum}`);
    console.info(`post-redemption USDM1 balance: ${postRedemptionUsdm1Sum}`);
    validateCantonBalanceChange({
        stage: "after-settlement",
        beforeCollateral: preRedemptionCollateralSum,
        afterCollateral: postRedemptionCollateralSum,
        beforeUsdm1: preRedemptionUsdm1Sum,
        afterUsdm1: postRedemptionUsdm1Sum,
        expectedCollateralDelta: selectedHoldingAmount,
        expectedUsdm1Delta: -selectedHoldingAmount,
    });
    console.info("redemption complete");
})().catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`redemption failed: ${message}`);
    process.exit(1);
});
