import { randomUUID } from "crypto";
import { and, asc, eq } from "drizzle-orm";
import { db } from "../db/client";
import { lands, soilTrips, people, LAND_STATUSES } from "../db/schema";
import { assertPersonOfType } from "./person.service";
import { emitToKiln } from "../config/socket";

export type LandStatus = (typeof LAND_STATUSES)[number];

export interface CreateLandInput {
  kilnId: string;
  landownerId: string;
  name: string;
  village?: string;
  tehsil?: string;
  district?: string;
  state?: string;
  khasraNumber?: string;
  khataNumber?: string;
  latitude?: number;
  longitude?: number;
  area?: number;
  areaUnit?: string;
  soilType?: string;
  estimatedSoilQuantity?: number;
  notes?: string;
}

export async function createLand(input: CreateLandInput) {
  await assertPersonOfType(input.kilnId, input.landownerId, ["LANDOWNER"]);
  const _id = randomUUID();
  db.insert(lands).values({ ...input, _id }).run();
  const land = db.select().from(lands).where(eq(lands._id, _id)).get()!;
  emitToKiln(input.kilnId, "land:update", land);
  return land;
}

async function excavatedQuantityForLand(kilnId: string, landId: string) {
  const trips = await db.select().from(soilTrips).where(and(eq(soilTrips.kilnId, kilnId), eq(soilTrips.landId, landId))).all();
  return trips.reduce((sum, t) => sum + (t.trolleyCount ?? 0), 0);
}

function withLandowner(land: typeof lands.$inferSelect) {
  const owner = db.select({ _id: people._id, name: people.name, phone: people.phone }).from(people).where(eq(people._id, land.landownerId)).get();
  return { ...land, landownerId: owner ?? land.landownerId };
}

// excavatedQuantity is always computed from SoilTrip, never stored — same
// "totals come from transactions" rule the rest of this app already follows
// (reconciliation.service.ts, soilContract.service.ts's getContractSummary).
export async function listLands(kilnId: string, landownerId?: string) {
  const conditions = [eq(lands.kilnId, kilnId)];
  if (landownerId) conditions.push(eq(lands.landownerId, landownerId));
  const rows = await db.select().from(lands).where(and(...conditions)).orderBy(asc(lands.name)).all();

  return Promise.all(
    rows.map(async (land) => ({
      ...withLandowner(land),
      excavatedQuantity: await excavatedQuantityForLand(kilnId, land._id),
    }))
  );
}

// Powers the "open a khet, see everything about it" drill-down — the land's
// own info plus its computed excavated total, same shape as one entry from
// listLands but fetched directly by id instead of scanning the whole list.
export async function getLand(kilnId: string, landId: string) {
  const land = db.select().from(lands).where(and(eq(lands._id, landId), eq(lands.kilnId, kilnId))).get();
  if (!land) throw new Error("Land not found in this kiln");
  return { ...withLandowner(land), excavatedQuantity: await excavatedQuantityForLand(kilnId, land._id) };
}

export interface UpdateLandInput extends Partial<Omit<CreateLandInput, "kilnId" | "landownerId">> {
  status?: LandStatus;
}

export async function updateLand(kilnId: string, landId: string, input: UpdateLandInput) {
  const existing = db.select().from(lands).where(and(eq(lands._id, landId), eq(lands.kilnId, kilnId))).get();
  if (!existing) throw new Error("Land not found in this kiln");
  db.update(lands).set(input).where(eq(lands._id, landId)).run();
  const land = db.select().from(lands).where(eq(lands._id, landId)).get()!;
  emitToKiln(kilnId, "land:update", land);
  return land;
}

export async function assertLandInKiln(kilnId: string, landId: string) {
  const land = db.select().from(lands).where(and(eq(lands._id, landId), eq(lands.kilnId, kilnId))).get();
  if (!land) throw new Error("Referenced land not found in this kiln");
  return land;
}
