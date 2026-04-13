import {
    BASE_FEE,
    Contract,
    nativeToScVal,
    Networks,
    rpc,
    scValToNative,
    TransactionBuilder,
    xdr,
} from "@stellar/stellar-sdk";

import { safeStringify } from "./util";

export interface BrokerRecordSnapshot {
    method: "get_deposit" | "get_redemption" | "get_swap";
    keyAddress: string;
    exists: boolean;
    retvalXdr?: string;
    retvalNative?: unknown;
}

export function decodeBrokerRecordXdr(xdrBase64: string): unknown {
    const retval = xdr.ScVal.fromXDR(xdrBase64, "base64");
    return scValToNative(retval);
}

async function readBrokerRecord(
    server: rpc.Server,
    brokerAddress: string,
    keyAddress: string,
    method: BrokerRecordSnapshot["method"],
    isTestnet: boolean,
): Promise<BrokerRecordSnapshot> {
    const networkPassphrase = isTestnet ? Networks.TESTNET : Networks.PUBLIC;
    const contract = new Contract(brokerAddress);
    const sourceAccount = await server.getAccount(keyAddress);

    const tx = new TransactionBuilder(sourceAccount, {
        fee: BASE_FEE,
        networkPassphrase,
    })
        .addOperation(
            contract.call(
                method,
                nativeToScVal(keyAddress, { type: "address" }),
            ),
        )
        .setTimeout(30)
        .build();

    const sim = await server.simulateTransaction(tx);
    const result = (sim as { result?: { retval?: xdr.ScVal } } | undefined)?.result;
    const retval = result?.retval;
    const nativeValue = retval ? scValToNative(retval) : undefined;

    const snapshot: BrokerRecordSnapshot = {
        method,
        keyAddress,
        exists: nativeValue !== undefined && nativeValue !== null,
    };

    if (retval) {
        snapshot.retvalXdr = retval.toXDR("base64");
        snapshot.retvalNative = nativeValue;
    }

    return snapshot;
}

export async function getDepositRecord(
    server: rpc.Server,
    brokerAddress: string,
    depositorAddress: string,
    isTestnet: boolean,
): Promise<BrokerRecordSnapshot> {
    return readBrokerRecord(server, brokerAddress, depositorAddress, "get_deposit", isTestnet);
}

export async function getRedemptionRecord(
    server: rpc.Server,
    brokerAddress: string,
    redeemerAddress: string,
    isTestnet: boolean,
): Promise<BrokerRecordSnapshot> {
    return readBrokerRecord(server, brokerAddress, redeemerAddress, "get_redemption", isTestnet);
}

export async function getSwapRecord(
    server: rpc.Server,
    brokerAddress: string,
    swapperAddress: string,
    isTestnet: boolean,
): Promise<BrokerRecordSnapshot> {
    return readBrokerRecord(server, brokerAddress, swapperAddress, "get_swap", isTestnet);
}

export function logBrokerRecordSnapshot(
    label: string,
    snapshot: BrokerRecordSnapshot,
): void {
    console.info(`[stellar] ${label} exists=${snapshot.exists}`);
    console.info(`[stellar] ${label} retvalXdr=${snapshot.retvalXdr ?? "<none>"}`);
    console.info(`[stellar] ${label} retvalNative=${safeStringify(snapshot.retvalNative ?? null)}`);
}
