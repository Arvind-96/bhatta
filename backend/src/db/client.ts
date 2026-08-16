import path from "path";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import * as schema from "./schema";

// A real file on disk, not a temp/scratch path — this session already
// relearned twice that a scratch dbpath silently loses data across
// crashes/restarts. Overridable via env for deployment.
const DB_PATH = process.env.SQLITE_PATH ?? path.join(__dirname, "..", "..", "data", "bhatta.db");

// Any other data that needs to survive redeploys (e.g. generated salary
// slip PDFs) belongs alongside the SQLite file, not in a second
// independently-configured location — so it automatically follows
// SQLITE_PATH if that ever points somewhere else (a mounted volume, etc.).
export const DATA_DIR = path.dirname(DB_PATH);

const sqlite = new Database(DB_PATH);
sqlite.pragma("journal_mode = WAL");
sqlite.pragma("foreign_keys = ON");

export const db = drizzle(sqlite, { schema });

export function runMigrations() {
  migrate(db, { migrationsFolder: path.join(__dirname, "..", "..", "drizzle") });
  console.log(`SQLite ready at ${DB_PATH}`);
}
