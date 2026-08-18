import { randomUUID } from "crypto";
import { and, desc, eq, inArray } from "drizzle-orm";
import { db } from "../db/client";
import { soilArrivals, soilContracts, people } from "../db/schema";
import { assertPersonOfType } from "./person.service";
import { addLedgerEntry } from "./ledger.service";
import { emitToKiln } from "../config/socket";

export interface CreateSoilArrivalInput {
  kilnId: string;
  landownerId: string;
  contractId?: string;
  jcbUsed?: boolean;
  tractorUsed?: boolean;
  jcbDriverId?: string;
  tractorDriverId?: string;
  trolleyCount: number;
  depthFeet?: number;
  paymentGiven?: number;
  paymentPending?: number;
  soilRemaining?: number;
  date?: Date;
  notes?: string;
}

// Same data-integrity guard soilTrip.service.ts uses for its contractId —
// a contract must belong to this kiln and be against the same landowner
// the arrival is being logged for.
async function assertContractMatchesLandowner(kilnId: string, contractId: string, landownerId: string) {
  const contract = (await db.select().from(soilContracts).where(and(eq(soilContracts._id, contractId), eq(soilContracts.kilnId, kilnId))))[0];
  if (!contract) throw new Error("Referenced soil contract not found in this kiln");
  if (contract.landownerId !== landownerId) {
    throw new Error("This arrival's landowner does not match the contract's landowner");
  }
}

async function withPeople(arrival: typeof soilArrivals.$inferSelect) {
  const ids = [arrival.landownerId, arrival.jcbDriverId, arrival.tractorDriverId].filter((v): v is string => !!v);
  const rows = ids.length ? await db.select({ _id: people._id, name: people.name, phone: people.phone }).from(people).where(inArray(people._id, ids)) : [];
  const byId = new Map(rows.map((p) => [p._id, p]));
  return {
    ...arrival,
    landownerId: byId.get(arrival.landownerId) ?? arrival.landownerId,
    jcbDriverId: arrival.jcbDriverId ? byId.get(arrival.jcbDriverId) ?? arrival.jcbDriverId : arrival.jcbDriverId,
    tractorDriverId: arrival.tractorDriverId ? byId.get(arrival.tractorDriverId) ?? arrival.tractorDriverId : arrival.tractorDriverId,
  };
}

// A soil arrival posts straight to the field owner's ledger: the
// combined obligation (payment given + still pending) as one DUE entry,
// and whatever was actually handed over as one PAID entry — so the
// resulting balance is exactly "payment pending" without storing it as a
// separate, driftable figure. The field owner's profile never needs a
// separate sync step because it reads this same table live, filtered to
// that landowner (same pattern as WorkEntry → Thekedar profile).
export async function createSoilArrival(input: CreateSoilArrivalInput) {
  await assertPersonOfType(input.kilnId, input.landownerId, ["LANDOWNER"]);
  if (input.jcbDriverId) await assertPersonOfType(input.kilnId, input.jcbDriverId, ["DRIVER"]);
  if (input.tractorDriverId) await assertPersonOfType(input.kilnId, input.tractorDriverId, ["DRIVER"]);
  if (input.contractId) await assertContractMatchesLandowner(input.kilnId, input.contractId, input.landownerId);

  const _id = randomUUID();
  await db.insert(soilArrivals).values({ ...input, _id });
  const entry = (await db.select().from(soilArrivals).where(eq(soilArrivals._id, _id)))[0]!;

  const given = input.paymentGiven ?? 0;
  const pending = input.paymentPending ?? 0;
  const total = given + pending;

  if (total > 0) {
    await addLedgerEntry({
      kilnId: input.kilnId,
      personId: input.landownerId,
      direction: "DUE",
      amount: total,
      reason: `Soil arrival: ${input.trolleyCount.toLocaleString()} trolleys`,
      date: input.date,
      category: "SOIL",
      contractId: input.contractId,
    });
  }
  if (given > 0) {
    await addLedgerEntry({
      kilnId: input.kilnId,
      personId: input.landownerId,
      direction: "PAID",
      amount: given,
      reason: "Payment given for soil arrival",
      date: input.date,
      category: "SOIL",
      contractId: input.contractId,
    });
  }

  emitToKiln(input.kilnId, "soilArrival:update", entry);
  return entry;
}

export interface UpdateSoilArrivalInput {
  jcbUsed?: boolean;
  tractorUsed?: boolean;
  jcbDriverId?: string;
  tractorDriverId?: string;
  contractId?: string;
  trolleyCount?: number;
  depthFeet?: number;
  paymentGiven?: number;
  paymentPending?: number;
  soilRemaining?: number;
  notes?: string;
}

// Never silently rewrites the amounts already posted — a changed
// given/pending figure posts a correction entry for the difference
// instead, same convention as workEntry.service.ts's delta correction.
export async function updateSoilArrival(kilnId: string, entryId: string, input: UpdateSoilArrivalInput) {
  const existing = (await db.select().from(soilArrivals).where(and(eq(soilArrivals._id, entryId), eq(soilArrivals.kilnId, kilnId))))[0];
  if (!existing) throw new Error("Soil arrival not found in this kiln");

  if (input.jcbDriverId) await assertPersonOfType(kilnId, input.jcbDriverId, ["DRIVER"]);
  if (input.tractorDriverId) await assertPersonOfType(kilnId, input.tractorDriverId, ["DRIVER"]);
  if (input.contractId) await assertContractMatchesLandowner(kilnId, input.contractId, existing.landownerId);

  const oldGiven = existing.paymentGiven ?? 0;
  const oldPending = existing.paymentPending ?? 0;
  const oldTotal = oldGiven + oldPending;

  await db.update(soilArrivals).set(input).where(eq(soilArrivals._id, entryId));
  const updated = (await db.select().from(soilArrivals).where(eq(soilArrivals._id, entryId)))[0]!;

  if (input.paymentGiven !== undefined || input.paymentPending !== undefined) {
    const newGiven = updated.paymentGiven ?? 0;
    const newPending = updated.paymentPending ?? 0;
    const newTotal = newGiven + newPending;

    const totalDelta = Math.round((newTotal - oldTotal) * 100) / 100;
    if (totalDelta > 0) {
      await addLedgerEntry({
        kilnId,
        personId: updated.landownerId,
        direction: "DUE",
        amount: totalDelta,
        reason: `Soil arrival correction: revised total to ₹${newTotal.toLocaleString("en-IN")}`,
        category: "SOIL",
        contractId: updated.contractId ?? undefined,
      });
    } else if (totalDelta < 0) {
      await addLedgerEntry({
        kilnId,
        personId: updated.landownerId,
        direction: "PAID",
        amount: -totalDelta,
        reason: `Soil arrival correction: revised total to ₹${newTotal.toLocaleString("en-IN")}`,
        category: "SOIL",
        contractId: updated.contractId ?? undefined,
      });
    }

    const givenDelta = Math.round((newGiven - oldGiven) * 100) / 100;
    if (givenDelta > 0) {
      await addLedgerEntry({
        kilnId,
        personId: updated.landownerId,
        direction: "PAID",
        amount: givenDelta,
        reason: `Soil arrival correction: additional ₹${givenDelta.toLocaleString("en-IN")} paid`,
        category: "SOIL",
        contractId: updated.contractId ?? undefined,
      });
    } else if (givenDelta < 0) {
      await addLedgerEntry({
        kilnId,
        personId: updated.landownerId,
        direction: "DUE",
        amount: -givenDelta,
        reason: `Soil arrival correction: payment revised down by ₹${(-givenDelta).toLocaleString("en-IN")}`,
        category: "SOIL",
        contractId: updated.contractId ?? undefined,
      });
    }
  }

  emitToKiln(kilnId, "soilArrival:update", updated);
  return updated;
}

export interface ListSoilArrivalFilter {
  landownerId?: string;
  contractId?: string;
}

export async function listSoilArrivals(kilnId: string, filter: ListSoilArrivalFilter = {}) {
  const conditions = [eq(soilArrivals.kilnId, kilnId)];
  if (filter.landownerId) conditions.push(eq(soilArrivals.landownerId, filter.landownerId));
  if (filter.contractId) conditions.push(eq(soilArrivals.contractId, filter.contractId));
  const rows = await db.select().from(soilArrivals).where(and(...conditions)).orderBy(desc(soilArrivals.date));
  return Promise.all(rows.map(withPeople));
}
