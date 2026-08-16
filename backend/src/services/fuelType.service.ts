import { randomUUID } from "crypto";
import { and, asc, eq } from "drizzle-orm";
import { db } from "../db/client";
import { fuelTypes } from "../db/schema";
import { emitToKiln } from "../config/socket";

export async function createFuelType(kilnId: string, name: string) {
  try {
    const _id = randomUUID();
    db.insert(fuelTypes).values({ _id, kilnId, name: name.trim() }).run();
    const created = db.select().from(fuelTypes).where(eq(fuelTypes._id, _id)).get()!;
    emitToKiln(kilnId, "fuelType:update", created);
    return created;
  } catch (err: unknown) {
    if (err instanceof Error && err.message.includes("UNIQUE constraint failed")) {
      throw new Error("This fuel type has already been added for this kiln");
    }
    throw err;
  }
}

export async function listFuelTypes(kilnId: string) {
  return db.select().from(fuelTypes).where(eq(fuelTypes.kilnId, kilnId)).orderBy(asc(fuelTypes.name)).all();
}

export async function deleteFuelType(kilnId: string, fuelTypeId: string) {
  const existing = db.select().from(fuelTypes).where(and(eq(fuelTypes._id, fuelTypeId), eq(fuelTypes.kilnId, kilnId))).get();
  if (!existing) throw new Error("Fuel type not found in this kiln");
  db.delete(fuelTypes).where(eq(fuelTypes._id, fuelTypeId)).run();
  emitToKiln(kilnId, "fuelType:update", { _id: fuelTypeId, deleted: true });
  return existing;
}

export async function assertFuelTypeExists(kilnId: string, name: string) {
  const exists = db.select({ _id: fuelTypes._id }).from(fuelTypes).where(and(eq(fuelTypes.kilnId, kilnId), eq(fuelTypes.name, name))).get();
  if (!exists) throw new Error(`Fuel type "${name}" has not been added for this kiln — add it on the Fuel page first`);
}
