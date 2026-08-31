import { randomUUID } from "crypto";
import { and, desc, eq } from "drizzle-orm";
import { db } from "../db/client";
import { paymentReceipts, people } from "../db/schema";
import { getBalance } from "./person.service";
import { addLedgerEntry, LedgerPaymentMode } from "./ledger.service";
import { emitToKiln } from "../config/socket";

// Same shape as Dispatch.generateSlipNumber / soilContract's
// generateContractNumber — timestamp + random suffix, no counter to race on.
function generateReceiptNumber() {
  return `RCPT-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
}

async function withPerson(receipt: typeof paymentReceipts.$inferSelect) {
  const person = (
    await db
      .select({ _id: people._id, name: people.name, type: people.type, phone: people.phone })
      .from(people)
      .where(eq(people._id, receipt.personId))
  )[0];
  return { ...receipt, personId: person ?? receipt.personId };
}

export interface CreatePaymentReceiptInput {
  kilnId: string;
  seasonId: string;
  personId: string;
  amountPaid: number;
  totalAgreedAmount?: number;
  paymentMode?: LedgerPaymentMode;
  cashAmount?: number;
  onlineAmount?: number;
  notes?: string;
  date?: Date;
}

// Issuing a receipt is also the money event: it posts one PAID ledger
// entry (same accounting effect as any other settlement in this app) and
// snapshots the before/after balance onto the receipt itself, so a later
// reprint shows exactly what was true when the recipient signed — not
// whatever the balance happens to be by the time someone reprints it.
export async function createPaymentReceipt(input: CreatePaymentReceiptInput) {
  const person = (await db.select().from(people).where(and(eq(people._id, input.personId), eq(people.kilnId, input.kilnId))))[0];
  if (!person) throw new Error("Person not found in this kiln");

  const balanceBefore = await getBalance(input.kilnId, input.personId);
  const receiptNumber = generateReceiptNumber();

  await addLedgerEntry({
    kilnId: input.kilnId,
    personId: input.personId,
    direction: "PAID",
    amount: input.amountPaid,
    reason: `Payment receipt ${receiptNumber}`,
    paymentMode: input.paymentMode,
    cashAmount: input.cashAmount,
    onlineAmount: input.onlineAmount,
    date: input.date,
  });

  const balanceAfter = balanceBefore - input.amountPaid;

  const _id = randomUUID();
  await db.insert(paymentReceipts)
    .values({
      _id,
      kilnId: input.kilnId,
      personId: input.personId,
      receiptNumber,
      amountPaid: input.amountPaid,
      totalAgreedAmount: input.totalAgreedAmount,
      balanceBefore,
      balanceAfter,
      paymentMode: input.paymentMode,
      cashAmount: input.cashAmount,
      onlineAmount: input.onlineAmount,
      notes: input.notes,
      date: input.date,
    });

  const receipt = await withPerson((await db.select().from(paymentReceipts).where(eq(paymentReceipts._id, _id)))[0]!);
  emitToKiln(input.kilnId, "paymentReceipt:update", receipt);
  emitToKiln(input.kilnId, "ledger:update", receipt);
  return receipt;
}

// seasonId is nullable — pass null for an all-time, every-season view (see
// report.service.ts's full person report).
export async function listPaymentReceipts(kilnId: string, seasonId: string | null, personId?: string) {
  const conditions = [eq(paymentReceipts.kilnId, kilnId)];
  if (seasonId) conditions.push(eq(paymentReceipts.seasonId, seasonId));
  if (personId) conditions.push(eq(paymentReceipts.personId, personId));
  const rows = await db.select().from(paymentReceipts).where(and(...conditions)).orderBy(desc(paymentReceipts.date));
  return Promise.all(rows.map(withPerson));
}

export async function getPaymentReceipt(kilnId: string, receiptId: string) {
  const receipt = (await db.select().from(paymentReceipts).where(and(eq(paymentReceipts._id, receiptId), eq(paymentReceipts.kilnId, kilnId))))[0];
  if (!receipt) throw new Error("Payment receipt not found in this kiln");
  return withPerson(receipt);
}

export interface UpdatePaymentReceiptInput {
  amountPaid?: number;
  totalAgreedAmount?: number;
  paymentMode?: LedgerPaymentMode;
  cashAmount?: number;
  onlineAmount?: number;
  notes?: string;
  date?: Date;
}

// Full admin edit — never silently rewrites the PAID entry already posted
// at issue time; a changed amountPaid posts a correction entry for the
// difference instead (same convention as workEntry/soilArrival's delta
// correction), then re-snapshots balanceAfter so a reprint still shows a
// consistent before/after. totalAgreedAmount/paymentMode/notes/date are
// receipt-only fields with no ledger effect, so they're just overwritten.
export async function updatePaymentReceipt(kilnId: string, receiptId: string, input: UpdatePaymentReceiptInput) {
  const existing = (await db.select().from(paymentReceipts).where(and(eq(paymentReceipts._id, receiptId), eq(paymentReceipts.kilnId, kilnId))))[0];
  if (!existing) throw new Error("Payment receipt not found in this kiln");

  const patch: Record<string, unknown> = {};

  if (input.amountPaid !== undefined && input.amountPaid !== existing.amountPaid) {
    const delta = Math.round((input.amountPaid - existing.amountPaid) * 100) / 100;
    if (delta > 0) {
      await addLedgerEntry({
        kilnId,
        personId: existing.personId,
        direction: "PAID",
        amount: delta,
        reason: `Payment receipt ${existing.receiptNumber} correction: revised up to ₹${input.amountPaid.toLocaleString("en-IN")}`,
        paymentMode: input.paymentMode ?? existing.paymentMode ?? undefined,
      });
    } else if (delta < 0) {
      await addLedgerEntry({
        kilnId,
        personId: existing.personId,
        direction: "DUE",
        amount: -delta,
        reason: `Payment receipt ${existing.receiptNumber} correction: revised down to ₹${input.amountPaid.toLocaleString("en-IN")}`,
        paymentMode: input.paymentMode ?? existing.paymentMode ?? undefined,
      });
    }
    patch.balanceAfter = existing.balanceAfter - delta;
    patch.amountPaid = input.amountPaid;
  }

  if (input.totalAgreedAmount !== undefined) patch.totalAgreedAmount = input.totalAgreedAmount;
  if (input.paymentMode !== undefined) patch.paymentMode = input.paymentMode;
  if (input.cashAmount !== undefined) patch.cashAmount = input.cashAmount;
  if (input.onlineAmount !== undefined) patch.onlineAmount = input.onlineAmount;
  if (input.notes !== undefined) patch.notes = input.notes;
  if (input.date !== undefined) patch.date = input.date;

  if (Object.keys(patch).length > 0) {
    await db.update(paymentReceipts).set(patch).where(eq(paymentReceipts._id, receiptId));
  }

  const populated = await withPerson((await db.select().from(paymentReceipts).where(eq(paymentReceipts._id, receiptId)))[0]!);
  emitToKiln(kilnId, "paymentReceipt:update", populated);
  emitToKiln(kilnId, "ledger:update", populated);
  return populated;
}

// Deleting a receipt reverses the exact PAID entry it posted at issue
// time (a DUE correction for the same amount) rather than touching that
// original entry, keeping the ledger an honest append-only trail — then
// removes the receipt document itself so it stops appearing/printing.
export async function deletePaymentReceipt(kilnId: string, receiptId: string) {
  const existing = (await db.select().from(paymentReceipts).where(and(eq(paymentReceipts._id, receiptId), eq(paymentReceipts.kilnId, kilnId))))[0];
  if (!existing) throw new Error("Payment receipt not found in this kiln");

  await addLedgerEntry({
    kilnId,
    personId: existing.personId,
    direction: "DUE",
    amount: existing.amountPaid,
    reason: `Payment receipt ${existing.receiptNumber} deleted — reversing ₹${existing.amountPaid.toLocaleString("en-IN")}`,
    paymentMode: existing.paymentMode ?? undefined,
  });

  await db.delete(paymentReceipts).where(and(eq(paymentReceipts._id, receiptId), eq(paymentReceipts.kilnId, kilnId)));
  emitToKiln(kilnId, "paymentReceipt:update", { _id: receiptId, deleted: true });
  emitToKiln(kilnId, "ledger:update", { _id: receiptId, deleted: true });
}
