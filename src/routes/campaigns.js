import { Router } from "express";
import { listCampaigns, getCampaign } from "../services/campaignsRepo.js";
import { getEscrowBalance } from "../services/soroban.js";

const router = Router();

router.get("/", async (_req, res, next) => {
  try {
    res.json(listCampaigns());
  } catch (err) {
    next(err);
  }
});

router.get("/:id", async (req, res, next) => {
  try {
    const campaign = getCampaign(req.params.id);
    if (!campaign) return res.status(404).json({ error: "not found" });

    let onChainBalance = null;
    if (campaign.escrow_contract_id) {
      onChainBalance = await getEscrowBalance(
        campaign.escrow_contract_id,
        campaign.recipient_address
      );
    }

    res.json({ ...campaign, onChainBalance });
  } catch (err) {
    next(err);
  }
});

export default router;
