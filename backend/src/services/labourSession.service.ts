import { and, eq, inArray, isNull } from "drizzle-orm";
import { db } from "../db/client";
import { LEDGER_CATEGORIES, labourSessions, ledgerEntries, people } from "../db/schema";
import { assertPersonOfType } from "./person.service";
import { emitToKiln } from "../config/socket";

type LedgerCategory = (typeof LEDGER_CATEGORIES)[number];
const DEDUCTION_CATEGORIES: LedgerCategory[] = ["ADVANCE", "KHARCHI", "MEDICAL", "FESTIVAL"];

async function laborerIdsUnderContractor(kilnId: string, contractorId: string) {
  const rows = await db
    .select({ _id: people._id })
    .from(people)
    .where(and(eq(people.kilnId, kilnId), eq(people.contractorId, contractorId), inArray(people.type, ["WORKER", "HELPER"])));
  return rows.map((r) => r._id);
}

// All-time sum -- never date-windowed. A "Number of laborers" session set
// up today must still net out an advance the admin paid this contractor
// months ago; scoping this to the session's own start date was the bug an
// admin flagged after paying ₹3,60,000 before ever setting up a session.
// Matches the Financial Ledger card on this same profile, which is also
// an all-time total.
async function sumPaidAllTime(kilnId: string, personIds: string[], categories: LedgerCategory[]) {
  if (personIds.length === 0) return 0;
  const rows = await db
    .select()
    .from(ledgerEntries)
    .where(
      and(
        eq(ledgerEntries.kilnId, kilnId),
        inArray(ledgerEntries.personId, personIds),
        eq(ledgerEntries.direction, "PAID"),
        inArray(ledgerEntries.category, categories)
      )
    );
  return rows.reduce((sum, e) => sum + e.amount, 0);
}

// Total Amount Payable by Admin = (every session this contractor has ever
// had, summed: Laborers x Fare + Laborers x Advance) - (all-time
// advance/kharchi/medical/festival paid to the gang) - (all-time advance
// paid to the contractor). Summing gross across every session (not just
// the open one) is what makes "carry forward" automatic and exact when a
// new session starts -- the same all-time deduction total simply keeps
// being netted against a running gross that now includes the new
// session's terms too, so nothing needs to be double-subtracted or
// snapshotted for the math to stay correct.
export async function getActiveSession(kilnId: string, contractorId: string) {
  const sessions = await db.select().from(labourSessions).where(and(eq(labourSessions.kilnId, kilnId), eq(labourSessions.contractorId, contractorId)));
  if (sessions.length === 0) return { session: null, base: 0, deductionsToLaborers: 0, advancePaidToContractor: 0, total: 0 };

  const activeSession = sessions.find((s) => s.endDate === null) ?? null;
  const base = sessions.reduce((sum, s) => sum + s.numberOfLaborers * (s.farePerLaborer + s.advancePerLaborer), 0);

  const laborerIds = await laborerIdsUnderContractor(kilnId, contractorId);
  const [deductionsToLaborers, advancePaidToContractor] = await Promise.all([
    sumPaidAllTime(kilnId, laborerIds, DEDUCTION_CATEGORIES),
    sumPaidAllTime(kilnId, [contractorId], ["ADVANCE"]),
  ]);

  const total = Math.round((base - deductionsToLaborers - advancePaidToContractor) * 100) / 100;
  return { session: activeSession, base, deductionsToLaborers, advancePaidToContractor, total };
}

export interface LabourSessionInput {
  numberOfLaborers: number;
  farePerLaborer: number;
  advancePerLaborer: number;
}

// Sets up the contractor's first session, or edits the terms of their
// current open one in place.
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

// Closes the contractor's current open session and opens a fresh one with
// the given terms. carriedForwardAmount is stored purely as a display
// snapshot (the "Includes ₹X carried forward..." note) -- it plays no
// part in the live total above, which already carries every session's
// balance forward automatically via the cumulative-gross sum.
export async function startNewSession(kilnId: string, contractorId: string, input: LabourSessionInput) {
  await assertPersonOfType(kilnId, contractorId, ["LABOUR_CONTRACTOR"]);
  const existing = (
    await db
      .select()
      .from(labourSessions)
      .where(and(eq(labourSessions.kilnId, kilnId), eq(labourSessions.contractorId, contractorId), isNull(labourSessions.endDate)))
  )[0];

  let carriedForwardAmount = 0;
  if (existing) {
    const { total } = await getActiveSession(kilnId, contractorId);
    carriedForwardAmount = Math.max(0, Math.round(total * 100) / 100);
    await db.update(labourSessions).set({ endDate: new Date() }).where(eq(labourSessions._id, existing._id));
  }

  await db.insert(labourSessions).values({ ...input, kilnId, contractorId, startDate: new Date(), carriedForwardAmount });
  emitToKiln(kilnId, "labourSession:update", { contractorId });
  return getActiveSession(kilnId, contractorId);
}
