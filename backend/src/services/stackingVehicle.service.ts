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
  db.insert(stackingVehicles).values({ ...input, _id }).run();
  const vehicle = db.select().from(stackingVehicles).where(eq(stackingVehicles._id, _id)).get()!;
  emitToKiln(input.kilnId, "stackingVehicle:update", vehicle);
  return vehicle;
}

export async function listStackingVehicles(kilnId: string, contractorId?: string) {
  const conditions = [eq(stackingVehicles.kilnId, kilnId)];
  if (contractorId) conditions.push(eq(stackingVehicles.contractorId, contractorId));
  return db.select().from(stackingVehicles).where(and(...conditions)).orderBy(desc(stackingVehicles.createdAt)).all();
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
  const existing = db.select().from(stackingVehicles).where(and(eq(stackingVehicles._id, vehicleId), eq(stackingVehicles.kilnId, kilnId))).get();
  if (!existing) throw new Error("Stacking vehicle not found in this kiln");

  db.update(stackingVehicles).set(input).where(eq(stackingVehicles._id, vehicleId)).run();
  const vehicle = db.select().from(stackingVehicles).where(eq(stackingVehicles._id, vehicleId)).get()!;
  emitToKiln(kilnId, "stackingVehicle:update", vehicle);
  return vehicle;
}
