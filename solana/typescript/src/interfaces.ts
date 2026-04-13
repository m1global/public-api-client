export interface TreasuryConfig {
    address: string;
    owner: string;
    usdm0?: SolanaToken;
    usdm1?: SolanaToken;
    whitelist?: string;
    whitelistOwner?: string;
    customFees?: string;
    customFeesOwner?: string;
    collaterals?: SolanaToken[]
}

export interface SolanaToken {
    name?: string;
    symbol?: string;
    mintAddress: string;
    decimals?: number;
    isInterestBearing?: boolean;
    feeRate?: bigint,
    beneficiary?: string;
    tokenProgramId?: string;
    isCollateral?: boolean;
    isRedeemable?: boolean;
    uri?: string;
}

export interface SolanaDepositBody {
    depositor: string,
    collateral: string,
    amount: string,
    tokenCode: string,
    isTestnet?: boolean,
}

export interface SolanaSwapBody {
    swapper: string,
    inputTokenCode: string,
    amount: string,
    isTestnet?: boolean,
}

export interface SolanaRedemptionBody {
    redeemer: string,
    tokenCode: string,
    amount: string,
    collateral: string,
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

export interface SerializedAccountMeta {
    pubkey: string;
    isSigner: boolean;
    isWritable: boolean;
}
