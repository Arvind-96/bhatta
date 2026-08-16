import Database from "better-sqlite3";
import { mkdirSync } from "fs";
import { dirname } from "path";

const DB_PATH = process.env.LOCAL_DB_PATH ?? "./local-data/bhatta.sqlite";
mkdirSync(dirname(DB_PATH), { recursive: true });

export const db = new Database(DB_PATH);
db.pragma("journal_mode = WAL");

db.exec(`
  CREATE TABLE IF NOT EXISTS production_logs (
    local_id TEXT PRIMARY KEY,
    batch_number TEXT NOT NULL,
    bricks_count INTEGER NOT NULL,
    quality_grade TEXT NOT NULL DEFAULT 'A',
    produced_on TEXT NOT NULL,
    synced INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS stock_entries (
    local_id TEXT PRIMARY KEY,
    type TEXT NOT NULL,
    item_name TEXT NOT NULL,
    quantity REAL NOT NULL,
    unit TEXT NOT NULL DEFAULT 'units',
    synced INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
`);

export interface LocalProductionInput {
  localId: string;
  batchNumber: string;
  bricksCount: number;
  qualityGrade?: string;
}

export function insertProductionLog(input: LocalProductionInput) {
  db.prepare(
    `INSERT INTO production_logs (local_id, batch_number, bricks_count, quality_grade, produced_on)
     VALUES (@localId, @batchNumber, @bricksCount, @qualityGrade, datetime('now'))`
  ).run({ qualityGrade: "A", ...input });
}

export interface LocalStockInput {
  localId: string;
  type: "RAW_MATERIAL" | "FINISHED_GOODS";
  itemName: string;
  quantity: number;
  unit?: string;
}

export function insertStockEntry(input: LocalStockInput) {
  db.prepare(
    `INSERT INTO stock_entries (local_id, type, item_name, quantity, unit)
     VALUES (@localId, @type, @itemName, @quantity, @unit)`
  ).run({ unit: "units", ...input });
}

export function getUnsyncedChanges() {
  const production = db
    .prepare(`SELECT * FROM production_logs WHERE synced = 0`)
    .all() as any[];
  const stock = db.prepare(`SELECT * FROM stock_entries WHERE synced = 0`).all() as any[];
  return { production, stock };
}

export function markProductionSynced(localIds: string[]) {
  const stmt = db.prepare(`UPDATE production_logs SET synced = 1 WHERE local_id = ?`);
  const tx = db.transaction((ids: string[]) => ids.forEach((id) => stmt.run(id)));
  tx(localIds);
}

export function markStockSynced(localIds: string[]) {
  const stmt = db.prepare(`UPDATE stock_entries SET synced = 1 WHERE local_id = ?`);
  const tx = db.transaction((ids: string[]) => ids.forEach((id) => stmt.run(id)));
  tx(localIds);
}
