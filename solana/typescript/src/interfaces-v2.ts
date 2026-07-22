export interface TreasuryConfig {
    address: string;
    owner: string;
    usdm0?: SolanaToken;
    usdm1?: SolanaToken;
    whitelist?: string;
    whitelistOwner?: string;
    customFees?: string;
    customFeesOwner?: string;
    lookupTableAddress?: string;
    collaterals?: SolanaToken[]
}

export interface SolanaToken {
    name?: string;
    symbol?: string;
    mintAddress: string;
    decimals?: number | string;
    isInterestBearing?: boolean;
    feeRate?: bigint,
    beneficiary?: string;
    tokenProgramId?: string;
    requiresAttestation?: boolean;
    isCollateral?: boolean;
    isRedeemable?: boolean;
    uri?: string;
}

export type SolanaPriceAttestationInput = SolanaPriceAttestation | SolanaPriceAttestationResponse;

export interface SolanaDepositBody {
    depositor: string,
    recipient?: string,
    collateral: string,
    amount: string,
    tokenCode: string,
    collateralAttestation?: SolanaPriceAttestationInput,
    tokenAttestation?: SolanaPriceAttestationInput,
    depositPermit: SolanaDepositPermit,
    isTestnet?: boolean,
}

export interface SolanaSwapBody {
    swapper: string,
    inputTokenCode: string,
    amount: string,
    tokenAttestation: SolanaPriceAttestationInput,
    swapPermit: SolanaSwapPermit,
    isTestnet?: boolean,
}

export interface SolanaRedemptionBody {
    redeemer: string,
    recipient?: string,
    tokenCode: string,
    amount: string,
    collateral: string,
    collateralAttestation?: SolanaPriceAttestationInput,
    tokenAttestation?: SolanaPriceAttestationInput,
    redeemPermit: SolanaRedeemPermit,
    isTestnet?: boolean,
}

export type SolanaV2Signature = {
    publicKey: string;
    signature: string;
};

export type AttestationDirectionRequest = "deposit" | "redeem" | "swap";

export interface SolanaPriceAttestation {
    token: string;
    quoteId: string;
    direction: number;
    index: string;
    notBefore: string;
    notAfter: string;
    signature: SolanaV2Signature;
}

export interface SolanaPriceAttestationResponse extends SolanaPriceAttestation {
    attestation: SolanaPriceAttestation;
    consumer: string;
    feedId: string;
    trueIndex: string;
    feeBps: number;
    tradeFeeBps: number;
    sourceFeeBps: number;
    digest: string;
}

export interface SolanaDepositPermit {
    source: string;
    recipient: string;
    collateral: string;
    usdm: string;
    amount: string;
    seq: string;
    notBefore: string;
    notAfter: string;
    signature: SolanaV2Signature;
}

export interface SolanaRedeemPermit {
    source: string;
    payoutRecipient: string;
    token: string;
    collateral: string;
    amount: string;
    seq: string;
    notBefore: string;
    notAfter: string;
    signature: SolanaV2Signature;
}

export interface SolanaSwapPermit {
    source: string;
    inputToken: string;
    outputToken: string;
    amount: string;
    seq: string;
    notBefore: string;
    notAfter: string;
    signature: SolanaV2Signature;
}

export interface SolanaPermitRequestBody {
    sourceAddress: string;
    recipientAddress: string;
    tokenCode: string;
    collateral: string;
    amount: string;
    isTestnet?: boolean;
}

export interface Deposit {
    depositor: string;
    amount: BigInt;
    amountApproved?: BigInt;
    collateral: string;
    token: string;
}

export interface Redemption {
    redeemer: string;
    amount: BigInt;
    amountApproved?: BigInt;
    inputToken: string;
    outputToken: string;
}

export interface Swap {
    swapper: string;
    amount: BigInt;
    amountApproved?: BigInt;
    inputToken: string;
    outputToken: string;
}

export interface Balance {
    balance: string;
}

export interface Allowance {
    allowance: string;
}

export interface WhitelistStatus {
    status: string;
}

export interface TxResult {
    tx: string;
}

export interface SerializedInstruction {
    keys: SerializedAccountMeta[];
    programId: string;
    data: string;
}

export type SerializedInstructionResponse = SerializedInstruction | SerializedInstruction[];

export interface SerializedAccountMeta {
    pubkey: string;
    isSigner: boolean;
    isWritable: boolean;
}
