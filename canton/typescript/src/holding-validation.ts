import type { CantonCreatedEvent } from "./interfaces";

interface HoldingValidationArgs {
    stage: string;
    beforeCollateral: number;
    afterCollateral: number;
    beforeUsdm1: number;
    afterUsdm1: number;
    expectedCollateralDelta: number;
    expectedUsdm1Delta?: number;
    requireUsdm1Increase?: boolean;
}

function formatSigned(delta: number): string {
    if (delta > 0) {
        return `+${delta}`;
    }
    return `${delta}`;
}

function warn(stage: string, message: string): void {
    console.warn(`[canton] WARN balance-check stage=${stage} ${message}`);
}

export function sumHoldingAmounts(holdings: CantonCreatedEvent[]): number {
    return holdings.reduce((total, event) => {
        const args = (event.createArgument ?? event.createArguments ?? {}) as Record<string, unknown>;
        const value = args["amount"];
        if (typeof value === "number") {
            return total + value;
        }
        if (typeof value === "string") {
            const parsed = Number(value);
            return Number.isFinite(parsed) ? total + parsed : total;
        }
        return total;
    }, 0);
}

export function validateCantonBalanceChange(args: HoldingValidationArgs): void {
    const collateralDelta = args.afterCollateral - args.beforeCollateral;
    const usdm1Delta = args.afterUsdm1 - args.beforeUsdm1;

    console.info(
        `[canton] balance-check stage=${args.stage} token=collateral delta=${formatSigned(collateralDelta)}`,
    );
    console.info(
        `[canton] balance-check stage=${args.stage} token=USDM1 delta=${formatSigned(usdm1Delta)}`,
    );

    if (collateralDelta !== args.expectedCollateralDelta) {
        warn(
            args.stage,
            `expected collateral delta=${args.expectedCollateralDelta} but observed ${collateralDelta}`,
        );
    }

    if (args.expectedUsdm1Delta != null && usdm1Delta !== args.expectedUsdm1Delta) {
        warn(
            args.stage,
            `expected USDM1 delta=${args.expectedUsdm1Delta} but observed ${usdm1Delta}`,
        );
    }

    if (args.requireUsdm1Increase && usdm1Delta <= 0) {
        warn(
            args.stage,
            `expected USDM1 to increase heuristically after deposit, but observed delta=${usdm1Delta}`,
        );
    }
}
