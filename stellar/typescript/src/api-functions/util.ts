import { Keypair, rpc, Transaction } from "@stellar/stellar-sdk";
import fs from "fs";

/**********************************************************************************
 * Typescript function that pauses the thread.
 * 
 * @param {number} ms The millliseconds to sleep.
 */
export async function sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
};

export function loadArtifact(path: string) {
    const file = fs.readFileSync(path).toString();
    const json = JSON.parse(file);
    return {
        abi: json.abi,
        bytecode: json.bytecode.object,
    };
}

export function safeStringify(obj: any): string {
    return JSON.stringify(obj, (_, v) => typeof v === "bigint" ? v.toString() : v, 2)
}

export function logRequest(method: "GET" | "POST", url: string, body?: unknown) {
    console.info(`[stellar] ${method} ${url}`);
    if (body !== undefined) {
        console.info(`[stellar] request body: ${safeStringify(body)}`);
    }
}

export function logResponse(method: "GET" | "POST", url: string, body: unknown) {
    console.info(`[stellar] ${method} ${url} -> ${safeStringify(body)}`);
}

export async function signAndSendTx(
    server: rpc.Server,
    xdr: string,
    network: string,
    keypair: Keypair): Promise<string | undefined> {

    console.info(`[stellar] rpc endpoint: ${server.serverURL.toString()}`);
    console.info(`[stellar] submitting signed transaction for ${keypair.publicKey()} xdrLength=${xdr.length}`);
    const tx = new Transaction(xdr, network);
    tx.sign(keypair);
    let resp = await server.sendTransaction(tx);
    if (!resp) {
        throw new Error("No TransactionResponse");
    } else if (resp.errorResult) {
        throw new Error(`error sending transaction: ${resp.errorResult}`);
    } else if (resp.status != "PENDING") {
        throw new Error(`failed to send transaction but with no errorResult: ${resp.status}`);
    }
    console.info(`[stellar] submission accepted with hash ${resp.hash}`);
    return resp.hash
}

export async function prepareSignAndSendTx(
    server: rpc.Server,
    xdr: string,
    network: string,
    keypair: Keypair): Promise<string | undefined> {

    console.info(`[stellar] rpc endpoint: ${server.serverURL.toString()}`);
    console.info(`[stellar] preparing transaction for ${keypair.publicKey()} xdrLength=${xdr.length}`);
    const tx = new Transaction(xdr, network);
    const preparedTx = await server.prepareTransaction(tx);
    console.info(`[stellar] prepared transaction envelope length=${preparedTx.toEnvelope().toXDR("base64").length}`);
    preparedTx.sign(keypair);
    let resp = await server.sendTransaction(preparedTx);
    if (!resp) {
        throw new Error("No TransactionResponse");
    } else if (resp.errorResult) {
        throw new Error(`error sending transaction: ${resp.errorResult}`);
    } else if (resp.status != "PENDING") {
        throw new Error(`failed to send transaction but with no errorResult: ${resp.status}`);
    }
    console.info(`[stellar] submission accepted with hash ${resp.hash}`);
    return resp.hash
}

export async function waitForTx(server: rpc.Server, txHash: string) {
    await sleep(5000);
    console.info(`[stellar] waiting for transaction ${txHash}`);
    const resp = await server.getTransaction(txHash)
    switch (resp.status) {
        case "NOT_FOUND":
            throw new Error(`transaction ${txHash} did not get mined`);
        case "FAILED":
            throw new Error(`transaction ${txHash} failed`);
        default:
            console.info(`[stellar] transaction ${txHash} succeeded`);
    }
}
