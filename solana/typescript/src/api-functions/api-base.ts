export const M1_API_BASE_URL_ENV = "M1_API_BASE_URL";
export const API_V1_PREFIX = "/api/1.0";
export const API_V2_PREFIX = "/api/2.0";

const TRAILING_SLASH_PATTERN = /\/$/;

function getM1ApiBaseUrl(apiPrefix: string): string {
    const rootUrl = process.env[M1_API_BASE_URL_ENV]?.trim();
    if (!rootUrl) {
        throw new Error(`no ${M1_API_BASE_URL_ENV} set in environment`);
    }
    if (rootUrl.includes(API_V1_PREFIX) || rootUrl.includes(API_V2_PREFIX)) {
        throw new Error(`${M1_API_BASE_URL_ENV} must not include an API version path`);
    }
    return `${rootUrl.replace(TRAILING_SLASH_PATTERN, "")}${apiPrefix}`;
}

export function getM1ApiV1BaseUrl(): string {
    return getM1ApiBaseUrl(API_V1_PREFIX);
}

export function getM1ApiV2BaseUrl(): string {
    return getM1ApiBaseUrl(API_V2_PREFIX);
}
