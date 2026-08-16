import { randomUUID } from "crypto";
import { integer, text } from "drizzle-orm/sqlite-core";

// Every table's PK is `_id TEXT` (not `id`) so a plain `SELECT *` already
// matches the JSON shape the frontend has always received from Mongoose —
// no serialization/rename layer needed anywhere in the app.
export function idColumn() {
  return text("_id")
    .primaryKey()
    .$defaultFn(() => randomUUID());
}

export function kilnIdColumn() {
  return text("kilnId").notNull();
}

// Stored as unix-ms integers (SQLite has no native date type) but Drizzle's
// timestamp_ms mode maps them to real JS Date objects on read — so
// `res.json(row)` still serializes to the same ISO-8601 string the
// frontend has always parsed with `new Date(...)`.
export function createdAtColumn() {
  return integer("createdAt", { mode: "timestamp_ms" }).$defaultFn(() => new Date());
}

export function dateColumn(name = "date") {
  return integer(name, { mode: "timestamp_ms" }).$defaultFn(() => new Date());
}
