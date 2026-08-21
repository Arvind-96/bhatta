import { randomUUID } from "crypto";
import { and, desc, eq, gte, lte } from "drizzle-orm";
import { db } from "../db/client";
import { sandDeliveries, sandContracts, SandDeliveryTractorEntry } from "../db/schema";
import { assertPersonOfType } from "./person.service";
import { addLedgerEntry } from "./ledger.service";
import { emitToKiln } from "../config/socket";

export interface CreateSandDeliveryInput {
  kilnId: string;
  sandContractorId: string;
  contractId?: string;
  tractorUsed?: boolean;
  tractors?: SandDeliveryTractorEntry[];
  trolleyCount: number;
  paymentGiven?: number;
  paymentPending?: number;
  date?: Date;
  notes?: string;
}

async function assertContractMatchesContractor(kilnId: string, contractId: string, sandContractorId: string) {
  const contract = (await db.select().from(sandContracts).where(and(eq(sandContracts._id, contractId), eq(sandContracts.kilnId, kilnId))))[0];
  if (!contract) throw new Error("Referenced sand contract not found in this kiln");
  if (contract.sandContractorId !== sandContractorId) {
    throw new Error("This delivery's contractor does not match the contract's contractor");
  }
}

// Same DUE(total)+PAID(given) pair-of-entries pattern soilArrival.service.ts
// uses for landowners — the field owner's/contractor's profile never needs
// a separate sync step because it reads this same table live.
export async function createSandDelivery(input: CreateSandDeliveryInput) {
  await assertPersonOfType(input.kilnId, input.sandContractorId, ["SAND_CONTRACTOR"]);
  if (input.contractId) await assertContractMatchesContractor(input.kilnId, input.contractId, input.sandContractorId);

  const _id = randomUUID();
  await db.insert(sandDeliveries).values({ ...input, _id });
  const entry = (await db.select().from(sandDeliveries).where(eq(sandDeliveries._id, _id)))[0]!;

  const given = input.paymentGiven ?? 0;
  const pending = input.paymentPending ?? 0;
  const total = given + pending;

  if (total > 0) {
    await addLedgerEntry({
      kilnId: input.kilnId,
      personId: input.sandContractorId,
      direction: "DUE",
      amount: total,
      reason: `Sand delivery: ${input.trolleyCount.toLocaleString()} trolleys`,
      date: input.date,
      category: "SAND",
      contractId: input.contractId,
    });
  }
  if (given > 0) {
    await addLedgerEntry({
      kilnId: input.kilnId,
      personId: input.sandContractorId,
      direction: "PAID",
      amount: given,
      reason: "Payment given for sand delivery",
      date: input.date,
      category: "SAND",
      contractId: input.contractId,
    });
  }

  emitToKiln(input.kilnId, "sandDelivery:update", entry);
  return entry;
}

export interface UpdateSandDeliveryInput {
  contractId?: string;
  tractorUsed?: boolean;
  tractors?: SandDeliveryTractorEntry[];
  trolleyCount?: number;
  paymentGiven?: number;
  paymentPending?: number;
  notes?: string;
}

// Never silently rewrites the amounts already posted — a changed
// given/pending figure posts a correction entry for the difference
// instead, same convention as soilArrival.service.ts's updateSoilArrival.
export async function updateSandDelivery(kilnId: string, entryId: string, input: UpdateSandDeliveryInput) {
  const existing = (await db.select().from(sandDeliveries).where(and(eq(sandDeliveries._id, entryId), eq(sandDeliveries.kilnId, kilnId))))[0];
  if (!existing) throw new Error("Sand delivery not found in this kiln");
  if (input.contractId) await assertContractMatchesContractor(kilnId, input.contractId, existing.sandContractorId);

  const oldGiven = existing.paymentGiven ?? 0;
  const oldPending = existing.paymentPending ?? 0;
  const oldTotal = oldGiven + oldPending;

  await db.update(sandDeliveries).set(input).where(eq(sandDeliveries._id, entryId));
  const updated = (await db.select().from(sandDeliveries).where(eq(sandDeliveries._id, entryId)))[0]!;

  if (input.paymentGiven !== undefined || input.paymentPending !== undefined) {
    const newGiven = updated.paymentGiven ?? 0;
    const newPending = updated.paymentPending ?? 0;
    const newTotal = newGiven + newPending;

    const totalDelta = Math.round((newTotal - oldTotal) * 100) / 100;
    if (totalDelta > 0) {
      await addLedgerEntry({
        kilnId,
        personId: updated.sandContractorId,
        direction: "DUE",
        amount: totalDelta,
        reason: `Sand delivery correction: revised total to ₹${newTotal.toLocaleString("en-IN")}`,
        category: "SAND",
        contractId: updated.contractId ?? undefined,
      });
    } else if (totalDelta < 0) {
      await addLedgerEntry({
        kilnId,
        personId: updated.sandContractorId,
        direction: "PAID",
        amount: -totalDelta,
        reason: `Sand delivery correction: revised total to ₹${newTotal.toLocaleString("en-IN")}`,
        category: "SAND",
        contractId: updated.contractId ?? undefined,
      });
    }

    const givenDelta = Math.round((newGiven - oldGiven) * 100) / 100;
    if (givenDelta > 0) {
      await addLedgerEntry({
        kilnId,
        personId: updated.sandContractorId,
        direction: "PAID",
        amount: givenDelta,
        reason: `Sand delivery correction: additional ₹${givenDelta.toLocaleString("en-IN")} paid`,
        category: "SAND",
        contractId: updated.contractId ?? undefined,
      });
    } else if (givenDelta < 0) {
      await addLedgerEntry({
        kilnId,
        personId: updated.sandContractorId,
        direction: "DUE",
        amount: -givenDelta,
        reason: `Sand delivery correction: payment revised down by ₹${(-givenDelta).toLocaleString("en-IN")}`,
        category: "SAND",
        contractId: updated.contractId ?? undefined,
      });
    }
  }

  emitToKiln(kilnId, "sandDelivery:update", updated);
  return updated;
}

// Reverses this delivery's ledger impact (same delta-correction math
// updateSandDelivery uses, applied against a target of zero) before
// removing the row — mirrors deleteSoilArrival.
export async function deleteSandDelivery(kilnId: string, entryId: string) {
  const existing = (await db.select().from(sandDeliveries).where(and(eq(sandDeliveries._id, entryId), eq(sandDeliveries.kilnId, kilnId))))[0];
  if (!existing) throw new Error("Sand delivery not found in this kiln");

  const given = existing.paymentGiven ?? 0;
  const pending = existing.paymentPending ?? 0;
  const total = given + pending;

  if (total > 0) {
    await addLedgerEntry({
      kilnId,
      personId: existing.sandContractorId,
      direction: "PAID",
      amount: total,
      reason: `Sand delivery deleted: reversing ₹${total.toLocaleString("en-IN")}`,
      category: "SAND",
      contractId: existing.contractId ?? undefined,
    });
  }
  if (given > 0) {
    await addLedgerEntry({
      kilnId,
      personId: existing.sandContractorId,
      direction: "DUE",
      amount: given,
      reason: `Sand delivery deleted: reversing ₹${given.toLocaleString("en-IN")} payment given`,
      category: "SAND",
      contractId: existing.contractId ?? undefined,
    });
  }

  await db.delete(sandDeliveries).where(eq(sandDeliveries._id, entryId));
  emitToKiln(kilnId, "sandDelivery:update", { _id: entryId, deleted: true });
}

export interface ListSandDeliveryFilter {
  sandContractorId?: string;
  contractId?: string;
  from?: Date;
  to?: Date;
}

export async function listSandDeliveries(kilnId: string, filter: ListSandDeliveryFilter = {}) {
  const conditions = [eq(sandDeliveries.kilnId, kilnId)];
  if (filter.sandContractorId) conditions.push(eq(sandDeliveries.sandContractorId, filter.sandContractorId));
  if (filter.contractId) conditions.push(eq(sandDeliveries.contractId, filter.contractId));
  if (filter.from) conditions.push(gte(sandDeliveries.date, filter.from));
  if (filter.to) conditions.push(lte(sandDeliveries.date, filter.to));
  return await db.select().from(sandDeliveries).where(and(...conditions)).orderBy(desc(sandDeliveries.date));
}
