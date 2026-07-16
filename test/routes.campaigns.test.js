import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import request from "supertest";
import express from "express";

const tmpDbPath = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "rr-route-test-")), "test.db");
process.env.DB_PATH = tmpDbPath;

const { default: db } = await import("../src/db.js");
const { default: campaignsRouter } = await import("../src/routes/campaigns.js");
const { default: errorHandler } = await import("../src/middleware/errorHandler.js");

const app = express();
app.use(express.json());
app.use("/campaigns", campaignsRouter);
app.use(errorHandler);

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
});

after(() => {
  db.close();
  fs.rmSync(path.dirname(tmpDbPath), { recursive: true, force: true });
});

test("GET /campaigns returns list", async () => {
  const res = await request(app).get("/campaigns");
  assert.equal(res.status, 200);
  assert.equal(res.body.length, 1);
  assert.equal(res.body[0].id, "flood-relief-oaxaca");
});

test("GET /campaigns/:id returns campaign with onChainBalance field", async () => {
  const res = await request(app).get("/campaigns/flood-relief-oaxaca");
  assert.equal(res.status, 200);
  assert.equal(res.body.id, "flood-relief-oaxaca");
  assert.ok("onChainBalance" in res.body);
  assert.equal(res.body.onChainBalance, null); // no escrow_contract_id configured
});

test("GET /campaigns/:id returns 404 for unknown campaign", async () => {
  const res = await request(app).get("/campaigns/does-not-exist");
  assert.equal(res.status, 404);
});
