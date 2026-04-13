# M1 Global API Client

This repository contains example API clients for [M1 Global](https://m1global.xyz), demonstrating how to deposit collateral, mint and swap USDM tokens, and redeem holdings across multiple blockchain networks.

M1 Global issues two tokens:

- **USDM0** — non-yield-bearing
- **USDM1** — yield-bearing

Clients can deposit collateral to receive USDM tokens, swap between USDM0 and USDM1, and redeem USDM tokens for collateral. The available operations and settlement mechanics vary by chain — see each project's README for details.

## Supported Chains

| Chain | Directory | Description |
|-------|-----------|-------------|
| **EVM (Ethereum)** | [`evm/typescript`](evm/typescript/) | Supports both a standard broker flow (asynchronous, cross-chain messaging) and an atomic broker flow (single-transaction settlement using EIP-712 attestations). |
| **Solana** | [`solana/typescript`](solana/typescript/) | Deposit, swap, and redeem via serialized Solana transaction instructions returned by the M1 API. |
| **Stellar** | [`stellar/typescript`](stellar/typescript/) | Deposit, swap, and redeem via base-64 encoded XDR transactions returned by the M1 API. |
| **Canton** | [`canton/typescript`](canton/typescript/) | Deposit and redeem on a Daml-based Canton ledger using the Canton participant HTTP JSON API. |

Each directory is a self-contained TypeScript/Node.js project with its own README, setup instructions, and environment configuration.

## Prerequisites

All projects require:

- A **Client JWT** issued by M1 Global for API authentication.
- A **whitelisted wallet address** (or party ID on Canton) registered with M1 Global.
- A funded wallet on the appropriate testnet to cover transaction fees.

Contact M1 Global to obtain your Client JWT and register your wallet for whitelisting.

## Getting Started

Navigate to the chain-specific directory of your choice and follow the README there for detailed setup and usage instructions.
