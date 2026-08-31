import { and, asc, eq, lte } from "drizzle-orm";
import { db } from "../db/client";
import { seasons } from "../db/schema";

// Two different meanings of "this season's data" show up across the app:
//   - A period view (this season's dispatches, invoices, attendance, ...)
//     wants a strict eq(table.seasonId, seasonId) — exactly what was
//     recorded during that one season, nothing carried over.
//   - A running/cumulative figure (a person's ledger balance, a customer's
//     due, a stock reconciliation check) wants everything through that
//     season — this season plus every one before it — the same idea as
//     openingPaid/openingDue being a running starting point, just spread
//     across season boundaries instead of one fixed number. This helper
//     resolves that second kind: every seasonId whose season started on or
//     before the given one, for use with drizzle's inArray().
export async function seasonIdsThrough(kilnId: string, seasonId: string): Promise<string[]> {
  const target = (await db.select({ startDate: seasons.startDate }).from(seasons).where(and(eq(seasons._id, seasonId), eq(seasons.kilnId, kilnId))))[0];
  if (!target) return [seasonId];
  const rows = await db
    .select({ _id: seasons._id })
    .from(seasons)
    .where(and(eq(seasons.kilnId, kilnId), lte(seasons.startDate, target.startDate)))
    .orderBy(asc(seasons.startDate));
  return rows.map((r) => r._id);
}

// The current season's id — for aggregates that must always reflect the
// full cumulative picture regardless of which season the request happens to
// be scoped to (e.g. person.service.ts's customerCreditAging: an admin
// chasing an old due needs to see it no matter which season they're
// browsing). seasonIdsThrough(kilnId, currentSeasonId) is "every season so
// far," since nothing is ever newer than current.
export async function getCurrentSeasonId(kilnId: string): Promise<string> {
  const current = (await db.select({ _id: seasons._id }).from(seasons).where(and(eq(seasons.kilnId, kilnId), eq(seasons.isCurrent, true))))[0];
  if (!current) throw new Error("No current season configured for this kiln");
  return current._id;
}

// Every season this kiln has ever had — for the one deliberate exception
// to season-scoping: Compare needs to see across a season boundary to
// compare two periods at all, so its queries pass every seasonId rather
// than one season or a cumulative-through slice.
export async function allSeasonIds(kilnId: string): Promise<string[]> {
  const rows = await db.select({ _id: seasons._id }).from(seasons).where(eq(seasons.kilnId, kilnId));
  return rows.map((r) => r._id);
}
