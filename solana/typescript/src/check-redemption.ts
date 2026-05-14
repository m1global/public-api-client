import fs from "fs";

import "dotenv/config";

import { getBalance } from "./api-functions/get-balance";
import {
    readBalance,
    validateOneToOneRedemption,
} from "./balance-validation";

const REDEMPTION_DETAILS_PATH = "redemption-details.json";

type RedemptionDetails = {
    redeemer: string;
    amount: string;
    inputToken: string;
    inputDecimals?: number | string;
    outputToken: string;
    outputDecimals?: number | string;
    before: Record<string, string>;
};

(async () => {
    if (!fs.existsSync(REDEMPTION_DETAILS_PATH)) {
        console.error(`${REDEMPTION_DETAILS_PATH} is missing`);
        return;
    }

    const details = JSON.parse(fs.readFileSync(REDEMPTION_DETAILS_PATH, "utf-8")) as RedemptionDetails;
    const inputBalance = await getBalance(details.inputToken, details.redeemer, true);
    console.info(`balance of ${details.inputToken}: ${inputBalance?.balance}`);
    const outputBalance = await getBalance(details.outputToken, details.redeemer, true);
    console.info(`balance of ${details.outputToken}: ${outputBalance?.balance}`);

    validateOneToOneRedemption({
        chainTag: "[solana]",
        stage: "after-settlement",
        before: {
            [details.inputToken]: BigInt(details.before[details.inputToken]!),
            [details.outputToken]: BigInt(details.before[details.outputToken]!),
        },
        after: {
            [details.inputToken]: readBalance(inputBalance, details.inputToken),
            [details.outputToken]: readBalance(outputBalance, details.outputToken),
        },
        inputToken: details.inputToken,
        inputAmount: BigInt(details.amount),
        inputDecimals: details.inputDecimals,
        outputToken: details.outputToken,
        outputDecimals: details.outputDecimals,
        requireOutputIncrease: true,
    });
})();
