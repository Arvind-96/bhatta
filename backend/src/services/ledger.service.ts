import { randomUUID } from "crypto";
import { and, eq, desc, gte, inArray, lte } from "drizzle-orm";
import { db } from "../db/client";
import { ledgerEntries, people, LEDGER_PAYMENT_MODES, LEDGER_CATEGORIES, PERSON_TYPES } from "../db/schema";
import { emitToKiln } from "../config/socket";

export type LedgerPaymentMode = (typeof LEDGER_PAYMENT_MODES)[number];
export type LedgerCategory = (typeof LEDGER_CATEGORIES)[number];

export interface AddLedgerEntryInput {
  kilnId: string;
  // Optional, unlike every other seasonId — addLedgerEntry is called from
  // dozens of create/update/correction paths across the app, several of
  // which don't have a natural "current" season in scope (a correction
  // entry belongs with the original transaction, not necessarily today's
  // season). Set it when it's naturally available (the handful of
  // contractor/operator "this season's production" summaries filter by
  // it); a ledger entry with no seasonId simply doesn't count toward any
  // of those season-scoped tallies — it's never used for balance math,
  // which stays deliberately all-time regardless (see listLedgerForPerson).
  seasonId?: string;
  personId: string;
  direction: "DUE" | "PAID";
  amount: number;
  reason: string;
  date?: Date;
  contractId?: string;
  paymentMode?: LedgerPaymentMode;
  cashAmount?: number;
  onlineAmount?: number;
  category?: LedgerCategory;
  // See ledgerEntries.isReversal's own schema comment — set this only when
  // posting a PAID entry purely to zero out a DUE liability that's being
  // cancelled/reattributed/corrected down, never for a real settlement.
  isReversal?: boolean;
}

// Every ledger write funnels through here, so this is the one place that
// has to check the person actually exists *in this kiln* — without it, a
// stale/cross-kiln/typo'd personId would silently create a balance for the
// wrong record (or one that isn't there), and nobody would notice until
// the money didn't add up.
export async function addLedgerEntry(input: AddLedgerEntryInput) {
  const person = (await db.select({ _id: people._id }).from(people).where(and(eq(people._id, input.personId), eq(people.kilnId, input.kilnId))))[0];
  if (!person) throw new Error("Referenced person not found in this kiln");

  const _id = randomUUID();
  await db.insert(ledgerEntries).values({ ...input, _id });
  const entry = (await db.select().from(ledgerEntries).where(eq(ledgerEntries._id, _id)))[0]!;
  emitToKiln(input.kilnId, "ledger:update", entry);
  return entry;
}

export interface UpdateLedgerEntryInput {
  direction?: "DUE" | "PAID";
  amount?: number;
  reason?: string;
  date?: Date;
  paymentMode?: LedgerPaymentMode;
  cashAmount?: number;
  onlineAmount?: number;
  category?: LedgerCategory;
}

// The admin editing/deleting a past Advance/Kharchi/Festival/Medical/Bill
// entry directly mutates or removes that row — a deliberate choice (per
// the admin) over the delta-correction pattern used elsewhere in this
// file, so a mis-entered amount can just be fixed instead of leaving a
// trail of offsetting entries.
export async function updateLedgerEntry(kilnId: string, entryId: string, input: UpdateLedgerEntryInput) {
  const existing = (await db.select().from(ledgerEntries).where(and(eq(ledgerEntries._id, entryId), eq(ledgerEntries.kilnId, kilnId))))[0];
  if (!existing) throw new Error("Ledger entry not found in this kiln");

  await db.update(ledgerEntries).set(input).where(eq(ledgerEntries._id, entryId));
  const updated = (await db.select().from(ledgerEntries).where(eq(ledgerEntries._id, entryId)))[0]!;
  emitToKiln(kilnId, "ledger:update", updated);
  return updated;
}

export async function deleteLedgerEntry(kilnId: string, entryId: string) {
  const existing = (await db.select().from(ledgerEntries).where(and(eq(ledgerEntries._id, entryId), eq(ledgerEntries.kilnId, kilnId))))[0];
  if (!existing) throw new Error("Ledger entry not found in this kiln");

  await db.delete(ledgerEntries).where(eq(ledgerEntries._id, entryId));
  emitToKiln(kilnId, "ledger:update", { _id: entryId, deleted: true });
}

// Deliberately season-agnostic (no seasonId filter) — a person's overall
// ledger balance is a running total across their whole relationship with
// the kiln, the same "carries forward, never resets" idea as a Customer's
// openingPaid/openingDue. Every ledger entry does still carry a seasonId
// (see AddLedgerEntryInput) for the handful of "this season's production"
// contractor/operator summaries that filter by it directly.
export async function listLedgerForPerson(kilnId: string, personId: string) {
  return await db
    .select()
    .from(ledgerEntries)
    .where(and(eq(ledgerEntries.kilnId, kilnId), eq(ledgerEntries.personId, personId)))
    .orderBy(desc(ledgerEntries.date));
}

export interface ListLedgerForKilnFilter {
  personId?: string;
  // A whole gang at once (a contractor + everyone linked to them) — see
  // person.service.ts's resolveContractorGang. Combined with personId via
  // OR (either matches) rather than replacing it, so a caller can pass
  // just one or the other.
  personIds?: string[];
  personType?: (typeof PERSON_TYPES)[number];
  category?: (typeof LEDGER_CATEGORIES)[number];
  from?: Date;
  to?: Date;
}

// Kiln-wide ledger query (contrast with listLedgerForPerson above, which
// requires a personId) — the direct data source for the Labour/Contractor/
// Staff report, so the admin can pull "everyone's kharchi this week" as
// easily as "just this one labourer's."
export async function listLedgerForKiln(kilnId: string, filter: ListLedgerForKilnFilter = {}) {
  const conditions = [eq(ledgerEntries.kilnId, kilnId)];
  if (filter.personId) conditions.push(eq(ledgerEntries.personId, filter.personId));
  if (filter.personIds && filter.personIds.length > 0) conditions.push(inArray(ledgerEntries.personId, filter.personIds));
  if (filter.category) conditions.push(eq(ledgerEntries.category, filter.category));
  if (filter.from) conditions.push(gte(ledgerEntries.date, filter.from));
  if (filter.to) conditions.push(lte(ledgerEntries.date, filter.to));

  let personIdsOfType: Set<string> | undefined;
  if (filter.personType) {
    const rows = await db.select({ _id: people._id }).from(people).where(and(eq(people.kilnId, kilnId), eq(people.type, filter.personType)));
    personIdsOfType = new Set(rows.map((r) => r._id));
    if (personIdsOfType.size === 0) return [];
    conditions.push(inArray(ledgerEntries.personId, Array.from(personIdsOfType)));
  }

  const rows = await db.select().from(ledgerEntries).where(and(...conditions)).orderBy(desc(ledgerEntries.date));
  const personIds = [...new Set(rows.map((r) => r.personId))];
  if (personIds.length === 0) return rows;
  const peopleRows = await db.select({ _id: people._id, name: people.name, type: people.type }).from(people).where(inArray(people._id, personIds));
  const personById = new Map(peopleRows.map((p) => [p._id, p]));
  return rows.map((r) => ({ ...r, personId: personById.get(r.personId) ?? r.personId }));
}

export async function contractLedgerBalance(kilnId: string, contractId: string) {
  const entries = await db
    .select()
    .from(ledgerEntries)
    .where(and(eq(ledgerEntries.kilnId, kilnId), eq(ledgerEntries.contractId, contractId)));
  return entries.reduce((sum: number, e: typeof ledgerEntries.$inferSelect) => sum + (e.direction === "DUE" ? e.amount : -e.amount), 0);
}
