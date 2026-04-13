# M1 Global TypeScript API Client for Canton

The M1 Global TypeScript API Client for Canton is a set of example Node.js scripts that demonstrates how to interact with the M1 API and the Canton participant HTTP JSON API (v2) to deposit collateral, redeem USDM1, and inspect holdings on a Daml-based Canton ledger.

These scripts are intended as reference implementations and are not a comprehensive exploration of the full API feature set.

## API Base URLs

| Environment | Base URL |
|-------------|----------|
| Production  | `https://api.m1global.xyz/api/1.0` |
| Staging     | `https://api-staging.m1global.xyz/api/1.0` |

## Authentication

### M1 API JWT

Most M1 API endpoints require a Client JWT transmitted in the `Authorization` header as a bearer token. Client JWTs have a TTL of 365 days. Contact M1 Global to receive your Client JWT.

### Canton JWT (Keycloak)

Canton ledger operations require a separate bearer JWT issued by the Canton Keycloak instance. The scripts obtain this automatically at runtime using the OAuth2 resource-owner password grant — no manual token management is needed. You will need a Keycloak client ID, client secret, username, and password for your Canton deployment.

## Canton Whitelist

The M1 Global Canton deposit flow requires your Canton party ID to be whitelisted. Provide your `CANTON_PARTY_ID` to M1 Global when you register for your Client JWT.

## Scripts

### `deposit.ts`

Performs a full Canton collateral deposit in exchange for USDM1:

1. Authenticates against Keycloak to obtain a Canton bearer JWT.
2. Fetches static Canton broker metadata from the M1 API.
3. Queries the customer's Active Contract Set (ACS) to resolve live contract IDs.
4. Captures the current collateral holdings as a baseline.
5. Exercises `AllocationFactory_RequestMint` to create a `MintRequest`.
6. Calls the M1 API Canton faucet with the `MintRequest` CID.
7. Polls the M1 API operations endpoint until the faucet approval settles.
8. Polls the customer ACS for the newly minted collateral Holding.
9. Gets or creates a `RecipientMintAuth` contract for the customer.
10. Exercises `AtomicBroker::CreateDepositRequest` — transfers collateral to the broker and creates a `DepositRequest`. The broker admin later calls `ProcessDepositAtomic` to settle the transfer and mint USDM1.

```
npm run deposit
```

The deposit amount defaults to `100` and can be overridden via `CANTON_DEPOSIT_AMOUNT`.

### `redeem.ts`

Redeems a customer USDM1 holding for collateral via the AtomicBroker:

1. Authenticates against Keycloak to obtain a Canton bearer JWT.
2. Fetches static Canton broker metadata from the M1 API.
3. Resolves required contracts from the broker bundle and customer ACS.
4. Exercises `AtomicBroker::CreateRedemptionRequest` using the selected USDM1 holding.
5. Polls the customer ACS for the resulting collateral `TransferOffer`.
6. Exercises `TransferInstruction_Accept` on the offer to complete collateral delivery.

Takes the USDM1 holding contract ID as a CLI argument (use `listAllMyUSDM1Holdings.ts` to find it):

```
npm run redeem -- <USDM1_HOLDING_CID>
```

### `listAllMyUSDM1Holdings.ts`

Queries the customer's ACS and prints all active USDM1 holdings, sorted largest-to-smallest, with their CID, amount, and lock status. Use this to identify which holding CID to pass to `redeem.js`.

```
npm run list-holdings
```

## Getting Started

1. **Install dependencies**

   ```
   npm install
   ```

2. **Copy the example env file**

   ```
   cp .env.example .env
   ```

3. **Edit `.env`** and fill in all required values (see [Environment Variables](#environment-variables) below).

4. **Build the project**

   ```
   npm run build
   ```

5. **Run a script**, e.g.:

   ```
   npm run deposit
   ```

## Environment Variables

| Variable | Required by | Description |
|---|---|---|
| `M1_API_BASE_URL` | all | M1 API base URL (see above). |
| `M1_API_JWT` | all | M1 Client JWT bearer token. |
| `CANTON_BASE_URL` | all | Canton participant HTTP JSON API base URL. |
| `CANTON_KEYCLOAK_URL` | all | Keycloak realm base URL (e.g. `https://auth.example.com/realms/canton`). |
| `CANTON_KEYCLOAK_CLIENT_ID` | all | OAuth2 client ID for Keycloak. |
| `CANTON_KEYCLOAK_CLIENT_SECRET` | all | OAuth2 client secret for Keycloak. |
| `CANTON_PARTY_ID` | all | Your Canton party ID. |
| `CANTON_USER_ID` | deposit | Your Keycloak user ID (`sub` claim). |
| `CANTON_USERNAME` | all | Your Keycloak username. |
| `CANTON_PASSWORD` | all | Your Keycloak password. |
| `CANTON_COLLATERAL_REGISTRAR` | deposit, redeem | Canton party ID of the collateral registrar. |
| `CANTON_DEPOSIT_AMOUNT` | deposit | Amount of collateral to deposit (default: `100`). |
| `UTILITY_REGISTRY_V0_PACKAGE_ID` | deposit, redeem | Package ID for `utility-registry-v0`. |
| `UTILITY_REGISTRY_APP_V0_PACKAGE_ID` | deposit, redeem | Package ID for `utility-registry-app-v0`. |
| `UTILITY_REGISTRY_HOLDING_V0_PACKAGE_ID` | all | Package ID for `utility-registry-holding-v0`. |

Package IDs are content-addressed hashes and are the same across all Canton environments that use the same DAR version. The `TRANSFER_INSTRUCTION_V1_PACKAGE_ID` constant used internally is hardcoded in `src/consts.ts` for the same reason.
