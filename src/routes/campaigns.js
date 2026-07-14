import { Router } from "express";
import { getEscrowBalance } from "../services/soroban.js";

const router = Router();

// TODO: replace with real DB; seeded demo data for now
const campaigns = [
  {
    id: "flood-relief-oaxaca",
    name: "Oaxaca Flood Relief",
    location: "Oaxaca, Mexico",
    goal: 20000,
    raised: 6420,
    milestonesTotal: 4,
    milestonesVerified: 1,
    escrowAddress: "CONTRACT_ID_PLACEHOLDER",
    usdcIssuer: "GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN",
  },
];

router.get("/", async (_req, res) => {
  res.json(campaigns);
});

router.get("/:id", async (req, res) => {
  const campaign = campaigns.find((c) => c.id === req.params.id);
  if (!campaign) return res.status(404).json({ error: "not found" });

  const onChainBalance = await getEscrowBalance(campaign.escrowAddress);
  res.json({ ...campaign, onChainBalance });
});

export default router;
