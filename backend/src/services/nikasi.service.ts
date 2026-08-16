import { randomUUID } from "crypto";
import { and, asc, eq, gte, inArray, isNull } from "drizzle-orm";
import { db } from "../db/client";
import { nikasiEntries, people, ledgerEntries, ghers } from "../db/schema";
import { assertPersonOfType } from "./person.service";
import { assertGherInKiln } from "./gher.service";
import { emitToKiln } from "../config/socket";

export interface CreateNikasiInput {
  kilnId: string;
  gherId: string;
  gangId: string;
  bricksCount: number;
  damagedCount?: number;
  date?: Date;
  notes?: string;
}

// Nikasi's own gang (contractor, or a worker/helper acting as jamadaar) is
// paid a monthly salary, same as Bharai — this entry is pure production
// tracking (how many fired bricks this gang unloaded), never a wage
// trigger. Deliberately doesn't touch Gher.status: unloading a chamber is
// still finalized via the existing chamber-grading flow, which is the
// single source finished-goods stock is computed from — Nikasi tracks who
// did the labor, not the authoritative brick count.
export async function createNikasiEntry(input: CreateNikasiInput) {
  await assertPersonOfType(input.kilnId, input.gangId, ["LABOUR_CONTRACTOR", "WORKER", "HELPER"]);
  await assertGherInKiln(input.kilnId, input.gherId);

  const _id = randomUUID();
  db.insert(nikasiEntries).values({ ...input, _id }).run();
  const entry = db.select().from(nikasiEntries).where(eq(nikasiEntries._id, _id)).get()!;
  emitToKiln(input.kilnId, "nikasi:update", entry);
  return entry;
}

export interface UpdateNikasiInput {
  bricksCount?: number;
  damagedCount?: number;
  notes?: string;
}

// Full admin edit — no wage is tied to this entry, so correcting
// bricksCount is just fixing the production record, no ledger side effect.
export async function updateNikasiEntry(kilnId: string, entryId: string, input: UpdateNikasiInput) {
  const existing = db.select().from(nikasiEntries).where(and(eq(nikasiEntries._id, entryId), eq(nikasiEntries.kilnId, kilnId))).get();
  if (!existing) throw new Error("Nikasi entry not found in this kiln");

  db.update(nikasiEntries).set(input).where(eq(nikasiEntries._id, entryId)).run();
  const updated = db.select().from(nikasiEntries).where(eq(nikasiEntries._id, entryId)).get()!;
  emitToKiln(kilnId, "nikasi:update", updated);
  return updated;
}

export interface ListNikasiFilter {
  gherId?: string;
  gangId?: string;
}

export async function listNikasiEntries(kilnId: string, filter: ListNikasiFilter = {}) {
  const conditions = [eq(nikasiEntries.kilnId, kilnId)];
  if (filter.gherId) conditions.push(eq(nikasiEntries.gherId, filter.gherId));
  if (filter.gangId) conditions.push(eq(nikasiEntries.gangId, filter.gangId));

  const rows = await db.select().from(nikasiEntries).where(and(...conditions)).all();
  const gangIds = [...new Set(rows.map((r) => r.gangId))];
  const gherIds = [...new Set(rows.map((r) => r.gherId))];
  const [gangRows, gherRows] = await Promise.all([
    gangIds.length ? db.select({ _id: people._id, name: people.name, type: people.type }).from(people).where(inArray(people._id, gangIds)).all() : [],
    gherIds.length ? db.select({ _id: ghers._id, number: ghers.number }).from(ghers).where(inArray(ghers._id, gherIds)).all() : [],
  ]);
  const gangById = new Map(gangRows.map((g) => [g._id, g]));
  const gherById = new Map(gherRows.map((g) => [g._id, g]));
  return rows
    .sort((a, b) => (b.date?.getTime() ?? 0) - (a.date?.getTime() ?? 0))
    .map((r) => ({ ...r, gangId: gangById.get(r.gangId) ?? r.gangId, gherId: gherById.get(r.gherId) ?? r.gherId }));
}

// All-time damage total for a given window — used by the dashboard's
// combined "raw + bharai + nikasi damage" figure alongside
// molding.service.ts's damagedMoldedSince and stacking.service.ts's
// totalStacked().damageCount.
export async function totalNikasiDamage(kilnId: string, since: Date) {
  const entries = await db.select().from(nikasiEntries).where(and(eq(nikasiEntries.kilnId, kilnId), gte(nikasiEntries.date, since))).all();
  return entries.reduce((sum, e) => sum + (e.damagedCount ?? 0), 0);
}

// Whole-kiln totals — every NikasiEntry already means "nikasi work" (no
// other module writes this collection), so unlike the Pathai-tagged
// contractor breakdown below, there's no ambiguity to filter out here.
export async function nikasiPeriodTotals(kilnId: string) {
  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);
  const weekAgo = new Date();
  weekAgo.setDate(weekAgo.getDate() - 7);
  const monthAgo = new Date();
  monthAgo.setDate(monthAgo.getDate() - 30);

  const [todayEntries, weekEntries, monthEntries] = await Promise.all([
    db.select().from(nikasiEntries).where(and(eq(nikasiEntries.kilnId, kilnId), gte(nikasiEntries.date, startOfDay))).all(),
    db.select().from(nikasiEntries).where(and(eq(nikasiEntries.kilnId, kilnId), gte(nikasiEntries.date, weekAgo))).all(),
    db.select().from(nikasiEntries).where(and(eq(nikasiEntries.kilnId, kilnId), gte(nikasiEntries.date, monthAgo))).all(),
  ]);

  const sum = (entries: typeof todayEntries, field: "bricksCount" | "damagedCount") =>
    entries.reduce((total, e) => total + (field === "bricksCount" ? e.bricksCount : e.damagedCount ?? 0), 0);

  return {
    today: sum(todayEntries, "bricksCount"),
    week: sum(weekEntries, "bricksCount"),
    month: sum(monthEntries, "bricksCount"),
    todayDamaged: sum(todayEntries, "damagedCount"),
    weekDamaged: sum(weekEntries, "damagedCount"),
    monthDamaged: sum(monthEntries, "damagedCount"),
  };
}

function sumByDirection(entries: { direction: "DUE" | "PAID"; amount: number }[]) {
  const due = entries.filter((e) => e.direction === "DUE").reduce((sum, e) => sum + e.amount, 0);
  const paid = entries.filter((e) => e.direction === "PAID").reduce((sum, e) => sum + e.amount, 0);
  return { due, paid, balance: due - paid };
}

// Independent operators only (no nikasi thekedar) — same shape/exclusion
// rule as stacking.service.ts's stackingOperatorSummary: LABOUR_CONTRACTOR
// persons are always covered by nikasiContractorSummary instead, and
// anyone mapped under a nikasi contractor is folded into that contractor's
// card rather than listed separately here.
//
// Scoped to Nikasi — only operators whose own profile is tagged workType
// "NIKASI" appear here, same "only show who's actually assigned to this
// module" rule molding.service.ts's contractor summary uses for Pathai.
export async function nikasiOperatorSummary(kilnId: string) {
  const operators = await db
    .select()
    .from(people)
    .where(and(eq(people.kilnId, kilnId), inArray(people.type, ["WORKER", "HELPER"]), isNull(people.nikasiContractorId), eq(people.workType, "NIKASI"), eq(people.active, true)))
    .orderBy(asc(people.name))
    .all();

  const allEntries = await db.select().from(nikasiEntries).where(eq(nikasiEntries.kilnId, kilnId)).all();
  const entriesByGang = new Map<string, typeof allEntries>();
  for (const e of allEntries) {
    const id = e.gangId;
    if (!entriesByGang.has(id)) entriesByGang.set(id, []);
    entriesByGang.get(id)!.push(e);
  }

  const results = [];
  for (const operator of operators) {
    const opEntries = entriesByGang.get(operator._id) ?? [];
    if (opEntries.length === 0) continue;

    const opLedgerEntries = await db.select().from(ledgerEntries).where(and(eq(ledgerEntries.kilnId, kilnId), eq(ledgerEntries.personId, operator._id))).all();
    const { due, paid, balance } = sumByDirection(opLedgerEntries);

    results.push({
      operator: {
        id: operator._id,
        name: operator.name,
        phone: operator.phone,
        type: operator.type,
        monthlySalary: operator.monthlySalary ?? null,
      },
      totalBricksUnloaded: opEntries.reduce((sum, e) => sum + e.bricksCount, 0),
      totalDamaged: opEntries.reduce((sum, e) => sum + (e.damagedCount ?? 0), 0),
      tripCount: opEntries.length,
      totalDue: due,
      totalPaid: paid,
      balance,
    });
  }

  return {
    operators: results,
    totalBricksUnloadedAllOperators: results.reduce((sum, r) => sum + r.totalBricksUnloaded, 0),
    totalDamagedAllOperators: results.reduce((sum, r) => sum + r.totalDamaged, 0),
  };
}

// The "how much do I owe Thekedar X's whole nikasi gang" rollup — every
// LABOUR_CONTRACTOR, the laborers mapped under them for unloading
// (Person.nikasiContractorId), their combined output (including entries
// logged against the contractor directly) and ledger. Same shape as
// stacking.service.ts's stackingContractorSummary, minus the vehicle
// roster (nikasi has no equipment-tracking requirement).
//
// Scoped to Nikasi — only contractors and laborers whose own profile is
// tagged workType "NIKASI" appear here (see molding.service.ts's
// contractor summary for the same rule applied to Pathai).
export async function nikasiContractorSummary(kilnId: string) {
  const [contractors, laborers] = await Promise.all([
    db.select().from(people).where(and(eq(people.kilnId, kilnId), eq(people.type, "LABOUR_CONTRACTOR"), eq(people.active, true), eq(people.workType, "NIKASI"))).orderBy(asc(people.name)).all(),
    db.select().from(people).where(and(eq(people.kilnId, kilnId), inArray(people.type, ["WORKER", "HELPER"]), eq(people.active, true), eq(people.workType, "NIKASI"))).all(),
  ]);

  const contractorResults = await Promise.all(
    contractors.map(async (contractor) => {
      const gangLaborers = laborers.filter((w) => w.nikasiContractorId === contractor._id);
      const laborerIds = gangLaborers.map((w) => w._id);
      const personIds = [contractor._id, ...laborerIds];

      const [gangEntries, gangLedgerEntries] = await Promise.all([
        db.select().from(nikasiEntries).where(and(eq(nikasiEntries.kilnId, kilnId), inArray(nikasiEntries.gangId, personIds))).all(),
        db.select().from(ledgerEntries).where(and(eq(ledgerEntries.kilnId, kilnId), inArray(ledgerEntries.personId, personIds))).all(),
      ]);

      const bricksByLaborer = new Map<string, number>();
      const damagedByLaborer = new Map<string, number>();
      for (const e of gangEntries) {
        const id = e.gangId;
        bricksByLaborer.set(id, (bricksByLaborer.get(id) ?? 0) + e.bricksCount);
        damagedByLaborer.set(id, (damagedByLaborer.get(id) ?? 0) + (e.damagedCount ?? 0));
      }
      const totalBricksUnloaded = gangEntries.reduce((sum, e) => sum + e.bricksCount, 0);
      const totalDamaged = gangEntries.reduce((sum, e) => sum + (e.damagedCount ?? 0), 0);
      const { due, paid, balance } = sumByDirection(gangLedgerEntries);

      return {
        contractor: {
          id: contractor._id,
          name: contractor.name,
          phone: contractor.phone,
          monthlySalary: contractor.monthlySalary ?? null,
        },
        laborers: gangLaborers.map((w) => ({
          id: w._id,
          name: w.name,
          phone: w.phone,
          monthlySalary: w.monthlySalary ?? null,
          bricksUnloaded: bricksByLaborer.get(w._id) ?? 0,
          damagedCount: damagedByLaborer.get(w._id) ?? 0,
        })),
        totalBricksUnloaded,
        totalDamaged,
        totalDue: due,
        totalPaid: paid,
        balance,
      };
    })
  );

  return {
    contractors: contractorResults,
    totalProductionAllContractors: contractorResults.reduce((sum, c) => sum + c.totalBricksUnloaded, 0),
    totalDamagedAllContractors: contractorResults.reduce((sum, c) => sum + c.totalDamaged, 0),
  };
}
