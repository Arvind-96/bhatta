import { and, desc, eq, gte, inArray, isNull, lt } from "drizzle-orm";
import { db } from "../db/client";
import { LEDGER_CATEGORIES, labourSessions, ledgerEntries, people } from "../db/schema";
import { assertPersonOfType } from "./person.service";
import { emitToKiln } from "../config/socket";

type LedgerCategory = (typeof LEDGER_CATEGORIES)[number];
const DEDUCTION_CATEGORIES: LedgerCategory[] = ["ADVANCE", "KHARCHI", "MEDICAL", "FESTIVAL"];

type LabourSession = typeof labourSessions.$inferSelect;

async function laborerIdsUnderContractor(kilnId: string, contractorId: string) {
  const rows = await db
    .select({ _id: people._id })
    .from(people)
    .where(and(eq(people.kilnId, kilnId), eq(people.contractorId, contractorId), inArray(people.type, ["WORKER", "HELPER"])));
  return rows.map((r) => r._id);
}

// Sums ledger entries for the given personIds within the session's own
// [startDate, endDate) window -- endDate is only set once a session is
// closed, so an open session's window is simply "from startDate onward".
// This is what keeps a prior session's already-carried-forward payments
// from being subtracted a second time against the new session's total.
async function sumPaidInWindow(kilnId: string, personIds: string[], categories: LedgerCategory[], session: Pick<LabourSession, "startDate" | "endDate">) {
  if (personIds.length === 0) return 0;
  const conditions = [
    eq(ledgerEntries.kilnId, kilnId),
    inArray(ledgerEntries.personId, personIds),
    eq(ledgerEntries.direction, "PAID"),
    inArray(ledgerEntries.category, categories),
    gte(ledgerEntries.date, session.startDate!),
  ];
  if (session.endDate) conditions.push(lt(ledgerEntries.date, session.endDate));
  const rows = await db.select().from(ledgerEntries).where(and(...conditions));
  return rows.reduce((sum, e) => sum + e.amount, 0);
}

async function computeSessionFigures(kilnId: string, contractorId: string, session: LabourSession) {
  const laborerIds = await laborerIdsUnderContractor(kilnId, contractorId);
  const [deductionsToLaborers, advancePaidToContractor] = await Promise.all([
    sumPaidInWindow(kilnId, laborerIds, DEDUCTION_CATEGORIES, session),
    sumPaidInWindow(kilnId, [contractorId], ["ADVANCE"], session),
  ]);

  const base = session.numberOfLaborers * (session.farePerLaborer + session.advancePerLaborer);
  const total = base - deductionsToLaborers - advancePaidToContractor + session.carriedForwardAmount;

  return { base, deductionsToLaborers, advancePaidToContractor, total };
}

// The contractor's current open session (endDate NULL) plus its live
// "Total Amount Payable by Admin" figure -- null session (never set up
// yet) reads as all-zero, matching a freshly-added thekedar with no
// terms entered.
export async function getActiveSession(kilnId: string, contractorId: string) {
  const session = (
    await db
      .select()
      .from(labourSessions)
      .where(and(eq(labourSessions.kilnId, kilnId), eq(labourSessions.contractorId, contractorId), isNull(labourSessions.endDate)))
      .orderBy(desc(labourSessions.startDate))
  )[0];
  if (!session) return { session: null, base: 0, deductionsToLaborers: 0, advancePaidToContractor: 0, total: 0 };
  const figures = await computeSessionFigures(kilnId, contractorId, session);
  return { session, ...figures };
}

export interface LabourSessionInput {
  numberOfLaborers: number;
  farePerLaborer: number;
  advancePerLaborer: number;
}

// Sets up the contractor's first session, or edits the terms of their
// current open one in place -- startDate/carriedForwardAmount are left
// untouched here; only startNewSession below rolls those.
export async function saveActiveSession(kilnId: string, contractorId: string, input: LabourSessionInput) {
  await assertPersonOfType(kilnId, contractorId, ["LABOUR_CONTRACTOR"]);
  const existing = (
    await db
      .select()
      .from(labourSessions)
      .where(and(eq(labourSessions.kilnId, kilnId), eq(labourSessions.contractorId, contractorId), isNull(labourSessions.endDate)))
  )[0];

  if (existing) {
    await db.update(labourSessions).set(input).where(eq(labourSessions._id, existing._id));
  } else {
    await db.insert(labourSessions).values({ ...input, kilnId, contractorId, startDate: new Date(), carriedForwardAmount: 0 });
  }
  emitToKiln(kilnId, "labourSession:update", { contractorId });
  return getActiveSession(kilnId, contractorId);
}

// Closes the contractor's current open session -- its final "Total Amount
// Payable by Admin" becomes the new session's carriedForwardAmount (only
// when positive; an already-settled or overpaid session starts the next
// one clean at 0, per admin request) -- then opens a fresh session with
// the given terms.
export async function startNewSession(kilnId: string, contractorId: string, input: LabourSessionInput) {
  await assertPersonOfType(kilnId, contractorId, ["LABOUR_CONTRACTOR"]);
  const existing = (
    await db
      .select()
      .from(labourSessions)
      .where(and(eq(labourSessions.kilnId, kilnId), eq(labourSessions.contractorId, contractorId), isNull(labourSessions.endDate)))
  )[0];

  const now = new Date();
  let carriedForwardAmount = 0;
  if (existing) {
    const { total } = await computeSessionFigures(kilnId, contractorId, { ...existing, endDate: now });
    carriedForwardAmount = Math.max(0, Math.round(total * 100) / 100);
    await db.update(labourSessions).set({ endDate: now }).where(eq(labourSessions._id, existing._id));
  }

  await db.insert(labourSessions).values({ ...input, kilnId, contractorId, startDate: now, carriedForwardAmount });
  emitToKiln(kilnId, "labourSession:update", { contractorId });
  return getActiveSession(kilnId, contractorId);
}
