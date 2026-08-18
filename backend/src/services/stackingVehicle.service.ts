import { randomUUID } from "crypto";
import { and, desc, eq } from "drizzle-orm";
import { db } from "../db/client";
import { stackingVehicles, STACKING_VEHICLE_TYPES } from "../db/schema";
import { assertPersonOfType } from "./person.service";
import { emitToKiln } from "../config/socket";

export type StackingVehicleType = (typeof STACKING_VEHICLE_TYPES)[number];

export interface CreateStackingVehicleInput {
  kilnId: string;
  contractorId: string;
  vehicleType: StackingVehicleType;
  vehicleNumber?: string;
  buggiCount?: number;
  driverName?: string;
  notes?: string;
}

export async function createStackingVehicle(input: CreateStackingVehicleInput) {
  await assertPersonOfType(input.kilnId, input.contractorId, ["LABOUR_CONTRACTOR"]);
  const _id = randomUUID();
  await db.insert(stackingVehicles).values({ ...input, _id });
  const vehicle = (await db.select().from(stackingVehicles).where(eq(stackingVehicles._id, _id)))[0]!;
  emitToKiln(input.kilnId, "stackingVehicle:update", vehicle);
  return vehicle;
}

export async function listStackingVehicles(kilnId: string, contractorId?: string) {
  const conditions = [eq(stackingVehicles.kilnId, kilnId)];
  if (contractorId) conditions.push(eq(stackingVehicles.contractorId, contractorId));
  return await db.select().from(stackingVehicles).where(and(...conditions)).orderBy(desc(stackingVehicles.createdAt));
}

export interface UpdateStackingVehicleInput {
  vehicleType?: StackingVehicleType;
  vehicleNumber?: string;
  buggiCount?: number;
  driverName?: string;
  status?: "ACTIVE" | "INACTIVE";
  notes?: string;
}

export async function updateStackingVehicle(kilnId: string, vehicleId: string, input: UpdateStackingVehicleInput) {
  const existing = (await db.select().from(stackingVehicles).where(and(eq(stackingVehicles._id, vehicleId), eq(stackingVehicles.kilnId, kilnId))))[0];
  if (!existing) throw new Error("Stacking vehicle not found in this kiln");

  await db.update(stackingVehicles).set(input).where(eq(stackingVehicles._id, vehicleId));
  const vehicle = (await db.select().from(stackingVehicles).where(eq(stackingVehicles._id, vehicleId)))[0]!;
  emitToKiln(kilnId, "stackingVehicle:update", vehicle);
  return vehicle;
}
