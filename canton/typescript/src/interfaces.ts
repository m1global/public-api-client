/** Response from the Keycloak token endpoint. */
export interface CantonKeycloakAuthResponse {
    access_token: string;
    token_type: string;
    expires_in: number;
}

/** A single created-event returned from the Canton ACS or a transaction. */
export interface CantonCreatedEvent {
    contractId: string;
    templateId: string;
    createArgument?: Record<string, unknown>;
    createArguments?: Record<string, unknown>;
    createdEventBlob?: string;
}

/** A row in the active-contracts response. */
export interface CantonActiveContractRow {
    contractEntry: {
        JsActiveContract: {
            createdEvent: CantonCreatedEvent;
        };
    };
}

/** The result returned by submit-and-wait-for-transaction. */
export interface CantonTransactionResult {
    transaction: {
        events: Array<{
            CreatedEvent?: CantonCreatedEvent;
            ExercisedEvent?: Record<string, unknown>;
        }>;
    };
}

/** A disclosed contract passed alongside a command submission. */
export interface DisclosedContract {
    contractId: string;
    templateId: string;
    createdEventBlob: string;
}

/** The M1 API operation result (contains an opaque tx reference once settled). */
export interface TxResult {
    tx?: string | null;
}

/**
 * Response from GET /canton/deposit-setup.
 * Contains the contract details (CID, templateId, createdEventBlob) needed as
 * disclosed contracts when a customer exercises AtomicBroker::CreateDepositRequest
 * directly on the Canton ledger.
 */
export interface CantonDepositSetup {
    /** The admin/operator Canton party ID (m1validator). */
    adminParty: string;
    /** The broker DAR package ID. */
    brokerPackageId: string;
    /** AtomicBroker contract details. */
    atomicBrokerCid: string;
    atomicBrokerTemplateId: string;
    atomicBrokerBlob: string;
    /** CollateralAllocationFactory contract details. */
    collateralAllocationFactoryCid: string;
    collateralAllocationFactoryTemplateId: string;
    collateralAllocationFactoryBlob: string;
    /** Collateral instrument identity. */
    collateralInstrumentId: string;
    collateralRegistrar: string;
    /** Collateral InstrumentConfiguration contract details (fetched by admin). */
    collateralInstrumentConfigCid: string;
    collateralInstrumentConfigTemplateId: string;
    collateralInstrumentConfigBlob: string;
    /** Collateral TransferRule contract details (fetched by admin). */
    collateralTransferRuleCid: string;
    collateralTransferRuleTemplateId: string;
    collateralTransferRuleBlob: string;
    /** USDM1 instrument identity. */
    usdm1InstrumentId: string;
    usdm1Registrar: string;
}

export interface CantonAcceptedCollateral {
    admin: string;
    id: string;
    enabled: boolean;
    brokerCollateralPotCid: string;
    brokerCollateralPotTemplateId: string;
    brokerCollateralPotBlob: string;
    brokerCollateralBalance: string;
    collateralAllocationFactoryCid: string;
    collateralAllocationFactoryTemplateId: string;
    collateralAllocationFactoryBlob: string;
    collateralRegistrar: string;
    collateralInstrumentConfigCid: string;
    collateralInstrumentConfigTemplateId: string;
    collateralInstrumentConfigBlob: string;
    collateralTransferRuleCid: string;
    collateralTransferRuleTemplateId: string;
    collateralTransferRuleBlob: string;
}

/** Static metadata from GET /canton/broker. */
export interface CantonBrokerConfig {
    environment: string;
    adminParty: string;
    brokerPackageId: string;
    utilityRegistryV0PackageId: string;
    utilityRegistryAppV0PackageId: string;
    utilityRegistryHoldingV0PackageId: string;
    acceptedCollaterals: CantonAcceptedCollateral[];
    atomicBrokerCid: string;
    atomicBrokerTemplateId: string;
    atomicBrokerBlob: string;
    atomicBrokerDepositHaircut: string;
    atomicBrokerRedemptionHaircut: string;
    maxAtomicRedemptionUsdm: string;
    usdm1AllocationFactoryCid: string;
    usdm1AllocationFactoryTemplateId: string;
    usdm1AllocationFactoryBlob: string;
    usdm1InstrumentId: string;
    usdm1Registrar: string;
    usdm1InstrumentConfigCid: string;
    usdm1InstrumentConfigTemplateId: string;
    usdm1InstrumentConfigBlob: string;
    usdm1TransferRuleCid: string;
    usdm1TransferRuleTemplateId: string;
    usdm1TransferRuleBlob: string;
}
