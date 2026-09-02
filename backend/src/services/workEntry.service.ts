import { randomUUID } from "crypto";
import { and, asc, desc, eq, gte, inArray, isNull, lte } from "drizzle-orm";
import { db } from "../db/client";
import { workEntries, people, ledgerEntries, WORK_TYPES } from "../db/schema";
import { assertPersonOfType } from "./person.service";
import { addLedgerEntry } from "./ledger.service";
import { emitToKiln } from "../config/socket";

export type WorkType = (typeof WORK_TYPES)[number];

const WORK_TYPE_LABELS: Record<WorkType, string> = {
  PATHAI: "Pathai",
  BHARAI_PHAD_TO_STOCK: "Bharai (Phad → stock/chamber)",
  PAKAYI: "Pakayi",
  NIKASI: "Nikasi",
  LOADING: "Loading",
  TUDI: "Tudi",
  RAWAS: "Rawas",
  BELDAR: "Beldar",
  BHARAI_STOCK_TO_CHAMBER: "Bharai (raw brick stock → inside chamber)",
};

function wageFor(quantity: number, ratePerThousand: number) {
  return (quantity / 1000) * ratePerThousand;
}

export interface CreateWorkEntryInput {
  kilnId: string;
  seasonId: string;
  personId: string;
  workType: WorkType;
  quantity: number;
  ratePerThousand: number;
  date?: Date;
  notes?: string;
}

// Logging a work entry posts the piece-rate wage straight to the
// labourer's ledger (category WAGE, same convention as pathai) — the
// thekedar's own profile never needs a separate sync step because it
// reads this same WorkEntry table live, filtered to whichever labourers
// are mapped to them (Person.contractorId).
export async function createWorkEntry(input: CreateWorkEntryInput) {
  await assertPersonOfType(input.kilnId, input.personId, ["WORKER", "HELPER"]);

  const _id = randomUUID();
  await db.insert(workEntries).values({ ...input, _id });
  const entry = (await db.select().from(workEntries).where(eq(workEntries._id, _id)))[0]!;

  await addLedgerEntry({
    kilnId: input.kilnId,
    personId: input.personId,
    direction: "DUE",
    amount: wageFor(input.quantity, input.ratePerThousand),
    reason: `${WORK_TYPE_LABELS[input.workType]}: ${input.quantity.toLocaleString()} units`,
    date: input.date,
    category: "WAGE",
  });

  emitToKiln(input.kilnId, "workEntry:update", entry);
  return entry;
}

export interface UpdateWorkEntryInput {
  workType?: WorkType;
  quantity?: number;
  ratePerThousand?: number;
  notes?: string;
}

// Full admin edit — never silently rewrites the wage already posted; a
// changed quantity/rate posts a correction entry for the difference
// instead (DUE if the corrected wage is higher, PAID if lower), same
// convention used everywhere else a piece-rate amount can be corrected.
export async function updateWorkEntry(kilnId: string, entryId: string, input: UpdateWorkEntryInput) {
  const existing = (await db.select().from(workEntries).where(and(eq(workEntries._id, entryId), eq(workEntries.kilnId, kilnId))))[0];
  if (!existing) throw new Error("Work entry not found in this kiln");

  const oldWage = wageFor(existing.quantity, existing.ratePerThousand);

  await db.update(workEntries).set(input).where(eq(workEntries._id, entryId));
  const updated = (await db.select().from(workEntries).where(eq(workEntries._id, entryId)))[0]!;

  if (input.quantity !== undefined || input.ratePerThousand !== undefined) {
    const newWage = wageFor(updated.quantity, updated.ratePerThousand);
    const delta = Math.round((newWage - oldWage) * 100) / 100;
    const label = WORK_TYPE_LABELS[updated.workType as WorkType];
    if (delta > 0) {
      await addLedgerEntry({
        kilnId,
        personId: updated.personId,
        direction: "DUE",
        amount: delta,
        reason: `${label} correction: revised up to ${updated.quantity.toLocaleString()} units @ ₹${updated.ratePerThousand}/1000`,
        category: "WAGE",
      });
    } else if (delta < 0) {
      await addLedgerEntry({
        kilnId,
        personId: updated.personId,
        direction: "PAID",
        amount: -delta,
        reason: `${label} correction: revised down to ${updated.quantity.toLocaleString()} units @ ₹${updated.ratePerThousand}/1000`,
        category: "WAGE",
      });
    }
  }

  emitToKiln(kilnId, "workEntry:update", updated);
  return updated;
}

// Reverses the wage this entry posted with a PAID correction (same
// delta-correction math updateWorkEntry uses for a revised quantity/rate,
// applied against a target of zero) before removing the row.
export async function deleteWorkEntry(kilnId: string, entryId: string) {
  const existing = (await db.select().from(workEntries).where(and(eq(workEntries._id, entryId), eq(workEntries.kilnId, kilnId))))[0];
  if (!existing) throw new Error("Work entry not found in this kiln");

  const wage = wageFor(existing.quantity, existing.ratePerThousand);
  if (wage > 0) {
    const label = WORK_TYPE_LABELS[existing.workType as WorkType];
    await addLedgerEntry({
      kilnId,
      personId: existing.personId,
      direction: "PAID",
      amount: wage,
      reason: `${label} deleted: reversing ₹${wage.toLocaleString("en-IN")}`,
      category: "WAGE",
    });
  }

  await db.delete(workEntries).where(eq(workEntries._id, entryId));
  emitToKiln(kilnId, "workEntry:update", { _id: entryId, deleted: true });
}

export interface ListWorkEntryFilter {
  personId?: string;
  workType?: WorkType;
  from?: Date;
  to?: Date;
}

// seasonId is nullable — pass null for an all-time, every-season view (see
// report.service.ts's full person report).
export async function listWorkEntries(kilnId: string, seasonId: string | null, filter: ListWorkEntryFilter = {}) {
  const conditions = [eq(workEntries.kilnId, kilnId)];
  if (seasonId) conditions.push(eq(workEntries.seasonId, seasonId));
  if (filter.personId) conditions.push(eq(workEntries.personId, filter.personId));
  if (filter.workType) conditions.push(eq(workEntries.workType, filter.workType));
  if (filter.from) conditions.push(gte(workEntries.date, filter.from));
  if (filter.to) conditions.push(lte(workEntries.date, filter.to));

  const rows = await db.select().from(workEntries).where(and(...conditions)).orderBy(desc(workEntries.date));
  const personIds = [...new Set(rows.map((r) => r.personId))];
  if (personIds.length === 0) return rows;
  const peopleRows = await db
    .select({ _id: people._id, name: people.name, type: people.type, contractorId: people.contractorId })
    .from(people)
    .where(inArray(people._id, personIds));
  const personById = new Map(peopleRows.map((p) => [p._id, p]));
  return rows.map((r) => ({ ...r, personId: personById.get(r.personId) ?? r.personId }));
}

function sumByDirection(entries: { direction: "DUE" | "PAID"; amount: number }[]) {
  const due = entries.filter((e) => e.direction === "DUE").reduce((sum, e) => sum + e.amount, 0);
  const paid = entries.filter((e) => e.direction === "PAID").reduce((sum, e) => sum + e.amount, 0);
  return { due, paid, balance: due - paid };
}

// Independent Pakayi operators only (no thekedar) — same shape/exclusion
// rule as nikasi.service.ts's nikasiOperatorSummary: LABOUR_CONTRACTOR
// persons are always covered by pakayiContractorSummary instead, and
// anyone mapped under a Pakayi contractor is folded into that contractor's
// card rather than listed separately here.
export async function pakayiOperatorSummary(kilnId: string, seasonId: string) {
  const operators = await db
    .select()
    .from(people)
    .where(and(eq(people.kilnId, kilnId), inArray(people.type, ["WORKER", "HELPER"]), isNull(people.pakayiContractorId), eq(people.active, true)))
    .orderBy(asc(people.name));

  const allEntries = await db.select().from(workEntries).where(and(eq(workEntries.kilnId, kilnId), eq(workEntries.seasonId, seasonId), eq(workEntries.workType, "PAKAYI")));
  const entriesByPerson = new Map<string, typeof allEntries>();
  for (const e of allEntries) {
    if (!entriesByPerson.has(e.personId)) entriesByPerson.set(e.personId, []);
    entriesByPerson.get(e.personId)!.push(e);
  }

  const results = [];
  for (const operator of operators) {
    const opEntries = entriesByPerson.get(operator._id) ?? [];
    if (opEntries.length === 0) continue;

    // Ledger balance stays all-time regardless of seasonId (see
    // listLedgerForPerson's doc comment in ledger.service.ts) — seasonId on
    // a ledger entry is optional and several real entries predate it, so
    // hard-filtering here would silently understate an operator's balance
    // relative to every other balance display in the app.
    const opLedgerEntries = await db.select().from(ledgerEntries).where(and(eq(ledgerEntries.kilnId, kilnId), eq(ledgerEntries.personId, operator._id)));
    const { due, paid, balance } = sumByDirection(opLedgerEntries);

    results.push({
      operator: {
        id: operator._id,
        name: operator.name,
        phone: operator.phone,
        type: operator.type,
        monthlySalary: operator.monthlySalary ?? null,
      },
      totalQuantity: opEntries.reduce((sum, e) => sum + e.quantity, 0),
      entryCount: opEntries.length,
      totalDue: due,
      totalPaid: paid,
      balance,
    });
  }

  return {
    operators: results,
    totalQuantityAllOperators: results.reduce((sum, r) => sum + r.totalQuantity, 0),
  };
}

// The "how much do I owe Thekedar X's whole Pakayi gang" rollup — every
// LABOUR_CONTRACTOR, the workers mapped under them for firing-side work
// (Person.pakayiContractorId), their combined output (including entries
// logged against the contractor directly) and ledger. Same shape as
// nikasi.service.ts's nikasiContractorSummary, built on the shared
// work_entries table (filtered to workType PAKAYI) instead of a dedicated
// entries table, since Pakayi never got one of its own.
export async function pakayiContractorSummary(kilnId: string, seasonId: string) {
  const [allContractors, workers, allEntries] = await Promise.all([
    db.select().from(people).where(and(eq(people.kilnId, kilnId), eq(people.type, "LABOUR_CONTRACTOR"), eq(people.active, true))).orderBy(asc(people.name)),
    db.select().from(people).where(and(eq(people.kilnId, kilnId), inArray(people.type, ["WORKER", "HELPER"]), eq(people.active, true))),
    db.select().from(workEntries).where(and(eq(workEntries.kilnId, kilnId), eq(workEntries.seasonId, seasonId), eq(workEntries.workType, "PAKAYI"))),
  ]);

  const workerIdsWithEntries = new Set(allEntries.map((e) => e.personId));
  const relevantWorkers = workers.filter((w) => w.workType === "PAKAYI" || workerIdsWithEntries.has(w._id));

  const contractorIdsWithWorkers = new Set(relevantWorkers.filter((w) => w.pakayiContractorId).map((w) => w.pakayiContractorId!));
  const contractors = allContractors.filter((c) => c.workType === "PAKAYI" || contractorIdsWithWorkers.has(c._id));

  const contractorResults = await Promise.all(
    contractors.map(async (contractor) => {
      const gangWorkers = relevantWorkers.filter((w) => w.pakayiContractorId === contractor._id);
      const workerIds = gangWorkers.map((w) => w._id);
      const personIds = [contractor._id, ...workerIds];

      // Ledger balance stays all-time regardless of seasonId — see the
      // identical note on the operator-summary query above.
      const [gangEntries, gangLedgerEntries] = await Promise.all([
        db.select().from(workEntries).where(and(eq(workEntries.kilnId, kilnId), eq(workEntries.seasonId, seasonId), eq(workEntries.workType, "PAKAYI"), inArray(workEntries.personId, personIds))),
        db.select().from(ledgerEntries).where(and(eq(ledgerEntries.kilnId, kilnId), inArray(ledgerEntries.personId, personIds))),
      ]);

      const quantityByWorker = new Map<string, number>();
      for (const e of gangEntries) {
        quantityByWorker.set(e.personId, (quantityByWorker.get(e.personId) ?? 0) + e.quantity);
      }
      const totalQuantity = gangEntries.reduce((sum, e) => sum + e.quantity, 0);
      const { due, paid, balance } = sumByDirection(gangLedgerEntries);

      return {
        contractor: {
          id: contractor._id,
          name: contractor.name,
          phone: contractor.phone,
          monthlySalary: contractor.monthlySalary ?? null,
        },
        workers: gangWorkers.map((w) => ({
          id: w._id,
          name: w.name,
          phone: w.phone,
          monthlySalary: w.monthlySalary ?? null,
          quantity: quantityByWorker.get(w._id) ?? 0,
        })),
        totalQuantity,
        totalDue: due,
        totalPaid: paid,
        balance,
      };
    })
  );

  return {
    contractors: contractorResults,
    totalQuantityAllContractors: contractorResults.reduce((sum, c) => sum + c.totalQuantity, 0),
  };
}
