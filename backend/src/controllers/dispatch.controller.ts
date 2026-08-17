import { Response } from "express";
import { z } from "zod";
import { AuthedRequest } from "../middleware/auth.middleware";
import { createDispatch, deleteDispatch, dispatchTotals, listDispatches, recordDeliveryAdjustment, updateDispatch } from "../services/dispatch.service";
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
    categoryId: z.string().optional(),
    vehicleNumber: z.string().optional(),
    vehicleType: z.string().optional(),
    driverTipAmount: z.number().min(0).optional(),
    discountAmount: z.number().min(0).optional(),
    dispatchedOn: z.string().optional(),
  })
  // Cash/online must sum to what the customer actually owes — the NET
  // amount after any discount, not the pre-discount gross.
  .superRefine((data, ctx) => validateCashOnlineSplit(data, data.amount - (data.discountAmount ?? 0), ctx))
  // A discount bigger than the bill itself would net to a negative
  // `amount` — createDispatch has no floor on this, so it must be rejected
  // here before it ever reaches a negative-revenue row that corrupts every
  // downstream total (dispatchTotals, Financial Overview, the customer's
  // ledger DUE entry).
  .superRefine((data, ctx) => {
    if (data.discountAmount != null && data.discountAmount > data.amount) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "discountAmount cannot exceed amount",
        path: ["discountAmount"],
      });
    }
  });

// Mirrors createSchema with every field optional — the edit modal always
// resends the complete current form state (same convention
// EditPaymentReceiptModal uses), so the split/discount guards below still
// apply coherently in the common case; a narrower field-only API edit that
// omits `amount` simply skips those two checks (the service layer's own
// discount-exceeds-gross guard still catches that case using the existing
// record's real gross).
const updateSchema = z
  .object({
    customerName: z.string().optional(),
    customerId: z.string().nullable().optional(),
    grade: z.enum(BRICK_GRADES).optional(),
    bricksCount: z.number().int().positive().optional(),
    amount: z.number().positive().optional(),
    driverId: z.string().nullable().optional(),
    transportCost: z.number().min(0).optional(),
    transportPaidBy: z.enum(["OWNER", "CUSTOMER"]).optional(),
    paymentMode: z.enum(PAYMENT_MODES).optional(),
    cashAmount: z.number().min(0).optional(),
    onlineAmount: z.number().min(0).optional(),
    categoryId: z.string().nullable().optional(),
    vehicleNumber: z.string().optional(),
    vehicleType: z.string().optional(),
    driverTipAmount: z.number().min(0).optional(),
    discountAmount: z.number().min(0).optional(),
  })
  .superRefine((data, ctx) => {
    if (data.amount === undefined) return;
    validateCashOnlineSplit(data, data.amount - (data.discountAmount ?? 0), ctx);
  })
  .superRefine((data, ctx) => {
    if (data.amount !== undefined && data.discountAmount != null && data.discountAmount > data.amount) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "discountAmount cannot exceed amount",
        path: ["discountAmount"],
      });
    }
  });

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

export async function update(req: AuthedRequest, res: Response) {
  const input = updateSchema.parse(req.body);
  const dispatch = await updateDispatch(req.kiln!.id, req.params.id, input);
  res.json(dispatch);
}

export async function remove(req: AuthedRequest, res: Response) {
  await deleteDispatch(req.kiln!.id, req.params.id);
  res.status(204).end();
}
