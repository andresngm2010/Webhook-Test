import fs from "fs";
import path from "path";
import Database from "better-sqlite3";

export function openDbAndMigrate(env) {
  fs.mkdirSync(path.dirname(env.SQLITE_PATH), { recursive: true });

  const db = new Database(env.SQLITE_PATH);
  db.pragma("journal_mode = WAL");
  db.pragma("synchronous = NORMAL");

  db.exec(`
    CREATE TABLE IF NOT EXISTS idempotency (
      history_id TEXT PRIMARY KEY,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS jobs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      history_id TEXT,
      payload_json TEXT NOT NULL,
      status TEXT NOT NULL CHECK (status IN ('pending','in_progress','done','failed','skipped')),
      attempts INTEGER NOT NULL DEFAULT 0,
      last_error TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_jobs_status_created ON jobs(status, created_at);
  `);

  return db;
}
