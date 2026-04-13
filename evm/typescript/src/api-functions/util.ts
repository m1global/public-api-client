import fs from "fs";

/**********************************************************************************
 * Typescript function that pauses the thread.
 * 
 * @param {number} ms The milliseconds to sleep.
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
    console.info(`[evm] ${method} ${url}`);
    if (body !== undefined) {
        console.info(`[evm] request body: ${safeStringify(body)}`);
    }
}

export function logResponse(method: "GET" | "POST", url: string, body: unknown) {
    console.info(`[evm] ${method} ${url} -> ${safeStringify(body)}`);
}
