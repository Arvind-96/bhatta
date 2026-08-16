import { Response } from "express";
import { z } from "zod";
import { AuthedRequest } from "../middleware/auth.middleware";
import {
  createMachine,
  createMachineFuelLog,
  createMaintenanceLog,
  listMachineFuelLogs,
  listMachines,
  listMaintenanceLogs,
} from "../services/machine.service";
import { MACHINE_TYPES, MACHINE_FUEL_TYPES } from "../db/schema";

const createMachineSchema = z.object({
  name: z.string(),
  type: z.enum(MACHINE_TYPES),
  identifier: z.string().optional(),
  notes: z.string().optional(),
});

export async function create(req: AuthedRequest, res: Response) {
  const input = createMachineSchema.parse(req.body);
  const machine = await createMachine({ ...input, kilnId: req.kiln!.id });
  res.status(201).json(machine);
}

export async function list(req: AuthedRequest, res: Response) {
  const machines = await listMachines(req.kiln!.id);
  res.json(machines);
}

const fuelLogSchema = z.object({
  machineId: z.string(),
  fuelType: z.enum(MACHINE_FUEL_TYPES),
  quantity: z.number().positive(),
  hoursRun: z.number().positive().optional(),
  date: z.string().optional(),
  notes: z.string().optional(),
});

export async function createFuelLog(req: AuthedRequest, res: Response) {
  const input = fuelLogSchema.parse(req.body);
  const result = await createMachineFuelLog({
    ...input,
    kilnId: req.kiln!.id,
    date: input.date ? new Date(input.date) : undefined,
  });
  res.status(201).json(result);
}

export async function listFuelLogs(req: AuthedRequest, res: Response) {
  const days = req.query.days ? Number(req.query.days) : 30;
  const logs = await listMachineFuelLogs(req.kiln!.id, days);
  res.json(logs);
}

const maintenanceSchema = z.object({
  machineId: z.string(),
  description: z.string(),
  cost: z.number().min(0).optional(),
  downtimeHours: z.number().min(0).optional(),
  date: z.string().optional(),
  notes: z.string().optional(),
});

export async function createMaintenance(req: AuthedRequest, res: Response) {
  const input = maintenanceSchema.parse(req.body);
  const log = await createMaintenanceLog({
    ...input,
    kilnId: req.kiln!.id,
    date: input.date ? new Date(input.date) : undefined,
  });
  res.status(201).json(log);
}

export async function listMaintenance(req: AuthedRequest, res: Response) {
  const days = req.query.days ? Number(req.query.days) : 90;
  const logs = await listMaintenanceLogs(req.kiln!.id, days);
  res.json(logs);
}
