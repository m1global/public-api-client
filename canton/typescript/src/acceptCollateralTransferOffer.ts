import "dotenv/config";

import { getDepositSetup } from "./api-functions/get-deposit-setup";
import { CANTON_MOCK_SYMBOL } from "./consts";
import { getJwt } from "./canton-functions/get-jwt";
import { getLedgerEnd } from "./canton-functions/get-ledger-end";
import { queryActiveContracts } from "./canton-functions/query-active-contracts";
import { acceptTransferOffer } from "./canton-functions/accept-transfer-offer";
import type {
    CantonAcceptedCollateral,
    CantonBrokerConfig,
    CantonCreatedEvent,
} from "./interfaces";

/**********************************************************************************
 * Accepts a pending collateral TransferOffer by CID using the authenticated
 * customer party.
 *
 * Required environment variables:
 *   M1_API_BASE_URL, M1_API_JWT
 *   CANTON_BASE_URL, CANTON_KEYCLOAK_URL, CANTON_KEYCLOAK_CLIENT_ID,
 *   CANTON_KEYCLOAK_CLIENT_SECRET, CANTON_PARTY_ID, CANTON_USER_ID,
 *   CANTON_USERNAME, CANTON_PASSWORD
 *
 * Optional environment variables:
 *   CANTON_COLLATERAL_ID (defaults to MOCK)
 *
 * Must be transpiled (npm run build) then run with:
 *   node dist/acceptCollateralTransferOffer.js <TRANSFER_OFFER_CID>
 */

function selectCollateral(bundle: CantonBrokerConfig, collateralId: string): CantonAcceptedCollateral {
    const acceptedCollaterals = Array.isArray(bundle.acceptedCollaterals) ? bundle.acceptedCollaterals : [];
    const selectedCollateral = acceptedCollaterals.find(
        (entry) => String(entry.id ?? "").trim() === collateralId,
    );
    if (!selectedCollateral) {
        throw new Error(`broker config missing accepted collateral ${collateralId}`);
    }
    if (!selectedCollateral.enabled) {
        throw new Error(`collateral ${collateralId} is present in broker config but not enabled`);
    }
    return selectedCollateral;
}

function getRequiredTransferOfferCidArg(): string {
    const transferOfferCid = String(process.argv[2] ?? "").trim();
    if (!transferOfferCid) {
        throw new Error("missing TransferOffer CID argument; usage: node dist/acceptCollateralTransferOffer.js <TRANSFER_OFFER_CID>");
    }
    return transferOfferCid;
}

(async () => {
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
    ];

    for (const key of requiredEnv) {
        if (!process.env[key]) {
            throw new Error(`${key} is not set in environment`);
        }
    }

    const cantonBaseUrl = process.env["CANTON_BASE_URL"]!;
    const partyId = process.env["CANTON_PARTY_ID"]!;
    const userId = process.env["CANTON_USER_ID"]!;
    const collateralId = String(process.env["CANTON_COLLATERAL_ID"] ?? CANTON_MOCK_SYMBOL).trim();
    const transferOfferCid = getRequiredTransferOfferCidArg();

    console.info(`operating as Canton party: ${partyId}`);
    console.info(`collateral id: ${collateralId}`);
    console.info(`transfer offer cid: ${transferOfferCid}`);

    console.info("\n[1/4] obtaining Canton JWT for customer...");
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

    console.info("\n[2/4] fetching Canton broker metadata...");
    const brokerConfig = await getDepositSetup();
    if (!brokerConfig) {
        throw new Error("failed to fetch Canton broker config from M1 API");
    }
    const collateral = selectCollateral(brokerConfig, collateralId);

    const collateralInstrumentConfig: CantonCreatedEvent = {
        contractId: collateral.collateralInstrumentConfigCid,
        templateId: collateral.collateralInstrumentConfigTemplateId,
        createdEventBlob: collateral.collateralInstrumentConfigBlob,
    };
    if (!collateralInstrumentConfig.createdEventBlob) {
        throw new Error(`Collateral InstrumentConfiguration not found for ${collateralId}`);
    }

    const collateralTransferRule: CantonCreatedEvent = {
        contractId: collateral.collateralTransferRuleCid,
        templateId: collateral.collateralTransferRuleTemplateId,
        createdEventBlob: collateral.collateralTransferRuleBlob,
    };
    if (!collateralTransferRule.createdEventBlob) {
        throw new Error(`Collateral TransferRule not found for ${collateralId}`);
    }

    console.info("\n[3/4] resolving TransferOffer from customer ACS...");
    const ledgerEnd = await getLedgerEnd(cantonBaseUrl, jwt);
    const transferOfferTemplateId =
        `${brokerConfig.utilityRegistryAppV0PackageId}:Utility.Registry.App.V0.Model.Transfer:TransferOffer`;
    const transferOffers = await queryActiveContracts(
        cantonBaseUrl,
        jwt,
        partyId,
        transferOfferTemplateId,
        ledgerEnd,
    );
    const transferOffer = transferOffers.find((event) => event.contractId === transferOfferCid);
    if (!transferOffer) {
        throw new Error(`TransferOffer ${transferOfferCid} is not visible in customer ACS`);
    }
    if (!transferOffer.createdEventBlob) {
        throw new Error(`TransferOffer ${transferOfferCid} is missing createdEventBlob`);
    }

    console.info("\n[4/4] accepting collateral TransferOffer...");
    const result = await acceptTransferOffer(
        cantonBaseUrl,
        jwt,
        partyId,
        userId,
        transferOffer,
        collateralInstrumentConfig,
        collateralTransferRule,
    );

    const createdEvents = result.transaction.events
        .map((event) => event.CreatedEvent)
        .filter((event): event is CantonCreatedEvent => Boolean(event));
    const exercisedCount = result.transaction.events.filter((event) => Boolean(event.ExercisedEvent)).length;
    console.info(`accept completed: created=${createdEvents.length} exercised=${exercisedCount}`);
    for (const created of createdEvents) {
        console.info(`  - ${created.templateId} :: ${created.contractId}`);
    }
})().catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`accept transfer offer failed: ${message}`);
    process.exit(1);
});
