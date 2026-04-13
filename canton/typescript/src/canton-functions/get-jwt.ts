import axios from "axios";

import { CantonKeycloakAuthResponse } from "../interfaces";

/**********************************************************************************
 * Obtains a bearer JWT from the Canton Keycloak instance using the
 * resource-owner password grant.
 *
 * @param {string} keycloakUrl The Keycloak realm base URL
 *  (e.g. "https://auth.example.com/realms/canton").
 * @param {string} clientId The OAuth2 client ID.
 * @param {string} clientSecret The OAuth2 client secret.
 * @param {string} username The customer's Keycloak username.
 * @param {string} password The customer's Keycloak password.
 *
 * @returns {Promise<CantonKeycloakAuthResponse>} The Keycloak token response.
 */
export async function getJwt(
    keycloakUrl: string,
    clientId: string,
    clientSecret: string,
    username: string,
    password: string,
): Promise<CantonKeycloakAuthResponse> {

    const url = `${keycloakUrl}/protocol/openid-connect/token`;

    const params = new URLSearchParams({
        grant_type: "password",
        client_id: clientId,
        client_secret: clientSecret,
        username,
        password,
    });

    const resp = await axios.post<CantonKeycloakAuthResponse>(url, params.toString(), {
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
    });

    return resp.data;
}
