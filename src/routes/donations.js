import { Router } from "express";
import db from "../db.js";

const router = Router();

/**
 * Public transparency ledger: recent donations across all campaigns.
 */
router.get("/", (req, res, next) => {
  try {
    let limit = parseInt(req.query.limit, 10);
    if (!Number.isFinite(limit) || limit <= 0) limit = 50;
    limit = Math.min(limit, 200);

    const rows = db
      .prepare(
        `SELECT id, campaign_id, donor_address, amount_usd, tx_hash, created_at
         FROM donations
         ORDER BY created_at DESC
         LIMIT ?`
      )
      .all(limit);

    res.json(rows);
  } catch (err) {
    next(err);
  }
});

export default router;
