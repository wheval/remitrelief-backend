import db from "../db.js";

let listStmt;
let getCampaignStmt;
let getMilestonesStmt;

function prepareStatements() {
  if (listStmt) return;

  listStmt = db.prepare(`
    SELECT id, name, location, goal_usd, escrow_contract_id, token_contract_id,
           recipient_address, created_at
    FROM campaigns
    ORDER BY created_at DESC
  `);

  getCampaignStmt = db.prepare(`
    SELECT id, name, location, goal_usd, escrow_contract_id, token_contract_id,
           recipient_address, created_at
    FROM campaigns
    WHERE id = ?
  `);

  getMilestonesStmt = db.prepare(`
    SELECT id, campaign_id, contract_index, description, amount_usd, verified,
           released, verified_at, released_at, verifier_address, tx_hash
    FROM milestones
    WHERE campaign_id = ?
    ORDER BY contract_index ASC
  `);
}

export function listCampaigns() {
  prepareStatements();
  return listStmt.all();
}

export function getCampaign(id) {
  prepareStatements();
  const campaign = getCampaignStmt.get(id);
  if (!campaign) return null;

  const milestones = getMilestonesStmt.all(id);
  return { ...campaign, milestones };
}
