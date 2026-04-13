import { StringLiteral } from "typescript";

export interface StellarBrokerConfig {
    address: string;
    usdm0: StellarAsset | undefined;
    usdm1: StellarAsset | undefined;
    collaterals: StellarAsset[] | undefined
}

export interface StellarAsset {
    symbol?: string;
    name?: string;
    issuer?: string;
    address: string;
    decimals?: number;
}

export interface StellarAllowanceBody {
    owner: string,
    spender: string,
    amount: string,
    isTestnet: boolean,
}

export interface StellarDepositBody {
    depositor: string,
    collateral: string,
    amount: string,
    tokenCode: string,
    isTestnet?: boolean,
}

export interface StellarRedemptionBody {
    redeemer: string,
    tokenCode: string,
    amount: string,
    collateral: string,
    isTestnet?: boolean,
}

export interface StellarSwapBody {
    swapper: string,
    inputTokenCode: string,
    amount: string,
    isTestnet?: boolean,
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
    token: string;
    collateral: string;
}

export interface Swap {
    swapper: string;
    amount: BigInt;
    amountApproved?: BigInt;
    inputToken: string;
    outputToken: string;
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
