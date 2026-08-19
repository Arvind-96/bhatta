import { randomUUID } from "crypto";
import { and, asc, desc, eq, gte, inArray, lte } from "drizzle-orm";
import { db } from "../db/client";
import { moldingEntries, people, ledgerEntries } from "../db/schema";
import { addLedgerEntry } from "./ledger.service";
import { assertPersonOfType } from "./person.service";
import { emitToKiln } from "../config/socket";

export interface CreateMoldingInput {
  kilnId: string;
  workerId: string;
  bricksCount: number;
  ratePerThousand: number;
  damagedCount?: number;
  date?: Date;
  washedOut?: boolean;
  notes?: string;
}

// washedOut = rain destroyed the kacchi bricks before they could dry — the
// count is still logged for the record, but no wage is owed for a batch
// that never became sellable, matching how it actually works on-site. Same
// logic applies to the contractor's commission below: no output, no cut.
export async function createMoldingEntry(input: CreateMoldingInput) {
  const worker = await assertPersonOfType(input.kilnId, input.workerId, ["WORKER"]);
  const _id = randomUUID();
  await db.insert(moldingEntries).values({ ...input, _id });
  const entry = (await db.select().from(moldingEntries).where(eq(moldingEntries._id, _id)))[0]!;

  if (!input.washedOut) {
    const wage = (input.bricksCount / 1000) * input.ratePerThousand;
    await addLedgerEntry({
      kilnId: input.kilnId,
      personId: input.workerId,
      direction: "DUE",
      amount: wage,
      reason: `Pathai: ${input.bricksCount.toLocaleString()} bricks`,
      date: input.date,
      category: "WAGE",
    });

    // Thekedar (labour contractor) commission — separate from the worker's
    // own wage, posted to the contractor's own ledger balance so
    // moldingContractorSummary can roll up "what the whole gang is owed"
    // without re-deriving it from every worker's entries each time.
    if (worker.contractorId) {
      const contractor = (await db
        .select()
        .from(people)
        .where(and(eq(people._id, worker.contractorId), eq(people.kilnId, input.kilnId), eq(people.type, "LABOUR_CONTRACTOR"))))[0];
      if (contractor?.commissionPerThousand) {
        const commission = (input.bricksCount / 1000) * contractor.commissionPerThousand;
        await addLedgerEntry({
          kilnId: input.kilnId,
          personId: contractor._id,
          direction: "DUE",
          amount: commission,
          reason: `Pathai commission: ${worker.name} molded ${input.bricksCount.toLocaleString()} bricks`,
          date: input.date,
          category: "COMMISSION",
        });
      }
    }
  }

  emitToKiln(input.kilnId, "molding:update", entry);
  return entry;
}

export interface UpdateMoldingInput {
  bricksCount?: number;
  ratePerThousand?: number;
  damagedCount?: number;
  washedOut?: boolean;
  notes?: string;
}

// Full admin edit — a revised bricksCount/rate/washedOut never silently
// rewrites the wage (and, if the worker has a contractor, the commission)
// already posted; each gets its own correction entry for the delta,
// same convention as workEntry.service.ts, applied to both ledgers here.
export async function updateMoldingEntry(kilnId: string, entryId: string, input: UpdateMoldingInput) {
  const existing = (await db.select().from(moldingEntries).where(and(eq(moldingEntries._id, entryId), eq(moldingEntries.kilnId, kilnId))))[0];
  if (!existing) throw new Error("Molding entry not found in this kiln");

  const worker = await assertPersonOfType(kilnId, existing.workerId, ["WORKER"]);
  const oldWage = existing.washedOut ? 0 : (existing.bricksCount / 1000) * existing.ratePerThousand;

  await db.update(moldingEntries).set(input).where(eq(moldingEntries._id, entryId));
  const updated = (await db.select().from(moldingEntries).where(eq(moldingEntries._id, entryId)))[0]!;

  const wageRelevant = input.bricksCount !== undefined || input.ratePerThousand !== undefined || input.washedOut !== undefined;
  if (wageRelevant) {
    const newWage = updated.washedOut ? 0 : (updated.bricksCount / 1000) * updated.ratePerThousand;
    const delta = Math.round((newWage - oldWage) * 100) / 100;
    if (delta > 0) {
      await addLedgerEntry({
        kilnId,
        personId: updated.workerId,
        direction: "DUE",
        amount: delta,
        reason: `Pathai correction: revised up to ${updated.bricksCount.toLocaleString()} bricks`,
        category: "WAGE",
      });
    } else if (delta < 0) {
      await addLedgerEntry({
        kilnId,
        personId: updated.workerId,
        direction: "PAID",
        amount: -delta,
        reason: `Pathai correction: revised down to ${updated.bricksCount.toLocaleString()} bricks`,
        category: "WAGE",
      });
    }

    if (worker.contractorId) {
      const contractor = (await db
        .select()
        .from(people)
        .where(and(eq(people._id, worker.contractorId), eq(people.kilnId, kilnId), eq(people.type, "LABOUR_CONTRACTOR"))))[0];
      if (contractor?.commissionPerThousand) {
        const oldCommission = existing.washedOut ? 0 : (existing.bricksCount / 1000) * contractor.commissionPerThousand;
        const newCommission = updated.washedOut ? 0 : (updated.bricksCount / 1000) * contractor.commissionPerThousand;
        const commissionDelta = Math.round((newCommission - oldCommission) * 100) / 100;
        if (commissionDelta > 0) {
          await addLedgerEntry({
            kilnId,
            personId: contractor._id,
            direction: "DUE",
            amount: commissionDelta,
            reason: `Pathai commission correction: ${worker.name} revised to ${updated.bricksCount.toLocaleString()} bricks`,
            category: "COMMISSION",
          });
        } else if (commissionDelta < 0) {
          await addLedgerEntry({
            kilnId,
            personId: contractor._id,
            direction: "PAID",
            amount: -commissionDelta,
            reason: `Pathai commission correction: ${worker.name} revised to ${updated.bricksCount.toLocaleString()} bricks`,
            category: "COMMISSION",
          });
        }
      }
    }
  }

  emitToKiln(kilnId, "molding:update", updated);
  return updated;
}

// Reverses both the worker's wage and (if applicable) the contractor's
// commission this entry posted, same delta-correction math updateMoldingEntry
// uses against a target of zero, before removing the row.
export async function deleteMoldingEntry(kilnId: string, entryId: string) {
  const existing = (await db.select().from(moldingEntries).where(and(eq(moldingEntries._id, entryId), eq(moldingEntries.kilnId, kilnId))))[0];
  if (!existing) throw new Error("Molding entry not found in this kiln");

  if (!existing.washedOut) {
    const wage = (existing.bricksCount / 1000) * existing.ratePerThousand;
    if (wage > 0) {
      await addLedgerEntry({
        kilnId,
        personId: existing.workerId,
        direction: "PAID",
        amount: wage,
        reason: `Pathai deleted: reversing ₹${wage.toLocaleString("en-IN")}`,
        category: "WAGE",
      });
    }

    const worker = (await db.select().from(people).where(and(eq(people._id, existing.workerId), eq(people.kilnId, kilnId))))[0];
    if (worker?.contractorId) {
      const contractor = (await db
        .select()
        .from(people)
        .where(and(eq(people._id, worker.contractorId), eq(people.kilnId, kilnId), eq(people.type, "LABOUR_CONTRACTOR"))))[0];
      if (contractor?.commissionPerThousand) {
        const commission = (existing.bricksCount / 1000) * contractor.commissionPerThousand;
        if (commission > 0) {
          await addLedgerEntry({
            kilnId,
            personId: contractor._id,
            direction: "PAID",
            amount: commission,
            reason: `Pathai commission deleted: reversing ₹${commission.toLocaleString("en-IN")}`,
            category: "COMMISSION",
          });
        }
      }
    }
  }

  await db.delete(moldingEntries).where(eq(moldingEntries._id, entryId));
  emitToKiln(kilnId, "molding:update", { _id: entryId, deleted: true });
}

export interface ListMoldingFilter {
  workerId?: string;
  from?: Date;
  to?: Date;
}

export async function listMoldingEntries(kilnId: string, filter: ListMoldingFilter = {}) {
  const conditions = [eq(moldingEntries.kilnId, kilnId)];
  if (filter.workerId) conditions.push(eq(moldingEntries.workerId, filter.workerId));
  if (filter.from) conditions.push(gte(moldingEntries.date, filter.from));
  if (filter.to) conditions.push(lte(moldingEntries.date, filter.to));

  const rows = await db.select().from(moldingEntries).where(and(...conditions)).orderBy(desc(moldingEntries.date));
  const workerIds = [...new Set(rows.map((r) => r.workerId))];
  if (workerIds.length === 0) return rows;
  const workerRows = await db.select({ _id: people._id, name: people.name }).from(people).where(inArray(people._id, workerIds));
  const workerById = new Map(workerRows.map((w) => [w._id, w]));
  return rows.map((r) => ({ ...r, workerId: workerById.get(r.workerId) ?? r.workerId }));
}

export async function todayMoldingTotal(kilnId: string) {
  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);
  const entries = await db
    .select()
    .from(moldingEntries)
    .where(and(eq(moldingEntries.kilnId, kilnId), gte(moldingEntries.date, startOfDay), eq(moldingEntries.washedOut, false)));
  return entries.reduce((sum, e) => sum + e.bricksCount, 0);
}

export async function totalMolded(kilnId: string, since: Date, until?: Date) {
  const conditions = [eq(moldingEntries.kilnId, kilnId), gte(moldingEntries.date, since), eq(moldingEntries.washedOut, false)];
  if (until) conditions.push(lte(moldingEntries.date, until));
  const entries = await db.select().from(moldingEntries).where(and(...conditions));
  return entries.reduce((sum, e) => sum + e.bricksCount, 0);
}

// Damage is tracked independently of washedOut — a batch that wasn't
// rained out can still have some bricks crack/break in handling, so this
// deliberately doesn't filter washedOut the way totalMolded does.
export async function damagedMoldedSince(kilnId: string, since: Date) {
  const entries = await db.select().from(moldingEntries).where(and(eq(moldingEntries.kilnId, kilnId), gte(moldingEntries.date, since)));
  return entries.reduce((sum, e) => sum + (e.damagedCount ?? 0), 0);
}

// Whole-kiln totals, unfiltered by work type — the "at a glance" numbers
// at the top of the Molding page, distinct from the Pathai-scoped
// contractor breakdown below.
export async function moldingPeriodTotals(kilnId: string) {
  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);
  const weekAgo = new Date();
  weekAgo.setDate(weekAgo.getDate() - 7);
  const monthAgo = new Date();
  monthAgo.setDate(monthAgo.getDate() - 30);

  const [today, week, month, todayDamaged, weekDamaged, monthDamaged] = await Promise.all([
    todayMoldingTotal(kilnId),
    totalMolded(kilnId, weekAgo),
    totalMolded(kilnId, monthAgo),
    damagedMoldedSince(kilnId, startOfDay),
    damagedMoldedSince(kilnId, weekAgo),
    damagedMoldedSince(kilnId, monthAgo),
  ]);

  return { today, week, month, todayDamaged, weekDamaged, monthDamaged };
}

function sumByDirection(entries: { direction: "DUE" | "PAID"; amount: number }[]) {
  const due = entries.filter((e) => e.direction === "DUE").reduce((sum, e) => sum + e.amount, 0);
  const paid = entries.filter((e) => e.direction === "PAID").reduce((sum, e) => sum + e.amount, 0);
  return { due, paid, balance: due - paid };
}

// The "how much do I owe Thekedar X's whole gang" rollup: for every
// LABOUR_CONTRACTOR, their own commission ledger plus every worker
// assigned to them (Person.contractorId) combined — production, DUE,
// PAID, and net balance, all computed live from MoldingEntry/LedgerEntry,
// nothing stored redundantly.
//
// "Assigned to Molding (Pathai)" is decided by relevance, not a single
// static tag: a worker counts if their own workType is "PATHAI" OR they
// have at least one real molding entry on file (someone whose gang's
// general trade is tagged Beldar/Rawas/Tudi but who's actually been logged
// for molding work still needs to show up here) — but a worker who merely
// shares a contractorId with a Pathai-relevant gang, with zero molding
// entries of their own, does not (that was cluttering this page with
// workers who have nothing to do with Pathai). A contractor is included if
// they're tagged "PATHAI" themselves, or have at least one Pathai-relevant
// worker by that same rule. Doesn't affect the whole-kiln totals above
// (moldingPeriodTotals), which stay unfiltered.
export async function moldingContractorSummary(kilnId: string) {
  const [allContractors, workers, allEntries] = await Promise.all([
    db.select().from(people).where(and(eq(people.kilnId, kilnId), eq(people.type, "LABOUR_CONTRACTOR"), eq(people.active, true))).orderBy(asc(people.name)),
    db.select().from(people).where(and(eq(people.kilnId, kilnId), eq(people.type, "WORKER"), eq(people.active, true))),
    db.select().from(moldingEntries).where(eq(moldingEntries.kilnId, kilnId)),
  ]);

  const workerIdsWithEntries = new Set(allEntries.map((e) => e.workerId));
  const isPathaiRelevant = (w: (typeof workers)[number]) => w.workType === "PATHAI" || workerIdsWithEntries.has(w._id);
  const relevantWorkers = workers.filter(isPathaiRelevant);

  const contractorIdsWithRelevantWorkers = new Set(relevantWorkers.filter((w) => w.contractorId).map((w) => w.contractorId!));
  const contractors = allContractors.filter((c) => c.workType === "PATHAI" || contractorIdsWithRelevantWorkers.has(c._id));

  const contractorResults = await Promise.all(
    contractors.map(async (contractor) => {
      const gangWorkers = relevantWorkers.filter((w) => w.contractorId === contractor._id);
      const workerIds = gangWorkers.map((w) => w._id);

      // Not filtered by washedOut here — damage is tracked regardless of
      // whether the batch washed out, so bricksProduced and damagedCount
      // are derived separately below instead of both being gated on the
      // same filter.
      const workerIdSet = new Set(workerIds);
      const gangEntries = allEntries.filter((e) => workerIdSet.has(e.workerId));
      const gangLedgerEntries = workerIds.length
        ? await db.select().from(ledgerEntries).where(and(eq(ledgerEntries.kilnId, kilnId), inArray(ledgerEntries.personId, [contractor._id, ...workerIds])))
        : await db.select().from(ledgerEntries).where(and(eq(ledgerEntries.kilnId, kilnId), eq(ledgerEntries.personId, contractor._id)));

      const bricksByWorker = new Map<string, number>();
      const damagedByWorker = new Map<string, number>();
      let totalBricksProduced = 0;
      let totalDamaged = 0;
      for (const e of gangEntries) {
        const id = e.workerId;
        damagedByWorker.set(id, (damagedByWorker.get(id) ?? 0) + (e.damagedCount ?? 0));
        totalDamaged += e.damagedCount ?? 0;
        if (e.washedOut) continue;
        bricksByWorker.set(id, (bricksByWorker.get(id) ?? 0) + e.bricksCount);
        totalBricksProduced += e.bricksCount;
      }
      const { due, paid, balance } = sumByDirection(gangLedgerEntries);

      // The Bhada/advance "pool" — money the kiln has handed this
      // contractor (category ADVANCE, e.g. from the Labor Fare & Advance
      // section below) minus whatever's since been paid out to their own
      // gang workers as Kharchi/Advance/Medical/Festival. Kept separate
      // from the generic due/paid/balance above (which also includes
      // commission and any other category) so "how much of the advance the
      // contractor is still holding" reads as its own number, continuously
      // up to date as new worker payments post — no separate reset/session
      // bookkeeping needed.
      const advanceGivenToContractor = gangLedgerEntries
        .filter((e) => e.personId === contractor._id && e.direction === "PAID" && e.category === "ADVANCE")
        .reduce((sum, e) => sum + e.amount, 0);
      const advanceDeductedForWorkers = gangLedgerEntries
        .filter(
          (e) =>
            e.personId !== contractor._id &&
            e.direction === "PAID" &&
            (e.category === "KHARCHI" || e.category === "ADVANCE" || e.category === "MEDICAL" || e.category === "FESTIVAL")
        )
        .reduce((sum, e) => sum + e.amount, 0);

      return {
        contractor: {
          id: contractor._id,
          name: contractor.name,
          phone: contractor.phone,
          commissionPerThousand: contractor.commissionPerThousand ?? null,
        },
        workers: gangWorkers.map((w) => ({
          id: w._id,
          name: w.name,
          bricksProduced: bricksByWorker.get(w._id) ?? 0,
          damagedCount: damagedByWorker.get(w._id) ?? 0,
        })),
        totalBricksProduced,
        totalDamaged,
        totalDue: due,
        totalPaid: paid,
        balance,
        advanceGivenToContractor,
        advanceDeductedForWorkers,
        remainingAdvancePool: advanceGivenToContractor - advanceDeductedForWorkers,
      };
    })
  );

  const unassignedWorkerIds = new Set(relevantWorkers.filter((w) => !w.contractorId).map((w) => w._id));
  const unassignedEntries = allEntries.filter((e) => unassignedWorkerIds.has(e.workerId));
  const unassignedBricksProduced = unassignedEntries
    .filter((e) => !e.washedOut)
    .reduce((sum, e) => sum + e.bricksCount, 0);
  const unassignedDamaged = unassignedEntries.reduce((sum, e) => sum + (e.damagedCount ?? 0), 0);

  return {
    contractors: contractorResults,
    totalProductionAllContractors: contractorResults.reduce((sum, c) => sum + c.totalBricksProduced, 0),
    totalDamagedAllContractors: contractorResults.reduce((sum, c) => sum + c.totalDamaged, 0),
    unassignedWorkerCount: unassignedWorkerIds.size,
    unassignedBricksProduced,
    unassignedDamaged,
  };
}
