import { Response } from "express";
import { z } from "zod";
import { AuthedRequest } from "../middleware/auth.middleware";
import {
  createInstallmentPayment,
  createMachine,
  createMachineFuelLog,
  createMaintenanceLog,
  deleteInstallmentPayment,
  getMachine,
  listInstallmentPayments,
  listMachineFuelLogs,
  listMachines,
  listMaintenanceLogs,
  updateMachine,
} from "../services/machine.service";
import { MACHINE_TYPES, MACHINE_FUEL_TYPES } from "../db/schema";

const createMachineSchema = z.object({
  name: z.string(),
  type: z.enum(MACHINE_TYPES),
  identifier: z.string().optional(),
  purchaseDate: z.string().optional(),
  price: z.number().min(0).optional(),
  purchasedByName: z.string().optional(),
  purchasedByPhone: z.string().optional(),
  warrantyDetails: z.string().optional(),
  totalPaid: z.number().min(0).optional(),
  tenureMonths: z.number().min(0).optional(),
  notes: z.string().optional(),
});

export async function create(req: AuthedRequest, res: Response) {
  const input = createMachineSchema.parse(req.body);
  const machine = await createMachine({
    ...input,
    kilnId: req.kiln!.id,
    seasonId: req.season!.id,
    purchaseDate: input.purchaseDate ? new Date(input.purchaseDate) : undefined,
  });
  res.status(201).json(machine);
}

export async function list(req: AuthedRequest, res: Response) {
  const machines = await listMachines(req.kiln!.id);
  res.json(machines);
}

export async function get(req: AuthedRequest, res: Response) {
  const machine = await getMachine(req.kiln!.id, req.params.id);
  res.json(machine);
}

const updateMachineSchema = z.object({
  name: z.string().optional(),
  type: z.enum(MACHINE_TYPES).optional(),
  identifier: z.string().optional(),
  purchaseDate: z.string().optional(),
  price: z.number().min(0).optional(),
  purchasedByName: z.string().optional(),
  purchasedByPhone: z.string().optional(),
  warrantyDetails: z.string().optional(),
  tenureMonths: z.number().min(0).optional(),
  notes: z.string().optional(),
  active: z.boolean().optional(),
});

export async function update(req: AuthedRequest, res: Response) {
  const input = updateMachineSchema.parse(req.body);
  const machine = await updateMachine(req.kiln!.id, req.params.id, {
    ...input,
    purchaseDate: input.purchaseDate ? new Date(input.purchaseDate) : undefined,
  });
  res.json(machine);
}

// Soft delete — active:false, matching the same convention as people/staff
// profiles, rather than a hard DELETE that would orphan its fuel/
// maintenance/installment history.
export async function remove(req: AuthedRequest, res: Response) {
  await updateMachine(req.kiln!.id, req.params.id, { active: false });
  res.status(204).send();
}

const installmentSchema = z.object({
  amount: z.number().positive(),
  date: z.string().optional(),
  notes: z.string().optional(),
});

export async function createInstallment(req: AuthedRequest, res: Response) {
  const input = installmentSchema.parse(req.body);
  const result = await createInstallmentPayment({
    kilnId: req.kiln!.id,
    seasonId: req.season!.id,
    machineId: req.params.id,
    amount: input.amount,
    date: input.date ? new Date(input.date) : undefined,
    notes: input.notes,
  });
  res.status(201).json(result);
}

export async function listInstallments(req: AuthedRequest, res: Response) {
  const payments = await listInstallmentPayments(req.kiln!.id, req.season!.id, req.params.id);
  res.json(payments);
}

export async function removeInstallment(req: AuthedRequest, res: Response) {
  const result = await deleteInstallmentPayment(req.kiln!.id, req.params.paymentId);
  res.json(result);
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
    seasonId: req.season!.id,
    date: input.date ? new Date(input.date) : undefined,
  });
  res.status(201).json(result);
}

export async function listFuelLogs(req: AuthedRequest, res: Response) {
  const days = req.query.days ? Number(req.query.days) : 30;
  const logs = await listMachineFuelLogs(req.kiln!.id, req.season!.id, days);
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
    seasonId: req.season!.id,
    date: input.date ? new Date(input.date) : undefined,
  });
  res.status(201).json(log);
}

export async function listMaintenance(req: AuthedRequest, res: Response) {
  const days = req.query.days ? Number(req.query.days) : 90;
  const logs = await listMaintenanceLogs(req.kiln!.id, req.season!.id, days);
  res.json(logs);
}
