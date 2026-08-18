import { randomUUID } from "crypto";
import { varchar, datetime } from "drizzle-orm/mysql-core";

// Every table's PK is `_id VARCHAR` (not `id`) so a plain `SELECT *` already
// matches the JSON shape the frontend has always received from Mongoose —
// no serialization/rename layer needed anywhere in the app. Length 64 (not
// 36, the length of a standard randomUUID) because some existing seeded IDs
// (kilns/users) are 24-char legacy hex strings from the pre-SQLite Mongo
// era, not standard UUIDs — headroom avoids truncating those on migration.
export function idColumn() {
  return varchar("_id", { length: 64 })
    .primaryKey()
    .$defaultFn(() => randomUUID());
}

export function kilnIdColumn() {
  return varchar("kilnId", { length: 64 }).notNull();
}

// MySQL's DATETIME with Drizzle's "date" mode returns a real JS Date object
// on read — same as SQLite's timestamp_ms mode did — so `res.json(row)`
// still serializes to the same ISO-8601 string the frontend has always
// parsed with `new Date(...)`. The mysql2 pool connection sets
// `timezone: "Z"` (see db/client.ts) so this round-trips without a
// server-local-offset shift.
export function createdAtColumn() {
  return datetime("createdAt", { mode: "date" }).$defaultFn(() => new Date());
}

export function dateColumn(name = "date") {
  return datetime(name, { mode: "date" }).$defaultFn(() => new Date());
}
