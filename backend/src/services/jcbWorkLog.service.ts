import { randomUUID } from "crypto";
import { and, desc, eq, gte, inArray, lte } from "drizzle-orm";
import { db } from "../db/client";
import { jcbWorkLogs, machines, soilContracts, lands, people } from "../db/schema";
import { assertLandInKiln } from "./land.service";
import { assertPersonOfType } from "./person.service";
import { emitToKiln } from "../config/socket";

export interface CreateJcbWorkLogInput {
  kilnId: string;
  seasonId: string;
  landId: string;
  landownerId: string;
  driverId: string;
  machineId?: string;
  contractId?: string;
  hoursWorked: number;
  date?: Date;
  notes?: string;
}

export async function createJcbWorkLog(input: CreateJcbWorkLogInput) {
  const land = await assertLandInKiln(input.kilnId, input.landId);
  if (land.landownerId !== input.landownerId) {
    throw new Error("landownerId does not match the owner of this land");
  }
  await assertPersonOfType(input.kilnId, input.driverId, ["DRIVER"]);

  if (input.machineId) {
    const machine = (await db.select().from(machines).where(and(eq(machines._id, input.machineId), eq(machines.kilnId, input.kilnId))))[0];
    if (!machine) throw new Error("Referenced machine not found in this kiln");
    if (machine.type !== "JCB") throw new Error("Referenced machine is not a JCB/backhoe loader");
  }

  if (input.contractId) {
    const contract = (await db.select().from(soilContracts).where(and(eq(soilContracts._id, input.contractId), eq(soilContracts.kilnId, input.kilnId))))[0];
    if (!contract) throw new Error("Referenced soil contract not found in this kiln");
    if (contract.landId !== input.landId) {
      throw new Error("This contract is not for the referenced land");
    }
  }

  const _id = randomUUID();
  await db.insert(jcbWorkLogs).values({ ...input, _id });
  const log = (await db.select().from(jcbWorkLogs).where(eq(jcbWorkLogs._id, _id)))[0]!;
  emitToKiln(input.kilnId, "jcbWorkLog:update", log);
  return log;
}

export interface ListJcbWorkLogsFilter {
  landId?: string;
  driverId?: string;
  contractId?: string;
  from?: Date;
  to?: Date;
}

export async function listJcbWorkLogs(kilnId: string, seasonId: string, filter: ListJcbWorkLogsFilter = {}) {
  const conditions = [eq(jcbWorkLogs.kilnId, kilnId), eq(jcbWorkLogs.seasonId, seasonId)];
  if (filter.landId) conditions.push(eq(jcbWorkLogs.landId, filter.landId));
  if (filter.driverId) conditions.push(eq(jcbWorkLogs.driverId, filter.driverId));
  if (filter.contractId) conditions.push(eq(jcbWorkLogs.contractId, filter.contractId));
  if (filter.from) conditions.push(gte(jcbWorkLogs.date, filter.from));
  if (filter.to) conditions.push(lte(jcbWorkLogs.date, filter.to));

  const rows = await db.select().from(jcbWorkLogs).where(and(...conditions)).orderBy(desc(jcbWorkLogs.date));

  const landIds = [...new Set(rows.map((r) => r.landId))];
  const personIds = [...new Set([...rows.map((r) => r.landownerId), ...rows.map((r) => r.driverId)])];
  const machineIds = [...new Set(rows.map((r) => r.machineId).filter((v): v is string => !!v))];
  const [landRows, personRows, machineRows] = await Promise.all([
    landIds.length ? db.select({ _id: lands._id, name: lands.name, village: lands.village }).from(lands).where(inArray(lands._id, landIds)) : [],
    personIds.length ? db.select({ _id: people._id, name: people.name }).from(people).where(inArray(people._id, personIds)) : [],
    machineIds.length ? db.select({ _id: machines._id, name: machines.name, identifier: machines.identifier }).from(machines).where(inArray(machines._id, machineIds)) : [],
  ]);
  const landById = new Map(landRows.map((l) => [l._id, l]));
  const personById = new Map(personRows.map((p) => [p._id, p]));
  const machineById = new Map(machineRows.map((m) => [m._id, m]));

  return rows.map((r) => ({
    ...r,
    landId: landById.get(r.landId) ?? r.landId,
    landownerId: personById.get(r.landownerId) ?? r.landownerId,
    driverId: personById.get(r.driverId) ?? r.driverId,
    machineId: r.machineId ? machineById.get(r.machineId) ?? r.machineId : r.machineId,
  }));
}

// Total hours logged against one land — the "how long has the JCB been
// digging at this khet" figure surfaced on the contract/land detail view.
export async function totalJcbHoursForLand(kilnId: string, landId: string) {
  const logs = await db.select().from(jcbWorkLogs).where(and(eq(jcbWorkLogs.kilnId, kilnId), eq(jcbWorkLogs.landId, landId)));
  // Deliberately season-agnostic (no seasonId filter) — an all-time "how
  // long has the JCB worked this khet" total.
  return logs.reduce((sum, l) => sum + l.hoursWorked, 0);
}
