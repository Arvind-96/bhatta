import { Response } from "express";
import { z } from "zod";
import { AuthedRequest } from "../middleware/auth.middleware";
import {
  brickLoadingDriverSummary,
  createBrickLoadingEntry,
  cancelBrickLoadingEntry,
  listBrickLoadingEntries,
  updateBrickLoadingEntry,
} from "../services/brickLoading.service";
import { BRICK_VEHICLE_TYPES } from "../db/schema";
import { SIMPLE_PAYMENT_MODES } from "../db/schema/_helpers";
import { validateCashOnlineSplit } from "../utils/paymentSplit";

// One row per brick category loaded on this trip — see BrickLineItem's
// doc comment in db/schema/_helpers.ts.
const lineItemSchema = z.object({
  categoryId: z.string().optional(),
  bricksCount: z.number().int().positive(),
  pricePerBrick: z.number().min(0).optional(),
});

// Loading/unloading charge splits are checked for internal consistency
// (both amounts present, both non-negative) but not strictly re-validated
// against bricksCount x rate here — that figure depends on `items`/the
// existing row's bricksCount, which would mean duplicating
// computeLaborCharge's math at the validation layer. The tip split IS
// strictly validated below since tipAmount is a plain field, no
// derivation needed.
const loadingUnloadingSplitSchema = {
  loadingPaymentMode: z.enum(SIMPLE_PAYMENT_MODES).optional(),
  loadingCashAmount: z.number().min(0).optional(),
  loadingOnlineAmount: z.number().min(0).optional(),
  unloadingPaymentMode: z.enum(SIMPLE_PAYMENT_MODES).optional(),
  unloadingCashAmount: z.number().min(0).optional(),
  unloadingOnlineAmount: z.number().min(0).optional(),
};

const createSchema = z
  .object({
    customerName: z.string().optional(),
    customerPhone: z.string().optional(),
    customerAddress: z.string().optional(),
    driverName: z.string().optional(),
    driverPhone: z.string().optional(),
    tipAmount: z.number().min(0).optional(),
    tipPaymentMode: z.enum(SIMPLE_PAYMENT_MODES).optional(),
    tipCashAmount: z.number().min(0).optional(),
    tipOnlineAmount: z.number().min(0).optional(),
    vehicleType: z.enum(BRICK_VEHICLE_TYPES),
    vehicleNumber: z.string(),
    items: z.array(lineItemSchema).min(1),
    unloadedBricksCount: z.number().int().nonnegative().optional(),
    loadingLaborerCount: z.number().int().nonnegative().optional(),
    loadingRatePerThousand: z.number().min(0).optional(),
    unloadingLaborerCount: z.number().int().nonnegative().optional(),
    unloadingRatePerThousand: z.number().min(0).optional(),
    ...loadingUnloadingSplitSchema,
    placeOfSupply: z.string().optional(),
    date: z.string().optional(),
    unloadingDate: z.string().optional(),
  })
  .superRefine((data, ctx) =>
    validateCashOnlineSplit({ paymentMode: data.tipPaymentMode, cashAmount: data.tipCashAmount, onlineAmount: data.tipOnlineAmount }, data.tipAmount ?? 0, ctx)
  );

export async function create(req: AuthedRequest, res: Response) {
  const input = createSchema.parse(req.body);
  const entry = await createBrickLoadingEntry({
    ...input,
    kilnId: req.kiln!.id,
    seasonId: req.season!.id,
    date: input.date ? new Date(input.date) : undefined,
    unloadingDate: input.unloadingDate ? new Date(input.unloadingDate) : undefined,
  });
  res.status(201).json(entry);
}

// includeCancelled: true — the Brick Loading list page shows a cancelled
// trip too, marked with a badge, per the client's "stays visible" answer.
export async function list(req: AuthedRequest, res: Response) {
  const entries = await listBrickLoadingEntries(req.kiln!.id, req.season!.id, {
    driverId: req.query.driverId as string | undefined,
    days: req.query.days ? Number(req.query.days) : undefined,
    includeCancelled: true,
  });
  res.json(entries);
}

const updateSchema = z
  .object({
    customerName: z.string().optional(),
    customerPhone: z.string().optional(),
    customerAddress: z.string().optional(),
    driverName: z.string().optional(),
    driverPhone: z.string().optional(),
    vehicleType: z.enum(BRICK_VEHICLE_TYPES).optional(),
    vehicleNumber: z.string().optional(),
    items: z.array(lineItemSchema).min(1).optional(),
    bricksCount: z.number().int().positive().optional(),
    unloadedBricksCount: z.number().int().nonnegative().optional(),
    loadingLaborerCount: z.number().int().nonnegative().optional(),
    loadingRatePerThousand: z.number().min(0).optional(),
    unloadingLaborerCount: z.number().int().nonnegative().optional(),
    unloadingRatePerThousand: z.number().min(0).optional(),
    pricePerBrick: z.number().min(0).optional(),
    tipAmount: z.number().min(0).optional(),
    tipPaymentMode: z.enum(SIMPLE_PAYMENT_MODES).optional(),
    tipCashAmount: z.number().min(0).optional(),
    tipOnlineAmount: z.number().min(0).optional(),
    ...loadingUnloadingSplitSchema,
    placeOfSupply: z.string().optional(),
    date: z.string().optional(),
    unloadingDate: z.string().optional(),
    notes: z.string().optional(),
  })
  .superRefine((data, ctx) => {
    if (data.tipAmount === undefined) return;
    validateCashOnlineSplit({ paymentMode: data.tipPaymentMode, cashAmount: data.tipCashAmount, onlineAmount: data.tipOnlineAmount }, data.tipAmount, ctx);
  });

export async function update(req: AuthedRequest, res: Response) {
  const input = updateSchema.parse(req.body);
  const entry = await updateBrickLoadingEntry(req.kiln!.id, req.params.id, {
    ...input,
    date: input.date ? new Date(input.date) : undefined,
    unloadingDate: input.unloadingDate ? new Date(input.unloadingDate) : undefined,
  });
  res.json(entry);
}

// Route stays DELETE /brick-loading/:id — now cancels, not hard-deletes.
export async function remove(req: AuthedRequest, res: Response) {
  await cancelBrickLoadingEntry(req.kiln!.id, req.params.id);
  res.status(204).end();
}

export async function driverSummary(req: AuthedRequest, res: Response) {
  const result = await brickLoadingDriverSummary(req.kiln!.id, req.season!.id);
  res.json(result);
}
