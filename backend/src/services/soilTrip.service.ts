import { randomUUID } from "crypto";
import { and, desc, eq, gte, inArray, lte } from "drizzle-orm";
import { db } from "../db/client";
import { soilTrips, soilContracts, people } from "../db/schema";
import { addLedgerEntry } from "./ledger.service";
import { assertPersonOfType } from "./person.service";
import { emitToKiln } from "../config/socket";

export interface CreateSoilTripInput {
  kilnId: string;
  seasonId: string;
  landownerId: string;
  driverId?: string;
  contractId?: string;
  landId?: string;
  tractorNumber?: string;
  trolleyCount?: number;
  receivedTrolleyCount?: number;
  ratePerTrolley: number;
  driverRatePerTrolley?: number;
  depthFeet?: number;
  date?: Date;
  notes?: string;
}

// Recording a trip is also a money event: the landowner is owed for the
// soil, and — if this trip is on a per-trolley driver contract — the
// driver/tractor is owed a trip fee too. Both post straight to the ledger
// so the munim never has to remember to enter them separately.
//
// Exception: a trip against a PER_BIGHA/PER_DEPTH contract does NOT post a
// landowner charge here — that contract's full price already posted as one
// DUE entry when it was created (see soilContract.service.ts), since the
// farmer was paid a fixed price for the field/depth, not per trolley. The
// trip still gets logged and still counts toward the contract's
// excavatedQuantity for operational tracking. Driver haulage fees are
// unaffected either way — a driver is paid per trip regardless of how the
// soil itself was priced.
export async function createSoilTrip(input: CreateSoilTripInput) {
  await assertPersonOfType(input.kilnId, input.landownerId, ["LANDOWNER"]);
  if (input.driverId) {
    await assertPersonOfType(input.kilnId, input.driverId, ["DRIVER"]);
  }

  let contract = null;
  if (input.contractId) {
    contract = (await db.select().from(soilContracts).where(and(eq(soilContracts._id, input.contractId), eq(soilContracts.kilnId, input.kilnId))))[0];
    if (!contract) throw new Error("Referenced soil contract not found in this kiln");
    if (contract.landownerId !== input.landownerId) {
      throw new Error("This trip's landowner does not match the contract's landowner");
    }
  }

  const trolleyCount = input.trolleyCount ?? 1;
  const _id = randomUUID();
  await db.insert(soilTrips).values({ ...input, _id, trolleyCount });
  const trip = (await db.select().from(soilTrips).where(eq(soilTrips._id, _id)))[0]!;

  if (!contract || contract.rateType === "PER_TROLLEY") {
    await addLedgerEntry({
      kilnId: input.kilnId,
      personId: input.landownerId,
      direction: "DUE",
      amount: trolleyCount * input.ratePerTrolley,
      reason: `Soil: ${trolleyCount} trolley(s)${input.tractorNumber ? ` — ${input.tractorNumber}` : ""}`,
      date: input.date,
      contractId: input.contractId,
    });
  }

  if (input.driverId && input.driverRatePerTrolley) {
    await addLedgerEntry({
      kilnId: input.kilnId,
      personId: input.driverId,
      direction: "DUE",
      amount: trolleyCount * input.driverRatePerTrolley,
      reason: `Trolley trip fee: ${trolleyCount} trip(s)`,
      date: input.date,
    });
  }

  emitToKiln(input.kilnId, "soilTrip:update", trip);
  return trip;
}

export interface ListSoilTripsFilter {
  landownerId?: string;
  contractId?: string;
  landId?: string;
  from?: Date;
  to?: Date;
}

// seasonId is nullable — pass null for an all-time, every-season view (see
// report.service.ts's full person report and the Reports page's own
// admin-picked date-range reports).
export async function listSoilTrips(kilnId: string, seasonId: string | null, filter: ListSoilTripsFilter = {}) {
  const conditions = [eq(soilTrips.kilnId, kilnId)];
  if (seasonId) conditions.push(eq(soilTrips.seasonId, seasonId));
  if (filter.landownerId) conditions.push(eq(soilTrips.landownerId, filter.landownerId));
  if (filter.contractId) conditions.push(eq(soilTrips.contractId, filter.contractId));
  if (filter.landId) conditions.push(eq(soilTrips.landId, filter.landId));
  if (filter.from) conditions.push(gte(soilTrips.date, filter.from));
  if (filter.to) conditions.push(lte(soilTrips.date, filter.to));

  const rows = await db.select().from(soilTrips).where(and(...conditions)).orderBy(desc(soilTrips.date));
  const landownerIds = [...new Set(rows.map((r) => r.landownerId))];
  const driverIds = [...new Set(rows.map((r) => r.driverId).filter((v): v is string => !!v))];
  const ids = [...new Set([...landownerIds, ...driverIds])];
  const peopleRows = ids.length ? await db.select({ _id: people._id, name: people.name }).from(people).where(inArray(people._id, ids)) : [];
  const personById = new Map(peopleRows.map((p) => [p._id, p]));
  return rows.map((r) => ({
    ...r,
    landownerId: personById.get(r.landownerId) ?? r.landownerId,
    driverId: r.driverId ? personById.get(r.driverId) ?? r.driverId : r.driverId,
  }));
}

export async function updateSoilTripStatus(kilnId: string, tripId: string, status: "ARRIVED" | "WEATHERING" | "READY") {
  const existing = (await db.select().from(soilTrips).where(and(eq(soilTrips._id, tripId), eq(soilTrips.kilnId, kilnId))))[0];
  if (!existing) throw new Error("Soil trip not found");
  await db.update(soilTrips).set({ status }).where(eq(soilTrips._id, tripId));
  const trip = (await db.select().from(soilTrips).where(eq(soilTrips._id, tripId)))[0]!;
  emitToKiln(kilnId, "soilTrip:update", trip);
  return trip;
}

export async function soilInwardTotals(kilnId: string, seasonId: string, days = 30) {
  const since = new Date();
  since.setDate(since.getDate() - days);

  const trips = await db.select().from(soilTrips).where(and(eq(soilTrips.kilnId, kilnId), eq(soilTrips.seasonId, seasonId), gte(soilTrips.date, since)));
  const totalTrolleys = trips.reduce((sum, t) => sum + (t.trolleyCount ?? 0), 0);
  const readyTrolleys = trips.filter((t) => t.status === "READY").reduce((sum, t) => sum + (t.trolleyCount ?? 0), 0);

  return { totalTrolleys, readyTrolleys, tripCount: trips.length };
}
