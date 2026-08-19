import { randomUUID } from "crypto";
import { and, eq, desc } from "drizzle-orm";
import { db } from "../db/client";
import { ledgerEntries, people, LEDGER_PAYMENT_MODES, LEDGER_CATEGORIES } from "../db/schema";
import { emitToKiln } from "../config/socket";

export type LedgerPaymentMode = (typeof LEDGER_PAYMENT_MODES)[number];
export type LedgerCategory = (typeof LEDGER_CATEGORIES)[number];

export interface AddLedgerEntryInput {
  kilnId: string;
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

export async function listLedgerForPerson(kilnId: string, personId: string) {
  return await db
    .select()
    .from(ledgerEntries)
    .where(and(eq(ledgerEntries.kilnId, kilnId), eq(ledgerEntries.personId, personId)))
    .orderBy(desc(ledgerEntries.date));
}

export async function contractLedgerBalance(kilnId: string, contractId: string) {
  const entries = await db
    .select()
    .from(ledgerEntries)
    .where(and(eq(ledgerEntries.kilnId, kilnId), eq(ledgerEntries.contractId, contractId)));
  return entries.reduce((sum: number, e: typeof ledgerEntries.$inferSelect) => sum + (e.direction === "DUE" ? e.amount : -e.amount), 0);
}
