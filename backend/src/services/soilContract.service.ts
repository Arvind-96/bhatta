import { randomUUID } from "crypto";
import { and, desc, eq, inArray, isNotNull, lte } from "drizzle-orm";
import { db } from "../db/client";
import { soilContracts, soilTrips, soilArrivals, lands, people, SOIL_CONTRACT_STATUSES, SOIL_CONTRACT_RATE_TYPES, DEPTH_UNITS } from "../db/schema";
import { assertLandInKiln } from "./land.service";
import { assertPersonOfType } from "./person.service";
import { addLedgerEntry, contractLedgerBalance } from "./ledger.service";
import { emitToKiln } from "../config/socket";

export type SoilContractStatus = (typeof SOIL_CONTRACT_STATUSES)[number];
export type SoilContractRateType = (typeof SOIL_CONTRACT_RATE_TYPES)[number];
export type DepthUnit = (typeof DEPTH_UNITS)[number];

const EXPIRY_WARNING_DAYS = 14;

// Same shape as Dispatch.generateSlipNumber — timestamp + random suffix,
// no counter to race on.
function generateContractNumber() {
  return `SC-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
}

export interface CreateSoilContractInput {
  kilnId: string;
  landId: string;
  landownerId: string;
  soilType?: string;
  rateType?: SoilContractRateType;
  contractedQuantity?: number; // trolleys — optional cap, any rateType
  ratePerTrolley?: number; // required when rateType is PER_TROLLEY
  contractedAreaBigha?: number; // required when rateType is PER_BIGHA
  ratePerBigha?: number; // required when rateType is PER_BIGHA
  contractedDepth?: number; // required when rateType is PER_DEPTH
  depthUnit?: DepthUnit;
  ratePerDepthUnit?: number; // required when rateType is PER_DEPTH
  totalContractValue?: number; // override for a fully custom lump-sum
  advanceAmount?: number;
  startDate?: Date;
  endDate?: Date;
  agreedDepthFeet?: number;
  paymentTerms?: string;
  notes?: string;
}

function computeTotalContractValue(input: {
  rateType?: SoilContractRateType;
  contractedQuantity?: number;
  ratePerTrolley?: number;
  contractedAreaBigha?: number;
  ratePerBigha?: number;
  contractedDepth?: number;
  ratePerDepthUnit?: number;
  totalContractValue?: number;
}): number {
  if (input.totalContractValue != null) return input.totalContractValue;

  const rateType = input.rateType ?? "PER_TROLLEY";
  if (rateType === "PER_BIGHA") {
    if (input.contractedAreaBigha == null || input.ratePerBigha == null) {
      throw new Error("contractedAreaBigha and ratePerBigha are required for a PER_BIGHA contract");
    }
    return input.contractedAreaBigha * input.ratePerBigha;
  }
  if (rateType === "PER_DEPTH") {
    if (input.contractedDepth == null || input.ratePerDepthUnit == null) {
      throw new Error("contractedDepth and ratePerDepthUnit are required for a PER_DEPTH contract");
    }
    return input.contractedDepth * input.ratePerDepthUnit;
  }
  if (input.contractedQuantity == null || input.ratePerTrolley == null) {
    throw new Error("contractedQuantity and ratePerTrolley are required for a PER_TROLLEY contract");
  }
  return input.contractedQuantity * input.ratePerTrolley;
}

function withLandownerAndLand(contract: typeof soilContracts.$inferSelect) {
  const owner = db.select({ _id: people._id, name: people.name, phone: people.phone, agreedDepthFeet: people.agreedDepthFeet }).from(people).where(eq(people._id, contract.landownerId)).get();
  const land = db
    .select({ _id: lands._id, name: lands.name, village: lands.village, tehsil: lands.tehsil, district: lands.district, state: lands.state, khasraNumber: lands.khasraNumber, khataNumber: lands.khataNumber, latitude: lands.latitude, longitude: lands.longitude, area: lands.area, areaUnit: lands.areaUnit })
    .from(lands)
    .where(eq(lands._id, contract.landId))
    .get();
  return { ...contract, landownerId: owner ?? contract.landownerId, landId: land ?? contract.landId };
}

// Creating a contract is also a money event. PER_TROLLEY contracts keep the
// original pay-as-you-extract shape: only the advance (if any) posts now,
// and each SoilTrip logged against the contract posts its own DUE later
// (see soilTrip.service.ts). PER_BIGHA/PER_DEPTH contracts are a fixed
// price agreed up front for the field/depth, not per trolley — so the full
// totalContractValue posts as DUE immediately alongside the advance PAID,
// and trips logged afterward don't add further landowner charges (they
// still count toward excavatedQuantity for operational tracking, and any
// driver haulage fee still applies per trip regardless of rateType).
export async function createSoilContract(input: CreateSoilContractInput) {
  const land = await assertLandInKiln(input.kilnId, input.landId);
  if (land.landownerId !== input.landownerId) {
    throw new Error("landownerId does not match the owner of this land");
  }
  await assertPersonOfType(input.kilnId, input.landownerId, ["LANDOWNER"]);

  const rateType = input.rateType ?? "PER_TROLLEY";
  const contractNumber = generateContractNumber();
  const totalContractValue = computeTotalContractValue(input);

  const _id = randomUUID();
  db.insert(soilContracts).values({ ...input, _id, rateType, contractNumber, totalContractValue }).run();
  const contract = db.select().from(soilContracts).where(eq(soilContracts._id, _id)).get()!;

  if (input.advanceAmount && input.advanceAmount > 0) {
    await addLedgerEntry({
      kilnId: input.kilnId,
      personId: input.landownerId,
      direction: "PAID",
      amount: input.advanceAmount,
      reason: `Advance for soil contract ${contractNumber}`,
      contractId: contract._id,
      date: input.startDate,
    });
  }

  if (rateType !== "PER_TROLLEY" && totalContractValue > 0) {
    await addLedgerEntry({
      kilnId: input.kilnId,
      personId: input.landownerId,
      direction: "DUE",
      amount: totalContractValue,
      reason:
        rateType === "PER_BIGHA"
          ? `Soil contract ${contractNumber}: ${input.contractedAreaBigha} bigha @ ₹${input.ratePerBigha}/bigha`
          : `Soil contract ${contractNumber}: ${input.contractedDepth} ${input.depthUnit ?? "feet"} @ ₹${input.ratePerDepthUnit}/${input.depthUnit ?? "feet"}`,
      contractId: contract._id,
      date: input.startDate,
    });
  }

  emitToKiln(input.kilnId, "soilContract:update", contract);
  return contract;
}

export interface ListSoilContractsFilter {
  landownerId?: string;
  landId?: string;
  status?: SoilContractStatus;
}

export async function listSoilContracts(kilnId: string, filter: ListSoilContractsFilter = {}) {
  const conditions = [eq(soilContracts.kilnId, kilnId)];
  if (filter.landownerId) conditions.push(eq(soilContracts.landownerId, filter.landownerId));
  if (filter.landId) conditions.push(eq(soilContracts.landId, filter.landId));
  if (filter.status) conditions.push(eq(soilContracts.status, filter.status));

  const rows = await db.select().from(soilContracts).where(and(...conditions)).orderBy(desc(soilContracts.createdAt)).all();
  return rows.map(withLandownerAndLand);
}

// Excavated quantity rolls up both sources that can carry a contractId:
// the old per-trip log (SoilTrip, kept for any records made before the
// Arrivals workflow existed) and the current soil-arrival log
// (SoilArrival) — so a contract's progress reflects arrivals logged
// either from the Soil page or straight from the field owner's profile.
async function excavatedQuantityForContract(kilnId: string, contractId: string) {
  const [trips, arrivals] = await Promise.all([
    db.select().from(soilTrips).where(and(eq(soilTrips.kilnId, kilnId), eq(soilTrips.contractId, contractId))).all(),
    db.select().from(soilArrivals).where(and(eq(soilArrivals.kilnId, kilnId), eq(soilArrivals.contractId, contractId))).all(),
  ]);
  const tripTotal = trips.reduce((sum, t) => sum + (t.trolleyCount ?? 0), 0);
  const arrivalTotal = arrivals.reduce((sum, a) => sum + a.trolleyCount, 0);
  return tripTotal + arrivalTotal;
}

// The deepest actual dig reading recorded against this contract so far —
// each SoilTrip/SoilArrival depthFeet is a point-in-time reading, not a
// cumulative value, so "depth used" is the max of those across both
// sources, same idea as the existing per-trip depth-dispute check in
// soilTrip but rolled up to contract level.
async function depthUsedForContract(kilnId: string, contractId: string) {
  const [trips, arrivals] = await Promise.all([
    db.select().from(soilTrips).where(and(eq(soilTrips.kilnId, kilnId), eq(soilTrips.contractId, contractId), isNotNull(soilTrips.depthFeet))).all(),
    db.select().from(soilArrivals).where(and(eq(soilArrivals.kilnId, kilnId), eq(soilArrivals.contractId, contractId), isNotNull(soilArrivals.depthFeet))).all(),
  ]);
  const tripMax = trips.reduce((max, t) => Math.max(max, t.depthFeet ?? 0), 0);
  const arrivalMax = arrivals.reduce((max, a) => Math.max(max, a.depthFeet ?? 0), 0);
  return Math.max(tripMax, arrivalMax);
}

// Fully computed, nothing stored redundantly — same shape as
// reconciliation.service.ts's reconcileSoilToKiln.
export async function getContractSummary(kilnId: string, contractId: string) {
  const row = db.select().from(soilContracts).where(and(eq(soilContracts._id, contractId), eq(soilContracts.kilnId, kilnId))).get();
  if (!row) throw new Error("Contract not found in this kiln");
  const contract = withLandownerAndLand(row);

  const [excavatedQuantity, ledgerBalance, depthUsedFeet] = await Promise.all([
    excavatedQuantityForContract(kilnId, contractId),
    contractLedgerBalance(kilnId, contractId),
    depthUsedForContract(kilnId, contractId),
  ]);

  // Only meaningful when a trolley cap was actually set — a PER_BIGHA/
  // PER_DEPTH contract may have no such cap, in which case excavatedQuantity
  // is still tracked (informational) but there's nothing to be "remaining"
  // or "overrun" against.
  const hasQuantityCap = row.contractedQuantity != null;
  const remainingQuantity = hasQuantityCap ? row.contractedQuantity! - excavatedQuantity : null;
  const percentUsed =
    hasQuantityCap && row.contractedQuantity! > 0
      ? Math.round((excavatedQuantity / row.contractedQuantity!) * 1000) / 10
      : null;
  const overrun = hasQuantityCap ? excavatedQuantity > row.contractedQuantity! : false;

  // Falls back to the landowner's general agreedDepthFeet only if this
  // specific contract didn't set its own — same fallback Soil.tsx's
  // depth-dispute banner already uses for ad-hoc trips. This is a safety
  // *limit* (don't dig past what the landowner agreed to), distinct from
  // contractedDepth below (the depth this contract is actually priced/
  // tracked for) — a PER_DEPTH contract can have both set to different
  // values, so they're kept as two separate figures rather than merged.
  const landowner = contract.landownerId as { agreedDepthFeet?: number | null } | string;
  const landownerAgreedDepth = typeof landowner === "object" ? landowner.agreedDepthFeet : undefined;
  const agreedDepthFeet = row.agreedDepthFeet ?? landownerAgreedDepth ?? null;
  const remainingDepthFeet = agreedDepthFeet != null ? Math.round((agreedDepthFeet - depthUsedFeet) * 10) / 10 : null;
  const depthExceeded = agreedDepthFeet != null && depthUsedFeet > agreedDepthFeet;

  // Depth progress against the contract's own target — set for PER_DEPTH
  // (its pricing basis) and optionally for PER_BIGHA (tracked alongside
  // trolleys, per the contract, without affecting the bigha-based price).
  const hasDepthCap = row.contractedDepth != null;
  const contractedDepthRemaining = hasDepthCap ? Math.round((row.contractedDepth! - depthUsedFeet) * 10) / 10 : null;
  const contractedDepthPercentUsed =
    hasDepthCap && row.contractedDepth! > 0
      ? Math.round((depthUsedFeet / row.contractedDepth!) * 1000) / 10
      : null;
  const contractedDepthOverrun = hasDepthCap ? depthUsedFeet > row.contractedDepth! : false;

  const now = Date.now();
  const isExpired = !!row.endDate && row.endDate.getTime() < now;
  const isExpiringSoon =
    !isExpired && !!row.endDate && row.endDate.getTime() - now <= EXPIRY_WARNING_DAYS * 24 * 60 * 60 * 1000;

  return {
    contract,
    excavatedQuantity,
    remainingQuantity,
    percentUsed,
    overrun,
    ledgerBalance,
    isExpired,
    isExpiringSoon,
    depthUsedFeet,
    agreedDepthFeet,
    remainingDepthFeet,
    depthExceeded,
    contractedDepthRemaining,
    contractedDepthPercentUsed,
    contractedDepthOverrun,
  };
}

// One row per calendar day this contract had trips — the "Daily Mitti
// Movement" breakdown: trip count, tractors used, and both the dispatched
// and (if separately counted) received quantity for that day.
export async function contractDailyMovement(kilnId: string, contractId: string) {
  const [trips, arrivals] = await Promise.all([
    db.select().from(soilTrips).where(and(eq(soilTrips.kilnId, kilnId), eq(soilTrips.contractId, contractId))).orderBy(soilTrips.date).all(),
    db.select().from(soilArrivals).where(and(eq(soilArrivals.kilnId, kilnId), eq(soilArrivals.contractId, contractId))).orderBy(soilArrivals.date).all(),
  ]);

  const driverIds = [...new Set(trips.map((t) => t.driverId).filter((v): v is string => !!v))];
  const arrivalDriverIds = [
    ...new Set([...arrivals.map((a) => a.jcbDriverId), ...arrivals.map((a) => a.tractorDriverId)].filter((v): v is string => !!v)),
  ];
  const allDriverIds = [...new Set([...driverIds, ...arrivalDriverIds])];
  const driverRows = allDriverIds.length ? await db.select({ _id: people._id, name: people.name }).from(people).where(inArray(people._id, allDriverIds)).all() : [];
  const driverById = new Map(driverRows.map((d) => [d._id, d]));

  const byDay = new Map<
    string,
    {
      date: string;
      tripCount: number;
      trolleyCount: number;
      receivedTrolleyCount: number;
      depthFeet: number | null;
      tractors: Set<string>;
      drivers: Set<string>;
    }
  >();

  for (const t of trips) {
    const day = t.date!.toISOString().slice(0, 10);
    const entry = byDay.get(day) ?? {
      date: day,
      tripCount: 0,
      trolleyCount: 0,
      receivedTrolleyCount: 0,
      depthFeet: null,
      tractors: new Set<string>(),
      drivers: new Set<string>(),
    };
    entry.tripCount += 1;
    entry.trolleyCount += t.trolleyCount ?? 0;
    entry.receivedTrolleyCount += t.receivedTrolleyCount ?? t.trolleyCount ?? 0;
    if (t.depthFeet != null) entry.depthFeet = Math.max(entry.depthFeet ?? 0, t.depthFeet);
    if (t.tractorNumber) entry.tractors.add(t.tractorNumber);
    const driverName = t.driverId ? driverById.get(t.driverId)?.name : undefined;
    if (driverName) entry.drivers.add(driverName);
    byDay.set(day, entry);
  }

  // Arrivals have no separate sent/received figure (there's no re-weigh
  // step in this simpler workflow) — the logged trolleyCount is treated
  // as fully received, so it never contributes a shortfall.
  for (const a of arrivals) {
    const day = a.date!.toISOString().slice(0, 10);
    const entry = byDay.get(day) ?? {
      date: day,
      tripCount: 0,
      trolleyCount: 0,
      receivedTrolleyCount: 0,
      depthFeet: null,
      tractors: new Set<string>(),
      drivers: new Set<string>(),
    };
    entry.tripCount += 1;
    entry.trolleyCount += a.trolleyCount;
    entry.receivedTrolleyCount += a.trolleyCount;
    if (a.depthFeet != null) entry.depthFeet = Math.max(entry.depthFeet ?? 0, a.depthFeet);
    const jcbDriverName = a.jcbDriverId ? driverById.get(a.jcbDriverId)?.name : undefined;
    const tractorDriverName = a.tractorDriverId ? driverById.get(a.tractorDriverId)?.name : undefined;
    if (jcbDriverName) entry.drivers.add(jcbDriverName);
    if (tractorDriverName) entry.drivers.add(tractorDriverName);
    byDay.set(day, entry);
  }

  return Array.from(byDay.values())
    .map((e) => ({
      date: e.date,
      tripCount: e.tripCount,
      trolleyCount: e.trolleyCount,
      receivedTrolleyCount: e.receivedTrolleyCount,
      shortfall: e.trolleyCount - e.receivedTrolleyCount,
      depthFeet: e.depthFeet,
      tractors: Array.from(e.tractors),
      drivers: Array.from(e.drivers),
    }))
    .sort((a, b) => (a.date < b.date ? 1 : -1));
}

export interface UpdateSoilContractInput {
  soilType?: string;
  rateType?: SoilContractRateType;
  contractedQuantity?: number;
  ratePerTrolley?: number;
  contractedAreaBigha?: number;
  ratePerBigha?: number;
  contractedDepth?: number;
  depthUnit?: DepthUnit;
  ratePerDepthUnit?: number;
  totalContractValue?: number;
  advanceAmount?: number;
  startDate?: Date;
  endDate?: Date;
  agreedDepthFeet?: number;
  paymentTerms?: string;
  notes?: string;
}

// Editing a contract can change the agreed price — same "revise, then post
// the delta" correction convention soilArrival.service.ts's updateSoilArrival
// uses, rather than silently rewriting what's already on the ledger. Only
// PER_BIGHA/PER_DEPTH contracts posted their totalContractValue as DUE up
// front (see createSoilContract above), so only those post a value
// correction; PER_TROLLEY contracts bill per trip/arrival, so a
// quantity/rate edit here only changes the contract's own cap/reference for
// those future postings. landId/landownerId are intentionally not
// editable — reassigning a contract to a different land/owner after trips
// have been logged against it would silently misattribute their excavated
// quantity.
export async function updateSoilContract(kilnId: string, contractId: string, input: UpdateSoilContractInput) {
  const existing = db.select().from(soilContracts).where(and(eq(soilContracts._id, contractId), eq(soilContracts.kilnId, kilnId))).get();
  if (!existing) throw new Error("Soil contract not found in this kiln");

  const rateType = input.rateType ?? existing.rateType!;
  const rateFieldsTouched =
    input.rateType !== undefined ||
    input.contractedQuantity !== undefined ||
    input.ratePerTrolley !== undefined ||
    input.contractedAreaBigha !== undefined ||
    input.ratePerBigha !== undefined ||
    input.contractedDepth !== undefined ||
    input.ratePerDepthUnit !== undefined ||
    input.totalContractValue !== undefined;

  const newTotalValue = rateFieldsTouched
    ? computeTotalContractValue({
        rateType,
        contractedQuantity: input.contractedQuantity ?? existing.contractedQuantity ?? undefined,
        ratePerTrolley: input.ratePerTrolley ?? existing.ratePerTrolley ?? undefined,
        contractedAreaBigha: input.contractedAreaBigha ?? existing.contractedAreaBigha ?? undefined,
        ratePerBigha: input.ratePerBigha ?? existing.ratePerBigha ?? undefined,
        contractedDepth: input.contractedDepth ?? existing.contractedDepth ?? undefined,
        ratePerDepthUnit: input.ratePerDepthUnit ?? existing.ratePerDepthUnit ?? undefined,
        totalContractValue: input.totalContractValue,
      })
    : existing.totalContractValue;

  const oldAdvance = existing.advanceAmount ?? 0;
  const newAdvance = input.advanceAmount ?? oldAdvance;

  db.update(soilContracts).set({ ...input, rateType, totalContractValue: newTotalValue }).where(eq(soilContracts._id, contractId)).run();
  const updated = withLandownerAndLand(db.select().from(soilContracts).where(eq(soilContracts._id, contractId)).get()!);

  if (rateType !== "PER_TROLLEY") {
    const valueDelta = Math.round((newTotalValue - existing.totalContractValue) * 100) / 100;
    if (valueDelta > 0) {
      await addLedgerEntry({
        kilnId,
        personId: existing.landownerId,
        direction: "DUE",
        amount: valueDelta,
        reason: `Soil contract ${existing.contractNumber} correction: revised value to ₹${newTotalValue.toLocaleString("en-IN")}`,
        contractId,
      });
    } else if (valueDelta < 0) {
      await addLedgerEntry({
        kilnId,
        personId: existing.landownerId,
        direction: "PAID",
        amount: -valueDelta,
        reason: `Soil contract ${existing.contractNumber} correction: revised value to ₹${newTotalValue.toLocaleString("en-IN")}`,
        contractId,
      });
    }
  }

  const advanceDelta = Math.round((newAdvance - oldAdvance) * 100) / 100;
  if (advanceDelta > 0) {
    await addLedgerEntry({
      kilnId,
      personId: existing.landownerId,
      direction: "PAID",
      amount: advanceDelta,
      reason: `Soil contract ${existing.contractNumber}: additional advance`,
      contractId,
    });
  } else if (advanceDelta < 0) {
    await addLedgerEntry({
      kilnId,
      personId: existing.landownerId,
      direction: "DUE",
      amount: -advanceDelta,
      reason: `Soil contract ${existing.contractNumber}: advance revised down`,
      contractId,
    });
  }

  emitToKiln(kilnId, "soilContract:update", updated);
  return updated;
}

// Deletion never touches ledger entries or SoilTrip/SoilArrival records
// already posted against this contract — they simply keep their contractId
// pointing at a now-deleted document, same "historical records survive
// deletion of the parent" convention used for admin-managed brick/fuel
// types elsewhere in this app.
export async function deleteSoilContract(kilnId: string, contractId: string) {
  const existing = db.select().from(soilContracts).where(and(eq(soilContracts._id, contractId), eq(soilContracts.kilnId, kilnId))).get();
  if (!existing) throw new Error("Soil contract not found in this kiln");
  db.delete(soilContracts).where(eq(soilContracts._id, contractId)).run();
  emitToKiln(kilnId, "soilContract:update", { _id: contractId, deleted: true });
  return existing;
}

export async function updateContractStatus(kilnId: string, contractId: string, status: SoilContractStatus) {
  const existing = db.select().from(soilContracts).where(and(eq(soilContracts._id, contractId), eq(soilContracts.kilnId, kilnId))).get();
  if (!existing) throw new Error("Contract not found in this kiln");
  db.update(soilContracts).set({ status }).where(eq(soilContracts._id, contractId)).run();
  const contract = db.select().from(soilContracts).where(eq(soilContracts._id, contractId)).get()!;
  emitToKiln(kilnId, "soilContract:update", contract);
  return contract;
}

// Quantity overrun/shortfall is surfaced as a warning, never a block — same
// "flagged, not blocked" philosophy as loadingEntry.service.ts's count
// mismatch check. The ledger itself is the settlement record; nothing extra
// is stored beyond flipping status to COMPLETED.
export async function settleContract(kilnId: string, contractId: string) {
  const summary = await getContractSummary(kilnId, contractId);
  const existing = db.select().from(soilContracts).where(and(eq(soilContracts._id, contractId), eq(soilContracts.kilnId, kilnId))).get();
  if (!existing) throw new Error("Contract not found in this kiln");
  db.update(soilContracts).set({ status: "COMPLETED" }).where(eq(soilContracts._id, contractId)).run();
  const contract = db.select().from(soilContracts).where(eq(soilContracts._id, contractId)).get()!;

  emitToKiln(kilnId, "soilContract:update", contract);
  return { ...summary, contract };
}

export async function contractsExpiringSoon(kilnId: string, withinDays = EXPIRY_WARNING_DAYS) {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() + withinDays);

  const contracts = await db
    .select()
    .from(soilContracts)
    .where(and(eq(soilContracts.kilnId, kilnId), eq(soilContracts.status, "ACTIVE"), lte(soilContracts.endDate, cutoff)))
    .orderBy(soilContracts.endDate)
    .all();

  return contracts.map((c) => ({ ...c, expired: !!c.endDate && c.endDate.getTime() < Date.now() }));
}

// Dashboard summary for the "Mitti Contracts / Khet" screen — every number
// here is computed from the same live sources getContractSummary uses, not
// stored separately, so it can never drift from the per-contract figures.
// Land area is intentionally NOT blended into one acreage total: different
// khets record area in different units (bigha/acre/hectare) and this app
// doesn't assume a conversion ratio between them (see Land.areaUnit) — so
// it's grouped by unit instead of silently summed across units.
export async function soilContractDashboard(kilnId: string) {
  const contracts = await db.select().from(soilContracts).where(eq(soilContracts.kilnId, kilnId)).all();

  const statusCounts: Record<SoilContractStatus, number> = {
    DRAFT: 0,
    ACTIVE: 0,
    PAUSED: 0,
    COMPLETED: 0,
    CANCELLED: 0,
  };
  let expiredCount = 0;
  let totalContractedQuantity = 0;
  let totalExcavatedQuantity = 0;
  let totalContractValue = 0;
  const nearingCompletion: { contractId: string; contractNumber: string; percentUsed: number }[] = [];
  const depthExceededContracts: { contractId: string; contractNumber: string; depthUsedFeet: number; agreedDepthFeet: number }[] = [];

  const now = Date.now();

  for (const c of contracts) {
    statusCounts[c.status as SoilContractStatus] += 1;
    if (c.status === "ACTIVE" && c.endDate && c.endDate.getTime() < now) expiredCount += 1;
    if (c.status === "CANCELLED") continue;

    totalContractedQuantity += c.contractedQuantity ?? 0;
    totalContractValue += c.totalContractValue;

    const summary = await getContractSummary(kilnId, c._id);
    totalExcavatedQuantity += summary.excavatedQuantity;
    if (c.status === "ACTIVE" && summary.percentUsed != null && summary.percentUsed >= 90 && !summary.overrun) {
      nearingCompletion.push({ contractId: c._id, contractNumber: c.contractNumber, percentUsed: summary.percentUsed });
    }
    if (c.status === "ACTIVE" && summary.depthExceeded) {
      depthExceededContracts.push({
        contractId: c._id,
        contractNumber: c.contractNumber,
        depthUsedFeet: summary.depthUsedFeet,
        agreedDepthFeet: summary.agreedDepthFeet as number,
      });
    }
  }

  const contractedLandIds = [...new Set(contracts.filter((c) => c.status !== "CANCELLED").map((c) => c.landId))];
  const landRows = contractedLandIds.length ? await db.select().from(lands).where(inArray(lands._id, contractedLandIds)).all() : [];
  const landAreaByUnit = new Map<string, number>();
  for (const l of landRows) {
    if (!l.area) continue;
    const unit = l.areaUnit ?? "bigha";
    landAreaByUnit.set(unit, (landAreaByUnit.get(unit) ?? 0) + l.area);
  }

  return {
    statusCounts,
    expiredCount,
    totalContracts: contracts.length,
    totalContractedQuantity,
    totalExcavatedQuantity,
    totalRemainingQuantity: totalContractedQuantity - totalExcavatedQuantity,
    totalContractValue,
    landAreaByUnit: Array.from(landAreaByUnit.entries()).map(([unit, total]) => ({ unit, total })),
    alerts: {
      nearingCompletion,
      depthExceeded: depthExceededContracts,
    },
  };
}
