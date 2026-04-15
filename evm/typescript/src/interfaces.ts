import { StringLiteral } from "typescript";

export interface EvmBrokerConfig {
    address: string;
    usdm0: Erc20 | undefined;
    usdm1: Erc20 | undefined;
    collaterals: Erc20[] | undefined
}

export interface EvmAtomicBrokerConfig {
    address: string;
    usdm0: Erc20 | undefined;
    usdm1: Erc20 | undefined;
    collaterals: Collateral[] | undefined
}

export interface Erc20 {
    address: string;
    symbol?: string;
    name?: string;
    decimals?: number | string;
}

export interface Collateral extends Erc20 {
    disabled: boolean;
    requiresAttestation: boolean;
    depositFee: string;
    redemptionFee: string;
}

export interface EvmApproveBody {
    owner: string,
    spender: string,
    amount: string,
    isTestnet: boolean,
}

export interface EvmDepositBody {
    depositor: string,
    collateral: string,
    amount: string,
    tokenCode: string,
    isTestnet?: boolean,
}

export interface EvmRedemptionBody {
    redeemer: string,
    tokenCode: string,
    amount: string,
    collateral: string,
    isTestnet?: boolean,
}

export interface EvmSwapBody {
    swapper: string,
    inputTokenCode: string,
    amount: string,
    isTestnet?: boolean,
}

export interface EvmAtomicDepositBody {
    depositor: string,
    recipient: string,
    collateral: string,
    amount: string,
    tokenCode: string,
    collateralAttestation: PriceAttestation,
    tokenAttestation: PriceAttestation,
    depositPermit: DepositPermit,
    isTestnet?: boolean,
}

export interface EvmAtomicRedemptionBody {
    redeemer: string,
    tokenCode: string,
    amount: string,
    collateral: string,
    recipient: string,
    collateralAttestation: PriceAttestation,
    tokenAttestation: PriceAttestation,
    redeemPermit: RedeemPermit,
    isTestnet?: boolean,
}

export interface EvmAtomicSwapBody {
    swapper: string,
    inputTokenCode: string,
    amount: string,
    tokenAttestation: PriceAttestation,
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

export interface PriceAttestation {
    token: string;
    index: string;
    notBefore: string;
    notAfter: string;
    seq: string;
    signature: string;
}

export type DepositPermit = {
    caller: string;        // must equal msg.sender
    source: string;        // source of funds
    recipient: string;     // receives minted shares/tokens
    collateral: string;    // collateral token being deposited
    usdm: string;          // USDM token being minted
    amount: bigint;        // exact mint amount
    notBefore: bigint;     // uint64 unix seconds
    notAfter: bigint;      // uint64 unix seconds
    seq: bigint;           // per-source seq
    signature?: string;    // 65-byte ECDSA signature hex (0x...), filled after signing
};

export type RedeemPermit = {
    caller: string;          // must equal msg.sender (submitter)
    source: string;          // per-source seq; USDM is pulled from source
    payoutRecipient: string; // where collateral/proceeds are sent
    token: string;           // USDM token being redeemed
    collateral: string;      // collateral being paid out
    amount: bigint;
    notBefore: bigint;
    notAfter: bigint;
    seq: bigint;
    signature?: string;
};
