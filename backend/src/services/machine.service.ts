import { randomUUID } from "crypto";
import { and, asc, desc, eq, gt, gte, inArray } from "drizzle-orm";
import { db } from "../db/client";
import { machines, machineFuelLogs, machineMaintenanceLogs, machineInstallmentPayments, MACHINE_TYPES } from "../db/schema";
import { createExpense } from "./expense.service";
import { findOrCreateExpenseType } from "./expenseType.service";
import { emitToKiln } from "../config/socket";

export type MachineType = (typeof MACHINE_TYPES)[number];

// Every machine/vehicle purchase and installment payment gets auto-logged
// under this one shared Expense Type (found-or-created once, reused for
// every machine) — same "auto-log a cost that already lives on another
// record as a first-class Expense" convention createMaintenanceLog below
// already uses for MACHINERY_REPAIR, just via the modern expenseTypeId
// path (see expense.ts schema's EXPENSE_CATEGORIES comment) rather than
// the legacy fixed enum.
const INSTALLMENT_EXPENSE_TYPE_NAME = "Installment";

export interface CreateMachineInput {
  kilnId: string;
  name: string;
  type: MachineType;
  identifier?: string;
  purchaseDate?: Date;
  price?: number;
  purchasedByName?: string;
  purchasedByPhone?: string;
  warrantyDetails?: string;
  // The amount actually paid at purchase time — auto-logged as an
  // Installment expense below (item 6's "initial purchasing amount...
  // should also automatically be added to the overall Expenses").
  totalPaid?: number;
  tenureMonths?: number;
  notes?: string;
}

export async function createMachine(input: CreateMachineInput) {
  const _id = randomUUID();
  const totalPaid = input.totalPaid ?? 0;
  const remainingDue = Math.max(0, (input.price ?? 0) - totalPaid);
  await db.insert(machines).values({ ...input, _id, totalPaid, remainingDue });

  if (totalPaid > 0) {
    const expenseType = await findOrCreateExpenseType(input.kilnId, INSTALLMENT_EXPENSE_TYPE_NAME);
    await createExpense({
      kilnId: input.kilnId,
      expenseTypeId: expenseType._id,
      amount: totalPaid,
      notes: `Purchase: ${input.name}`,
      date: input.purchaseDate,
    });
  }

  const machine = (await db.select().from(machines).where(eq(machines._id, _id)))[0]!;
  emitToKiln(input.kilnId, "machine:update", machine);
  return machine;
}

export async function listMachines(kilnId: string) {
  return await db.select().from(machines).where(and(eq(machines.kilnId, kilnId), eq(machines.active, true))).orderBy(asc(machines.name));
}

export async function getMachine(kilnId: string, machineId: string) {
  return await assertMachineInKiln(kilnId, machineId);
}

async function assertMachineInKiln(kilnId: string, machineId: string) {
  const machine = (await db.select().from(machines).where(and(eq(machines._id, machineId), eq(machines.kilnId, kilnId))))[0];
  if (!machine) throw new Error("Referenced machine not found in this kiln");
  return machine;
}

export interface UpdateMachineInput {
  name?: string;
  type?: MachineType;
  identifier?: string;
  purchaseDate?: Date;
  price?: number;
  purchasedByName?: string;
  purchasedByPhone?: string;
  warrantyDetails?: string;
  tenureMonths?: number;
  notes?: string;
  active?: boolean;
}

// Never touches totalPaid/remainingDue directly (those only ever move via
// the initial purchase payment and createInstallmentPayment below) — this
// is for correcting the machine's own descriptive/purchase-info fields, or
// soft-deleting it (active: false), matching the same soft-delete
// convention `people`/salary slips use elsewhere.
export async function updateMachine(kilnId: string, machineId: string, input: UpdateMachineInput) {
  await assertMachineInKiln(kilnId, machineId);
  await db.update(machines).set(input).where(eq(machines._id, machineId));
  const updated = (await db.select().from(machines).where(eq(machines._id, machineId)))[0]!;
  emitToKiln(kilnId, "machine:update", updated);
  return updated;
}

export interface CreateInstallmentPaymentInput {
  kilnId: string;
  machineId: string;
  amount: number;
  date?: Date;
  notes?: string;
}

// Logs one EMI/installment payment against a machine, rolls it into that
// machine's own running totalPaid/remainingDue, and auto-logs the same
// amount as an Expense under the shared "Installment" expense type (item
// 6) — same pattern as the purchase-time payment in createMachine above.
export async function createInstallmentPayment(input: CreateInstallmentPaymentInput) {
  const machine = await assertMachineInKiln(input.kilnId, input.machineId);
  const _id = randomUUID();
  await db.insert(machineInstallmentPayments).values({
    _id,
    kilnId: input.kilnId,
    machineId: input.machineId,
    amount: input.amount,
    date: input.date,
    notes: input.notes,
  });

  const newTotalPaid = (machine.totalPaid ?? 0) + input.amount;
  const newRemainingDue = Math.max(0, (machine.price ?? 0) - newTotalPaid);
  await db.update(machines).set({ totalPaid: newTotalPaid, remainingDue: newRemainingDue }).where(eq(machines._id, input.machineId));

  const expenseType = await findOrCreateExpenseType(input.kilnId, INSTALLMENT_EXPENSE_TYPE_NAME);
  await createExpense({
    kilnId: input.kilnId,
    expenseTypeId: expenseType._id,
    amount: input.amount,
    notes: `Installment: ${machine.name}`,
    date: input.date,
  });

  const payment = (await db.select().from(machineInstallmentPayments).where(eq(machineInstallmentPayments._id, _id)))[0]!;
  const updatedMachine = (await db.select().from(machines).where(eq(machines._id, input.machineId)))[0]!;
  emitToKiln(input.kilnId, "machineInstallment:update", payment);
  emitToKiln(input.kilnId, "machine:update", updatedMachine);
  return { payment, machine: updatedMachine };
}

export async function listInstallmentPayments(kilnId: string, machineId: string) {
  return await db
    .select()
    .from(machineInstallmentPayments)
    .where(and(eq(machineInstallmentPayments.kilnId, kilnId), eq(machineInstallmentPayments.machineId, machineId)))
    .orderBy(desc(machineInstallmentPayments.date));
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
      .where(and(eq(machineFuelLogs.kilnId, input.kilnId), eq(machineFuelLogs.machineId, input.machineId), gte(machineFuelLogs.date, since), gt(machineFuelLogs.hoursRun, 0)));

    if (history.length >= 3) {
      const totalQty = history.reduce((sum, h) => sum + h.quantity, 0);
      const totalHours = history.reduce((sum, h) => sum + (h.hoursRun ?? 0), 0);
      baselineRatePerHour = totalHours > 0 ? totalQty / totalHours : null;
      consumptionAlert = baselineRatePerHour != null && ratePerHour > baselineRatePerHour * CONSUMPTION_ALERT_RATIO;
    }
  }

  const _id = randomUUID();
  await db.insert(machineFuelLogs).values({ ...input, _id });
  const log = (await db.select().from(machineFuelLogs).where(eq(machineFuelLogs._id, _id)))[0]!;
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
  const rows = await db.select().from(machineFuelLogs).where(and(eq(machineFuelLogs.kilnId, kilnId), gte(machineFuelLogs.date, since))).orderBy(desc(machineFuelLogs.date));
  return withMachine(rows);
}

async function withMachine<T extends { machineId: string }>(rows: T[]) {
  const machineIds = [...new Set(rows.map((r) => r.machineId))];
  const machineRows = machineIds.length ? await db.select({ _id: machines._id, name: machines.name, type: machines.type }).from(machines).where(inArray(machines._id, machineIds)) : [];
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
  await db.insert(machineMaintenanceLogs).values({ ...input, _id });
  const log = (await db.select().from(machineMaintenanceLogs).where(eq(machineMaintenanceLogs._id, _id)))[0]!;

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
  const rows = await db.select().from(machineMaintenanceLogs).where(and(eq(machineMaintenanceLogs.kilnId, kilnId), gte(machineMaintenanceLogs.date, since))).orderBy(desc(machineMaintenanceLogs.date));
  return withMachine(rows);
}
