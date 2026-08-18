import { randomUUID } from "crypto";
import { and, desc, eq, gte, lte } from "drizzle-orm";
import { db } from "../db/client";
import { expenses, soilTrips, dispatches, EXPENSE_CATEGORIES, LEDGER_PAYMENT_MODES } from "../db/schema";
import { emitToKiln } from "../config/socket";

export type ExpenseCategory = (typeof EXPENSE_CATEGORIES)[number];
export type ExpensePaymentMode = Exclude<(typeof LEDGER_PAYMENT_MODES)[number], "CASH_AND_ONLINE">;

export interface CreateExpenseInput {
  kilnId: string;
  category: ExpenseCategory;
  amount: number;
  paymentMode?: ExpensePaymentMode;
  hours?: number;
  date?: Date;
  notes?: string;
  soilTripId?: string;
  incidentId?: string;
  dispatchId?: string;
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
