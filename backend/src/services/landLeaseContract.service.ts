import { randomUUID } from "crypto";
import { and, desc, eq, lte, sql } from "drizzle-orm";
import { db } from "../db/client";
import { landLeaseContracts, lands, people, ledgerEntries, LAND_LEASE_CONTRACT_STATUSES, LAND_LEASE_RATE_TYPES, LAND_LEASE_DEPTH_UNITS } from "../db/schema";
import { assertLandInKiln } from "./land.service";
import { assertPersonOfType } from "./person.service";
import { addLedgerEntry, contractLedgerBalance, LedgerPaymentMode } from "./ledger.service";
import { emitToKiln } from "../config/socket";

export type LandLeaseContractStatus = (typeof LAND_LEASE_CONTRACT_STATUSES)[number];
export type LandLeaseRateType = (typeof LAND_LEASE_RATE_TYPES)[number];
export type LandLeaseDepthUnit = (typeof LAND_LEASE_DEPTH_UNITS)[number];

const EXPIRY_WARNING_DAYS = 14;

// A plain per-kiln sequential number (LL-1, LL-2, ...) — see
// soilContract.service.ts's generateContractNumber for the same
// reasoning. Separate "LL-" prefix so the number space can never be
// confused with Soil/Sand contract numbers even though they're stored in
// different tables anyway.
async function generateContractNumber(kilnId: string) {
  const countRow = (await db.select({ count: sql<number>`count(*)` }).from(landLeaseContracts).where(eq(landLeaseContracts.kilnId, kilnId)))[0];
  return `LL-${(countRow?.count ?? 0) + 1}`;
}

export interface CreateLandLeaseContractInput {
  kilnId: string;
  landId: string;
  landLeaseId: string;
  rateType?: LandLeaseRateType;
  contractedQuantity?: number;
  ratePerTrolley?: number;
  contractedAreaBigha?: number;
  ratePerBigha?: number;
  contractedDepth?: number;
  depthUnit?: LandLeaseDepthUnit;
  ratePerDepthUnit?: number;
  totalContractValue?: number;
  advanceAmount?: number;
  paymentMode?: LedgerPaymentMode;
  cashAmount?: number;
  onlineAmount?: number;
  startDate?: Date;
  endDate?: Date;
  paymentTerms?: string;
  notes?: string;
}

// Identical formula to soilContract.service.ts's computeTotalContractValue.
function computeTotalContractValue(input: {
  rateType?: LandLeaseRateType;
  contractedQuantity?: number;
  ratePerTrolley?: number;
  contractedAreaBigha?: number;
  ratePerBigha?: number;
  contractedDepth?: number;
  ratePerDepthUnit?: number;
  totalContractValue?: number;
}): number {
  if (input.totalContractValue != null) return input.totalContractValue;

  const rateType = input.rateType ?? "PER_BIGHA";
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

async function withLeaseAndLand(contract: typeof landLeaseContracts.$inferSelect) {
  const lease = (await db.select({ _id: people._id, name: people.name, phone: people.phone }).from(people).where(eq(people._id, contract.landLeaseId)))[0];
  const land = (await db
    .select({ _id: lands._id, name: lands.name, village: lands.village, tehsil: lands.tehsil, district: lands.district, state: lands.state, khasraNumber: lands.khasraNumber, khataNumber: lands.khataNumber, area: lands.area, areaUnit: lands.areaUnit })
    .from(lands)
    .where(eq(lands._id, contract.landId)))[0];
  return { ...contract, landLeaseId: lease ?? contract.landLeaseId, landId: land ?? contract.landId };
}

// Same money-event shape as soilContract.service.ts's createSoilContract —
// PER_TROLLEY keeps the pay-as-you-go idea (only the advance posts now),
// every other rate type posts the full totalContractValue as DUE
// immediately alongside the advance PAID.
export async function createLandLeaseContract(input: CreateLandLeaseContractInput) {
  const land = await assertLandInKiln(input.kilnId, input.landId);
  if (land.landownerId !== input.landLeaseId) {
    throw new Error("landLeaseId does not match the owner of this land");
  }
  await assertPersonOfType(input.kilnId, input.landLeaseId, ["LAND_LEASE"]);

  const rateType = input.rateType ?? "PER_BIGHA";
  const contractNumber = await generateContractNumber(input.kilnId);
  const totalContractValue = computeTotalContractValue(input);

  const { paymentMode, cashAmount, onlineAmount, ...insertableInput } = input;

  const _id = randomUUID();
  await db.insert(landLeaseContracts).values({ ...insertableInput, _id, rateType, contractNumber, totalContractValue });
  const contract = (await db.select().from(landLeaseContracts).where(eq(landLeaseContracts._id, _id)))[0]!;

  if (input.advanceAmount && input.advanceAmount > 0) {
    await addLedgerEntry({
      kilnId: input.kilnId,
      personId: input.landLeaseId,
      direction: "PAID",
      amount: input.advanceAmount,
      reason: `Advance for land lease contract ${contractNumber}`,
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
      personId: input.landLeaseId,
      direction: "DUE",
      amount: totalContractValue,
      reason:
        rateType === "BOTH"
          ? `Land lease contract ${contractNumber}: ${input.contractedAreaBigha} bigha + ${input.contractedDepth} ${input.depthUnit ?? "feet"}`
          : rateType === "PER_BIGHA"
          ? `Land lease contract ${contractNumber}: ${input.contractedAreaBigha} bigha @ ₹${input.ratePerBigha}/bigha`
          : `Land lease contract ${contractNumber}: ${input.contractedDepth} ${input.depthUnit ?? "feet"} @ ₹${input.ratePerDepthUnit}/${input.depthUnit ?? "feet"}`,
      category: "SOIL",
      contractId: contract._id,
      date: input.startDate,
    });
  }

  emitToKiln(input.kilnId, "landLeaseContract:update", contract);
  return contract;
}

export interface ListLandLeaseContractsFilter {
  landLeaseId?: string;
  landId?: string;
  status?: LandLeaseContractStatus;
}

export async function listLandLeaseContracts(kilnId: string, filter: ListLandLeaseContractsFilter = {}) {
  const conditions = [eq(landLeaseContracts.kilnId, kilnId)];
  if (filter.landLeaseId) conditions.push(eq(landLeaseContracts.landLeaseId, filter.landLeaseId));
  if (filter.landId) conditions.push(eq(landLeaseContracts.landId, filter.landId));
  if (filter.status) conditions.push(eq(landLeaseContracts.status, filter.status));

  const rows = await db.select().from(landLeaseContracts).where(and(...conditions)).orderBy(desc(landLeaseContracts.createdAt));
  return Promise.all(rows.map(withLeaseAndLand));
}

// A simplified version of soilContract.service.ts's getContractSummary —
// no excavatedQuantity/depthUsed (those are meaningless without
// SoilTrip/SoilArrival records, which Land Lease has none of), just the
// ledger balance and expiry state.
export async function getLandLeaseContractSummary(kilnId: string, contractId: string) {
  const row = (await db.select().from(landLeaseContracts).where(and(eq(landLeaseContracts._id, contractId), eq(landLeaseContracts.kilnId, kilnId))))[0];
  if (!row) throw new Error("Land lease contract not found in this kiln");
  const contract = await withLeaseAndLand(row);
  const ledgerBalance = await contractLedgerBalance(kilnId, contractId);

  const now = Date.now();
  const isExpired = !!row.endDate && row.endDate.getTime() < now;
  const isExpiringSoon = !isExpired && !!row.endDate && row.endDate.getTime() - now <= EXPIRY_WARNING_DAYS * 24 * 60 * 60 * 1000;

  return { contract, ledgerBalance, isExpired, isExpiringSoon };
}

export interface UpdateLandLeaseContractInput {
  rateType?: LandLeaseRateType;
  contractedQuantity?: number;
  ratePerTrolley?: number;
  contractedAreaBigha?: number;
  ratePerBigha?: number;
  contractedDepth?: number;
  depthUnit?: LandLeaseDepthUnit;
  ratePerDepthUnit?: number;
  totalContractValue?: number;
  advanceAmount?: number;
  // How the *additional* advance (if the edit raises advanceAmount) was
  // paid — same "posted on the delta's PAID entry only" convention as
  // CreateLandLeaseContractInput's own paymentMode/cashAmount/onlineAmount.
  paymentMode?: LedgerPaymentMode;
  cashAmount?: number;
  onlineAmount?: number;
  startDate?: Date;
  endDate?: Date;
  paymentTerms?: string;
  notes?: string;
}

// Same "revise, then post the delta" correction convention as
// soilContract.service.ts's updateSoilContract.
export async function updateLandLeaseContract(kilnId: string, contractId: string, input: UpdateLandLeaseContractInput) {
  const existing = (await db.select().from(landLeaseContracts).where(and(eq(landLeaseContracts._id, contractId), eq(landLeaseContracts.kilnId, kilnId))))[0];
  if (!existing) throw new Error("Land lease contract not found in this kiln");

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
  // below, not a landLeaseContracts column — never persisted on the
  // contract row itself, same exclusion createLandLeaseContract applies on
  // insert.
  const { paymentMode, cashAmount, onlineAmount, ...persistableInput } = input;
  if (paymentMode === "CASH_AND_ONLINE" && advanceDelta > 0) {
    const sum = Math.round(((cashAmount ?? 0) + (onlineAmount ?? 0)) * 100) / 100;
    if (sum !== advanceDelta) {
      throw new Error(`cashAmount + onlineAmount (₹${sum}) must equal the additional advance amount (₹${advanceDelta})`);
    }
  }

  await db.update(landLeaseContracts).set({ ...persistableInput, rateType, totalContractValue: newTotalValue }).where(eq(landLeaseContracts._id, contractId));
  const updated = await withLeaseAndLand((await db.select().from(landLeaseContracts).where(eq(landLeaseContracts._id, contractId)))[0]!);

  if (rateType !== "PER_TROLLEY") {
    const valueDelta = Math.round((newTotalValue - existing.totalContractValue) * 100) / 100;
    if (valueDelta > 0) {
      await addLedgerEntry({
        kilnId,
        personId: existing.landLeaseId,
        direction: "DUE",
        amount: valueDelta,
        reason: `Land lease contract ${existing.contractNumber} correction: revised value to ₹${newTotalValue.toLocaleString("en-IN")}`,
        category: "SOIL",
        contractId,
      });
    } else if (valueDelta < 0) {
      await addLedgerEntry({
        kilnId,
        personId: existing.landLeaseId,
        direction: "PAID",
        amount: -valueDelta,
        reason: `Land lease contract ${existing.contractNumber} correction: revised value to ₹${newTotalValue.toLocaleString("en-IN")}`,
        category: "SOIL",
        contractId,
        // Bug fix: no cash actually moved — see soilContract.service.ts's
        // identical fix for the confirmed live impact.
        isReversal: true,
      });
    }
  }

  if (advanceDelta > 0) {
    await addLedgerEntry({
      kilnId,
      personId: existing.landLeaseId,
      direction: "PAID",
      amount: advanceDelta,
      reason: `Land lease contract ${existing.contractNumber}: additional advance`,
      category: "ADVANCE",
      contractId,
      paymentMode,
      cashAmount: paymentMode === "CASH_AND_ONLINE" ? cashAmount : undefined,
      onlineAmount: paymentMode === "CASH_AND_ONLINE" ? onlineAmount : undefined,
    });
  } else if (advanceDelta < 0) {
    await addLedgerEntry({
      kilnId,
      personId: existing.landLeaseId,
      direction: "DUE",
      amount: -advanceDelta,
      reason: `Land lease contract ${existing.contractNumber}: advance revised down`,
      category: "ADVANCE",
      contractId,
    });
  }

  emitToKiln(kilnId, "landLeaseContract:update", updated);
  return updated;
}

// The ADVANCE and lump-sum-value ledger entries this contract posted at
// creation would otherwise sit on the landowner's ledger forever,
// permanently showing money paid/owed against a contract that (from the
// admin's view) no longer exists — reversed here the same way
// updateLandLeaseContract's own delta correction does it, just for the
// full original amount instead of a partial delta.
export async function deleteLandLeaseContract(kilnId: string, contractId: string) {
  const existing = (await db.select().from(landLeaseContracts).where(and(eq(landLeaseContracts._id, contractId), eq(landLeaseContracts.kilnId, kilnId))))[0];
  if (!existing) throw new Error("Land lease contract not found in this kiln");

  if (existing.advanceAmount && existing.advanceAmount > 0) {
    await addLedgerEntry({
      kilnId,
      personId: existing.landLeaseId,
      direction: "DUE",
      amount: existing.advanceAmount,
      reason: `Land lease contract ${existing.contractNumber} deleted — reversing advance`,
      category: "ADVANCE",
      contractId,
    });
  }
  if (existing.rateType !== "PER_TROLLEY" && existing.totalContractValue > 0) {
    await addLedgerEntry({
      kilnId,
      personId: existing.landLeaseId,
      direction: "PAID",
      amount: existing.totalContractValue,
      reason: `Land lease contract ${existing.contractNumber} deleted — reversing contract value`,
      category: "SOIL",
      contractId,
      // Bug fix: no cash actually moved — see soilContract.service.ts's
      // identical fix for the confirmed live impact.
      isReversal: true,
    });
  }

  // Bug fix: every ledger entry ever posted against this contract (at
  // creation and by the reversals just above) kept its contractId pointing
  // at a row about to not exist — same orphan class already fixed for
  // soilTrips/soilArrivals/jcbWorkLogs/sandDeliveries, just missed here.
  // The balance itself is unaffected (always summed by personId, never by
  // contractId), this only clears a now-meaningless reference tag.
  await db.update(ledgerEntries).set({ contractId: null }).where(and(eq(ledgerEntries.kilnId, kilnId), eq(ledgerEntries.contractId, contractId)));

  await db.delete(landLeaseContracts).where(eq(landLeaseContracts._id, contractId));
  emitToKiln(kilnId, "landLeaseContract:update", { _id: contractId, deleted: true });
  return existing;
}

export async function updateLandLeaseContractStatus(kilnId: string, contractId: string, status: LandLeaseContractStatus) {
  const existing = (await db.select().from(landLeaseContracts).where(and(eq(landLeaseContracts._id, contractId), eq(landLeaseContracts.kilnId, kilnId))))[0];
  if (!existing) throw new Error("Land lease contract not found in this kiln");
  await db.update(landLeaseContracts).set({ status }).where(eq(landLeaseContracts._id, contractId));
  const contract = (await db.select().from(landLeaseContracts).where(eq(landLeaseContracts._id, contractId)))[0]!;
  emitToKiln(kilnId, "landLeaseContract:update", contract);
  return contract;
}

export async function landLeaseContractsExpiringSoon(kilnId: string, withinDays = EXPIRY_WARNING_DAYS) {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() + withinDays);
  const contracts = await db
    .select()
    .from(landLeaseContracts)
    .where(and(eq(landLeaseContracts.kilnId, kilnId), eq(landLeaseContracts.status, "ACTIVE"), lte(landLeaseContracts.endDate, cutoff)))
    .orderBy(landLeaseContracts.endDate);
  return contracts.map((c) => ({ ...c, expired: !!c.endDate && c.endDate.getTime() < Date.now() }));
}
