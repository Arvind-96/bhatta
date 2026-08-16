import { randomUUID } from "crypto";
import { and, asc, desc, eq, gt, gte, inArray } from "drizzle-orm";
import { db } from "../db/client";
import { machines, machineFuelLogs, machineMaintenanceLogs, MACHINE_TYPES } from "../db/schema";
import { createExpense } from "./expense.service";
import { emitToKiln } from "../config/socket";

export type MachineType = (typeof MACHINE_TYPES)[number];

export interface CreateMachineInput {
  kilnId: string;
  name: string;
  type: MachineType;
  identifier?: string;
  notes?: string;
}

export async function createMachine(input: CreateMachineInput) {
  const _id = randomUUID();
  db.insert(machines).values({ ...input, _id }).run();
  const machine = db.select().from(machines).where(eq(machines._id, _id)).get()!;
  emitToKiln(input.kilnId, "machine:update", machine);
  return machine;
}

export async function listMachines(kilnId: string) {
  return db.select().from(machines).where(and(eq(machines.kilnId, kilnId), eq(machines.active, true))).orderBy(asc(machines.name)).all();
}

async function assertMachineInKiln(kilnId: string, machineId: string) {
  const machine = db.select().from(machines).where(and(eq(machines._id, machineId), eq(machines.kilnId, kilnId))).get();
  if (!machine) throw new Error("Referenced machine not found in this kiln");
  return machine;
}

export interface CreateFuelLogInput {
  kilnId: string;
  machineId: string;
  fuelType: "DIESEL" | "PETROL" | "ELECTRICITY";
  quantity: number;
  hoursRun?: number;
  date?: Date;
  notes?: string;
}

const CONSUMPTION_ALERT_RATIO = 1.3; // 30% above this machine's own baseline

// Compares this fill-up's litres/hour against the machine's own trailing
// average — the anomaly that actually matters for catching siphoning is
// per-machine drift, not a fleet-wide number that averages a thirsty JCB
// against a frugal generator.
export async function createMachineFuelLog(input: CreateFuelLogInput) {
  await assertMachineInKiln(input.kilnId, input.machineId);

  let consumptionAlert = false;
  let ratePerHour: number | null = null;
  let baselineRatePerHour: number | null = null;

  if (input.hoursRun && input.hoursRun > 0) {
    ratePerHour = input.quantity / input.hoursRun;

    const since = new Date();
    since.setDate(since.getDate() - 30);
    const history = await db
      .select()
      .from(machineFuelLogs)
      .where(and(eq(machineFuelLogs.kilnId, input.kilnId), eq(machineFuelLogs.machineId, input.machineId), gte(machineFuelLogs.date, since), gt(machineFuelLogs.hoursRun, 0)))
      .all();

    if (history.length >= 3) {
      const totalQty = history.reduce((sum, h) => sum + h.quantity, 0);
      const totalHours = history.reduce((sum, h) => sum + (h.hoursRun ?? 0), 0);
      baselineRatePerHour = totalHours > 0 ? totalQty / totalHours : null;
      consumptionAlert = baselineRatePerHour != null && ratePerHour > baselineRatePerHour * CONSUMPTION_ALERT_RATIO;
    }
  }

  const _id = randomUUID();
  db.insert(machineFuelLogs).values({ ...input, _id }).run();
  const log = db.select().from(machineFuelLogs).where(eq(machineFuelLogs._id, _id)).get()!;
  emitToKiln(input.kilnId, "machineFuel:update", {
    ...log,
    ratePerHour,
    baselineRatePerHour,
    consumptionAlert,
  });
  return { log, ratePerHour, baselineRatePerHour, consumptionAlert };
}

export async function listMachineFuelLogs(kilnId: string, days = 30) {
  const since = new Date();
  since.setDate(since.getDate() - days);
  const rows = await db.select().from(machineFuelLogs).where(and(eq(machineFuelLogs.kilnId, kilnId), gte(machineFuelLogs.date, since))).orderBy(desc(machineFuelLogs.date)).all();
  return withMachine(rows);
}

async function withMachine<T extends { machineId: string }>(rows: T[]) {
  const machineIds = [...new Set(rows.map((r) => r.machineId))];
  const machineRows = machineIds.length ? await db.select({ _id: machines._id, name: machines.name, type: machines.type }).from(machines).where(inArray(machines._id, machineIds)).all() : [];
  const machineById = new Map(machineRows.map((m) => [m._id, m]));
  return rows.map((r) => ({ ...r, machineId: machineById.get(r.machineId) ?? r.machineId }));
}

export interface CreateMaintenanceInput {
  kilnId: string;
  machineId: string;
  description: string;
  cost?: number;
  downtimeHours?: number;
  date?: Date;
  notes?: string;
}

export async function createMaintenanceLog(input: CreateMaintenanceInput) {
  await assertMachineInKiln(input.kilnId, input.machineId);
  const _id = randomUUID();
  db.insert(machineMaintenanceLogs).values({ ...input, _id }).run();
  const log = db.select().from(machineMaintenanceLogs).where(eq(machineMaintenanceLogs._id, _id)).get()!;

  if (input.cost && input.cost > 0) {
    await createExpense({
      kilnId: input.kilnId,
      category: "MACHINERY_REPAIR",
      amount: input.cost,
      notes: input.description,
      date: input.date,
    });
  }

  emitToKiln(input.kilnId, "machineMaintenance:update", log);
  return log;
}

export async function listMaintenanceLogs(kilnId: string, days = 90) {
  const since = new Date();
  since.setDate(since.getDate() - days);
  const rows = await db.select().from(machineMaintenanceLogs).where(and(eq(machineMaintenanceLogs.kilnId, kilnId), gte(machineMaintenanceLogs.date, since))).orderBy(desc(machineMaintenanceLogs.date)).all();
  return withMachine(rows);
}
