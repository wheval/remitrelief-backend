![RemitRelief logo](assets/remitrelief-logo.svg)

# RemitRelief — Backend

Backend for RemitRelief, a disaster-relief microdonation platform on Stellar.
Donors send USDC to relief campaigns; funds sit in a per-campaign Soroban
escrow contract and release to the recipient only once an authorized
relief-partner NGO verifies that a milestone was met.

This repo contains:
- An Express REST API (campaigns, milestones, donations) backed by SQLite
- The Soroban escrow smart contract itself (Rust), under
  `src/contracts/escrow-contract/`

## Status

**Testnet only, pre-audit.** This code has not undergone a third-party
security review and should not be used to hold real funds. See
[Escrow contract](#escrow-contract) below for the contract's design notes.

## Stack
- Node + Express
- `better-sqlite3` for persistence
- `@stellar/stellar-sdk` for Soroban RPC simulate/invoke calls
- `soroban-sdk` (Rust) for the escrow contract

## Getting started

```bash
npm install
cp .env.example .env
npm run migrate
npm run dev
```

The API listens on `PORT` (default `4000`). `npm run migrate` creates the
SQLite database (default path `./data/remitrelief.db`) and applies any
pending migrations from `migrations/`.

## Project structure
```
migrations/           SQL migrations + migration runner
src/
  db.js               better-sqlite3 connection (WAL mode)
  routes/             REST endpoints (campaigns, milestones, donations)
  services/            campaignsRepo (SQLite reads), soroban (RPC calls)
  middleware/          centralized Express error handler
  contracts/
    escrow.md          contract design notes
    escrow-contract/    the Soroban escrow contract (Rust crate)
test/                 node:test test suite
```

## API

- `GET /campaigns` — list all campaigns
- `GET /campaigns/:id` — campaign detail, including its milestones and a
  live `onChainBalance` read from the escrow contract
- `POST /milestones/:id/verify` — relief-partner NGO confirms a milestone;
  submits `verify_milestone` on-chain
- `POST /milestones/:id/release` — releases a verified milestone's funds;
  submits `release` on-chain
- `GET /donations?limit=N` — recent donations across all campaigns, for the
  public transparency ledger (default 50, capped at 200)
- `GET /health` — liveness check

## Escrow contract

One escrow contract instance is deployed per campaign. Storage and public
functions:

- `Milestone { amount: i128, verified: bool, released: bool }`
- Constructor (`__constructor`): sets `token`, `recipient`, `verifiers`, and
  the fixed list of milestone amounts, atomically at deploy time (Protocol
  22+ constructor — no separate `initialize()` call, avoiding
  reinitialization/front-running issues)
- `deposit(donor, amount)` — donor sends funds into escrow (requires donor
  auth)
- `verify_milestone(verifier, index)` — an authorized verifier marks a
  milestone complete (requires verifier auth; verifier must be in the
  contract's `verifiers` list)
- `release(index)` — pays out that milestone's tranche to `recipient` once
  verified. Callable by anyone once verified — the verified-state gate is
  the authorization boundary, not caller identity, and funds only ever move
  to the fixed `recipient` address
- `balance()` — read-only, current token balance held by the contract

See `src/contracts/escrow-contract/src/lib.rs` for the implementation and
`src/contracts/escrow-contract/src/test.rs` for the test suite (full
deposit → verify → release flow, unauthorized verifier rejection, double
verify/release rejection, release-before-verify rejection, non-positive
deposit rejection).

### Building and testing the contract

```bash
cd src/contracts/escrow-contract
cargo test
cargo build --release --target wasm32-unknown-unknown
```

### Deploying to testnet

```bash
cd src/contracts/escrow-contract
./scripts/deploy-testnet.sh \
  --source <deployer-identity> \
  --token <token-contract-id> \
  --recipient <recipient-address> \
  --verifiers <addr1,addr2,...> \
  --milestone-amounts <amt1,amt2,...>
```

Verifier accounts are currently hardcoded demo NGO accounts held
server-side by the backend (see `DEPLOYER_SECRET_KEY` in `.env.example`) —
this is a testnet simplification, not a production credential model.

## Escrow flow

1. A donor deposits USDC into the campaign's Soroban escrow contract
2. A relief-partner NGO submits milestone proof via
   `POST /milestones/:id/verify`, which calls `verify_milestone` on-chain
3. The backend (or anyone) calls `POST /milestones/:id/release`, which
   calls `release` on-chain and pays out that milestone's tranche to the
   recipient
4. Funds settle to the recipient's Stellar account / anchor for cash-out
