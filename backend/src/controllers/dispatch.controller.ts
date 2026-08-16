import { Response } from "express";
import { z } from "zod";
import { AuthedRequest } from "../middleware/auth.middleware";
import { createDispatch, dispatchTotals, listDispatches, recordDeliveryAdjustment } from "../services/dispatch.service";
import { BRICK_GRADES, DISPATCH_PAYMENT_MODES as PAYMENT_MODES } from "../db/schema";
import { validateCashOnlineSplit } from "../utils/paymentSplit";

const createSchema = z
  .object({
    customerName: z.string(),
    customerId: z.string().optional(),
    grade: z.enum(BRICK_GRADES).optional(),
    bricksCount: z.number().int().positive(),
    amount: z.number().positive(),
    driverId: z.string().optional(),
    transportCost: z.number().min(0).optional(),
    transportPaidBy: z.enum(["OWNER", "CUSTOMER"]).optional(),
    paymentMode: z.enum(PAYMENT_MODES).optional(),
    cashAmount: z.number().min(0).optional(),
    onlineAmount: z.number().min(0).optional(),
    dispatchedOn: z.string().optional(),
  })
  .superRefine((data, ctx) => validateCashOnlineSplit(data, data.amount, ctx));

const adjustmentSchema = z.object({
  breakageCount: z.number().int().min(0).optional(),
  returnedCount: z.number().int().min(0).optional(),
  returnReason: z.string().optional(),
});

export async function create(req: AuthedRequest, res: Response) {
  const input = createSchema.parse(req.body);
  const dispatch = await createDispatch({
    ...input,
    kilnId: req.kiln!.id,
    dispatchedOn: input.dispatchedOn ? new Date(input.dispatchedOn) : undefined,
  });
  res.status(201).json(dispatch);
}

export async function list(req: AuthedRequest, res: Response) {
  const days = req.query.days ? Number(req.query.days) : 30;
  const dispatches = await listDispatches(req.kiln!.id, days);
  res.json(dispatches);
}

export async function totals(req: AuthedRequest, res: Response) {
  const days = req.query.days ? Number(req.query.days) : 7;
  const result = await dispatchTotals(req.kiln!.id, days);
  res.json(result);
}

export async function adjustment(req: AuthedRequest, res: Response) {
  const input = adjustmentSchema.parse(req.body);
  const dispatch = await recordDeliveryAdjustment(req.kiln!.id, req.params.id, input);
  res.json(dispatch);
}
