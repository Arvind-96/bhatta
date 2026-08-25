import { randomUUID } from "crypto";
import { and, desc, eq, gte, lte } from "drizzle-orm";
import { db } from "../db/client";
import { expenses, soilTrips, dispatches, EXPENSE_CATEGORIES } from "../db/schema";
import { SIMPLE_PAYMENT_MODES } from "../db/schema/_helpers";
import { emitToKiln } from "../config/socket";
import { findOrCreateExpenseType } from "./expenseType.service";

export type ExpenseCategory = (typeof EXPENSE_CATEGORIES)[number];
export type ExpensePaymentMode = (typeof SIMPLE_PAYMENT_MODES)[number];

export interface CreateExpenseInput {
  kilnId: string;
  expenseTypeId?: string;
  category?: ExpenseCategory;
  amount: number;
  quantity?: number;
  paymentMode?: ExpensePaymentMode;
  // Only meaningful when paymentMode is CASH_AND_ONLINE — must sum to
  // `amount`, same convention as dispatches.cashAmount/onlineAmount.
  cashAmount?: number;
  onlineAmount?: number;
  hours?: number;
  date?: Date;
  notes?: string;
  soilTripId?: string;
  incidentId?: string;
  dispatchId?: string;
  brickLoadingEntryId?: string;
}

export async function createExpense(input: CreateExpenseInput) {
  if (input.soilTripId) {
    const trip = (await db.select({ _id: soilTrips._id }).from(soilTrips).where(and(eq(soilTrips._id, input.soilTripId), eq(soilTrips.kilnId, input.kilnId))))[0];
    if (!trip) throw new Error("Referenced soil trip not found in this kiln");
  }
  if (input.dispatchId) {
    const dispatch = (await db.select({ _id: dispatches._id }).from(dispatches).where(and(eq(dispatches._id, input.dispatchId), eq(dispatches.kilnId, input.kilnId))))[0];
    if (!dispatch) throw new Error("Referenced dispatch not found in this kiln");
  }

  const _id = randomUUID();
  await db.insert(expenses).values({ ...input, _id });
  const expense = (await db.select().from(expenses).where(eq(expenses._id, _id)))[0]!;
  emitToKiln(input.kilnId, "expense:update", expense);
  return expense;
}

// Auto-logs a cost that already lives on a Brick Loading trip or Dispatch
// row (driver reward/inam, loading charge, unloading charge) as a first-
// class Expense the moment that row is created — see brickLoading.service.ts
// createBrickLoadingEntry and dispatch.service.ts createDispatch, the only
// two call sites. Silently no-ops for a zero/missing amount so callers
// don't need their own guard.
export async function autoLogExpense(
  kilnId: string,
  typeName: string,
  amount: number | null | undefined,
  date: Date | undefined,
  notes: string,
  links: {
    dispatchId?: string;
    brickLoadingEntryId?: string;
    paymentMode?: ExpensePaymentMode;
    cashAmount?: number;
    onlineAmount?: number;
  } = {}
) {
  if (!amount || amount <= 0) return;
  const expenseType = await findOrCreateExpenseType(kilnId, typeName);
  await createExpense({ kilnId, expenseTypeId: expenseType._id, amount, date, notes, ...links });
}

export interface UpdateExpenseInput {
  amount?: number;
  quantity?: number;
  paymentMode?: ExpensePaymentMode;
  cashAmount?: number;
  onlineAmount?: number;
  hours?: number;
  date?: Date;
  notes?: string;
}

// Finds the single Expense row auto-logged for a specific cost on a Brick
// Loading trip (or Dispatch) — by brickLoadingEntryId/dispatchId plus the
// expense TYPE name, since a trip can have up to three such rows (Driver
// Reward, Loading Charge, Unloading Charge) and only the one matching this
// exact type should be touched. Used by updateBrickLoadingEntry/
// updateDispatch to carry a payment-mode/split edit through to the
// already-created Expense row, so correcting a historical trip's payment
// details (see Edit Mode) actually reaches the Expense page too, not just
// the trip's own record.
export async function updateLinkedExpensePaymentInfo(
  kilnId: string,
  link: { brickLoadingEntryId?: string; dispatchId?: string },
  typeName: string,
  info: { paymentMode?: ExpensePaymentMode; cashAmount?: number; onlineAmount?: number }
) {
  const expenseType = await findOrCreateExpenseType(kilnId, typeName);
  const linkCondition = link.brickLoadingEntryId
    ? eq(expenses.brickLoadingEntryId, link.brickLoadingEntryId)
    : link.dispatchId
    ? eq(expenses.dispatchId, link.dispatchId)
    : undefined;
  if (!linkCondition) return;
  const existing = (
    await db
      .select()
      .from(expenses)
      .where(and(eq(expenses.kilnId, kilnId), linkCondition, eq(expenses.expenseTypeId, expenseType._id)))
  )[0];
  if (!existing) return;
  await db.update(expenses).set(info).where(eq(expenses._id, existing._id));
  const updated = (await db.select().from(expenses).where(eq(expenses._id, existing._id)))[0]!;
  emitToKiln(kilnId, "expense:update", updated);
}

export async function updateExpense(kilnId: string, expenseId: string, input: UpdateExpenseInput) {
  const existing = (await db.select().from(expenses).where(and(eq(expenses._id, expenseId), eq(expenses.kilnId, kilnId))))[0];
  if (!existing) throw new Error("Expense not found in this kiln");

  await db.update(expenses).set(input).where(eq(expenses._id, expenseId));
  const updated = (await db.select().from(expenses).where(eq(expenses._id, expenseId)))[0]!;
  emitToKiln(kilnId, "expense:update", updated);
  return updated;
}

export async function deleteExpense(kilnId: string, expenseId: string) {
  const existing = (await db.select().from(expenses).where(and(eq(expenses._id, expenseId), eq(expenses.kilnId, kilnId))))[0];
  if (!existing) throw new Error("Expense not found in this kiln");

  await db.delete(expenses).where(eq(expenses._id, expenseId));
  emitToKiln(kilnId, "expense:update", { _id: expenseId, deleted: true });
}

export interface ListExpensesFilter {
  category?: ExpenseCategory;
  from?: Date;
  to?: Date;
}

export async function listExpenses(kilnId: string, filter: ListExpensesFilter = {}) {
  const conditions = [eq(expenses.kilnId, kilnId)];
  if (filter.category) conditions.push(eq(expenses.category, filter.category));
  if (filter.from) conditions.push(gte(expenses.date, filter.from));
  if (filter.to) conditions.push(lte(expenses.date, filter.to));
  return await db.select().from(expenses).where(and(...conditions)).orderBy(desc(expenses.date));
}

export async function expenseTotalsByCategory(kilnId: string, days = 30) {
  const since = new Date();
  since.setDate(since.getDate() - days);
  const rows = await db.select().from(expenses).where(and(eq(expenses.kilnId, kilnId), gte(expenses.date, since)));

  const totals = new Map<ExpenseCategory, number>();
  for (const e of rows) {
    const cat = e.category as ExpenseCategory;
    totals.set(cat, (totals.get(cat) ?? 0) + e.amount);
  }
  return Array.from(totals.entries()).map(([category, amount]) => ({ category, amount }));
}

export async function totalExpensesSince(kilnId: string, since: Date) {
  const rows = await db.select().from(expenses).where(and(eq(expenses.kilnId, kilnId), gte(expenses.date, since)));
  return rows.reduce((sum, e) => sum + e.amount, 0);
}
