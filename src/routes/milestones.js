import { Router } from "express";
import { releaseMilestoneFunds } from "../services/soroban.js";

const router = Router();

/**
 * Relief-partner NGOs call this once they've confirmed a milestone
 * (e.g. "delivered clean water to 200 households") to trigger a
 * tranche release from the Soroban escrow contract.
 */
router.post("/:id/verify", async (req, res) => {
  const { id } = req.params;
  const { escrowAddress, milestoneIndex, verifierSignature } = req.body;

  if (!escrowAddress || milestoneIndex === undefined || !verifierSignature) {
    return res.status(400).json({ error: "missing required fields" });
  }

  try {
    const result = await releaseMilestoneFunds({
      escrowAddress,
      milestoneIndex,
      verifierSignature,
    });
    res.json({ milestoneId: id, released: true, txHash: result.hash });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "release failed" });
  }
});

export default router;
