# M1 Global TypeScript API Client for EVM-based Chains

The M1 Global TypeScript API Client for EVM-based chains is a set of example Node.js scripts that demonstrates how to interact with the M1 API on Ethereum Sepolia. The scripts cover both the standard broker flow (deposit, swap, redeem) and the atomic broker flow (atomic-deposit, atomic-swap, atomic-redeem).

These scripts are intended as reference implementations and are not a comprehensive exploration of the full API feature set.

## API Base URLs

| Environment | Base URL |
|-------------|----------|
| Production  | `https://api.m1global.xyz/api/1.0` |
| Staging     | `https://api-staging.m1global.xyz/api/1.0` |

## Authentication

Most M1 API endpoints require a Client JWT transmitted in the `Authorization` header as a bearer token. Client JWTs have a TTL of 365 days. Contact M1 Global to receive your Client JWT.

## EVM Whitelist

Deposit and redemption operations on both the standard and atomic broker require your Ethereum wallet address to be whitelisted. Swaps are open to all holders of USDM0 or USDM1. Provide your wallet address to M1 Global when you register for your Client JWT.

## Wallet Setup

These scripts use an encrypted keystore file (`wallet.json`) stored at the root of the project. Use the provided `create-wallet` script to generate it:

```
npm run create-wallet -- -p <your password>
```

This writes an encrypted `wallet.json` to the project root and prints the wallet's public address. Provide that address to M1 Global for whitelisting.

If you need to retrieve the public address later:

```
npm run wallet-address -- -wp <your password>
```

The wallet must hold Sepolia ETH to pay for gas. Fund it using the [Sepolia faucet](https://www.alchemy.com/faucets/ethereum-sepolia) or another Sepolia ETH source.

All scripts require the `-wp` flag to decrypt the wallet at runtime:

```
npm run deposit -- -wp <your password>
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

5. **Create a wallet**

   ```
   npm run create-wallet -- -p <your password>
   ```

6. **Fund the wallet** with Sepolia ETH.

7. **Contact M1 Global** to provide your wallet address and receive your Client JWT.

8. **Run a script**, e.g.:

   ```
   npm run deposit -- -wp <your password>
   ```

## Deposits

The standard broker flow uses cross-chain messaging to settle operations. When you submit a deposit, swap, or redemption transaction to Ethereum, the M1 system processes it asynchronously via an off-chain messaging layer before the resulting token transfer is finalized on-chain. This means operations are not instantaneous — the scripts sleep and poll to demonstrate the full settlement cycle.

The standard broker contract address is returned by the `/ethereum/broker/config` endpoint and is separate from the atomic broker contract.

### `deposit.ts`

Deposits mock collateral in exchange for USDM1 on Ethereum Sepolia:

1. Verifies the wallet is whitelisted by the M1 API.
2. Fetches the M1 broker configuration for Ethereum Sepolia.
3. Checks the mock collateral balance; automatically calls the M1 faucet if the balance is insufficient (rate-limited to 10 requests per hour per token).
4. Checks the broker's ERC-20 allowance on the wallet's mock collateral; submits an approve transaction if insufficient.
5. Fetches a `ContractTransaction` from the M1 API, signs it, and submits it to Ethereum Sepolia.
6. Waits 5 minutes for cross-chain messaging to complete minting of USDM1.

```
npm run deposit -- -wp <your password>
```

The deposit amount defaults to `100000000` (100 mock, 6 decimal places).

### `swap.ts`

Swaps USDM1 for USDM0 on Ethereum Sepolia. Run `deposit` first to acquire USDM1. Swaps are not whitelisted — any holder of USDM1 may swap.

1. Fetches the M1 broker configuration for Ethereum Sepolia.
2. Checks the USDM1 balance; aborts if insufficient.
3. Checks the broker's ERC-20 allowance on the wallet's USDM1; submits an approve transaction if insufficient.
4. Fetches a `ContractTransaction` from the M1 API, signs it, and submits it to Ethereum Sepolia.
5. Waits 5 minutes for cross-chain messaging to complete minting of USDM0.

Note: when swapping USDM1 for USDM0 the output amount will always exceed the input amount because USDM1 has a monotonically increasing price.

```
npm run swap -- -wp <your password>
```

The swap amount defaults to `90000000000000000000` (90 USDM1, 18 decimal places).

### `redeem.ts`

Redeems USDM0 for mock collateral on Ethereum Sepolia. Run `deposit` then `swap` first to acquire USDM0.

1. Verifies the wallet is whitelisted by the M1 API.
2. Fetches the M1 broker configuration for Ethereum Sepolia.
3. Checks the USDM0 balance; aborts if insufficient.
4. Checks the broker's ERC-20 allowance on the wallet's USDM0; submits an approve transaction if insufficient.
5. Fetches a `ContractTransaction` from the M1 API, signs it, and submits it to Ethereum Sepolia.
6. Waits approximately 20 minutes for cross-chain messaging to approve and fulfil the redemption.

```
npm run redeem -- -wp <your password>
```

The redemption amount defaults to `10000000000000000000` (10 USDM0, 18 decimal places).

## Atomic Deposits

The atomic broker flow uses off-chain EIP-712 price attestations and permits issued by the M1 API to authorize the deposit or redemption amount at a specific USDM1 price. Because the price and authorization are cryptographically committed to the transaction payload, the broker contract can validate and settle the entire operation in a single on-chain transaction — no cross-chain messaging round-trip is required.

The atomic broker is a distinct contract with a different address from the standard broker. Its address and configuration are returned by the `/ethereum/atomic-broker/config` endpoint. Allowances for the atomic broker must be granted separately from those granted to the standard broker.

### `atomic-deposit.ts`

Deposits mock collateral in exchange for USDM1 atomically in a single transaction:

1. Verifies the wallet is whitelisted by the M1 API.
2. Fetches the M1 atomic broker configuration for Ethereum Sepolia.
3. Checks the mock collateral balance; automatically calls the M1 faucet if the balance is insufficient.
4. Checks the atomic broker's ERC-20 allowance on the wallet's mock collateral; submits an approve transaction if insufficient.
5. Fetches an EIP-712 price attestation for USDM1 from the M1 API.
6. Fetches an EIP-712 deposit permit from the M1 API authorizing the deposit amount.
7. Fetches a `ContractTransaction` from the M1 API (embedding the attestation and permit), signs it, and submits it. USDM1 is minted in the same transaction.

```
npm run atomic-deposit -- -wp <your password>
```

The deposit amount defaults to `100000000` (100 mock, 6 decimal places).

### `atomic-swap.ts`

Swaps USDM1 for USDM0 atomically in a single transaction. Run `atomic-deposit` first to acquire USDM1. Swaps are not whitelisted.

1. Fetches the M1 atomic broker configuration for Ethereum Sepolia.
2. Checks the USDM1 balance; aborts if insufficient.
3. Checks the atomic broker's ERC-20 allowance on the wallet's USDM1; submits an approve transaction if insufficient.
4. Fetches an EIP-712 price attestation for USDM1 from the M1 API.
5. Fetches a `ContractTransaction` from the M1 API (embedding the attestation), signs it, and submits it. USDM0 is minted in the same transaction.

```
npm run atomic-swap -- -wp <your password>
```

The swap amount defaults to `90000000000000000000` (90 USDM1, 18 decimal places).

### `atomic-redeem.ts`

Redeems USDM0 for mock collateral atomically in a single transaction. Run `atomic-deposit` then `atomic-swap` first to acquire USDM0.

1. Verifies the wallet is whitelisted by the M1 API.
2. Fetches the M1 atomic broker configuration for Ethereum Sepolia.
3. Checks the USDM0 balance; aborts if insufficient.
4. Checks the atomic broker's ERC-20 allowance on the wallet's USDM0; submits an approve transaction if insufficient.
5. Fetches an EIP-712 price attestation for USDM1 from the M1 API.
6. Fetches an EIP-712 redeem permit from the M1 API authorizing the redemption amount.
7. Fetches a `ContractTransaction` from the M1 API (embedding the attestation and permit), signs it, and submits it. Collateral is returned in the same transaction.

```
npm run atomic-redeem -- -wp <your password>
```

The redemption amount defaults to `10000000000000000000` (10 USDM0, 18 decimal places).

## Environment Variables

| Variable | Required by | Description |
|---|---|---|
| `M1_API_BASE_URL` | all | M1 API base URL (see above). |
| `M1_API_JWT` | all | M1 Client JWT bearer token. |
| `ETHEREUM_SEPOLIA_RPC_URL` | all | Ethereum Sepolia RPC endpoint URL (e.g. from QuickNode or Infura). |
