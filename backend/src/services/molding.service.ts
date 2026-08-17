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
  db.insert(moldingEntries).values({ ...input, _id }).run();
  const entry = db.select().from(moldingEntries).where(eq(moldingEntries._id, _id)).get()!;

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
      const contractor = db
        .select()
        .from(people)
        .where(and(eq(people._id, worker.contractorId), eq(people.kilnId, input.kilnId), eq(people.type, "LABOUR_CONTRACTOR")))
        .get();
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

  const rows = await db.select().from(moldingEntries).where(and(...conditions)).orderBy(desc(moldingEntries.date)).all();
  const workerIds = [...new Set(rows.map((r) => r.workerId))];
  if (workerIds.length === 0) return rows;
  const workerRows = await db.select({ _id: people._id, name: people.name }).from(people).where(inArray(people._id, workerIds)).all();
  const workerById = new Map(workerRows.map((w) => [w._id, w]));
  return rows.map((r) => ({ ...r, workerId: workerById.get(r.workerId) ?? r.workerId }));
}

export async function todayMoldingTotal(kilnId: string) {
  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);
  const entries = await db
    .select()
    .from(moldingEntries)
    .where(and(eq(moldingEntries.kilnId, kilnId), gte(moldingEntries.date, startOfDay), eq(moldingEntries.washedOut, false)))
    .all();
  return entries.reduce((sum, e) => sum + e.bricksCount, 0);
}

export async function totalMolded(kilnId: string, since: Date, until?: Date) {
  const conditions = [eq(moldingEntries.kilnId, kilnId), gte(moldingEntries.date, since), eq(moldingEntries.washedOut, false)];
  if (until) conditions.push(lte(moldingEntries.date, until));
  const entries = await db.select().from(moldingEntries).where(and(...conditions)).all();
  return entries.reduce((sum, e) => sum + e.bricksCount, 0);
}

// Damage is tracked independently of washedOut — a batch that wasn't
// rained out can still have some bricks crack/break in handling, so this
// deliberately doesn't filter washedOut the way totalMolded does.
export async function damagedMoldedSince(kilnId: string, since: Date) {
  const entries = await db.select().from(moldingEntries).where(and(eq(moldingEntries.kilnId, kilnId), gte(moldingEntries.date, since))).all();
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
// Scoped to Pathai — only contractors and workers whose own profile is
// tagged workType "PATHAI" appear here, so a thekedar/labourer who
// actually works Bharai/Pakayi/etc. (or hasn't been tagged yet) doesn't
// show up under Molding just because they happen to have a molding entry
// on file. Doesn't affect the whole-kiln totals above (moldingPeriodTotals),
// which stay unfiltered.
export async function moldingContractorSummary(kilnId: string) {
  const [contractors, workers] = await Promise.all([
    db.select().from(people).where(and(eq(people.kilnId, kilnId), eq(people.type, "LABOUR_CONTRACTOR"), eq(people.active, true), eq(people.workType, "PATHAI"))).orderBy(asc(people.name)).all(),
    db.select().from(people).where(and(eq(people.kilnId, kilnId), eq(people.type, "WORKER"), eq(people.active, true), eq(people.workType, "PATHAI"))).all(),
  ]);

  const contractorResults = await Promise.all(
    contractors.map(async (contractor) => {
      const gangWorkers = workers.filter((w) => w.contractorId === contractor._id);
      const workerIds = gangWorkers.map((w) => w._id);

      // Fetched without the washedOut filter — damage is tracked
      // regardless of whether the batch washed out, so bricksProduced and
      // damagedCount are derived separately below instead of both being
      // gated on the same query filter.
      const [gangEntries, gangLedgerEntries] = await Promise.all([
        workerIds.length ? db.select().from(moldingEntries).where(and(eq(moldingEntries.kilnId, kilnId), inArray(moldingEntries.workerId, workerIds))).all() : [],
        db.select().from(ledgerEntries).where(and(eq(ledgerEntries.kilnId, kilnId), inArray(ledgerEntries.personId, [contractor._id, ...workerIds]))).all(),
      ]);

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
      };
    })
  );

  const unassignedWorkerIds = workers.filter((w) => !w.contractorId).map((w) => w._id);
  const unassignedEntries = unassignedWorkerIds.length
    ? await db.select().from(moldingEntries).where(and(eq(moldingEntries.kilnId, kilnId), inArray(moldingEntries.workerId, unassignedWorkerIds))).all()
    : [];
  const unassignedBricksProduced = unassignedEntries
    .filter((e) => !e.washedOut)
    .reduce((sum, e) => sum + e.bricksCount, 0);
  const unassignedDamaged = unassignedEntries.reduce((sum, e) => sum + (e.damagedCount ?? 0), 0);

  return {
    contractors: contractorResults,
    totalProductionAllContractors: contractorResults.reduce((sum, c) => sum + c.totalBricksProduced, 0),
    totalDamagedAllContractors: contractorResults.reduce((sum, c) => sum + c.totalDamaged, 0),
    unassignedWorkerCount: unassignedWorkerIds.length,
    unassignedBricksProduced,
    unassignedDamaged,
  };
}
