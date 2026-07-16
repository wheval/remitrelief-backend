import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";

const tmpDbPath = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "rr-test-")), "test.db");
process.env.DB_PATH = tmpDbPath;

const { default: db } = await import("../src/db.js");
const { listCampaigns, getCampaign } = await import("../src/services/campaignsRepo.js");

before(() => {
  db.exec(`
    CREATE TABLE campaigns (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      location TEXT,
      goal_usd INTEGER NOT NULL,
      escrow_contract_id TEXT,
      token_contract_id TEXT,
      recipient_address TEXT,
      created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
    );
    CREATE TABLE milestones (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      campaign_id TEXT NOT NULL REFERENCES campaigns(id),
      contract_index INTEGER NOT NULL,
      description TEXT,
      amount_usd INTEGER NOT NULL,
      verified INTEGER NOT NULL DEFAULT 0,
      released INTEGER NOT NULL DEFAULT 0,
      verified_at TEXT,
      released_at TEXT,
      verifier_address TEXT,
      tx_hash TEXT,
      UNIQUE(campaign_id, contract_index)
    );
  `);

  db.prepare(
    `INSERT INTO campaigns (id, name, location, goal_usd) VALUES (?, ?, ?, ?)`
  ).run("flood-relief-oaxaca", "Oaxaca Flood Relief", "Oaxaca, Mexico", 20000);

  db.prepare(
    `INSERT INTO milestones (campaign_id, contract_index, description, amount_usd) VALUES (?, ?, ?, ?)`
  ).run("flood-relief-oaxaca", 1, "Second tranche", 5000);
  db.prepare(
    `INSERT INTO milestones (campaign_id, contract_index, description, amount_usd) VALUES (?, ?, ?, ?)`
  ).run("flood-relief-oaxaca", 0, "First tranche", 5000);
});

after(() => {
  db.close();
  fs.rmSync(path.dirname(tmpDbPath), { recursive: true, force: true });
});

test("listCampaigns returns seeded campaign", () => {
  const campaigns = listCampaigns();
  assert.equal(campaigns.length, 1);
  assert.equal(campaigns[0].id, "flood-relief-oaxaca");
});

test("getCampaign returns campaign with milestones ordered by contract_index", () => {
  const campaign = getCampaign("flood-relief-oaxaca");
  assert.ok(campaign);
  assert.equal(campaign.milestones.length, 2);
  assert.equal(campaign.milestones[0].contract_index, 0);
  assert.equal(campaign.milestones[1].contract_index, 1);
});

test("getCampaign returns null for unknown id", () => {
  const campaign = getCampaign("does-not-exist");
  assert.equal(campaign, null);
});
