import "dotenv/config";

/**********************************************************************************
 * Node command that lists all active USDM1 holdings for the authenticated
 * customer, sorted largest-to-smallest.
 *
 * For each holding the script prints the contract ID (CID), amount, whether the
 * holding is fully unlocked, and the total lock count. Use the CID output here
 * as the argument to redeem.js.
 *
 * Required environment variables:
 *   M1_API_BASE_URL, M1_API_JWT
 *   CANTON_BASE_URL, CANTON_KEYCLOAK_URL, CANTON_KEYCLOAK_CLIENT_ID,
 *   CANTON_KEYCLOAK_CLIENT_SECRET, CANTON_PARTY_ID,
 *   CANTON_USERNAME, CANTON_PASSWORD
 *
 * Must be transpiled (npm run build) then run with:
 *   node dist/listAllMyUSDM1Holdings.js
 */

import { getDepositSetup } from "./api-functions/get-deposit-setup";
import { getJwt } from "./canton-functions/get-jwt";
import { getLedgerEnd } from "./canton-functions/get-ledger-end";
import { queryActiveContracts } from "./canton-functions/query-active-contracts";
import type { CantonBrokerConfig, CantonCreatedEvent } from "./interfaces";

function toRequiredBrokerFields(bundle: CantonBrokerConfig): {
    utilityRegistryHoldingV0PackageId: string;
    usdm1InstrumentId: string;
    usdm1Registrar: string;
} {
    const fields: Array<keyof CantonBrokerConfig> = [
        "utilityRegistryHoldingV0PackageId",
        "usdm1InstrumentId",
        "usdm1Registrar",
    ];

    for (const field of fields) {
        const value = String(bundle[field] ?? "").trim();
        if (!value) {
            throw new Error(`broker config missing ${String(field)}`);
        }
    }

    return {
        utilityRegistryHoldingV0PackageId: bundle.utilityRegistryHoldingV0PackageId,
        usdm1InstrumentId: bundle.usdm1InstrumentId,
        usdm1Registrar: bundle.usdm1Registrar,
    };
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

function getHoldingLockCount(event: CantonCreatedEvent): number {
    const args = (event.createArgument ?? event.createArguments ?? {}) as Record<string, unknown>;
    const lock = (args["lock"] as Record<string, unknown> | undefined) ?? undefined;
    if (!lock) {
        return 0;
    }
    const lockers = ((lock["lockers"] as Record<string, unknown> | undefined)?.["map"] as unknown[] | undefined) ?? [];
    return lockers.length;
}

function isUnlockedHolding(event: CantonCreatedEvent): boolean {
    return getHoldingLockCount(event) === 0;
}

function selectCustomerUsdm1Holdings(
    events: CantonCreatedEvent[],
    ownerParty: string,
    usdm1InstrumentId: string,
    usdm1Registrar: string,
): CantonCreatedEvent[] {
    return events.filter((event) => {
        const args = (event.createArgument ?? event.createArguments ?? {}) as Record<string, unknown>;
        const owner = String(args["owner"] ?? "").trim();
        const instrument = (
            (args["instrument"] as Record<string, unknown> | undefined)
            ?? (args["instrumentId"] as Record<string, unknown> | undefined)
            ?? {}
        );
        const instrumentId = String(instrument["id"] ?? "").trim();
        const registrar = String(instrument["admin"] ?? instrument["source"] ?? "").trim();

        return owner === ownerParty
            && instrumentId === usdm1InstrumentId
            && (!registrar || registrar === usdm1Registrar);
    });
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

    console.info(`operating as Canton party: ${partyId}`);

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
    const requiredBrokerFields = toRequiredBrokerFields(brokerConfig);

    console.info("\n[3/4] querying customer holdings from ACS...");
    const ledgerEnd = await getLedgerEnd(cantonBaseUrl, jwt);
    const holdingTemplateId =
        `${requiredBrokerFields.utilityRegistryHoldingV0PackageId}:Utility.Registry.Holding.V0.Holding:Holding`;

    const holdings = await queryActiveContracts(cantonBaseUrl, jwt, partyId, holdingTemplateId, ledgerEnd);
    const usdmHoldings = selectCustomerUsdm1Holdings(
        holdings,
        partyId,
        requiredBrokerFields.usdm1InstrumentId,
        requiredBrokerFields.usdm1Registrar,
    );

    console.info(`ledger end: ${ledgerEnd}`);
    console.info(`USDM1 holdings found: ${usdmHoldings.length}`);

    if (usdmHoldings.length === 0) {
        throw new Error("no customer USDM1 holdings found");
    }

    const sorted = [...usdmHoldings].sort((a, b) => {
        const aArgs = (a.createArgument ?? a.createArguments ?? {}) as Record<string, unknown>;
        const bArgs = (b.createArgument ?? b.createArguments ?? {}) as Record<string, unknown>;
        return parseAmount(bArgs["amount"]) - parseAmount(aArgs["amount"]);
    });

    console.info("\n[4/4] available USDM1 holdings");
    for (const event of sorted) {
        const args = (event.createArgument ?? event.createArguments ?? {}) as Record<string, unknown>;
        const amount = parseAmount(args["amount"]);
        const lockCount = getHoldingLockCount(event);
        console.info(
            `- cid=${event.contractId} amount=${amount} unlocked=${isUnlockedHolding(event)} lockCount=${lockCount}`,
        );
    }
})();
