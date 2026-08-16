import { Response } from "express";
import { z } from "zod";
import { AuthedRequest } from "../middleware/auth.middleware";
import {
  createDieselEntry,
  createVehicle,
  deleteDieselEntry,
  deleteVehicle,
  dieselPeriodTotals,
  listDieselEntries,
  listVehicles,
} from "../services/kilnVehicle.service";

const createVehicleSchema = z.object({
  name: z.string().min(1),
  type: z.string().min(1),
});

export async function createVehicleHandler(req: AuthedRequest, res: Response) {
  const input = createVehicleSchema.parse(req.body);
  const vehicle = await createVehicle({ ...input, kilnId: req.kiln!.id });
  res.status(201).json(vehicle);
}

export async function listVehiclesHandler(req: AuthedRequest, res: Response) {
  const vehicles = await listVehicles(req.kiln!.id);
  res.json(vehicles);
}

export async function removeVehicleHandler(req: AuthedRequest, res: Response) {
  await deleteVehicle(req.kiln!.id, req.params.id);
  res.status(204).end();
}

const createDieselSchema = z.object({
  vehicleId: z.string(),
  quantityLiters: z.number().positive(),
  costAmount: z.number().nonnegative().optional(),
  date: z.string().optional(),
  notes: z.string().optional(),
});

export async function createDieselHandler(req: AuthedRequest, res: Response) {
  const input = createDieselSchema.parse(req.body);
  const entry = await createDieselEntry({
    ...input,
    kilnId: req.kiln!.id,
    date: input.date ? new Date(input.date) : undefined,
  });
  res.status(201).json(entry);
}

export async function listDieselHandler(req: AuthedRequest, res: Response) {
  const days = req.query.days ? Number(req.query.days) : undefined;
  const entries = await listDieselEntries(req.kiln!.id, days);
  res.json(entries);
}

export async function removeDieselHandler(req: AuthedRequest, res: Response) {
  await deleteDieselEntry(req.kiln!.id, req.params.id);
  res.status(204).end();
}

export async function dieselPeriodTotalsHandler(req: AuthedRequest, res: Response) {
  const result = await dieselPeriodTotals(req.kiln!.id);
  res.json(result);
}
