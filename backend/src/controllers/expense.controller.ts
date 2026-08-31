import { Response } from "express";
import { z } from "zod";
import { AuthedRequest } from "../middleware/auth.middleware";
import { createExpense, deleteExpense, expenseTotalsByCategory, listExpenses, updateExpense } from "../services/expense.service";
import { findOrCreateExpenseType } from "../services/expenseType.service";
import { EXPENSE_CATEGORIES } from "../db/schema";
import { SIMPLE_PAYMENT_MODES } from "../db/schema/_helpers";
import { validateCashOnlineSplit } from "../utils/paymentSplit";

const categorySchema = z.enum(EXPENSE_CATEGORIES);

const createSchema = z
  .object({
    // The admin either picked an existing type from the dropdown or typed a
    // new one into "Add Expense Type" — either way the client just sends the
    // resolved name and the server finds-or-creates it (see
    // expenseType.service.ts's findOrCreateExpenseType).
    expenseTypeName: z.string().min(1),
    amount: z.number().positive(),
    quantity: z.number().positive().optional(),
    paymentMode: z.enum(SIMPLE_PAYMENT_MODES).optional(),
    cashAmount: z.number().min(0).optional(),
    onlineAmount: z.number().min(0).optional(),
    hours: z.number().positive().optional(),
    date: z.string().optional(),
    notes: z.string().optional(),
    soilTripId: z.string().optional(),
    dispatchId: z.string().optional(),
  })
  .superRefine((data, ctx) => validateCashOnlineSplit(data, data.amount, ctx));

export async function create(req: AuthedRequest, res: Response) {
  const input = createSchema.parse(req.body);
  const { expenseTypeName, ...rest } = input;
  const expenseType = await findOrCreateExpenseType(req.kiln!.id, expenseTypeName);
  const expense = await createExpense({
    ...rest,
    expenseTypeId: expenseType._id,
    kilnId: req.kiln!.id,
    seasonId: req.season!.id,
    date: input.date ? new Date(input.date) : undefined,
  });
  res.status(201).json(expense);
}

export async function list(req: AuthedRequest, res: Response) {
  const expenses = await listExpenses(req.kiln!.id, req.season!.id, {
    category: req.query.category ? categorySchema.parse(req.query.category) : undefined,
    from: req.query.from ? new Date(String(req.query.from)) : undefined,
    to: req.query.to ? new Date(String(req.query.to)) : undefined,
  });
  res.json(expenses);
}

export async function totals(req: AuthedRequest, res: Response) {
  const days = req.query.days ? Number(req.query.days) : 30;
  const result = await expenseTotalsByCategory(req.kiln!.id, req.season!.id, days);
  res.json(result);
}

const updateSchema = z
  .object({
    amount: z.number().positive().optional(),
    quantity: z.number().positive().optional(),
    paymentMode: z.enum(SIMPLE_PAYMENT_MODES).optional(),
    cashAmount: z.number().min(0).optional(),
    onlineAmount: z.number().min(0).optional(),
    hours: z.number().positive().optional(),
    date: z.string().optional(),
    notes: z.string().optional(),
  })
  .superRefine((data, ctx) => {
    if (data.amount === undefined) return;
    validateCashOnlineSplit(data, data.amount, ctx);
  });

export async function update(req: AuthedRequest, res: Response) {
  const input = updateSchema.parse(req.body);
  const expense = await updateExpense(req.kiln!.id, req.params.id, {
    ...input,
    date: input.date ? new Date(input.date) : undefined,
  });
  res.json(expense);
}

export async function remove(req: AuthedRequest, res: Response) {
  await deleteExpense(req.kiln!.id, req.params.id);
  res.status(204).end();
}
