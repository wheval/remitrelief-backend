# Escrow contract (Soroban / Rust)

Not implemented yet in this scaffold — this is the spec to build during the
hackathon using `soroban-sdk`.

## Storage
- `donor_total: i128` — total held for this campaign
- `milestones: Vec<Milestone>` — each with `{ amount: i128, verified: bool, released: bool }`
- `recipient: Address` — where released funds are sent
- `verifiers: Vec<Address>` — addresses authorized to confirm milestones (relief NGOs)

## Functions
- `deposit(from: Address, amount: i128)` — donor sends funds into escrow
- `verify_milestone(verifier: Address, index: u32)` — authorized verifier marks a milestone complete (requires `verifier.require_auth()`)
- `release(index: u32)` — pays out that milestone's tranche to `recipient`, callable by anyone once `verified == true`
- `balance() -> i128` — read-only, current escrowed amount

## Notes for the demo
- Deploy one contract instance per campaign for the hackathon (simplest to reason about and demo live)
- Use Stellar testnet + Soroban testnet RPC
- `verifiers` can be hardcoded to a couple of demo NGO accounts for the live demo
