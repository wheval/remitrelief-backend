import { Router } from "express";
import db from "../db.js";
import { verifyMilestone, releaseMilestone, keypairFromSecret } from "../services/soroban.js";

const router = Router();

/**
 * Demo NGO verifier accounts, held server-side (see src/contracts/escrow.md).
 * In production these would be per-partner secrets loaded from a secrets
 * manager, not process env vars — this is a testnet/demo simplification.
 */
function getVerifierKeypair() {
  const secret = process.env.DEPLOYER_SECRET_KEY;
  if (!secret) {
    throw new Error("No verifier/submitter secret key configured (DEPLOYER_SECRET_KEY)");
  }
  return keypairFromSecret(secret);
}

const getMilestoneStmt = db.prepare(`
  SELECT m.*, c.escrow_contract_id
  FROM milestones m
  JOIN campaigns c ON c.id = m.campaign_id
  WHERE m.id = ?
`);

const markVerifiedStmt = db.prepare(`
  UPDATE milestones
  SET verified = 1, verified_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), verifier_address = ?
  WHERE id = ?
`);

const markReleasedStmt = db.prepare(`
  UPDATE milestones
  SET released = 1, released_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), tx_hash = ?
  WHERE id = ?
`);

/**
 * Relief-partner NGOs call this once they've confirmed a milestone
 * (e.g. "delivered clean water to 200 households") to submit an
 * on-chain `verify_milestone` invocation against the escrow contract.
 */
router.post("/:id/verify", async (req, res) => {
  try {
    const { id } = req.params;
    const milestone = getMilestoneStmt.get(id);
    if (!milestone) return res.status(404).json({ error: "milestone not found" });
    if (!milestone.escrow_contract_id) {
      return res.status(400).json({ error: "campaign has no escrow contract configured" });
    }

    const verifierKeypair = getVerifierKeypair();
    const { hash } = await verifyMilestone({
      escrowContractId: milestone.escrow_contract_id,
      verifierKeypair,
      milestoneIndex: milestone.contract_index,
    });

    markVerifiedStmt.run(verifierKeypair.publicKey(), id);
    res.json({ milestoneId: id, verified: true, txHash: hash });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "verify failed" });
  }
});

/**
 * Triggers the escrow contract's `release` for a verified milestone,
 * paying out that milestone's tranche to the campaign recipient.
 */
router.post("/:id/release", async (req, res) => {
  try {
    const { id } = req.params;
    const milestone = getMilestoneStmt.get(id);
    if (!milestone) return res.status(404).json({ error: "milestone not found" });
    if (!milestone.escrow_contract_id) {
      return res.status(400).json({ error: "campaign has no escrow contract configured" });
    }

    const submitterKeypair = getVerifierKeypair();
    const { hash } = await releaseMilestone({
      escrowContractId: milestone.escrow_contract_id,
      submitterKeypair,
      milestoneIndex: milestone.contract_index,
    });

    markReleasedStmt.run(hash, id);
    res.json({ milestoneId: id, released: true, txHash: hash });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "release failed" });
  }
});

export default router;
