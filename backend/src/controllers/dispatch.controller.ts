import { Response } from "express";
import { z } from "zod";
import { AuthedRequest } from "../middleware/auth.middleware";
import { createDispatch, deleteDispatch, dispatchTotals, listDispatches, recordDeliveryAdjustment, updateDispatch } from "../services/dispatch.service";
import { BRICK_GRADES, DISPATCH_PAYMENT_MODES as PAYMENT_MODES } from "../db/schema";
import { SIMPLE_PAYMENT_MODES } from "../db/schema/_helpers";
import { validateCashOnlineSplit } from "../utils/paymentSplit";

// One row per brick category on this dispatch — see BrickLineItem's doc
// comment in db/schema/_helpers.ts. Ignored (and overridden) when
// `loadingEntryId` is set, same as bricksCount/categoryId/amount.
const lineItemSchema = z.object({
  categoryId: z.string().optional(),
  bricksCount: z.number().int().positive(),
  pricePerBrick: z.number().min(0).optional(),
});

const createSchema = z
  .object({
    customerName: z.string(),
    customerId: z.string().optional(),
    customerAddress: z.string().optional(),
    customerPhone: z.string().optional(),
    grade: z.enum(BRICK_GRADES).optional(),
    // Required only when NOT linking an existing Loading Trip — when
    // `loadingEntryId` is set, createDispatch overrides both fields
    // authoritatively from that trip row and ignores whatever's sent here.
    bricksCount: z.number().int().min(0).optional(),
    amount: z.number().min(0).optional(),
    items: z.array(lineItemSchema).optional(),
    driverId: z.string().optional(),
    driverName: z.string().optional(),
    driverPhone: z.string().optional(),
    transportCost: z.number().min(0).optional(),
    transportPaidBy: z.enum(["OWNER", "CUSTOMER"]).optional(),
    paymentMode: z.enum(PAYMENT_MODES).optional(),
    cashAmount: z.number().min(0).optional(),
    onlineAmount: z.number().min(0).optional(),
    categoryId: z.string().optional(),
    vehicleNumber: z.string().optional(),
    vehicleType: z.string().optional(),
    driverTipAmount: z.number().min(0).optional(),
    driverTipPaymentMode: z.enum(SIMPLE_PAYMENT_MODES).optional(),
    driverTipCashAmount: z.number().min(0).optional(),
    driverTipOnlineAmount: z.number().min(0).optional(),
    discountAmount: z.number().min(0).optional(),
    placeOfSupply: z.string().optional(),
    notes: z.string().optional(),
    dispatchedOn: z.string().min(1, "Transaction date is required"),
    loadingEntryId: z.string().optional(),
  })
  .superRefine((data, ctx) =>
    validateCashOnlineSplit(
      { paymentMode: data.driverTipPaymentMode, cashAmount: data.driverTipCashAmount, onlineAmount: data.driverTipOnlineAmount },
      data.driverTipAmount ?? 0,
      ctx
    )
  )
  .superRefine((data, ctx) => {
    if (data.loadingEntryId) return;
    if (data.items && data.items.length > 0) return;
    if (!data.bricksCount || data.bricksCount <= 0) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "bricksCount is required", path: ["bricksCount"] });
    }
    if (!data.amount || data.amount <= 0) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "amount is required", path: ["amount"] });
    }
  })
  // Cash/online must sum to what the customer actually owes. For a manual
  // entry, `amount` is the pre-discount gross (createDispatch's own
  // convention) so the discount is subtracted here; for a linked-trip
  // dispatch, the client instead sends the trip's own already-net `amount`
  // directly (see Dispatch.tsx's handleTripSelect) — subtracting
  // discountAmount again there would double-count it.
  .superRefine((data, ctx) => {
    const netAmount = data.loadingEntryId ? (data.amount ?? 0) : (data.amount ?? 0) - (data.discountAmount ?? 0);
    validateCashOnlineSplit(data, netAmount, ctx);
  })
  // A discount bigger than the bill itself would net to a negative
  // `amount` — createDispatch has no floor on this, so it must be rejected
  // here before it ever reaches a negative-revenue row that corrupts every
  // downstream total (dispatchTotals, Financial Overview, the customer's
  // ledger DUE entry).
  .superRefine((data, ctx) => {
    if (data.loadingEntryId) return;
    if (data.discountAmount != null && data.amount != null && data.discountAmount > data.amount) {
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
    customerAddress: z.string().optional(),
    customerPhone: z.string().optional(),
    grade: z.enum(BRICK_GRADES).optional(),
    bricksCount: z.number().int().positive().optional(),
    amount: z.number().positive().optional(),
    driverId: z.string().nullable().optional(),
    driverName: z.string().optional(),
    driverPhone: z.string().optional(),
    transportCost: z.number().min(0).optional(),
    transportPaidBy: z.enum(["OWNER", "CUSTOMER"]).optional(),
    paymentMode: z.enum(PAYMENT_MODES).optional(),
    cashAmount: z.number().min(0).optional(),
    onlineAmount: z.number().min(0).optional(),
    categoryId: z.string().nullable().optional(),
    items: z.array(lineItemSchema).optional(),
    vehicleNumber: z.string().optional(),
    vehicleType: z.string().optional(),
    driverTipAmount: z.number().min(0).optional(),
    driverTipPaymentMode: z.enum(SIMPLE_PAYMENT_MODES).optional(),
    driverTipCashAmount: z.number().min(0).optional(),
    driverTipOnlineAmount: z.number().min(0).optional(),
    discountAmount: z.number().min(0).optional(),
    placeOfSupply: z.string().optional(),
    notes: z.string().optional(),
    dispatchedOn: z.string().optional(),
  })
  .superRefine((data, ctx) => {
    if (data.amount === undefined) return;
    validateCashOnlineSplit(data, data.amount - (data.discountAmount ?? 0), ctx);
  })
  .superRefine((data, ctx) => {
    if (data.driverTipAmount === undefined) return;
    validateCashOnlineSplit(
      { paymentMode: data.driverTipPaymentMode, cashAmount: data.driverTipCashAmount, onlineAmount: data.driverTipOnlineAmount },
      data.driverTipAmount,
      ctx
    );
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
    // Placeholders when linking a trip — createDispatch overrides both
    // from the trip row before either value is ever used.
    bricksCount: input.bricksCount ?? 0,
    amount: input.amount ?? 0,
    kilnId: req.kiln!.id,
    dispatchedOn: input.dispatchedOn ? new Date(input.dispatchedOn) : undefined,
  });
  res.status(201).json(dispatch);
}

export async function list(req: AuthedRequest, res: Response) {
  const days = req.query.days ? Number(req.query.days) : undefined;
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
  const dispatch = await updateDispatch(req.kiln!.id, req.params.id, {
    ...input,
    dispatchedOn: input.dispatchedOn ? new Date(input.dispatchedOn) : undefined,
  });
  res.json(dispatch);
}

export async function remove(req: AuthedRequest, res: Response) {
  await deleteDispatch(req.kiln!.id, req.params.id);
  res.status(204).end();
}
