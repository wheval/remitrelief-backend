import {
  Contract,
  Keypair,
  TransactionBuilder,
  BASE_FEE,
  rpc,
  scValToNative,
  nativeToScVal,
  Address,
} from "@stellar/stellar-sdk";

const SOROBAN_RPC_URL = process.env.SOROBAN_RPC_URL || "https://soroban-testnet.stellar.org";
const NETWORK_PASSPHRASE =
  process.env.STELLAR_NETWORK_PASSPHRASE || "Test SDF Network ; September 2015";

const sorobanServer = new rpc.Server(SOROBAN_RPC_URL);

/**
 * Loads the source account used to submit a transaction. We use the
 * server-held keypair itself as the fee-paying/source account for these
 * backend-submitted invocations (verifier / demo-deployer accounts).
 */
async function loadSourceAccount(publicKey) {
  return sorobanServer.getAccount(publicKey);
}

/**
 * Builds, simulates, signs (if needed), and submits a contract invocation,
 * polling until the transaction reaches a final status.
 */
async function invokeContract({ contractId, method, args = [], signerKeypair }) {
  const sourceAccount = await loadSourceAccount(signerKeypair.publicKey());
  const contract = new Contract(contractId);

  let tx = new TransactionBuilder(sourceAccount, {
    fee: BASE_FEE,
    networkPassphrase: NETWORK_PASSPHRASE,
  })
    .addOperation(contract.call(method, ...args))
    .setTimeout(30)
    .build();

  const simulated = await sorobanServer.simulateTransaction(tx);
  if (rpc.Api.isSimulationError(simulated)) {
    throw new Error(`Simulation failed for ${method}: ${simulated.error}`);
  }

  const prepared = rpc.assembleTransaction(tx, simulated).build();
  prepared.sign(signerKeypair);

  const sendResult = await sorobanServer.sendTransaction(prepared);
  if (sendResult.status === "ERROR") {
    throw new Error(`Submission failed for ${method}: ${JSON.stringify(sendResult.errorResult)}`);
  }

  const hash = sendResult.hash;
  let getResult = await sorobanServer.getTransaction(hash);
  const maxAttempts = 15;
  let attempts = 0;
  while (getResult.status === "NOT_FOUND" && attempts < maxAttempts) {
    await new Promise((resolve) => setTimeout(resolve, 1000));
    getResult = await sorobanServer.getTransaction(hash);
    attempts += 1;
  }

  if (getResult.status !== "SUCCESS") {
    throw new Error(
      `Transaction ${hash} for ${method} did not succeed: ${getResult.status}`
    );
  }

  return { hash, result: getResult };
}

/**
 * Simulates a read-only contract call and returns the decoded native value.
 * No signing/submission needed since `balance()` doesn't mutate state.
 */
async function simulateReadOnly({ contractId, method, args = [], callerPublicKey }) {
  const sourceAccount = await loadSourceAccount(callerPublicKey);
  const contract = new Contract(contractId);

  const tx = new TransactionBuilder(sourceAccount, {
    fee: BASE_FEE,
    networkPassphrase: NETWORK_PASSPHRASE,
  })
    .addOperation(contract.call(method, ...args))
    .setTimeout(30)
    .build();

  const simulated = await sorobanServer.simulateTransaction(tx);
  if (rpc.Api.isSimulationError(simulated)) {
    throw new Error(`Simulation failed for ${method}: ${simulated.error}`);
  }

  if (!simulated.result?.retval) {
    return null;
  }

  return scValToNative(simulated.result.retval);
}

/**
 * Reads the current balance held in an escrow contract by simulating
 * `balance()`. Requires a caller public key purely to build a valid
 * simulation envelope (the call is read-only and requires no signature).
 */
export async function getEscrowBalance(escrowContractId, callerPublicKey) {
  if (!escrowContractId) return null;

  try {
    const value = await simulateReadOnly({
      contractId: escrowContractId,
      method: "balance",
      args: [],
      callerPublicKey,
    });
    return value === null ? null : Number(value);
  } catch (err) {
    console.error(`getEscrowBalance failed for ${escrowContractId}:`, err.message);
    return null;
  }
}

/**
 * Invokes the escrow contract's `verify_milestone` for a given milestone
 * index, signed and submitted by a relief-partner NGO's server-held
 * verifier keypair.
 */
export async function verifyMilestone({ escrowContractId, verifierKeypair, milestoneIndex }) {
  const verifierAddress = Address.fromString(verifierKeypair.publicKey()).toScVal();
  const indexScVal = nativeToScVal(milestoneIndex, { type: "u32" });

  return invokeContract({
    contractId: escrowContractId,
    method: "verify_milestone",
    args: [verifierAddress, indexScVal],
    signerKeypair: verifierKeypair,
  });
}

/**
 * Invokes the escrow contract's `release` for a given milestone index.
 * Per the contract's design, `release` has no caller-auth requirement
 * (the verified-state gate is the authorization boundary), so any funded
 * keypair can submit this once the milestone has been verified.
 */
export async function releaseMilestone({ escrowContractId, submitterKeypair, milestoneIndex }) {
  const indexScVal = nativeToScVal(milestoneIndex, { type: "u32" });

  return invokeContract({
    contractId: escrowContractId,
    method: "release",
    args: [indexScVal],
    signerKeypair: submitterKeypair,
  });
}

/**
 * Convenience helper: builds a Keypair from a raw secret key string.
 * Used to load hardcoded demo NGO verifier accounts / the release
 * submitter account from environment configuration.
 */
export function keypairFromSecret(secret) {
  return Keypair.fromSecret(secret);
}
