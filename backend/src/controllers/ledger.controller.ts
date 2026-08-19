import { Response } from "express";
import { z } from "zod";
import { AuthedRequest } from "../middleware/auth.middleware";
import { updateLedgerEntry, deleteLedgerEntry } from "../services/ledger.service";
import { LEDGER_CATEGORIES, LEDGER_PAYMENT_MODES } from "../db/schema";
import { validateCashOnlineSplit } from "../utils/paymentSplit";

const updateSchema = z
  .object({
    direction: z.enum(["DUE", "PAID"]),
    amount: z.number().positive(),
    reason: z.string(),
    date: z.string().optional(),
    paymentMode: z.enum(LEDGER_PAYMENT_MODES).optional(),
    cashAmount: z.number().min(0).optional(),
    onlineAmount: z.number().min(0).optional(),
    category: z.enum(LEDGER_CATEGORIES).optional(),
  })
  .superRefine((data, ctx) => validateCashOnlineSplit(data, data.amount, ctx));

export async function update(req: AuthedRequest, res: Response) {
  const input = updateSchema.parse(req.body);
  const entry = await updateLedgerEntry(req.kiln!.id, req.params.id, {
    ...input,
    date: input.date ? new Date(input.date) : undefined,
  });
  res.json(entry);
}

export async function remove(req: AuthedRequest, res: Response) {
  await deleteLedgerEntry(req.kiln!.id, req.params.id);
  res.status(204).end();
}
