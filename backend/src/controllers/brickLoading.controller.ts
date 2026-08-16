import { Response } from "express";
import { z } from "zod";
import { AuthedRequest } from "../middleware/auth.middleware";
import {
  brickLoadingDriverSummary,
  createBrickLoadingEntry,
  listBrickLoadingEntries,
  updateBrickLoadingEntry,
} from "../services/brickLoading.service";
import { BRICK_VEHICLE_TYPES } from "../db/schema";

const createSchema = z.object({
  vehicleType: z.enum(BRICK_VEHICLE_TYPES),
  vehicleNumber: z.string(),
  driverId: z.string(),
  bricksCount: z.number().int().positive(),
  tipAmount: z.number().min(0).optional(),
  loadingCharge: z.number().min(0).optional(),
  categoryId: z.string().optional(),
  dispatchId: z.string().optional(),
  date: z.string().optional(),
  notes: z.string().optional(),
});

export async function create(req: AuthedRequest, res: Response) {
  const input = createSchema.parse(req.body);
  const entry = await createBrickLoadingEntry({
    ...input,
    kilnId: req.kiln!.id,
    date: input.date ? new Date(input.date) : undefined,
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
  vehicleType: z.enum(BRICK_VEHICLE_TYPES).optional(),
  vehicleNumber: z.string().optional(),
  bricksCount: z.number().int().positive().optional(),
  tipAmount: z.number().min(0).optional(),
  loadingCharge: z.number().min(0).optional(),
  notes: z.string().optional(),
});

export async function update(req: AuthedRequest, res: Response) {
  const input = updateSchema.parse(req.body);
  const entry = await updateBrickLoadingEntry(req.kiln!.id, req.params.id, input);
  res.json(entry);
}

export async function driverSummary(req: AuthedRequest, res: Response) {
  const result = await brickLoadingDriverSummary(req.kiln!.id);
  res.json(result);
}
