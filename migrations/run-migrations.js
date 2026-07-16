import { readdirSync, readFileSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import Database from "better-sqlite3";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DB_PATH = process.env.DB_PATH || "./data/remitrelief.db";

function run() {
  const dbDir = path.dirname(DB_PATH);
  if (dbDir && dbDir !== ".") {
    mkdirSync(dbDir, { recursive: true });
  }

  const db = new Database(DB_PATH);
  db.pragma("journal_mode = WAL");

  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      name TEXT PRIMARY KEY,
      applied_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
    );
  `);

  const applied = new Set(
    db.prepare("SELECT name FROM schema_migrations").all().map((row) => row.name)
  );

  const files = readdirSync(__dirname)
    .filter((f) => f.endsWith(".sql"))
    .sort();

  const insertMigration = db.prepare(
    "INSERT INTO schema_migrations (name) VALUES (?)"
  );

  for (const file of files) {
    if (applied.has(file)) {
      console.log(`Skipping already-applied migration: ${file}`);
      continue;
    }

    console.log(`Applying migration: ${file}`);
    const sql = readFileSync(path.join(__dirname, file), "utf8");
    const applyMigration = db.transaction(() => {
      db.exec(sql);
      insertMigration.run(file);
    });
    applyMigration();
  }

  db.close();
  console.log("Migrations complete.");
}

run();
