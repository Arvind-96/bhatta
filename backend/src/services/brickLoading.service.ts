import { randomUUID } from "crypto";
import { and, asc, desc, eq, gte, inArray } from "drizzle-orm";
import { db } from "../db/client";
import { brickLoadingEntries, dispatches, people, ledgerEntries, BRICK_VEHICLE_TYPES } from "../db/schema";
import { assertPersonOfType } from "./person.service";
import { addLedgerEntry } from "./ledger.service";
import { emitToKiln } from "../config/socket";

export type BrickVehicleType = (typeof BRICK_VEHICLE_TYPES)[number];

export interface CreateBrickLoadingInput {
  kilnId: string;
  vehicleType: BrickVehicleType;
  vehicleNumber: string;
  driverId: string;
  bricksCount: number;
  tipAmount?: number;
  dispatchId?: string;
  date?: Date;
  notes?: string;
}

// The vehicle-loading operation record — which truck/tractor, which
// driver, how many bricks — kept separate from Dispatch (the sale) and
// LoadingEntry (the palledar's wage for the physical loading labor). A
// tip/inaam given to the driver posts straight to their ledger, same
// DUE-entry pattern used for every other bonus in this app (see
// firingShift.service.ts's OT/bonus).
export async function createBrickLoadingEntry(input: CreateBrickLoadingInput) {
  await assertPersonOfType(input.kilnId, input.driverId, ["DRIVER"]);
  if (input.dispatchId) {
    const dispatch = db.select({ _id: dispatches._id }).from(dispatches).where(and(eq(dispatches._id, input.dispatchId), eq(dispatches.kilnId, input.kilnId))).get();
    if (!dispatch) throw new Error("Referenced dispatch not found in this kiln");
  }

  const _id = randomUUID();
  db.insert(brickLoadingEntries).values({ ...input, _id }).run();
  const entry = db.select().from(brickLoadingEntries).where(eq(brickLoadingEntries._id, _id)).get()!;

  if (input.tipAmount && input.tipAmount > 0) {
    await addLedgerEntry({
      kilnId: input.kilnId,
      personId: input.driverId,
      direction: "DUE",
      amount: input.tipAmount,
      reason: `Driver tip/inaam — ${input.vehicleNumber} (${input.bricksCount.toLocaleString()} bricks)`,
      date: input.date,
      category: "TIP",
    });
  }

  emitToKiln(input.kilnId, "brickLoading:update", entry);
  return entry;
}

export interface UpdateBrickLoadingInput {
  vehicleType?: BrickVehicleType;
  vehicleNumber?: string;
  bricksCount?: number;
  tipAmount?: number;
  notes?: string;
}

// Full admin edit — never silently rewrites a tip already posted to the
// driver's ledger; a changed tipAmount posts a correction entry for the
// difference instead (DUE if raised, PAID if lowered), same convention as
// every other correctable amount in this app (see stacking.service.ts's
// original wage-delta pattern).
export async function updateBrickLoadingEntry(kilnId: string, entryId: string, input: UpdateBrickLoadingInput) {
  const existing = db.select().from(brickLoadingEntries).where(and(eq(brickLoadingEntries._id, entryId), eq(brickLoadingEntries.kilnId, kilnId))).get();
  if (!existing) throw new Error("Brick loading entry not found in this kiln");

  const oldTip = existing.tipAmount ?? 0;

  db.update(brickLoadingEntries).set(input).where(eq(brickLoadingEntries._id, entryId)).run();
  const updated = db.select().from(brickLoadingEntries).where(eq(brickLoadingEntries._id, entryId)).get()!;

  if (input.tipAmount !== undefined) {
    const delta = Math.round((input.tipAmount - oldTip) * 100) / 100;
    if (delta > 0) {
      await addLedgerEntry({
        kilnId,
        personId: updated.driverId,
        direction: "DUE",
        amount: delta,
        reason: `Driver tip correction — revised up to ₹${input.tipAmount} for ${updated.vehicleNumber}`,
        category: "TIP",
      });
    } else if (delta < 0) {
      await addLedgerEntry({
        kilnId,
        personId: updated.driverId,
        direction: "PAID",
        amount: -delta,
        reason: `Driver tip correction — revised down to ₹${input.tipAmount} for ${updated.vehicleNumber}`,
        category: "TIP",
      });
    }
  }

  emitToKiln(kilnId, "brickLoading:update", updated);
  return updated;
}

export interface ListBrickLoadingFilter {
  driverId?: string;
  days?: number;
}

export async function listBrickLoadingEntries(kilnId: string, filter: ListBrickLoadingFilter = {}) {
  const conditions = [eq(brickLoadingEntries.kilnId, kilnId)];
  if (filter.driverId) conditions.push(eq(brickLoadingEntries.driverId, filter.driverId));
  if (filter.days) {
    const since = new Date();
    since.setDate(since.getDate() - filter.days);
    conditions.push(gte(brickLoadingEntries.date, since));
  }

  const rows = await db.select().from(brickLoadingEntries).where(and(...conditions)).orderBy(desc(brickLoadingEntries.date)).all();
  const driverIds = [...new Set(rows.map((r) => r.driverId))];
  const dispatchIds = [...new Set(rows.map((r) => r.dispatchId).filter((v): v is string => !!v))];
  const [driverRows, dispatchRows] = await Promise.all([
    driverIds.length ? db.select({ _id: people._id, name: people.name, type: people.type }).from(people).where(inArray(people._id, driverIds)).all() : [],
    dispatchIds.length ? db.select({ _id: dispatches._id, slipNumber: dispatches.slipNumber, customerName: dispatches.customerName }).from(dispatches).where(inArray(dispatches._id, dispatchIds)).all() : [],
  ]);
  const driverById = new Map(driverRows.map((d) => [d._id, d]));
  const dispatchById = new Map(dispatchRows.map((d) => [d._id, d]));
  return rows.map((r) => ({
    ...r,
    driverId: driverById.get(r.driverId) ?? r.driverId,
    dispatchId: r.dispatchId ? dispatchById.get(r.dispatchId) ?? r.dispatchId : r.dispatchId,
  }));
}

function sumByDirection(entries: { direction: "DUE" | "PAID"; amount: number }[]) {
  const due = entries.filter((e) => e.direction === "DUE").reduce((sum, e) => sum + e.amount, 0);
  const paid = entries.filter((e) => e.direction === "PAID").reduce((sum, e) => sum + e.amount, 0);
  return { due, paid, balance: due - paid };
}

// Per-driver rollup: every driver who's ever loaded a brick delivery, their
// total bricks moved, total tips earned, trip count, and ledger balance —
// so an owner can see "who's driving the most, and what have I tipped them"
// at a glance.
export async function brickLoadingDriverSummary(kilnId: string) {
  const drivers = await db.select().from(people).where(and(eq(people.kilnId, kilnId), eq(people.type, "DRIVER"), eq(people.active, true))).orderBy(asc(people.name)).all();

  const allEntries = await db.select().from(brickLoadingEntries).where(eq(brickLoadingEntries.kilnId, kilnId)).all();
  const entriesByDriver = new Map<string, typeof allEntries>();
  for (const e of allEntries) {
    const id = e.driverId;
    if (!entriesByDriver.has(id)) entriesByDriver.set(id, []);
    entriesByDriver.get(id)!.push(e);
  }

  const results = [];
  for (const driver of drivers) {
    const driverEntries = entriesByDriver.get(driver._id) ?? [];
    if (driverEntries.length === 0) continue;

    const driverLedgerEntries = await db.select().from(ledgerEntries).where(and(eq(ledgerEntries.kilnId, kilnId), eq(ledgerEntries.personId, driver._id))).all();
    const { due, paid, balance } = sumByDirection(driverLedgerEntries);

    results.push({
      driver: {
        id: driver._id,
        name: driver.name,
        phone: driver.phone,
        vehicleNumber: driver.vehicleNumber ?? null,
      },
      totalBricksLoaded: driverEntries.reduce((sum, e) => sum + e.bricksCount, 0),
      totalTips: driverEntries.reduce((sum, e) => sum + (e.tipAmount ?? 0), 0),
      tripCount: driverEntries.length,
      totalDue: due,
      totalPaid: paid,
      balance,
    });
  }

  return {
    drivers: results,
    totalBricksLoadedAllDrivers: results.reduce((sum, r) => sum + r.totalBricksLoaded, 0),
  };
}
