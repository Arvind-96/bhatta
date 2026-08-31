import { Response } from "express";
import { z } from "zod";
import { AuthedRequest } from "../middleware/auth.middleware";
import { LEDGER_PAYMENT_MODES } from "../db/schema";
import { validateCashOnlineSplit } from "../utils/paymentSplit";
import {
  createPaymentReceipt,
  deletePaymentReceipt,
  getPaymentReceipt,
  listPaymentReceipts,
  updatePaymentReceipt,
} from "../services/paymentReceipt.service";

const createSchema = z
  .object({
    personId: z.string(),
    amountPaid: z.number().positive(),
    totalAgreedAmount: z.number().nonnegative().optional(),
    paymentMode: z.enum(LEDGER_PAYMENT_MODES).optional(),
    cashAmount: z.number().min(0).optional(),
    onlineAmount: z.number().min(0).optional(),
    notes: z.string().optional(),
    date: z.string().optional(),
  })
  .superRefine((data, ctx) => validateCashOnlineSplit(data, data.amountPaid, ctx));

const updateSchema = z
  .object({
    amountPaid: z.number().positive().optional(),
    totalAgreedAmount: z.number().nonnegative().optional(),
    paymentMode: z.enum(LEDGER_PAYMENT_MODES).optional(),
    cashAmount: z.number().min(0).optional(),
    onlineAmount: z.number().min(0).optional(),
    notes: z.string().optional(),
    date: z.string().optional(),
  })
  .superRefine((data, ctx) => {
    if (data.amountPaid != null) validateCashOnlineSplit(data, data.amountPaid, ctx);
  });

export async function create(req: AuthedRequest, res: Response) {
  const input = createSchema.parse(req.body);
  const receipt = await createPaymentReceipt({
    ...input,
    kilnId: req.kiln!.id,
    seasonId: req.season!.id,
    date: input.date ? new Date(input.date) : undefined,
  });
  res.status(201).json(receipt);
}

export async function list(req: AuthedRequest, res: Response) {
  const result = await listPaymentReceipts(req.kiln!.id, req.season!.id, req.query.personId as string | undefined);
  res.json(result);
}

export async function getOne(req: AuthedRequest, res: Response) {
  const result = await getPaymentReceipt(req.kiln!.id, req.params.id);
  res.json(result);
}

export async function update(req: AuthedRequest, res: Response) {
  const input = updateSchema.parse(req.body);
  const receipt = await updatePaymentReceipt(req.kiln!.id, req.params.id, {
    ...input,
    date: input.date ? new Date(input.date) : undefined,
  });
  res.json(receipt);
}

export async function remove(req: AuthedRequest, res: Response) {
  await deletePaymentReceipt(req.kiln!.id, req.params.id);
  res.status(204).end();
}
