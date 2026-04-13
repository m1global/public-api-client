import "dotenv/config";

import { faucet } from "./api-functions/faucet";
import { getOperation } from "./api-functions/get-operation";
import { getDepositSetup } from "./api-functions/get-deposit-setup";
import { sleep } from "./api-functions/util";
import { getJwt } from "./canton-functions/get-jwt";
import { getLedgerEnd } from "./canton-functions/get-ledger-end";
import { getOrCreateRecipientMintAuth } from "./canton-functions/get-or-create-recipient-mint-auth";
import { createDepositRequest } from "./canton-functions/create-deposit-request";
import { queryActiveContracts } from "./canton-functions/query-active-contracts";
import { requestMintCollateral } from "./canton-functions/request-mint-collateral";
import type {
    CantonAcceptedCollateral,
    CantonBrokerConfig,
    CantonCreatedEvent,
    CantonDepositSetup,
} from "./interfaces";
import {
    sumHoldingAmounts,
    validateCantonBalanceChange,
} from "./holding-validation";

/**********************************************************************************
 * Node command to perform a full Canton deposit of mock collateral into the
 * AtomicBroker in exchange for USDM.
 *
 * Flow:
 *  1.  Authenticates against Keycloak to obtain a Canton bearer JWT.
 *  2.  Fetches static Canton broker metadata from the M1 API.
 *  3.  Queries the customer's ACS to resolve live contracts and CIDs needed for deposit.
 *  4.  Captures current customer collateral Holdings as a baseline.
 *  5.  Customer exercises AllocationFactory_RequestMint, creating a MintRequest.
 *  6.  Calls the M1 API Canton faucet with the MintRequest CID.
 *  7.  Polls the M1 API operations endpoint until faucet approval settles.
 *  8.  Polls the customer ACS for the newly minted collateral Holding.
 *  9.  Gets or creates a RecipientMintAuth contract for the customer.
 * 10. Exercises AtomicBroker::CreateDepositRequest — transfers collateral
 *      to the broker and creates a DepositRequest. The broker admin later
 *      calls ProcessDepositAtomic to settle the transfer and mint USDM.
 *
 * Required environment variables:
 *   M1_API_BASE_URL, M1_API_JWT
 *   CANTON_BASE_URL, CANTON_KEYCLOAK_URL, CANTON_KEYCLOAK_CLIENT_ID,
 *   CANTON_KEYCLOAK_CLIENT_SECRET, CANTON_PARTY_ID, CANTON_USER_ID,
 *   CANTON_USERNAME, CANTON_PASSWORD, CANTON_COLLATERAL_REGISTRAR
 *
 * Optional environment variables:
 *   CANTON_DEPOSIT_AMOUNT (defaults to 100)
 *
 * Must be transpiled (npm run build) then run with:
 *   node dist/deposit.js
 */

function filterCollateralHoldings(
    events: CantonCreatedEvent[],
    ownerParty: string,
    instrumentId: string,
): CantonCreatedEvent[] {
    return events.filter((event) => {
        const args = (event.createArgument ?? {}) as Record<string, unknown>;
        const owner = String(args["owner"] ?? "").trim();
        const instrument = (args["instrument"] as Record<string, unknown> | undefined);
        return owner === ownerParty && String(instrument?.["id"] ?? "").trim() === instrumentId;
    });
}

function filterUsdmHoldings(
    events: CantonCreatedEvent[],
    ownerParty: string,
    instrumentId: string,
): CantonCreatedEvent[] {
    return events.filter((event) => {
        const args = (event.createArgument ?? {}) as Record<string, unknown>;
        const owner = String(args["owner"] ?? "").trim();
        const instrument = (args["instrument"] as Record<string, unknown> | undefined);
        return owner === ownerParty && String(instrument?.["id"] ?? "").trim() === instrumentId;
    });
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

function toDepositSetupFromBundle(bundle: CantonBrokerConfig, collateral: CantonAcceptedCollateral): CantonDepositSetup {
    const requiredBundleFields: Array<keyof CantonBrokerConfig> = [
        "adminParty",
        "brokerPackageId",
        "atomicBrokerCid",
        "atomicBrokerTemplateId",
        "atomicBrokerBlob",
        "usdm1InstrumentId",
        "usdm1Registrar",
    ];

    for (const field of requiredBundleFields) {
        const value = String(bundle[field] ?? "").trim();
        if (!value) {
            throw new Error(`broker config missing ${String(field)}`);
        }
    }

    const requiredCollateralFields: Array<keyof CantonAcceptedCollateral> = [
        "id",
        "collateralAllocationFactoryCid",
        "collateralAllocationFactoryTemplateId",
        "collateralAllocationFactoryBlob",
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
        collateralAllocationFactoryCid: collateral.collateralAllocationFactoryCid,
        collateralAllocationFactoryTemplateId: collateral.collateralAllocationFactoryTemplateId,
        collateralAllocationFactoryBlob: collateral.collateralAllocationFactoryBlob,
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
    };
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
            console.error(`${key} is not set in environment`);
            return;
        }
    }

    const cantonBaseUrl = process.env["CANTON_BASE_URL"]!;
    const partyId = process.env["CANTON_PARTY_ID"]!;
    const userId = process.env["CANTON_USER_ID"]!;
    const collateralRegistrarOverride = process.env["CANTON_COLLATERAL_REGISTRAR"]!;
    const depositAmount = Number(process.env["CANTON_DEPOSIT_AMOUNT"] ?? "100");

    if (isNaN(depositAmount) || depositAmount <= 0) {
        console.error("CANTON_DEPOSIT_AMOUNT must be a positive number");
        return;
    }

    console.info(`operating as Canton party: ${partyId}`);
    console.info(`deposit amount: ${depositAmount}`);

    // -------------------------------------------------------------------------
    // Step 1: Obtain a Canton JWT for the customer via Keycloak.
    // -------------------------------------------------------------------------
    console.info("\n[1/11] obtaining Canton JWT for customer...");

    const jwtResp = await getJwt(
        process.env["CANTON_KEYCLOAK_URL"]!,
        process.env["CANTON_KEYCLOAK_CLIENT_ID"]!,
        process.env["CANTON_KEYCLOAK_CLIENT_SECRET"]!,
        process.env["CANTON_USERNAME"]!,
        process.env["CANTON_PASSWORD"]!,
    );

    const jwt = jwtResp.access_token;
    if (!jwt) {
        console.error("failed to obtain Canton JWT from Keycloak");
        return;
    }
    console.info("Canton JWT obtained");

    // -------------------------------------------------------------------------
    // Step 2: Fetch static broker metadata from the M1 API.
    // -------------------------------------------------------------------------
    console.info("\n[2/11] fetching Canton broker metadata from M1 API...");

    const brokerConfig = await getDepositSetup();
    if (!brokerConfig) {
        console.error("failed to fetch Canton broker config from M1 API");
        return;
    }

    const selectedCollateral = selectCollateral(brokerConfig);
    const instrumentId = String(selectedCollateral.id ?? "").trim();
    if (!instrumentId) {
        console.error("broker config missing selected collateral id");
        return;
    }
    console.info(`collateral instrument: ${instrumentId}`);

    // -------------------------------------------------------------------------
    // Step 3: Build setup contracts from the broker bundle.
    // -------------------------------------------------------------------------
    console.info("\n[3/11] loading setup contracts from broker bundle...");

    const depositSetup = toDepositSetupFromBundle(brokerConfig, selectedCollateral);

    const collateralRegistrar = collateralRegistrarOverride || depositSetup.collateralRegistrar;
    if (collateralRegistrar !== depositSetup.collateralRegistrar) {
        console.error(
            `CANTON_COLLATERAL_REGISTRAR mismatch: env=${collateralRegistrar} ledger=${depositSetup.collateralRegistrar}`,
        );
        return;
    }
    console.info(`AtomicBroker: ${depositSetup.atomicBrokerCid}`);
    console.info(`CollateralAllocationFactory: ${depositSetup.collateralAllocationFactoryCid}`);
    console.info(`adminParty: ${depositSetup.adminParty}`);

    // -------------------------------------------------------------------------
    // Step 3 (continued): Build InstrumentConfiguration and TransferRule events.
    // -------------------------------------------------------------------------

    if (!depositSetup.collateralInstrumentConfigBlob) {
        console.error("deposit setup is missing collateralInstrumentConfigBlob — cannot proceed");
        return;
    }

    const instrumentConfigEvent: CantonCreatedEvent = {
        contractId: depositSetup.collateralInstrumentConfigCid,
        templateId: depositSetup.collateralInstrumentConfigTemplateId,
        createdEventBlob: depositSetup.collateralInstrumentConfigBlob,
    };
    console.info(`InstrumentConfiguration: ${instrumentConfigEvent.contractId}`);

    const transferRuleEvent: CantonCreatedEvent | undefined = depositSetup.collateralTransferRuleCid
        ? {
            contractId: depositSetup.collateralTransferRuleCid,
            templateId: depositSetup.collateralTransferRuleTemplateId,
            createdEventBlob: depositSetup.collateralTransferRuleBlob,
        }
        : undefined;
    if (transferRuleEvent) {
        console.info(`TransferRule: ${transferRuleEvent.contractId}`);
    } else {
        console.info("no TransferRule — collateral extra-args will omit transfer-rule key");
    }

    // -------------------------------------------------------------------------
    // Step 4: Capture current customer collateral holdings as a baseline.
    // -------------------------------------------------------------------------
    console.info("\n[4/11] capturing baseline collateral holdings...");

    const holdingTemplateId =
        `${brokerConfig.utilityRegistryHoldingV0PackageId}:Utility.Registry.Holding.V0.Holding:Holding`;
    console.info(`holding template: ${holdingTemplateId}`);
    const baselineLedgerEnd = await getLedgerEnd(cantonBaseUrl, jwt);
    const baselineEvents = await queryActiveContracts(
        cantonBaseUrl,
        jwt,
        partyId,
        holdingTemplateId,
        baselineLedgerEnd,
    );
    const baselineCollateralHoldings = filterCollateralHoldings(
        baselineEvents,
        partyId,
        instrumentId,
    );
    const baselineHoldingIds = new Set(baselineCollateralHoldings.map((event) => event.contractId));
    console.info(`baseline collateral holdings: ${baselineCollateralHoldings.length}`);

    const baselineUsdmHoldings = filterUsdmHoldings(
        baselineEvents,
        partyId,
        depositSetup.usdm1InstrumentId,
    );
    const baselineUsdmHoldingIds = new Set(baselineUsdmHoldings.map((event) => event.contractId));
    console.info(`baseline USDM1 holdings: ${baselineUsdmHoldings.length}`);

    // -------------------------------------------------------------------------
    // Step 5: Customer creates a MintRequest for collateral.
    // -------------------------------------------------------------------------
    console.info("\n[5/11] creating collateral MintRequest as customer...");

    const mintRequestEvent = await requestMintCollateral(
        cantonBaseUrl,
        jwt,
        partyId,
        userId,
        depositAmount,
        depositSetup,
        instrumentConfigEvent,
    );
    console.info(`MintRequest created: ${mintRequestEvent.contractId}`);

    // -------------------------------------------------------------------------
    // Step 6: Call the M1 API Canton faucet with the MintRequest CID.
    // -------------------------------------------------------------------------
    console.info(`\n[6/11] submitting MintRequest ${mintRequestEvent.contractId} to Canton faucet...`);

    const opId = await faucet(partyId, mintRequestEvent.contractId);
    if (!opId) {
        console.error("faucet request failed");
        return;
    }
    console.info(`faucet operation id: ${opId}`);

    // -------------------------------------------------------------------------
    // Step 7: Poll the M1 API until faucet approval settles.
    // -------------------------------------------------------------------------
    console.info("\n[7/11] waiting for faucet operation to complete...");

    let operationTx: string | undefined;
    const POLL_ATTEMPTS = 12;
    const POLL_INTERVAL_MS = 5_000;
    const pollStartMs = Date.now();
    console.info(`poll configuration: attempts=${POLL_ATTEMPTS} intervalMs=${POLL_INTERVAL_MS} opId=${opId}`);

    for (let attempt = 1; attempt <= POLL_ATTEMPTS; attempt++) {
        await sleep(POLL_INTERVAL_MS);
        const elapsedMs = Date.now() - pollStartMs;
        console.info(`  poll ${attempt}/${POLL_ATTEMPTS} @${new Date().toISOString()} elapsedMs=${elapsedMs}`);
        operationTx = await getOperation(opId);
        if (operationTx) break;
        console.info(`  poll ${attempt}/${POLL_ATTEMPTS} — operation not yet settled`);
    }

    if (!operationTx) {
        console.error(`faucet operation did not settle after ${POLL_ATTEMPTS} attempts`);
        return;
    }
    console.info(`faucet operation settled: ${operationTx}`);

    // -------------------------------------------------------------------------
    // Step 8: Poll customer ACS for the new collateral Holding minted by faucet approval.
    // -------------------------------------------------------------------------
    console.info("\n[8/11] polling customer ACS for newly minted collateral Holding...");

    let holdingEvent: CantonCreatedEvent | undefined;
    const HOLDING_POLL_ATTEMPTS = 12;

    for (let attempt = 1; attempt <= HOLDING_POLL_ATTEMPTS; attempt++) {
        const freshLedgerEnd = await getLedgerEnd(cantonBaseUrl, jwt);
        const events = await queryActiveContracts(
            cantonBaseUrl,
            jwt,
            partyId,
            holdingTemplateId,
            freshLedgerEnd,
        );
        const collateralHoldings = filterCollateralHoldings(events, partyId, instrumentId);
        holdingEvent = collateralHoldings.find((event) => !baselineHoldingIds.has(event.contractId));

        if (holdingEvent) {
            break;
        }

        console.info(
            `  poll ${attempt}/${HOLDING_POLL_ATTEMPTS} — ledgerEnd=${freshLedgerEnd} collateralHoldings=${collateralHoldings.length} baseline=${baselineCollateralHoldings.length}`,
        );
        await sleep(5_000);
    }

    if (!holdingEvent) {
        console.error(`no newly minted ${instrumentId} Holding found in customer ACS after polling`);
        return;
    }

    if (!holdingEvent.createdEventBlob) {
        console.error("Holding has no createdEventBlob — cannot proceed with deposit");
        return;
    }
    console.info(`collateral Holding: ${holdingEvent.contractId}`);
    const preDepositLedgerEnd = await getLedgerEnd(cantonBaseUrl, jwt);
    const preDepositEvents = await queryActiveContracts(
        cantonBaseUrl,
        jwt,
        partyId,
        holdingTemplateId,
        preDepositLedgerEnd,
    );
    const preDepositCollateralSum = sumHoldingAmounts(
        filterCollateralHoldings(preDepositEvents, partyId, instrumentId),
    );
    const preDepositUsdm1Sum = sumHoldingAmounts(
        filterUsdmHoldings(preDepositEvents, partyId, depositSetup.usdm1InstrumentId),
    );
    console.info(`pre-deposit collateral balance: ${preDepositCollateralSum}`);
    console.info(`pre-deposit USDM1 balance: ${preDepositUsdm1Sum}`);

    // -------------------------------------------------------------------------
    // Step 9: Get or create RecipientMintAuth.
    // This standing-authorisation contract allows the broker admin to mint USDM
    // to the customer when settling a DepositRequest via ProcessDepositAtomic.
    // -------------------------------------------------------------------------
    console.info("\n[9/11] getting or creating RecipientMintAuth...");

    const freshLedgerEnd = await getLedgerEnd(cantonBaseUrl, jwt);

    await getOrCreateRecipientMintAuth(
        cantonBaseUrl,
        jwt,
        partyId,
        depositSetup.adminParty,
        userId,
        depositSetup.brokerPackageId,
        freshLedgerEnd,
    );

    // -------------------------------------------------------------------------
    // Step 10: Exercise AtomicBroker::CreateDepositRequest.
    // Transfers collateral from the customer to the broker and creates a
    // DepositRequest.  The broker admin will later settle this atomically and
    // mint USDM to the customer.
    // -------------------------------------------------------------------------
    console.info("\n[10/11] submitting CreateDepositRequest to AtomicBroker...");

    const { depositRequestCid, transactionResult } = await createDepositRequest(
        cantonBaseUrl,
        jwt,
        partyId,
        userId,
        depositAmount,
        depositSetup,
        holdingEvent,
        instrumentConfigEvent,
        transferRuleEvent,
    );

    if (depositRequestCid) {
        console.info(`DepositRequest created: ${depositRequestCid}`);
    } else {
        // The DepositRequest CID comes from the ExercisedEvent result — the
        // createDepositRequest function also searches CreatedEvents.  Log the
        // raw transaction for inspection if no CID was resolved.
        console.info("deposit submitted — DepositRequest CID not found in CreatedEvents; raw transaction:");
        console.info(JSON.stringify(transactionResult, null, 2));
    }

    // -------------------------------------------------------------------------
    // Step 11: Wait for indexer/API processing, then resolve the newly minted
    // customer USDM1 Holding that results from ProcessDepositAtomic.
    // -------------------------------------------------------------------------
    const INDEXER_WAIT_MS = 20_000;
    console.info(`\n[11/11] waiting ${INDEXER_WAIT_MS}ms for indexer/API processing...`);
    await sleep(INDEXER_WAIT_MS);

    const postDepositLedgerEnd = await getLedgerEnd(cantonBaseUrl, jwt);
    const postDepositEvents = await queryActiveContracts(
        cantonBaseUrl,
        jwt,
        partyId,
        holdingTemplateId,
        postDepositLedgerEnd,
    );
    const postDepositUsdmHoldings = filterUsdmHoldings(
        postDepositEvents,
        partyId,
        depositSetup.usdm1InstrumentId,
    );

    const newUsdmHolding = postDepositUsdmHoldings.find(
        (event) => !baselineUsdmHoldingIds.has(event.contractId),
    );

    if (!newUsdmHolding) {
        console.error("no new USDM1 Holding found after deposit processing wait window");
        return;
    }

    console.info(`new USDM1 Holding: ${newUsdmHolding.contractId}`);
    const postDepositCollateralSum = sumHoldingAmounts(
        filterCollateralHoldings(postDepositEvents, partyId, instrumentId),
    );
    const postDepositUsdm1Sum = sumHoldingAmounts(postDepositUsdmHoldings);
    console.info(`post-deposit collateral balance: ${postDepositCollateralSum}`);
    console.info(`post-deposit USDM1 balance: ${postDepositUsdm1Sum}`);
    validateCantonBalanceChange({
        stage: "after-settlement",
        beforeCollateral: preDepositCollateralSum,
        afterCollateral: postDepositCollateralSum,
        beforeUsdm1: preDepositUsdm1Sum,
        afterUsdm1: postDepositUsdm1Sum,
        expectedCollateralDelta: -depositAmount,
        requireUsdm1Increase: true,
    });

})();
