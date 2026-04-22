import axios from "axios";

import { CantonTransactionResult, DisclosedContract } from "../interfaces";

/**********************************************************************************
 * Submits a list of DAML commands to the Canton participant and waits for the
 * resulting transaction.
 *
 * @param {string} baseUrl The Canton participant base URL.
 * @param {string} jwt The bearer JWT obtained from Keycloak.
 * @param {unknown[]} commands The list of DAML commands (CreateCommand /
 *  ExerciseCommand objects).
 * @param {string[]} actAs The list of parties that authorise the submission.
 * @param {string} commandIdPrefix A human-readable prefix used to build the
 *  unique commandId for this submission.
 * @param {string} userId The Keycloak user ID (sub claim) of the submitter.
 * @param {DisclosedContract[]} disclosedContracts Contracts disclosed to the
 *  participant so it can validate interface choices without a separate lookup.
 *
 * @returns {Promise<CantonTransactionResult>} The completed transaction result.
 */
export async function submitCommand(
    baseUrl: string,
    jwt: string,
    commands: unknown[],
    actAs: string[],
    commandIdPrefix: string,
    userId: string,
    disclosedContracts: DisclosedContract[] = [],
): Promise<CantonTransactionResult> {

    const commandId = `${commandIdPrefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

    const payload = {
        commands: {
            commands,
            commandId,
            userId,
            applicationId: "canton-client",
            actAs,
            disclosedContracts: disclosedContracts.map((dc) => ({
                contractId: dc.contractId,
                templateId: dc.templateId,
                createdEventBlob: dc.createdEventBlob,
                synchronizerId: "",
            })),
        },
    };

    try {
        const resp = await axios.post<CantonTransactionResult>(
            `${baseUrl}/v2/commands/submit-and-wait-for-transaction`,
            payload,
            {
                headers: {
                    Authorization: `Bearer ${jwt}`,
                    "Content-Type": "application/json",
                },
            },
        );

        return resp.data;
    } catch (error: unknown) {
        if (!axios.isAxiosError(error)) {
            throw error;
        }

        const status = error.response?.status;
        const responseData = error.response?.data;
        const cantonCode = typeof responseData?.code === "string" ? responseData.code : undefined;
        const cantonCause = typeof responseData?.cause === "string" ? responseData.cause : undefined;
        const prettyResponse = responseData === undefined
            ? "no response body"
            : JSON.stringify(responseData, null, 2);

        const messageParts = [
            `Canton command submission failed for ${commandIdPrefix}`,
            status ? `(HTTP ${status})` : "",
            cantonCode ? `with code ${cantonCode}` : "",
            cantonCause ? `: ${cantonCause}` : `: ${error.message}`,
        ].filter(Boolean);

        throw new Error(`${messageParts.join(" ")}\n${prettyResponse}`);
    }
}
