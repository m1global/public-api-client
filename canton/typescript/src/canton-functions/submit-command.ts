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
}
