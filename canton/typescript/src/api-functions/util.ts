/**
 * Pauses execution for the given number of milliseconds.
 *
 * @param {number} ms The milliseconds to sleep.
 */
export async function sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
}
