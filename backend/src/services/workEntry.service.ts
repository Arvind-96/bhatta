import { randomUUID } from "crypto";
import { and, desc, eq, inArray } from "drizzle-orm";
import { db } from "../db/client";
import { workEntries, people, WORK_TYPES } from "../db/schema";
import { assertPersonOfType } from "./person.service";
import { addLedgerEntry } from "./ledger.service";
import { emitToKiln } from "../config/socket";

export type WorkType = (typeof WORK_TYPES)[number];

const WORK_TYPE_LABELS: Record<WorkType, string> = {
  PATHAI: "Pathai",
  BHARAI_TRANSPORT: "Bharai (field → outside ghera)",
  PAKAYI: "Pakayi",
  NIKASI: "Nikasi",
  LOADING: "Loading",
  BHARAI_CHAMBER_STACKING: "Bharai (outside → inside ghera)",
};

function wageFor(quantity: number, ratePerThousand: number) {
  return (quantity / 1000) * ratePerThousand;
}

export interface CreateWorkEntryInput {
  kilnId: string;
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
  db.insert(workEntries).values({ ...input, _id }).run();
  const entry = db.select().from(workEntries).where(eq(workEntries._id, _id)).get()!;

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
  const existing = db.select().from(workEntries).where(and(eq(workEntries._id, entryId), eq(workEntries.kilnId, kilnId))).get();
  if (!existing) throw new Error("Work entry not found in this kiln");

  const oldWage = wageFor(existing.quantity, existing.ratePerThousand);

  db.update(workEntries).set(input).where(eq(workEntries._id, entryId)).run();
  const updated = db.select().from(workEntries).where(eq(workEntries._id, entryId)).get()!;

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

export interface ListWorkEntryFilter {
  personId?: string;
  workType?: WorkType;
}

export async function listWorkEntries(kilnId: string, filter: ListWorkEntryFilter = {}) {
  const conditions = [eq(workEntries.kilnId, kilnId)];
  if (filter.personId) conditions.push(eq(workEntries.personId, filter.personId));
  if (filter.workType) conditions.push(eq(workEntries.workType, filter.workType));

  const rows = await db.select().from(workEntries).where(and(...conditions)).orderBy(desc(workEntries.date)).all();
  const personIds = [...new Set(rows.map((r) => r.personId))];
  if (personIds.length === 0) return rows;
  const peopleRows = await db
    .select({ _id: people._id, name: people.name, type: people.type, contractorId: people.contractorId })
    .from(people)
    .where(inArray(people._id, personIds))
    .all();
  const personById = new Map(peopleRows.map((p) => [p._id, p]));
  return rows.map((r) => ({ ...r, personId: personById.get(r.personId) ?? r.personId }));
}
