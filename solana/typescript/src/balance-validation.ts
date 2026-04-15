type BalanceSnapshot = Record<string, bigint>;

interface HeuristicValidationArgs {
    chainTag: string;
    operation: "deposit" | "swap";
    stage: string;
    before: BalanceSnapshot;
    after: BalanceSnapshot;
    inputToken: string;
    inputAmount: bigint;
    outputToken: string;
    requireOutputIncrease: boolean;
}

interface RedemptionValidationArgs {
    chainTag: string;
    stage: string;
    before: BalanceSnapshot;
    after: BalanceSnapshot;
    inputToken: string;
    inputAmount: bigint;
    inputDecimals: number | string | undefined;
    outputToken: string;
    outputDecimals: number | string | undefined;
    requireOutputIncrease: boolean;
}

function formatSigned(delta: bigint): string {
    if (delta > 0n) {
        return `+${delta.toString()}`;
    }
    return delta.toString();
}

function logCheck(chainTag: string, operation: string, stage: string, token: string, delta: bigint): void {
    console.info(
        `${chainTag} balance-check operation=${operation} stage=${stage} token=${token} delta=${formatSigned(delta)}`,
    );
}

function warn(chainTag: string, operation: string, stage: string, message: string): void {
    console.warn(`${chainTag} WARN balance-check operation=${operation} stage=${stage} ${message}`);
}

function scaleAmount(amount: bigint, fromDecimals: number, toDecimals: number): bigint {
    if (fromDecimals === toDecimals) {
        return amount;
    }
    const exponent = BigInt(Math.abs(fromDecimals - toDecimals));
    const factor = 10n ** exponent;
    if (fromDecimals < toDecimals) {
        return amount * factor;
    }
    return amount / factor;
}

function getSnapshotBalance(snapshot: BalanceSnapshot, token: string): bigint {
    return snapshot[token] ?? 0n;
}

function normalizeDecimals(value: number | string | undefined): number | undefined {
    if (value == null) {
        return undefined;
    }
    if (typeof value === "number") {
        return Number.isFinite(value) ? value : undefined;
    }
    const trimmed = value.trim();
    if (trimmed.length === 0) {
        return undefined;
    }
    const parsed = Number(trimmed);
    return Number.isFinite(parsed) ? parsed : undefined;
}

export function readBalance(balance: { balance?: string } | undefined, token: string): bigint {
    if (!balance?.balance) {
        console.warn(`[solana] WARN balance-check token=${token} balance missing, treating as 0`);
        return 0n;
    }
    return BigInt(balance.balance);
}

export function validateHeuristicBalanceChange(args: HeuristicValidationArgs): void {
    const inputDelta = getSnapshotBalance(args.after, args.inputToken) - getSnapshotBalance(args.before, args.inputToken);
    const outputDelta = getSnapshotBalance(args.after, args.outputToken) - getSnapshotBalance(args.before, args.outputToken);

    logCheck(args.chainTag, args.operation, args.stage, args.inputToken, inputDelta);
    logCheck(args.chainTag, args.operation, args.stage, args.outputToken, outputDelta);

    if (inputDelta !== -args.inputAmount) {
        warn(
            args.chainTag,
            args.operation,
            args.stage,
            `expected ${args.inputToken} delta=${(-args.inputAmount).toString()} but observed ${inputDelta.toString()}`,
        );
    }

    if (args.requireOutputIncrease && outputDelta <= 0n) {
        warn(
            args.chainTag,
            args.operation,
            args.stage,
            `expected ${args.outputToken} to increase heuristically after ${args.operation}, but observed delta=${outputDelta.toString()}`,
        );
    }
}

export function validateOneToOneRedemption(args: RedemptionValidationArgs): void {
    const inputDelta = getSnapshotBalance(args.after, args.inputToken) - getSnapshotBalance(args.before, args.inputToken);
    const outputDelta = getSnapshotBalance(args.after, args.outputToken) - getSnapshotBalance(args.before, args.outputToken);

    logCheck(args.chainTag, "redeem", args.stage, args.inputToken, inputDelta);
    logCheck(args.chainTag, "redeem", args.stage, args.outputToken, outputDelta);

    if (inputDelta !== -args.inputAmount) {
        warn(
            args.chainTag,
            "redeem",
            args.stage,
            `expected ${args.inputToken} delta=${(-args.inputAmount).toString()} but observed ${inputDelta.toString()}`,
        );
    }

    if (!args.requireOutputIncrease) {
        return;
    }

    const inputDecimals = normalizeDecimals(args.inputDecimals);
    const outputDecimals = normalizeDecimals(args.outputDecimals);

    if (inputDecimals == null || outputDecimals == null) {
        if (outputDelta <= 0n) {
            warn(
                args.chainTag,
                "redeem",
                args.stage,
                `token decimals unavailable, so exact 1:1 validation was skipped and ${args.outputToken} did not increase`,
            );
        }
        return;
    }

    const expectedOutputDelta = scaleAmount(args.inputAmount, inputDecimals, outputDecimals);
    if (outputDelta !== expectedOutputDelta) {
        warn(
            args.chainTag,
            "redeem",
            args.stage,
            `expected ${args.outputToken} delta=${expectedOutputDelta.toString()} for 1:1 redemption but observed ${outputDelta.toString()}`,
        );
    }
}
