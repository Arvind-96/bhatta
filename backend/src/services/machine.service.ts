import { randomUUID } from "crypto";
import { and, asc, desc, eq, gt, gte, inArray, lte } from "drizzle-orm";
import { db } from "../db/client";
import { machines, machineFuelLogs, machineMaintenanceLogs, machineInstallmentPayments, expenses, MACHINE_TYPES } from "../db/schema";
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
  seasonId: string;
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

// Records one payment against a machine — rolls it into that machine's own
// running totalPaid/remainingDue and auto-logs the exact same amount as a
// properly-linked Expense (expenses.machineInstallmentPaymentId), so it can
// be found, shown in the Installment Payment History list, and reversed
// the same way regardless of whether it's the purchase-time payment or a
// later EMI. Shared by createMachine (below) and createInstallmentPayment
// so there is exactly ONE code path that ever writes this kind of row —
// the only way to guarantee a payment can never end up logged as two
// separate, unlinked Expenses for the same money.
async function recordMachinePayment(
  machine: { _id: string; kilnId: string; name: string; price: number | null; totalPaid: number | null },
  input: { seasonId: string; amount: number; date?: Date; notes?: string; label: string }
) {
  const _id = randomUUID();
  await db.insert(machineInstallmentPayments).values({
    _id,
    kilnId: machine.kilnId,
    seasonId: input.seasonId,
    machineId: machine._id,
    amount: input.amount,
    date: input.date,
    notes: input.notes,
  });

  const newTotalPaid = (machine.totalPaid ?? 0) + input.amount;
  const newRemainingDue = Math.max(0, (machine.price ?? 0) - newTotalPaid);
  await db.update(machines).set({ totalPaid: newTotalPaid, remainingDue: newRemainingDue }).where(eq(machines._id, machine._id));

  const expenseType = await findOrCreateExpenseType(machine.kilnId, INSTALLMENT_EXPENSE_TYPE_NAME);
  await createExpense({
    kilnId: machine.kilnId,
    seasonId: input.seasonId,
    expenseTypeId: expenseType._id,
    amount: input.amount,
    notes: `${input.label}: ${machine.name}`,
    date: input.date,
    machineInstallmentPaymentId: _id,
  });

  return _id;
}

export async function createMachine(input: CreateMachineInput) {
  const { seasonId, ...machineInput } = input;
  const _id = randomUUID();
  // Inserted at 0/full-due first, then recordMachinePayment (below) folds
  // in the purchase-time payment — same call every later installment
  // payment makes, so the very first payment is never a special case that
  // could drift out of sync with (or double-log alongside) the rest.
  await db.insert(machines).values({ ...machineInput, _id, totalPaid: 0, remainingDue: Math.max(0, input.price ?? 0) });

  if (input.totalPaid && input.totalPaid > 0) {
    await recordMachinePayment(
      { _id, kilnId: input.kilnId, name: input.name, price: input.price ?? null, totalPaid: 0 },
      { seasonId, amount: input.totalPaid, date: input.purchaseDate, label: "Purchase" }
    );
  }

  const machine = (await db.select().from(machines).where(eq(machines._id, _id)))[0]!;
  emitToKiln(input.kilnId, "machine:update", machine);
  if (input.totalPaid && input.totalPaid > 0) emitToKiln(input.kilnId, "machineInstallment:update", { machineId: _id });
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

// Never touches totalPaid directly (that only ever moves via the initial
// purchase payment and createInstallmentPayment below) — this is for
// correcting the machine's own descriptive/purchase-info fields, or
// soft-deleting it (active: false), matching the same soft-delete
// convention `people`/salary slips use elsewhere. `remainingDue` IS
// recomputed here when `price` changes, though — otherwise a later price
// correction (e.g. a data-entry fix) would leave remainingDue silently
// stale against the new price until the next installment payment happened
// to touch it.
export async function updateMachine(kilnId: string, machineId: string, input: UpdateMachineInput) {
  const existing = await assertMachineInKiln(kilnId, machineId);
  const patch: UpdateMachineInput & { remainingDue?: number } = { ...input };
  if (input.price !== undefined) {
    patch.remainingDue = Math.max(0, input.price - (existing.totalPaid ?? 0));
  }
  await db.update(machines).set(patch).where(eq(machines._id, machineId));
  const updated = (await db.select().from(machines).where(eq(machines._id, machineId)))[0]!;
  emitToKiln(kilnId, "machine:update", updated);
  return updated;
}

export interface CreateInstallmentPaymentInput {
  kilnId: string;
  seasonId: string;
  machineId: string;
  amount: number;
  date?: Date;
  notes?: string;
}

// Logs one EMI/installment payment against a machine via the same
// recordMachinePayment path createMachine's purchase-time payment uses —
// rolls it into totalPaid/remainingDue and auto-logs the same amount as a
// linked Expense under the shared "Installment" expense type.
export async function createInstallmentPayment(input: CreateInstallmentPaymentInput) {
  const machine = await assertMachineInKiln(input.kilnId, input.machineId);
  const _id = await recordMachinePayment(machine, { seasonId: input.seasonId, amount: input.amount, date: input.date, notes: input.notes, label: "Installment" });

  const payment = (await db.select().from(machineInstallmentPayments).where(eq(machineInstallmentPayments._id, _id)))[0]!;
  const updatedMachine = (await db.select().from(machines).where(eq(machines._id, input.machineId)))[0]!;
  emitToKiln(input.kilnId, "machineInstallment:update", payment);
  emitToKiln(input.kilnId, "machine:update", updatedMachine);
  return { payment, machine: updatedMachine };
}

export async function listInstallmentPayments(kilnId: string, seasonId: string, machineId: string) {
  return await db
    .select()
    .from(machineInstallmentPayments)
    .where(and(eq(machineInstallmentPayments.kilnId, kilnId), eq(machineInstallmentPayments.seasonId, seasonId), eq(machineInstallmentPayments.machineId, machineId)))
    .orderBy(desc(machineInstallmentPayments.date));
}

// A mistyped amount or a duplicate entry had no way to be corrected —
// every other auto-logged cost in this app (Brick Loading charges, Doctor
// Visits, Supplier Invoices) can be edited or deleted with the machine's
// own running total and the linked Expense kept in sync; installment
// payments were the one exception. Reverses this payment's contribution
// to totalPaid/remainingDue and removes its linked Expense (matched via
// expenses.machineInstallmentPaymentId).
export async function deleteInstallmentPayment(kilnId: string, paymentId: string) {
  const existing = (await db.select().from(machineInstallmentPayments).where(and(eq(machineInstallmentPayments._id, paymentId), eq(machineInstallmentPayments.kilnId, kilnId))))[0];
  if (!existing) throw new Error("Installment payment not found in this kiln");
  const machine = await assertMachineInKiln(kilnId, existing.machineId);

  await db.delete(machineInstallmentPayments).where(eq(machineInstallmentPayments._id, paymentId));

  const newTotalPaid = Math.max(0, (machine.totalPaid ?? 0) - existing.amount);
  const newRemainingDue = Math.max(0, (machine.price ?? 0) - newTotalPaid);
  await db.update(machines).set({ totalPaid: newTotalPaid, remainingDue: newRemainingDue }).where(eq(machines._id, existing.machineId));

  const linkedExpense = (await db.select({ _id: expenses._id }).from(expenses).where(eq(expenses.machineInstallmentPaymentId, paymentId)))[0];
  if (linkedExpense) {
    await db.delete(expenses).where(eq(expenses._id, linkedExpense._id));
    emitToKiln(kilnId, "expense:update", { _id: linkedExpense._id, deleted: true });
  }

  const updatedMachine = (await db.select().from(machines).where(eq(machines._id, existing.machineId)))[0]!;
  emitToKiln(kilnId, "machineInstallment:update", { _id: paymentId, deleted: true });
  emitToKiln(kilnId, "machine:update", updatedMachine);
  return { machine: updatedMachine };
}

export interface CreateFuelLogInput {
  kilnId: string;
  seasonId: string;
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
      .where(and(eq(machineFuelLogs.kilnId, input.kilnId), eq(machineFuelLogs.seasonId, input.seasonId), eq(machineFuelLogs.machineId, input.machineId), gte(machineFuelLogs.date, since), gt(machineFuelLogs.hoursRun, 0)));

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

export async function listMachineFuelLogs(kilnId: string, seasonId: string, days = 30) {
  const since = new Date();
  since.setDate(since.getDate() - days);
  const rows = await db.select().from(machineFuelLogs).where(and(eq(machineFuelLogs.kilnId, kilnId), eq(machineFuelLogs.seasonId, seasonId), gte(machineFuelLogs.date, since))).orderBy(desc(machineFuelLogs.date));
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
  seasonId: string;
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
      seasonId: input.seasonId,
      category: "MACHINERY_REPAIR",
      amount: input.cost,
      notes: input.description,
      date: input.date,
      machineMaintenanceLogId: _id,
    });
  }

  emitToKiln(input.kilnId, "machineMaintenance:update", log);
  return log;
}

export async function listMaintenanceLogs(kilnId: string, seasonId: string, days = 90) {
  const since = new Date();
  since.setDate(since.getDate() - days);
  const rows = await db.select().from(machineMaintenanceLogs).where(and(eq(machineMaintenanceLogs.kilnId, kilnId), eq(machineMaintenanceLogs.seasonId, seasonId), gte(machineMaintenanceLogs.date, since))).orderBy(desc(machineMaintenanceLogs.date));
  return withMachine(rows);
}

// Mirrors deleteInstallmentPayment's reasoning — a mistyped fuel quantity
// had no way to be corrected. Fuel logs never auto-log an Expense (no cost
// field), so this is a plain delete with no linked-row reversal needed.
export async function deleteMachineFuelLog(kilnId: string, logId: string) {
  const existing = (await db.select().from(machineFuelLogs).where(and(eq(machineFuelLogs._id, logId), eq(machineFuelLogs.kilnId, kilnId))))[0];
  if (!existing) throw new Error("Fuel log not found in this kiln");
  await db.delete(machineFuelLogs).where(eq(machineFuelLogs._id, logId));
  emitToKiln(kilnId, "machineFuel:update", { _id: logId, deleted: true });
}

// Reverses a maintenance log's linked Expense (matched via
// expenses.machineMaintenanceLogId), same pattern as
// deleteInstallmentPayment's expense reversal.
export async function deleteMaintenanceLog(kilnId: string, logId: string) {
  const existing = (await db.select().from(machineMaintenanceLogs).where(and(eq(machineMaintenanceLogs._id, logId), eq(machineMaintenanceLogs.kilnId, kilnId))))[0];
  if (!existing) throw new Error("Maintenance log not found in this kiln");

  await db.delete(machineMaintenanceLogs).where(eq(machineMaintenanceLogs._id, logId));

  const linkedExpense = (await db.select({ _id: expenses._id }).from(expenses).where(eq(expenses.machineMaintenanceLogId, logId)))[0];
  if (linkedExpense) {
    await db.delete(expenses).where(eq(expenses._id, linkedExpense._id));
    emitToKiln(kilnId, "expense:update", { _id: linkedExpense._id, deleted: true });
  }

  emitToKiln(kilnId, "machineMaintenance:update", { _id: logId, deleted: true });
}

// Per-machine rollup for the period — the machine-fleet third of the
// unified "Vehicle Reports" (see reports/resources.reports.ts's
// vehicleWork report), mirroring vehicleDieselSummary/tractorFleetSummary's
// own entity-rollup shape. Report-level unification only — machines stay a
// completely independent identity from kilnVehicles/stackingVehicles, no
// schema/FK merge.
export async function machineFleetSummary(kilnId: string, filter: { from?: Date; to?: Date } = {}) {
  const allMachines = await listMachines(kilnId);
  const fuelConditions = [eq(machineFuelLogs.kilnId, kilnId)];
  if (filter.from) fuelConditions.push(gte(machineFuelLogs.date, filter.from));
  if (filter.to) fuelConditions.push(lte(machineFuelLogs.date, filter.to));
  const fuelRows = await db.select().from(machineFuelLogs).where(and(...fuelConditions));

  const fuelByMachine = new Map<string, { quantity: number; logCount: number }>();
  for (const f of fuelRows) {
    const existing = fuelByMachine.get(f.machineId) ?? { quantity: 0, logCount: 0 };
    existing.quantity += f.quantity;
    existing.logCount += 1;
    fuelByMachine.set(f.machineId, existing);
  }

  return allMachines.map((m) => ({
    machineId: m._id,
    machineName: m.name,
    machineType: m.type,
    fuelQuantity: Math.round((fuelByMachine.get(m._id)?.quantity ?? 0) * 100) / 100,
    fillUpCount: fuelByMachine.get(m._id)?.logCount ?? 0,
  }));
}
