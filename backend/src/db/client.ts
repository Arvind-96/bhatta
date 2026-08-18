import path from "path";
import mysql from "mysql2/promise";
import { drizzle } from "drizzle-orm/mysql2";
import { migrate } from "drizzle-orm/mysql2/migrator";
import * as schema from "./schema";

// Generated files that need to survive redeploys (e.g. salary slip PDFs)
// live here — independent of the database now that it's a real MySQL
// server rather than a file alongside the app. Overridable via env for
// deployment (e.g. a mounted persistent volume).
export const DATA_DIR = process.env.DATA_DIR ?? path.join(__dirname, "..", "..", "data");

const pool = mysql.createPool({
  host: process.env.DB_HOST ?? "localhost",
  port: process.env.DB_PORT ? Number(process.env.DB_PORT) : 3306,
  user: process.env.DB_USER ?? "root",
  password: process.env.DB_PASSWORD ?? "",
  database: process.env.DB_NAME ?? "bhatta_cloud",
  // Store/read every DATETIME as UTC regardless of the MySQL server's own
  // configured timezone — otherwise a date's round-trip through the driver
  // silently shifts by the server's local offset. The app already does its
  // own timezone-aware date math in JS (season boundaries, day windows,
  // etc.), so what matters here is that whatever goes in comes back out
  // unchanged, not that MySQL applies any conversion of its own.
  timezone: "Z",
});

export const db = drizzle(pool, { schema, mode: "default" });

export async function runMigrations() {
  await migrate(db, { migrationsFolder: path.join(__dirname, "..", "..", "drizzle") });
  console.log(`MySQL ready at ${process.env.DB_HOST ?? "localhost"}:${process.env.DB_PORT ?? 3306}/${process.env.DB_NAME ?? "bhatta_cloud"}`);
}
