![RemitRelief logo](assets/remitrelief-logo.svg)

# RemitRelief — Backend

API + Soroban escrow logic for RemitRelief.

## Responsibilities
- Serve verified campaign data to the frontend
- Track milestone verification submitted by relief-partner NGOs
- Trigger the Soroban escrow contract to release funds when a milestone
  is confirmed
- Expose donation/payout history for the public transparency ledger view

## Stack
- Node + Express
- `@stellar/stellar-sdk` for reading Horizon and invoking Soroban contracts

## Getting started
```bash
npm install
cp .env.example .env
npm run dev
```

## Project structure
```
src/
  routes/       REST endpoints (campaigns, milestones, donations)
  services/     Stellar/Soroban integration (contract calls, Horizon queries)
  contracts/    Soroban escrow contract interface + deployment notes
```

## Escrow flow
1. Donation lands in the campaign's Soroban escrow contract (frontend triggers this)
2. A relief-partner NGO submits milestone proof via `POST /milestones/:id/verify`
3. Backend calls the escrow contract's `release` function for that milestone's share
4. Funds settle to the recipient's Stellar account / anchor for cash-out
