export interface StellarAtomicBrokerConfig {
    address: string;
    usdm0: StellarAsset | undefined;
    usdm1: StellarAsset | undefined;
    baseDepositFeeBps: number;
    baseRedemptionFeeBps: number;
    collaterals: StellarCollateral[] | undefined
}

export interface StellarAsset {
    symbol?: string;
    name?: string;
    issuer?: string;
    address: string;
    decimals?: number | string;
}

export interface StellarCollateral extends StellarAsset {
    exists: boolean;
    disabled: boolean;
    requiresAttestation: boolean;
    depositFeeBps: number;
    redemptionFeeBps: number;
}

export interface StellarAllowanceBody {
    owner: string,
    spender: string,
    amount: string,
    isTestnet: boolean,
}

export interface StellarAtomicDepositBody {
    depositor: string,
    recipient: string,
    collateral: string,
    amount: string,
    tokenCode: string,
    collateralAttestation: StellarPriceAttestation,
    tokenAttestation: StellarPriceAttestation,
    depositPermit: StellarDepositPermit,
    isTestnet?: boolean,
}

export interface StellarAtomicSwapBody {
    swapper: string,
    inputTokenCode: string,
    amount: string,
    tokenAttestation: StellarPriceAttestation,
    isTestnet?: boolean,
}

export interface StellarAtomicRedemptionBody {
    redeemer: string,
    tokenCode: string,
    amount: string,
    collateral: string,
    recipient: string,
    collateralAttestation: StellarPriceAttestation,
    tokenAttestation: StellarPriceAttestation,
    redeemPermit: StellarRedeemPermit,
    isTestnet?: boolean,
}

export interface StellarPriceAttestation {
    index: string;
    notBefore: string;
    notAfter: string;
    seq: string;
    publicKey: string;
    signature: string;
}

export interface StellarPriceAttestationResponse extends StellarPriceAttestation {
    contract: string;
    consumer: string;
    token: string;
    feedId: string;
    digest: string;
}

export interface StellarDepositPermit {
    caller: string;
    source: string;
    recipient: string;
    collateral: string;
    usdm: string;
    amount: string;
    seq: string;
    notBefore: string;
    notAfter: string;
    publicKey: string;
    signature: string;
}

export interface StellarRedeemPermit {
    caller: string;
    source: string;
    payoutRecipient: string;
    token: string;
    collateral: string;
    amount: string;
    seq: string;
    notBefore: string;
    notAfter: string;
    publicKey: string;
    signature: string;
}

export interface Trustline {
    publicKey: string,
    code: string,
    issuer: string,
    balance: string,
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
