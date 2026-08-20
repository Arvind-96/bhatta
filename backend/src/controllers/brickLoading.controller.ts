import { Response } from "express";
import { z } from "zod";
import { AuthedRequest } from "../middleware/auth.middleware";
import {
  brickLoadingDriverSummary,
  createBrickLoadingEntry,
  deleteBrickLoadingEntry,
  listBrickLoadingEntries,
  updateBrickLoadingEntry,
} from "../services/brickLoading.service";
import { BRICK_VEHICLE_TYPES } from "../db/schema";

const createSchema = z.object({
  customerName: z.string().optional(),
  customerPhone: z.string().optional(),
  customerAddress: z.string().optional(),
  driverName: z.string().optional(),
  driverPhone: z.string().optional(),
  tipAmount: z.number().min(0).optional(),
  vehicleType: z.enum(BRICK_VEHICLE_TYPES),
  vehicleNumber: z.string(),
  bricksCount: z.number().int().positive(),
  unloadedBricksCount: z.number().int().nonnegative().optional(),
  loadingLaborerCount: z.number().int().nonnegative().optional(),
  loadingRatePerThousand: z.number().min(0).optional(),
  unloadingLaborerCount: z.number().int().nonnegative().optional(),
  unloadingRatePerThousand: z.number().min(0).optional(),
  categoryId: z.string(),
  pricePerBrick: z.number().min(0),
  date: z.string().optional(),
  unloadingDate: z.string().optional(),
});

export async function create(req: AuthedRequest, res: Response) {
  const input = createSchema.parse(req.body);
  const entry = await createBrickLoadingEntry({
    ...input,
    kilnId: req.kiln!.id,
    date: input.date ? new Date(input.date) : undefined,
    unloadingDate: input.unloadingDate ? new Date(input.unloadingDate) : undefined,
  });
  res.status(201).json(entry);
}

export async function list(req: AuthedRequest, res: Response) {
  const entries = await listBrickLoadingEntries(req.kiln!.id, {
    driverId: req.query.driverId as string | undefined,
    days: req.query.days ? Number(req.query.days) : undefined,
  });
  res.json(entries);
}

const updateSchema = z.object({
  customerName: z.string().optional(),
  customerPhone: z.string().optional(),
  customerAddress: z.string().optional(),
  driverName: z.string().optional(),
  driverPhone: z.string().optional(),
  vehicleType: z.enum(BRICK_VEHICLE_TYPES).optional(),
  vehicleNumber: z.string().optional(),
  bricksCount: z.number().int().positive().optional(),
  unloadedBricksCount: z.number().int().nonnegative().optional(),
  loadingLaborerCount: z.number().int().nonnegative().optional(),
  loadingRatePerThousand: z.number().min(0).optional(),
  unloadingLaborerCount: z.number().int().nonnegative().optional(),
  unloadingRatePerThousand: z.number().min(0).optional(),
  pricePerBrick: z.number().min(0).optional(),
  tipAmount: z.number().min(0).optional(),
  date: z.string().optional(),
  unloadingDate: z.string().optional(),
  notes: z.string().optional(),
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

export async function remove(req: AuthedRequest, res: Response) {
  await deleteBrickLoadingEntry(req.kiln!.id, req.params.id);
  res.status(204).end();
}

export async function driverSummary(req: AuthedRequest, res: Response) {
  const result = await brickLoadingDriverSummary(req.kiln!.id);
  res.json(result);
}
