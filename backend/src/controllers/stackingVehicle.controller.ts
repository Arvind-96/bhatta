import { Response } from "express";
import { z } from "zod";
import { AuthedRequest } from "../middleware/auth.middleware";
import { createStackingVehicle, listStackingVehicles, updateStackingVehicle } from "../services/stackingVehicle.service";
import { STACKING_VEHICLE_TYPES, STACKING_VEHICLE_STATUSES } from "../db/schema";

const createSchema = z.object({
  contractorId: z.string(),
  vehicleType: z.enum(STACKING_VEHICLE_TYPES),
  vehicleNumber: z.string().optional(),
  buggiCount: z.number().int().positive().optional(),
  driverName: z.string().optional(),
  notes: z.string().optional(),
});

export async function create(req: AuthedRequest, res: Response) {
  const input = createSchema.parse(req.body);
  const vehicle = await createStackingVehicle({ ...input, kilnId: req.kiln!.id });
  res.status(201).json(vehicle);
}

export async function list(req: AuthedRequest, res: Response) {
  const vehicles = await listStackingVehicles(req.kiln!.id, req.query.contractorId as string | undefined);
  res.json(vehicles);
}

const updateSchema = z.object({
  vehicleType: z.enum(STACKING_VEHICLE_TYPES).optional(),
  vehicleNumber: z.string().optional(),
  buggiCount: z.number().int().positive().optional(),
  driverName: z.string().optional(),
  status: z.enum(STACKING_VEHICLE_STATUSES).optional(),
  notes: z.string().optional(),
});

export async function update(req: AuthedRequest, res: Response) {
  const input = updateSchema.parse(req.body);
  const vehicle = await updateStackingVehicle(req.kiln!.id, req.params.id, input);
  res.json(vehicle);
}
