
/**********************************************************************************
 * Typescript function that pauses the thread.
 * 
 * @param {number} ms The millliseconds to sleep.
 */
export async function sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
};

export function safeStringify(value: unknown): string {
    return JSON.stringify(
        value,
        (_, nestedValue) => typeof nestedValue === "bigint" ? nestedValue.toString() : nestedValue
    );
}

export function logRequest(method: "GET" | "POST", url: string, body?: unknown) {
    console.info(`[solana] ${method} ${url}`);
    if (body !== undefined) {
        console.info(`[solana] request body: ${safeStringify(body)}`);
    }
}

export function logResponse(method: "GET" | "POST", url: string, body: unknown) {
    console.info(`[solana] ${method} ${url} -> ${safeStringify(body)}`);
}
