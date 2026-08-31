import { randomUUID } from "crypto";
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { db } from "../db/client";
import { expenseTypes, expenses } from "../db/schema";
import { seasonIdsThrough } from "./season.util";
import { emitToKiln } from "../config/socket";

export interface ExpenseTypeInput {
  name: string;
  openingPaid?: number;
  openingDue?: number;
}

export async function createExpenseType(kilnId: string, input: ExpenseTypeInput) {
  const _id = randomUUID();
  await db.insert(expenseTypes).values({ ...input, name: input.name.trim(), _id, kilnId });
  const row = (await db.select().from(expenseTypes).where(eq(expenseTypes._id, _id)))[0]!;
  emitToKiln(kilnId, "expenseType:update", row);
  return row;
}

export async function listExpenseTypes(kilnId: string) {
  return db.select().from(expenseTypes).where(eq(expenseTypes.kilnId, kilnId)).orderBy(desc(expenseTypes.createdAt));
}

// Case-insensitive exact-name lookup — the "Add Expense Type" free-text
// field, and every auto-logged expense from Brick Loading/Dispatch,
// resolve against this before creating anything new (find-or-create,
// never a duplicate for the same name).
export async function findExpenseTypeByName(kilnId: string, name: string) {
  const trimmed = name.trim();
  if (!trimmed) return undefined;
  return (
    await db
      .select()
      .from(expenseTypes)
      .where(and(eq(expenseTypes.kilnId, kilnId), eq(sql`lower(${expenseTypes.name})`, trimmed.toLowerCase())))
  )[0];
}

export async function findOrCreateExpenseType(kilnId: string, name: string) {
  const existing = await findExpenseTypeByName(kilnId, name);
  if (existing) return existing;
  return createExpenseType(kilnId, { name });
}

// Every expense logged under this type, plus the live paid/due balance
// derived from them — never stored/cached, so it can never drift out of
// sync with the expenses list it's computed from. There's no separate
// "new charge" concept for expenses (unlike a Customer's invoices) — every
// expense is a pure payment, so it always adds to paid and subtracts from
// due. openingPaid/openingDue are the type's starting balances, added on
// top of every expense's own amount.
export async function getExpenseTypeDetail(kilnId: string, expenseTypeId: string, seasonId: string) {
  const expenseType = (await db.select().from(expenseTypes).where(and(eq(expenseTypes._id, expenseTypeId), eq(expenseTypes.kilnId, kilnId))))[0];
  if (!expenseType) throw new Error("Expense type not found in this kiln");

  const seasonIds = await seasonIdsThrough(kilnId, seasonId);
  const rows = await db
    .select()
    .from(expenses)
    .where(and(eq(expenses.kilnId, kilnId), inArray(expenses.seasonId, seasonIds), eq(expenses.expenseTypeId, expenseTypeId)))
    .orderBy(desc(expenses.date));

  let totalPaid = expenseType.openingPaid;
  let totalDue = expenseType.openingDue;
  for (const e of rows) {
    totalPaid += e.amount;
    totalDue -= e.amount;
  }
  totalPaid = Math.round(totalPaid * 100) / 100;
  totalDue = Math.round(totalDue * 100) / 100;

  return { expenseType, expenses: rows, totalPaid, totalDue };
}

export async function updateExpenseType(kilnId: string, expenseTypeId: string, input: Partial<ExpenseTypeInput>) {
  const existing = (await db.select().from(expenseTypes).where(and(eq(expenseTypes._id, expenseTypeId), eq(expenseTypes.kilnId, kilnId))))[0];
  if (!existing) throw new Error("Expense type not found in this kiln");
  await db.update(expenseTypes).set(input.name ? { ...input, name: input.name.trim() } : input).where(eq(expenseTypes._id, expenseTypeId));
  const updated = (await db.select().from(expenseTypes).where(eq(expenseTypes._id, expenseTypeId)))[0]!;
  emitToKiln(kilnId, "expenseType:update", updated);
  return updated;
}
