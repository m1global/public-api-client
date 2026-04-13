# M1 Global TypeScript API Client for Solana

The M1 Global TypeScript API Client for Solana is a set of example Node.js scripts that demonstrates how to interact with the M1 API and the Solana network to deposit mock collateral, swap USDM1 for USDM0, and redeem USDM0 for collateral on Solana Devnet.

These scripts are intended as reference implementations and are not a comprehensive exploration of the full API feature set.

## API Base URLs

| Environment | Base URL |
|-------------|----------|
| Production  | `https://api.m1global.xyz/api/1.0` |
| Staging     | `https://api-staging.m1global.xyz/api/1.0` |

## Authentication

Most M1 API endpoints require a Client JWT transmitted in the `Authorization` header as a bearer token. Client JWTs have a TTL of 365 days. Contact M1 Global to receive your Client JWT.

## Solana Whitelist

The M1 Global Solana deposit and redeem flows require your Solana public key to be whitelisted. Provide your public key to M1 Global when you register for your Client JWT.

## Wallet Setup

These scripts use a keypair stored as `id.json` at the root of the project. Use the provided `create-keypair` script to generate it:

```
npm run create-keypair
```

This writes a new Solana keypair to `id.json`. The public key is printed to the console — provide it to M1 Global for whitelisting.

The wallet must hold SOL to pay for transaction fees. Fund it using the [Solana Devnet faucet](https://faucet.solana.com/).

## Scripts

### `deposit.ts`

Deposits mock collateral in exchange for USDM1 on Solana Devnet:

1. Verifies the wallet is whitelisted by the M1 API.
2. Fetches the M1 treasury configuration for Solana Devnet.
3. Idempotently creates Associated Token Accounts (ATAs) for MOCK and USDM1 if they do not exist.
4. Checks the MOCK collateral balance; calls the M1 faucet if the balance is insufficient (rate-limited to 10 requests per hour per token).
5. Fetches a serialized `TransactionInstruction` from the M1 API, signs it, and submits it to Solana Devnet.

```
npm run deposit
```

The deposit amount defaults to `100000000` (100 MOCK, 6 decimal places).

### `swap.ts`

Swaps USDM1 for USDM0 on Solana Devnet. Run `deposit` first to acquire USDM1.

1. Fetches the M1 treasury configuration for Solana Devnet.
2. Idempotently creates an ATA for USDM0 if it does not exist.
3. Checks the USDM1 balance; aborts if insufficient.
4. Fetches a serialized `TransactionInstruction` from the M1 API, signs it, and submits it to Solana Devnet.

```
npm run swap
```

The swap amount defaults to `90000000000` (90 USDM1 in base units).

### `redeem.ts`

Redeems USDM0 for mock collateral on Solana Devnet. Run `swap` first to acquire USDM0.

1. Verifies the wallet is whitelisted by the M1 API.
2. Fetches the M1 treasury configuration for Solana Devnet.
3. Checks the USDM0 balance; aborts if insufficient.
4. Fetches a serialized `TransactionInstruction` from the M1 API, signs it, and submits it to Solana Devnet.

```
npm run redeem
```

The redemption amount defaults to `100000000` (0.1 USDM0 in base units).

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

5. **Generate a keypair**

   ```
   npm run create-keypair
   ```

6. **Fund the wallet** with Devnet SOL at [faucet.solana.com](https://faucet.solana.com/).

7. **Contact M1 Global** to provide your Solana public key and receive your Client JWT.

8. **Run a script**, e.g.:

   ```
   npm run deposit
   ```

## Environment Variables

| Variable | Required by | Description |
|---|---|---|
| `M1_API_BASE_URL` | all | M1 API base URL (see above). |
| `M1_API_JWT` | all | M1 Client JWT bearer token. |
| `SOLANA_DEVNET_RPC_URL` | all | Solana Devnet RPC endpoint URL (e.g. from QuickNode). |
