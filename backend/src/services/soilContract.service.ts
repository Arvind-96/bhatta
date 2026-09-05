import { randomUUID } from "crypto";
import { and, desc, eq, inArray, isNotNull, lte, sql } from "drizzle-orm";
import { db } from "../db/client";
import { soilContracts, soilTrips, soilArrivals, jcbWorkLogs, lands, people, ledgerEntries, SOIL_CONTRACT_STATUSES, SOIL_CONTRACT_RATE_TYPES, DEPTH_UNITS } from "../db/schema";
import { assertLandInKiln } from "./land.service";
import { assertPersonOfType } from "./person.service";
import { addLedgerEntry, contractLedgerBalance, LedgerPaymentMode } from "./ledger.service";
import { emitToKiln } from "../config/socket";

export type SoilContractStatus = (typeof SOIL_CONTRACT_STATUSES)[number];
export type SoilContractRateType = (typeof SOIL_CONTRACT_RATE_TYPES)[number];
export type DepthUnit = (typeof DEPTH_UNITS)[number];

const EXPIRY_WARNING_DAYS = 14;

// A plain per-kiln sequential number (SC-1, SC-2, ...) — matches the
// serial format used everywhere else (Landowner/Sand Contractor/Land
// Lease people, Sale/Purchase Orders), not the old opaque
// timestamp+random string. Contract creation is a rare, manual, admin
// action, so the unguarded count-then-insert race that a high-frequency
// path like Dispatch's slip number has to defend against isn't a real
// concern here.
async function generateContractNumber(kilnId: string) {
  const countRow = (await db.select({ count: sql<number>`count(*)` }).from(soilContracts).where(eq(soilContracts.kilnId, kilnId)))[0];
  return `SC-${(countRow?.count ?? 0) + 1}`;
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
  // How the advance (if any) was actually paid — posted onto that one PAID
  // ledger entry only; the totalContractValue DUE entry below is a bill,
  // not a payment, so it never carries a payment mode.
  paymentMode?: LedgerPaymentMode;
  cashAmount?: number;
  onlineAmount?: number;
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
  if (rateType === "BOTH") {
    if (input.contractedAreaBigha == null || input.ratePerBigha == null || input.contractedDepth == null || input.ratePerDepthUnit == null) {
      throw new Error("contractedAreaBigha, ratePerBigha, contractedDepth, and ratePerDepthUnit are all required for a BOTH contract");
    }
    return input.contractedAreaBigha * input.ratePerBigha + input.contractedDepth * input.ratePerDepthUnit;
  }
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

async function withLandownerAndLand(contract: typeof soilContracts.$inferSelect) {
  const owner = (await db.select({ _id: people._id, name: people.name, phone: people.phone, agreedDepthFeet: people.agreedDepthFeet }).from(people).where(eq(people._id, contract.landownerId)))[0];
  const land = (await db
    .select({ _id: lands._id, name: lands.name, village: lands.village, tehsil: lands.tehsil, district: lands.district, state: lands.state, khasraNumber: lands.khasraNumber, khataNumber: lands.khataNumber, latitude: lands.latitude, longitude: lands.longitude, area: lands.area, areaUnit: lands.areaUnit })
    .from(lands)
    .where(eq(lands._id, contract.landId)))[0];
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
  const contractNumber = await generateContractNumber(input.kilnId);
  const totalContractValue = computeTotalContractValue(input);

  const { paymentMode, cashAmount, onlineAmount, ...insertableInput } = input;

  const _id = randomUUID();
  await db.insert(soilContracts).values({ ...insertableInput, _id, rateType, contractNumber, totalContractValue });
  const contract = (await db.select().from(soilContracts).where(eq(soilContracts._id, _id)))[0]!;

  if (input.advanceAmount && input.advanceAmount > 0) {
    await addLedgerEntry({
      kilnId: input.kilnId,
      personId: input.landownerId,
      direction: "PAID",
      amount: input.advanceAmount,
      reason: `Advance for soil contract ${contractNumber}`,
      category: "ADVANCE",
      contractId: contract._id,
      date: input.startDate,
      paymentMode,
      cashAmount: paymentMode === "CASH_AND_ONLINE" ? cashAmount : undefined,
      onlineAmount: paymentMode === "CASH_AND_ONLINE" ? onlineAmount : undefined,
    });
  }

  if (rateType !== "PER_TROLLEY" && totalContractValue > 0) {
    await addLedgerEntry({
      kilnId: input.kilnId,
      personId: input.landownerId,
      direction: "DUE",
      amount: totalContractValue,
      reason:
        rateType === "BOTH"
          ? `Soil contract ${contractNumber}: ${input.contractedAreaBigha} bigha + ${input.contractedDepth} ${input.depthUnit ?? "feet"}`
          : rateType === "PER_BIGHA"
          ? `Soil contract ${contractNumber}: ${input.contractedAreaBigha} bigha @ ₹${input.ratePerBigha}/bigha`
          : `Soil contract ${contractNumber}: ${input.contractedDepth} ${input.depthUnit ?? "feet"} @ ₹${input.ratePerDepthUnit}/${input.depthUnit ?? "feet"}`,
      category: "SOIL",
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

  const rows = await db.select().from(soilContracts).where(and(...conditions)).orderBy(desc(soilContracts.createdAt));
  return Promise.all(rows.map(withLandownerAndLand));
}

// Excavated quantity rolls up both sources that can carry a contractId:
// the old per-trip log (SoilTrip, kept for any records made before the
// Arrivals workflow existed) and the current soil-arrival log
// (SoilArrival) — so a contract's progress reflects arrivals logged
// either from the Soil page or straight from the field owner's profile.
async function excavatedQuantityForContract(kilnId: string, contractId: string) {
  const [trips, arrivals] = await Promise.all([
    db.select().from(soilTrips).where(and(eq(soilTrips.kilnId, kilnId), eq(soilTrips.contractId, contractId))),
    db.select().from(soilArrivals).where(and(eq(soilArrivals.kilnId, kilnId), eq(soilArrivals.contractId, contractId))),
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
    db.select().from(soilTrips).where(and(eq(soilTrips.kilnId, kilnId), eq(soilTrips.contractId, contractId), isNotNull(soilTrips.depthFeet))),
    db.select().from(soilArrivals).where(and(eq(soilArrivals.kilnId, kilnId), eq(soilArrivals.contractId, contractId), isNotNull(soilArrivals.depthFeet))),
  ]);
  const tripMax = trips.reduce((max, t) => Math.max(max, t.depthFeet ?? 0), 0);
  const arrivalMax = arrivals.reduce((max, a) => Math.max(max, a.depthFeet ?? 0), 0);
  return Math.max(tripMax, arrivalMax);
}

// Fully computed, nothing stored redundantly — same shape as
// reconciliation.service.ts's reconcileSoilToKiln.
export async function getContractSummary(kilnId: string, contractId: string) {
  const row = (await db.select().from(soilContracts).where(and(eq(soilContracts._id, contractId), eq(soilContracts.kilnId, kilnId))))[0];
  if (!row) throw new Error("Contract not found in this kiln");
  const contract = await withLandownerAndLand(row);

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
    db.select().from(soilTrips).where(and(eq(soilTrips.kilnId, kilnId), eq(soilTrips.contractId, contractId))).orderBy(soilTrips.date),
    db.select().from(soilArrivals).where(and(eq(soilArrivals.kilnId, kilnId), eq(soilArrivals.contractId, contractId))).orderBy(soilArrivals.date),
  ]);

  const driverIds = [...new Set(trips.map((t) => t.driverId).filter((v): v is string => !!v))];
  const arrivalDriverIds = [
    ...new Set([...arrivals.map((a) => a.jcbDriverId), ...arrivals.map((a) => a.tractorDriverId)].filter((v): v is string => !!v)),
  ];
  const allDriverIds = [...new Set([...driverIds, ...arrivalDriverIds])];
  const driverRows = allDriverIds.length ? await db.select({ _id: people._id, name: people.name }).from(people).where(inArray(people._id, allDriverIds)) : [];
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
  // How the *additional* advance (if the edit raises advanceAmount) was
  // paid — same "posted on the delta's PAID entry only" convention as
  // CreateSoilContractInput's own paymentMode/cashAmount/onlineAmount.
  paymentMode?: LedgerPaymentMode;
  cashAmount?: number;
  onlineAmount?: number;
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
  const existing = (await db.select().from(soilContracts).where(and(eq(soilContracts._id, contractId), eq(soilContracts.kilnId, kilnId))))[0];
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
  const advanceDelta = Math.round((newAdvance - oldAdvance) * 100) / 100;

  // paymentMode/cashAmount/onlineAmount describe the delta's PAID entry
  // below, not a soilContracts column — never persisted on the contract
  // row itself, same exclusion createSoilContract applies on insert.
  const { paymentMode, cashAmount, onlineAmount, ...persistableInput } = input;
  if (paymentMode === "CASH_AND_ONLINE" && advanceDelta > 0) {
    const sum = Math.round(((cashAmount ?? 0) + (onlineAmount ?? 0)) * 100) / 100;
    if (sum !== advanceDelta) {
      throw new Error(`cashAmount + onlineAmount (₹${sum}) must equal the additional advance amount (₹${advanceDelta})`);
    }
  }

  await db.update(soilContracts).set({ ...persistableInput, rateType, totalContractValue: newTotalValue }).where(eq(soilContracts._id, contractId));
  const updated = await withLandownerAndLand((await db.select().from(soilContracts).where(eq(soilContracts._id, contractId)))[0]!);

  if (rateType !== "PER_TROLLEY") {
    const valueDelta = Math.round((newTotalValue - existing.totalContractValue) * 100) / 100;
    if (valueDelta > 0) {
      await addLedgerEntry({
        kilnId,
        personId: existing.landownerId,
        direction: "DUE",
        amount: valueDelta,
        reason: `Soil contract ${existing.contractNumber} correction: revised value to ₹${newTotalValue.toLocaleString("en-IN")}`,
        category: "SOIL",
        contractId,
      });
    } else if (valueDelta < 0) {
      await addLedgerEntry({
        kilnId,
        personId: existing.landownerId,
        direction: "PAID",
        amount: -valueDelta,
        reason: `Soil contract ${existing.contractNumber} correction: revised value to ₹${newTotalValue.toLocaleString("en-IN")}`,
        category: "SOIL",
        contractId,
        // Bug fix: a downward correction posts PAID purely to reduce a
        // liability that turned out to be smaller than first recorded — no
        // cash actually moved. Without this flag, flowForRange counted it
        // as real money spent (confirmed live: this exact bug inflated
        // Financial Overview/Profit & Loss by the corrected amount).
        isReversal: true,
      });
    }
  }

  if (advanceDelta > 0) {
    await addLedgerEntry({
      kilnId,
      personId: existing.landownerId,
      direction: "PAID",
      amount: advanceDelta,
      reason: `Soil contract ${existing.contractNumber}: additional advance`,
      category: "ADVANCE",
      contractId,
      paymentMode,
      cashAmount: paymentMode === "CASH_AND_ONLINE" ? cashAmount : undefined,
      onlineAmount: paymentMode === "CASH_AND_ONLINE" ? onlineAmount : undefined,
    });
  } else if (advanceDelta < 0) {
    await addLedgerEntry({
      kilnId,
      personId: existing.landownerId,
      direction: "DUE",
      amount: -advanceDelta,
      reason: `Soil contract ${existing.contractNumber}: advance revised down`,
      category: "ADVANCE",
      contractId,
    });
  }

  emitToKiln(kilnId, "soilContract:update", updated);
  return updated;
}

// SoilTrip/SoilArrival records already posted against this contract keep
// their contractId pointing at a now-deleted document, same "historical
// records survive deletion of the parent" convention used for
// admin-managed brick/fuel types elsewhere in this app — those aren't
// reversed. The ADVANCE and lump-sum-value ledger entries THIS contract
// itself posted at creation are a different matter, though: left alone,
// they'd sit on the landowner's ledger forever, permanently showing money
// paid/owed against a contract that (from the admin's view) no longer
// exists. Reversed here the same way updateSoilContract's own delta
// correction does it, just for the full original amount instead of a
// partial delta.
export async function deleteSoilContract(kilnId: string, contractId: string) {
  const existing = (await db.select().from(soilContracts).where(and(eq(soilContracts._id, contractId), eq(soilContracts.kilnId, kilnId))))[0];
  if (!existing) throw new Error("Soil contract not found in this kiln");

  if (existing.advanceAmount && existing.advanceAmount > 0) {
    await addLedgerEntry({
      kilnId,
      personId: existing.landownerId,
      direction: "DUE",
      amount: existing.advanceAmount,
      reason: `Soil contract ${existing.contractNumber} deleted — reversing advance`,
      category: "ADVANCE",
      contractId,
    });
  }
  if (existing.rateType !== "PER_TROLLEY" && existing.totalContractValue > 0) {
    await addLedgerEntry({
      kilnId,
      personId: existing.landownerId,
      direction: "PAID",
      amount: existing.totalContractValue,
      reason: `Soil contract ${existing.contractNumber} deleted — reversing contract value`,
      category: "SOIL",
      contractId,
      // Bug fix: no real cash moved — this only zeroes out a liability
      // that will now never be paid since the contract is gone. Without
      // this flag, flowForRange counted it as real money spent (confirmed
      // live via a deleted test contract inflating Financial Overview/
      // Profit & Loss's "money spent" by this exact amount).
      isReversal: true,
    });
  }

  // Bug fix: Soil Trips/Arrivals/JCB Work Logs already logged against this
  // contract were never touched by a delete — real, historical events that
  // correctly aren't deleted themselves, but their own contractId kept
  // pointing at a row that no longer exists. The money was never at risk
  // (their own amount/ledger entries stand independently of the contract
  // row), but anywhere the app tries to show "which contract this belongs
  // to" for one of these would silently resolve to nothing. Clearing the
  // now-dangling reference instead of leaving it dangling makes that
  // explicit ("no contract") rather than broken.
  // Bug fix: ledgerEntries posted against this contract (at creation and
  // by the reversals just above) had the same dangling-contractId gap —
  // found live via an exhaustive orphan scan. Balance is unaffected
  // (always summed by personId, never contractId), this only clears the
  // now-meaningless reference tag.
  await Promise.all([
    db.update(soilTrips).set({ contractId: null }).where(and(eq(soilTrips.kilnId, kilnId), eq(soilTrips.contractId, contractId))),
    db.update(soilArrivals).set({ contractId: null }).where(and(eq(soilArrivals.kilnId, kilnId), eq(soilArrivals.contractId, contractId))),
    db.update(jcbWorkLogs).set({ contractId: null }).where(and(eq(jcbWorkLogs.kilnId, kilnId), eq(jcbWorkLogs.contractId, contractId))),
    db.update(ledgerEntries).set({ contractId: null }).where(and(eq(ledgerEntries.kilnId, kilnId), eq(ledgerEntries.contractId, contractId))),
  ]);

  await db.delete(soilContracts).where(eq(soilContracts._id, contractId));
  emitToKiln(kilnId, "soilContract:update", { _id: contractId, deleted: true });
  return existing;
}

export async function updateContractStatus(kilnId: string, contractId: string, status: SoilContractStatus) {
  const existing = (await db.select().from(soilContracts).where(and(eq(soilContracts._id, contractId), eq(soilContracts.kilnId, kilnId))))[0];
  if (!existing) throw new Error("Contract not found in this kiln");
  await db.update(soilContracts).set({ status }).where(eq(soilContracts._id, contractId));
  const contract = (await db.select().from(soilContracts).where(eq(soilContracts._id, contractId)))[0]!;
  emitToKiln(kilnId, "soilContract:update", contract);
  return contract;
}

// Quantity overrun/shortfall is surfaced as a warning, never a block — same
// "flagged, not blocked" philosophy as loadingEntry.service.ts's count
// mismatch check. The ledger itself is the settlement record; nothing extra
// is stored beyond flipping status to COMPLETED.
export async function settleContract(kilnId: string, contractId: string) {
  const summary = await getContractSummary(kilnId, contractId);
  const existing = (await db.select().from(soilContracts).where(and(eq(soilContracts._id, contractId), eq(soilContracts.kilnId, kilnId))))[0];
  if (!existing) throw new Error("Contract not found in this kiln");
  await db.update(soilContracts).set({ status: "COMPLETED" }).where(eq(soilContracts._id, contractId));
  const contract = (await db.select().from(soilContracts).where(eq(soilContracts._id, contractId)))[0]!;

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
    .orderBy(soilContracts.endDate);

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
  const contracts = await db.select().from(soilContracts).where(eq(soilContracts.kilnId, kilnId));

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
  const landRows = contractedLandIds.length ? await db.select().from(lands).where(inArray(lands._id, contractedLandIds)) : [];
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
