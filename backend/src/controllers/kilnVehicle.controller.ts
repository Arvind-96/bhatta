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
  updateDieselEntry,
} from "../services/kilnVehicle.service";
import { LEDGER_PAYMENT_MODES } from "../db/schema";

const createVehicleSchema = z.object({
  name: z.string().min(1),
  type: z.string().min(1),
  initialMeterReading: z.number().min(0).optional(),
  oilTankCapacity: z.number().min(0).optional(),
  notes: z.string().optional(),
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
  initialMeterReading: z.number().min(0).optional(),
  driverId: z.string().optional(),
  costAmount: z.number().nonnegative().optional(),
  paymentMode: z.enum(LEDGER_PAYMENT_MODES).exclude(["CASH_AND_ONLINE"]).optional(),
  date: z.string().optional(),
  notes: z.string().optional(),
});

export async function createDieselHandler(req: AuthedRequest, res: Response) {
  const input = createDieselSchema.parse(req.body);
  const entry = await createDieselEntry({
    ...input,
    kilnId: req.kiln!.id,
    seasonId: req.season!.id,
    date: input.date ? new Date(input.date) : undefined,
  });
  res.status(201).json(entry);
}

export async function listDieselHandler(req: AuthedRequest, res: Response) {
  const days = req.query.days ? Number(req.query.days) : undefined;
  const driverId = req.query.driverId ? String(req.query.driverId) : undefined;
  const entries = await listDieselEntries(req.kiln!.id, req.season!.id, { days, driverId });
  res.json(entries);
}

const updateDieselSchema = z.object({
  vehicleId: z.string().optional(),
  quantityLiters: z.number().positive().optional(),
  initialMeterReading: z.number().min(0).optional(),
  driverId: z.string().nullable().optional(),
  costAmount: z.number().nonnegative().optional(),
  paymentMode: z.enum(LEDGER_PAYMENT_MODES).exclude(["CASH_AND_ONLINE"]).optional(),
  date: z.string().optional(),
  notes: z.string().optional(),
});

export async function updateDieselHandler(req: AuthedRequest, res: Response) {
  const input = updateDieselSchema.parse(req.body);
  const entry = await updateDieselEntry(req.kiln!.id, req.params.id, {
    ...input,
    date: input.date ? new Date(input.date) : undefined,
  });
  res.json(entry);
}

export async function removeDieselHandler(req: AuthedRequest, res: Response) {
  await deleteDieselEntry(req.kiln!.id, req.params.id);
  res.status(204).end();
}

export async function dieselPeriodTotalsHandler(req: AuthedRequest, res: Response) {
  const result = await dieselPeriodTotals(req.kiln!.id, req.season!.id);
  res.json(result);
}
