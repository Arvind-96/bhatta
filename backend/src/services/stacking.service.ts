import { randomUUID } from "crypto";
import { and, asc, desc, eq, gte, inArray, isNotNull, lte } from "drizzle-orm";
import { db } from "../db/client";
import { stackingEntries, people, ledgerEntries, stackingVehicles, ghers, STACKING_MODES, STACKING_STAGES } from "../db/schema";
import { assertPersonOfType } from "./person.service";
import { assertGherInKiln, updateGherStatus } from "./gher.service";
import { emitToKiln } from "../config/socket";

export type StackingMode = (typeof STACKING_MODES)[number];
export type StackingStage = (typeof STACKING_STAGES)[number];

export interface CreateStackingInput {
  kilnId: string;
  gherId: string;
  gangId: string;
  stage: StackingStage;
  bricksCount: number;
  damageCount?: number;
  qualityRating?: "GOOD" | "AVERAGE" | "POOR";
  mode?: StackingMode;
  tractorNumber?: string;
  buggiCount?: number;
  date?: Date;
  notes?: string;
}

// Payment goes to the gang head (a Labour Contractor, or a Worker acting
// as jamadaar for their own small gang) on a fixed monthly salary — not
// computed from this entry, so logging bharai production never touches the
// ledger; salary is settled manually (category "SALARY"), same as FITTER's
// monthly pay. This entry is pure production/output tracking: which stage,
// how many bricks, how they moved. Logging one also flips the chamber to
// STACKING so the live Gher map reflects reality without a separate manual
// status update.
export async function createStackingEntry(input: CreateStackingInput) {
  await assertPersonOfType(input.kilnId, input.gangId, ["LABOUR_CONTRACTOR", "WORKER", "HELPER"]);
  await assertGherInKiln(input.kilnId, input.gherId);

  const _id = randomUUID();
  await db.insert(stackingEntries).values({ ...input, _id });
  const entry = (await db.select().from(stackingEntries).where(eq(stackingEntries._id, _id)))[0]!;

  await updateGherStatus(input.kilnId, input.gherId, "STACKING");

  emitToKiln(input.kilnId, "stacking:update", entry);
  return entry;
}

export interface UpdateStackingInput {
  stage?: StackingStage;
  bricksCount?: number;
  damageCount?: number;
  qualityRating?: "GOOD" | "AVERAGE" | "POOR";
  mode?: StackingMode;
  tractorNumber?: string;
  buggiCount?: number;
  notes?: string;
}

// Full admin edit — bharai is salary-based now, so correcting bricksCount
// or stage here is just fixing the production record; it never touches the
// ledger (contrast with molding's piece-rate correction pattern).
export async function updateStackingEntry(kilnId: string, entryId: string, input: UpdateStackingInput) {
  const existing = (await db.select().from(stackingEntries).where(and(eq(stackingEntries._id, entryId), eq(stackingEntries.kilnId, kilnId))))[0];
  if (!existing) throw new Error("Stacking entry not found in this kiln");

  await db.update(stackingEntries).set(input).where(eq(stackingEntries._id, entryId));
  const updated = (await db.select().from(stackingEntries).where(eq(stackingEntries._id, entryId)))[0]!;

  emitToKiln(kilnId, "stacking:update", updated);
  return updated;
}

// No ledger side effect to reverse (bharai gangs are salary-based, see
// createStackingEntry) and the gher's current stage is left alone — it may
// have already moved on to a later real-world stage since this entry was
// logged, so rewinding it here on a historical-record deletion would risk
// contradicting the chamber's actual current state.
export async function deleteStackingEntry(kilnId: string, entryId: string) {
  const existing = (await db.select().from(stackingEntries).where(and(eq(stackingEntries._id, entryId), eq(stackingEntries.kilnId, kilnId))))[0];
  if (!existing) throw new Error("Stacking entry not found in this kiln");

  await db.delete(stackingEntries).where(eq(stackingEntries._id, entryId));
  emitToKiln(kilnId, "stacking:update", { _id: entryId, deleted: true });
}

export interface ListStackingFilter {
  gherId?: string;
  gangId?: string;
  from?: Date;
  to?: Date;
}

export async function listStackingEntries(kilnId: string, filter: ListStackingFilter = {}) {
  const conditions = [eq(stackingEntries.kilnId, kilnId)];
  if (filter.gherId) conditions.push(eq(stackingEntries.gherId, filter.gherId));
  if (filter.gangId) conditions.push(eq(stackingEntries.gangId, filter.gangId));
  if (filter.from) conditions.push(gte(stackingEntries.date, filter.from));
  if (filter.to) conditions.push(lte(stackingEntries.date, filter.to));

  const rows = await db.select().from(stackingEntries).where(and(...conditions)).orderBy(desc(stackingEntries.date));
  const gangIds = [...new Set(rows.map((r) => r.gangId))];
  const gherIds = [...new Set(rows.map((r) => r.gherId))];
  const [gangRows, gherRows] = await Promise.all([
    gangIds.length ? db.select({ _id: people._id, name: people.name, type: people.type }).from(people).where(inArray(people._id, gangIds)) : [],
    gherIds.length ? db.select({ _id: ghers._id, number: ghers.number }).from(ghers).where(inArray(ghers._id, gherIds)) : [],
  ]);
  const gangById = new Map(gangRows.map((g) => [g._id, g]));
  const gherById = new Map(gherRows.map((g) => [g._id, g]));
  return rows.map((r) => ({ ...r, gangId: gangById.get(r.gangId) ?? r.gangId, gherId: gherById.get(r.gherId) ?? r.gherId }));
}

export async function totalStacked(kilnId: string, since: Date, until?: Date) {
  const conditions = [eq(stackingEntries.kilnId, kilnId), gte(stackingEntries.date, since)];
  if (until) conditions.push(lte(stackingEntries.date, until));
  const entries = await db.select().from(stackingEntries).where(and(...conditions));
  return {
    bricksCount: entries.reduce((sum, e) => sum + e.bricksCount, 0),
    damageCount: entries.reduce((sum, e) => sum + (e.damageCount ?? 0), 0),
  };
}

// Used by chamberGrading.service.ts to scope "bricks stacked this cycle" —
// everything logged against this chamber since it last flipped to STACKING
// (Gher.cycleStartedAt), not its entire multi-season history.
export async function stackedSinceForGher(kilnId: string, gherId: string, since?: Date) {
  const conditions = [eq(stackingEntries.kilnId, kilnId), eq(stackingEntries.gherId, gherId)];
  if (since) conditions.push(gte(stackingEntries.date, since));
  const entries = await db.select().from(stackingEntries).where(and(...conditions));
  return entries.reduce((sum, e) => sum + e.bricksCount, 0);
}

function sumByDirection(entries: { direction: "DUE" | "PAID"; amount: number }[]) {
  const due = entries.filter((e) => e.direction === "DUE").reduce((sum, e) => sum + e.amount, 0);
  const paid = entries.filter((e) => e.direction === "PAID").reduce((sum, e) => sum + e.amount, 0);
  return { due, paid, balance: due - paid };
}

// Per-operator (gang head) rollup for *independent* operators only — a
// WORKER/HELPER stacking on their own account, with no thekedar. Anyone
// mapped under a bharai contractor (Person.bharaiContractorId) is folded
// into that contractor's card by stackingContractorSummary instead, so the
// same production doesn't show up twice; LABOUR_CONTRACTOR persons are
// always covered by stackingContractorSummary (even their own direct
// entries), never listed here.
export async function stackingOperatorSummary(kilnId: string) {
  const operators = await db
    .select()
    .from(people)
    .where(and(eq(people.kilnId, kilnId), inArray(people.type, ["WORKER", "HELPER"]), eq(people.active, true)))
    .orderBy(asc(people.name));
  const independentOperators = operators.filter((o) => !o.bharaiContractorId);

  const allEntries = await db.select().from(stackingEntries).where(eq(stackingEntries.kilnId, kilnId));
  const entriesByGang = new Map<string, typeof allEntries>();
  for (const e of allEntries) {
    const id = e.gangId;
    if (!entriesByGang.has(id)) entriesByGang.set(id, []);
    entriesByGang.get(id)!.push(e);
  }

  const results = [];
  for (const operator of independentOperators) {
    const opEntries = entriesByGang.get(operator._id) ?? [];
    if (opEntries.length === 0) continue;

    const opLedgerEntries = await db.select().from(ledgerEntries).where(and(eq(ledgerEntries.kilnId, kilnId), eq(ledgerEntries.personId, operator._id)));
    const { due, paid, balance } = sumByDirection(opLedgerEntries);

    const tractorNumbers = new Set<string>();
    let totalBuggiCount = 0;
    for (const e of opEntries) {
      if (e.tractorNumber) tractorNumbers.add(e.tractorNumber);
      if (e.buggiCount) totalBuggiCount += e.buggiCount;
    }

    results.push({
      operator: {
        id: operator._id,
        name: operator.name,
        phone: operator.phone,
        type: operator.type,
        monthlySalary: operator.monthlySalary ?? null,
        stackingStage: operator.stackingStage ?? null,
      },
      totalBricksStacked: opEntries.reduce((sum, e) => sum + e.bricksCount, 0),
      totalDamage: opEntries.reduce((sum, e) => sum + (e.damageCount ?? 0), 0),
      tripCount: opEntries.length,
      tractorNumbers: Array.from(tractorNumbers),
      totalBuggiCount,
      totalDue: due,
      totalPaid: paid,
      balance,
    });
  }

  return {
    operators: results,
    totalBricksStackedAllOperators: results.reduce((sum, r) => sum + r.totalBricksStacked, 0),
    totalDamagedAllOperators: results.reduce((sum, r) => sum + r.totalDamage, 0),
  };
}

// The "how much do I owe Thekedar X's whole bharai gang" rollup — every
// LABOUR_CONTRACTOR, the laborers mapped under them for stacking
// (Person.bharaiContractorId), their combined production (including
// entries logged against the contractor directly, e.g. gangId = the
// contractor themself) and ledger, plus the contractor's own vehicle/driver
// roster. Same shape as molding.service.ts's moldingContractorSummary.
export async function stackingContractorSummary(kilnId: string) {
  const [contractors, laborers, vehicles] = await Promise.all([
    db.select().from(people).where(and(eq(people.kilnId, kilnId), eq(people.type, "LABOUR_CONTRACTOR"), eq(people.active, true))).orderBy(asc(people.name)),
    db.select().from(people).where(and(eq(people.kilnId, kilnId), inArray(people.type, ["WORKER", "HELPER"]), eq(people.active, true))),
    db.select().from(stackingVehicles).where(eq(stackingVehicles.kilnId, kilnId)),
  ]);

  const contractorResults = await Promise.all(
    contractors.map(async (contractor) => {
      const gangLaborers = laborers.filter((w) => w.bharaiContractorId === contractor._id);
      const laborerIds = gangLaborers.map((w) => w._id);
      const personIds = [contractor._id, ...laborerIds];

      const [gangEntries, gangLedgerEntries] = await Promise.all([
        db.select().from(stackingEntries).where(and(eq(stackingEntries.kilnId, kilnId), inArray(stackingEntries.gangId, personIds))),
        db.select().from(ledgerEntries).where(and(eq(ledgerEntries.kilnId, kilnId), inArray(ledgerEntries.personId, personIds))),
      ]);

      const bricksByLaborer = new Map<string, number>();
      const damageByLaborer = new Map<string, number>();
      for (const e of gangEntries) {
        const id = e.gangId;
        bricksByLaborer.set(id, (bricksByLaborer.get(id) ?? 0) + e.bricksCount);
        damageByLaborer.set(id, (damageByLaborer.get(id) ?? 0) + (e.damageCount ?? 0));
      }
      const totalBricksStacked = gangEntries.reduce((sum, e) => sum + e.bricksCount, 0);
      const totalDamaged = gangEntries.reduce((sum, e) => sum + (e.damageCount ?? 0), 0);
      const { due, paid, balance } = sumByDirection(gangLedgerEntries);

      const contractorVehicles = vehicles.filter((v) => v.contractorId === contractor._id);
      const tractorCount = contractorVehicles.filter((v) => v.vehicleType === "TRACTOR").length;
      const totalBuggiCount = contractorVehicles
        .filter((v) => v.vehicleType === "BUGGI")
        .reduce((sum, v) => sum + (v.buggiCount ?? 0), 0);

      return {
        contractor: {
          id: contractor._id,
          name: contractor.name,
          phone: contractor.phone,
          monthlySalary: contractor.monthlySalary ?? null,
          stackingStage: contractor.stackingStage ?? null,
        },
        laborers: gangLaborers.map((w) => ({
          id: w._id,
          name: w.name,
          phone: w.phone,
          monthlySalary: w.monthlySalary ?? null,
          bricksStacked: bricksByLaborer.get(w._id) ?? 0,
          damagedCount: damageByLaborer.get(w._id) ?? 0,
        })),
        vehicles: contractorVehicles.map((v) => ({
          id: v._id,
          vehicleType: v.vehicleType,
          vehicleNumber: v.vehicleNumber ?? null,
          buggiCount: v.buggiCount ?? null,
          driverName: v.driverName ?? null,
          status: v.status,
        })),
        tractorCount,
        totalBuggiCount,
        totalBricksStacked,
        totalDamaged,
        totalDue: due,
        totalPaid: paid,
        balance,
      };
    })
  );

  return {
    contractors: contractorResults,
    totalProductionAllContractors: contractorResults.reduce((sum, c) => sum + c.totalBricksStacked, 0),
    totalDamagedAllContractors: contractorResults.reduce((sum, c) => sum + c.totalDamaged, 0),
  };
}

// "Which tractors are actually doing bharai work, and how much" — fleet
// tracking distinct from the operator (who gets paid), since one tractor
// might be used across several stacking sessions/operators.
export async function tractorFleetSummary(kilnId: string) {
  const entries = await db
    .select()
    .from(stackingEntries)
    .where(and(eq(stackingEntries.kilnId, kilnId), eq(stackingEntries.mode, "TRACTOR"), isNotNull(stackingEntries.tractorNumber)));

  const gangIds = [...new Set(entries.map((e) => e.gangId))];
  const gangRows = gangIds.length ? await db.select({ _id: people._id, name: people.name }).from(people).where(inArray(people._id, gangIds)) : [];
  const gangById = new Map(gangRows.map((g) => [g._id, g]));

  const byTractor = new Map<
    string,
    { tractorNumber: string; tripCount: number; totalBricksStacked: number; operators: Set<string> }
  >();

  for (const e of entries) {
    const key = e.tractorNumber as string;
    const entry = byTractor.get(key) ?? { tractorNumber: key, tripCount: 0, totalBricksStacked: 0, operators: new Set<string>() };
    entry.tripCount += 1;
    entry.totalBricksStacked += e.bricksCount;
    const gang = gangById.get(e.gangId);
    if (gang?.name) entry.operators.add(gang.name);
    byTractor.set(key, entry);
  }

  return Array.from(byTractor.values())
    .map((t) => ({ ...t, operators: Array.from(t.operators) }))
    .sort((a, b) => b.tripCount - a.tripCount);
}
