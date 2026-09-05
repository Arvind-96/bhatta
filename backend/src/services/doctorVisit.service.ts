import { randomUUID } from "crypto";
import { and, desc, eq, inArray } from "drizzle-orm";
import { db } from "../db/client";
import { doctorVisits, people, expenses, doctors } from "../db/schema";
import { SIMPLE_PAYMENT_MODES } from "../db/schema/_helpers";
import { assertDoctorInKiln } from "./doctor.service";
import { autoLogExpense } from "./expense.service";
import { clearBankMatchForExpense } from "./bankTransaction.service";
import { emitToKiln } from "../config/socket";

export type DoctorVisitPaymentMode = (typeof SIMPLE_PAYMENT_MODES)[number];

async function assertPersonInKiln(kilnId: string, personId: string) {
  const person = (await db.select({ _id: people._id, name: people.name }).from(people).where(and(eq(people._id, personId), eq(people.kilnId, kilnId))))[0];
  if (!person) throw new Error("Person not found in this kiln");
  return person;
}

export interface CreateDoctorVisitInput {
  kilnId: string;
  seasonId: string;
  doctorId: string;
  personId: string;
  ailment?: string;
  medicineCost?: number;
  consultationFee?: number;
  paymentMode?: DoctorVisitPaymentMode;
  cashAmount?: number;
  onlineAmount?: number;
  date?: Date;
  notes?: string;
}

// Logging a visit auto-creates one Expense for medicineCost +
// consultationFee combined (see expense.service.ts's autoLogExpense) —
// the admin never separately re-enters what was just spent on this visit.
// A zero-cost visit (both fields blank/0) simply skips the expense —
// autoLogExpense already no-ops for a zero/missing amount.
export async function createDoctorVisit(input: CreateDoctorVisitInput) {
  await assertDoctorInKiln(input.kilnId, input.doctorId);
  const person = await assertPersonInKiln(input.kilnId, input.personId);

  const _id = randomUUID();
  await db.insert(doctorVisits).values({ ...input, _id });
  const visit = (await db.select().from(doctorVisits).where(eq(doctorVisits._id, _id)))[0]!;

  const totalCost = (input.medicineCost ?? 0) + (input.consultationFee ?? 0);
  await autoLogExpense(
    input.kilnId,
    input.seasonId,
    "Doctor / Medical",
    totalCost,
    input.date,
    `Doctor visit for ${person.name}${input.ailment ? ` — ${input.ailment}` : ""}`,
    { doctorVisitId: _id, paymentMode: input.paymentMode, cashAmount: input.cashAmount, onlineAmount: input.onlineAmount }
  );

  emitToKiln(input.kilnId, "doctorVisit:update", visit);
  return visit;
}

export interface ListDoctorVisitsFilter {
  doctorId?: string;
  personId?: string;
}

// Populates doctorId/personId as {_id, name[, type]} objects — same
// manual-join-by-id-map pattern as stacking.service.ts's
// listStackingEntries (gangId/gherId), since this schema has no
// relational joins set up.
export async function listDoctorVisits(kilnId: string, filter: ListDoctorVisitsFilter = {}) {
  const conditions = [eq(doctorVisits.kilnId, kilnId)];
  if (filter.doctorId) conditions.push(eq(doctorVisits.doctorId, filter.doctorId));
  if (filter.personId) conditions.push(eq(doctorVisits.personId, filter.personId));
  const rows = await db.select().from(doctorVisits).where(and(...conditions)).orderBy(desc(doctorVisits.date));

  const doctorIds = [...new Set(rows.map((r) => r.doctorId))];
  const personIds = [...new Set(rows.map((r) => r.personId))];
  const [doctorRows, personRows] = await Promise.all([
    doctorIds.length ? db.select({ _id: doctors._id, name: doctors.name }).from(doctors).where(inArray(doctors._id, doctorIds)) : [],
    personIds.length ? db.select({ _id: people._id, name: people.name, type: people.type }).from(people).where(inArray(people._id, personIds)) : [],
  ]);
  const doctorById = new Map(doctorRows.map((d) => [d._id, d]));
  const personById = new Map(personRows.map((p) => [p._id, p]));
  return rows.map((r) => ({ ...r, doctorId: doctorById.get(r.doctorId) ?? r.doctorId, personId: personById.get(r.personId) ?? r.personId }));
}

export interface UpdateDoctorVisitInput {
  doctorId?: string;
  personId?: string;
  ailment?: string;
  medicineCost?: number;
  consultationFee?: number;
  paymentMode?: DoctorVisitPaymentMode;
  cashAmount?: number;
  onlineAmount?: number;
  date?: Date;
  notes?: string;
}

// Keeps the linked Expense row (matched via expenses.doctorVisitId) in
// sync with any cost/date/payment/doctor/person edit — same reasoning as
// updateLinkedExpensePaymentInfo, but also carries the recomputed amount
// and reason text through, which that helper doesn't (it only ever
// touches payment info). Unlike a soil/sand/land-lease contract's
// landId/landownerId, doctorId/personId carry no downstream aggregation
// keyed off them — just descriptive labels — so reassigning either here
// is safe and doesn't misattribute any tracked history.
export async function updateDoctorVisit(kilnId: string, visitId: string, input: UpdateDoctorVisitInput) {
  const existing = (await db.select().from(doctorVisits).where(and(eq(doctorVisits._id, visitId), eq(doctorVisits.kilnId, kilnId))))[0];
  if (!existing) throw new Error("Doctor visit not found in this kiln");

  if (input.doctorId) await assertDoctorInKiln(kilnId, input.doctorId);
  const person = input.personId ? await assertPersonInKiln(kilnId, input.personId) : await assertPersonInKiln(kilnId, existing.personId);

  await db.update(doctorVisits).set(input).where(eq(doctorVisits._id, visitId));
  const updated = (await db.select().from(doctorVisits).where(eq(doctorVisits._id, visitId)))[0]!;

  const newTotal = (input.medicineCost ?? existing.medicineCost) + (input.consultationFee ?? existing.consultationFee);
  const ailment = input.ailment ?? existing.ailment;
  const reason = `Doctor visit for ${person.name}${ailment ? ` — ${ailment}` : ""}`;
  const linkedExpense = (await db.select().from(expenses).where(eq(expenses.doctorVisitId, visitId)))[0];
  if (linkedExpense) {
    await db
      .update(expenses)
      .set({
        amount: newTotal,
        date: input.date ?? existing.date,
        notes: reason,
        paymentMode: input.paymentMode ?? existing.paymentMode ?? undefined,
        cashAmount: input.cashAmount ?? existing.cashAmount ?? undefined,
        onlineAmount: input.onlineAmount ?? existing.onlineAmount ?? undefined,
      })
      .where(eq(expenses._id, linkedExpense._id));
    const updatedExpense = (await db.select().from(expenses).where(eq(expenses._id, linkedExpense._id)))[0]!;
    emitToKiln(kilnId, "expense:update", updatedExpense);
  } else if (newTotal > 0) {
    // The original visit had a zero cost (no expense was auto-logged),
    // but the edit gave it a real one — log it now instead of losing it.
    await autoLogExpense(
      kilnId,
      existing.seasonId ?? "",
      "Doctor / Medical",
      newTotal,
      input.date ?? existing.date ?? undefined,
      reason,
      { doctorVisitId: visitId, paymentMode: input.paymentMode, cashAmount: input.cashAmount, onlineAmount: input.onlineAmount }
    );
  }

  emitToKiln(kilnId, "doctorVisit:update", updated);
  return updated;
}

export async function deleteDoctorVisit(kilnId: string, visitId: string) {
  const existing = (await db.select().from(doctorVisits).where(and(eq(doctorVisits._id, visitId), eq(doctorVisits.kilnId, kilnId))))[0];
  if (!existing) throw new Error("Doctor visit not found in this kiln");

  const linkedExpense = (await db.select({ _id: expenses._id }).from(expenses).where(eq(expenses.doctorVisitId, visitId)))[0];
  if (linkedExpense) {
    await db.delete(expenses).where(eq(expenses._id, linkedExpense._id));
    // Bug fix: same bank-reconciliation orphan as deleteExpense's own fix —
    // this visit's expense could independently have been bank-reconciled.
    await clearBankMatchForExpense(kilnId, linkedExpense._id);
    emitToKiln(kilnId, "expense:update", { _id: linkedExpense._id, deleted: true });
  }

  await db.delete(doctorVisits).where(eq(doctorVisits._id, visitId));
  emitToKiln(kilnId, "doctorVisit:update", { _id: visitId, deleted: true });
}
