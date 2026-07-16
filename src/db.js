import { mkdirSync } from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";

const DB_PATH = process.env.DB_PATH || "./data/remitrelief.db";

const dbDir = path.dirname(DB_PATH);
if (dbDir && dbDir !== ".") {
  mkdirSync(dbDir, { recursive: true });
}

const db = new Database(DB_PATH);
db.pragma("journal_mode = WAL");

export default db;
