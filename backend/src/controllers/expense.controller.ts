import { Response } from "express";
import { z } from "zod";
import { AuthedRequest } from "../middleware/auth.middleware";
import { createExpense, expenseTotalsByCategory, listExpenses } from "../services/expense.service";
import { EXPENSE_CATEGORIES, LEDGER_PAYMENT_MODES } from "../db/schema";

const categorySchema = z.enum(EXPENSE_CATEGORIES);

const createSchema = z.object({
  category: categorySchema,
  amount: z.number().positive(),
  paymentMode: z.enum(LEDGER_PAYMENT_MODES).exclude(["CASH_AND_ONLINE"]).optional(),
  hours: z.number().positive().optional(),
  date: z.string().optional(),
  notes: z.string().optional(),
  soilTripId: z.string().optional(),
  dispatchId: z.string().optional(),
});

export async function create(req: AuthedRequest, res: Response) {
  const input = createSchema.parse(req.body);
  const expense = await createExpense({
    ...input,
    kilnId: req.kiln!.id,
    date: input.date ? new Date(input.date) : undefined,
  });
  res.status(201).json(expense);
}

export async function list(req: AuthedRequest, res: Response) {
  const expenses = await listExpenses(req.kiln!.id, {
    category: req.query.category ? categorySchema.parse(req.query.category) : undefined,
    from: req.query.from ? new Date(String(req.query.from)) : undefined,
    to: req.query.to ? new Date(String(req.query.to)) : undefined,
  });
  res.json(expenses);
}

export async function totals(req: AuthedRequest, res: Response) {
  const days = req.query.days ? Number(req.query.days) : 30;
  const result = await expenseTotalsByCategory(req.kiln!.id, days);
  res.json(result);
}
