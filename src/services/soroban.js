import { Horizon, Contract, rpc } from "@stellar/stellar-sdk";

const HORIZON_URL = process.env.HORIZON_URL || "https://horizon-testnet.stellar.org";
const SOROBAN_RPC_URL = process.env.SOROBAN_RPC_URL || "https://soroban-testnet.stellar.org";

const horizon = new Horizon.Server(HORIZON_URL);
const sorobanServer = new rpc.Server(SOROBAN_RPC_URL);

/**
 * Reads the current balance held in an escrow contract.
 * The escrow contract (see ../contracts/escrow.md) exposes a `balance` fn.
 */
export async function getEscrowBalance(escrowAddress) {
  if (escrowAddress === "CONTRACT_ID_PLACEHOLDER") return 0; // demo seed data
  const contract = new Contract(escrowAddress);
  // In a full implementation: build a simulate-only invoke of `balance`
  // via sorobanServer.simulateTransaction and parse the returned ScVal.
  return contract ? null : null; // placeholder for hackathon scaffold
}

/**
 * Invokes the escrow contract's `release` function for a verified milestone.
 * Requires the relief-partner's verifier signature to authorize release.
 */
export async function releaseMilestoneFunds({ escrowAddress, milestoneIndex, verifierSignature }) {
  // Hackathon scaffold: wire this up to a real signed Soroban invocation:
  //   1. Build the invoke host function operation for `release(milestone_index)`
  //   2. Attach verifierSignature as contract auth
  //   3. Submit via sorobanServer.sendTransaction and poll for status
  console.log(`Releasing milestone ${milestoneIndex} for ${escrowAddress}`);
  return { hash: "PENDING_IMPLEMENTATION" };
}
