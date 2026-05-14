# M1X TypeScript API Client for Stellar

The depredated, legacy deposit, swap, and redeem scripts have been removed in this version and the corresponding broker contract has been paused on-chain.

The M1X TypeScript API Client for Stellar is a set of example Node.js scripts that demonstrates how to interact with the M1 API and the Stellar network using the atomic broker flow on Stellar Testnet.

These scripts are intended as reference implementations and are not a comprehensive exploration of the full API feature set.

## API Base URLs

| Environment | Base URL |
|-------------|----------|
| Production  | `https://api.m1global.xyz/api/1.0` |
| Staging     | `https://api-staging.m1global.xyz/api/1.0` |

## Authentication

Most M1 API endpoints require a Client JWT transmitted in the `Authorization` header as a bearer token. Client JWTs have a TTL of 365 days. Contact M1X to receive your Client JWT.

## Stellar Whitelist

The M1X Stellar deposit and redeem flows require your Stellar public key to be whitelisted. Provide your public key to M1X when you register for your Client JWT.

## Wallet Setup

These scripts use the Stellar CLI to manage keypairs. The keypair secret is passed at runtime via the `-s` flag — no keypair file is stored on disk.

To create and fund a testnet wallet:

```
stellar keys generate alice
stellar keys fund alice
```

To retrieve your secret for use with the scripts:

```
stellar keys secret alice
```

Pass the secret at runtime:

```
npm run atomic-deposit -- -s "$(stellar keys secret alice)"
```

## Scripts

### `atomic-deposit.ts`

Deposits mock collateral in exchange for USDM1 on Stellar Testnet in the atomic broker flow:

1. Verifies the wallet is whitelisted by the M1 API.
2. Fetches the M1 atomic broker configuration for Stellar Testnet.
3. Ensures trustlines exist for MOCK and USDM1, creating them if needed.
4. Checks the MOCK collateral balance; calls the M1 faucet if the balance is insufficient.
5. Checks the broker's allowance on the wallet's MOCK balance; submits an approve transaction if insufficient.
6. Fetches price attestations and a deposit permit from the M1 API.
7. Fetches an atomic deposit transaction (base-64 encoded XDR) from the M1 API, signs it, and submits it to Stellar Testnet.

```
npm run atomic-deposit -- -s "$(stellar keys secret alice)"
```

The deposit amount defaults to `1000000000` (100 MOCK, 7 decimal places).

### `atomic-swap.ts`

Swaps USDM1 for USDM0 on Stellar Testnet in the atomic broker flow. Run `atomic-deposit` first to acquire USDM1.

1. Fetches the M1 atomic broker configuration for Stellar Testnet.
2. Ensures a trustline exists for USDM0, creating it if needed.
3. Checks the USDM1 balance; aborts if insufficient.
4. Checks the broker's allowance on the wallet's USDM1 balance; submits an approve transaction if insufficient.
5. Fetches a price attestation from the M1 API.
6. Fetches an atomic swap transaction (base-64 encoded XDR) from the M1 API, signs it, and submits it to Stellar Testnet.

```
npm run atomic-swap -- -s "$(stellar keys secret alice)"
```

The swap amount defaults to `900000000` (90 USDM1, 7 decimal places).

### `atomic-redeem.ts`

Redeems USDM0 for mock collateral on Stellar Testnet in the atomic broker flow. Run `atomic-deposit` then `atomic-swap` first to acquire USDM0.

1. Fetches the M1 atomic broker configuration for Stellar Testnet.
2. Verifies the wallet is whitelisted by the M1 API.
3. Ensures trustlines exist for USDM0 and MOCK, creating them if needed.
4. Checks the USDM0 balance; aborts if insufficient.
5. Checks the broker's allowance on the wallet's USDM0 balance; submits an approve transaction if insufficient.
6. Fetches price attestations and a redeem permit from the M1 API.
7. Fetches an atomic redemption transaction (base-64 encoded XDR) from the M1 API, signs it, and submits it to Stellar Testnet.

```
npm run atomic-redeem -- -s "$(stellar keys secret alice)"
```

The redemption amount defaults to `100000000` (10 USDM0, 7 decimal places).

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

4. **Create and fund a Stellar testnet wallet** (see [Wallet Setup](#wallet-setup) above).

5. **Contact M1X** to provide your Stellar public key and receive your Client JWT.

6. **Build the project**

   ```
   npm run build
   ```

7. **Run a script**, e.g.:

   ```
   npm run atomic-deposit -- -s "$(stellar keys secret alice)"
   ```

## Environment Variables

| Variable | Required by | Description |
|---|---|---|
| `M1_API_BASE_URL` | all | M1 API base URL (see above). |
| `M1_API_JWT` | all | M1 Client JWT bearer token. |
| `STELLAR_TESTNET_RPC_URL` | all | Stellar Testnet RPC endpoint URL (e.g. from QuickNode). |
