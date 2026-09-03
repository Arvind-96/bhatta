import { randomUUID } from "crypto";
import { and, desc, eq, sql } from "drizzle-orm";
import { db } from "../db/client";
import { sandContracts, people, SAND_CONTRACT_RATE_TYPES } from "../db/schema";
import { assertPersonOfType } from "./person.service";
import { addLedgerEntry, LedgerPaymentMode } from "./ledger.service";
import { emitToKiln } from "../config/socket";

export type SandContractRateType = (typeof SAND_CONTRACT_RATE_TYPES)[number];

// A plain per-kiln sequential number (SD-1, SD-2, ...) — see
// soilContract.service.ts's generateContractNumber for the same reasoning.
async function generateContractNumber(kilnId: string) {
  const countRow = (await db.select({ count: sql<number>`count(*)` }).from(sandContracts).where(eq(sandContracts.kilnId, kilnId)))[0];
  return `SD-${(countRow?.count ?? 0) + 1}`;
}

export interface CreateSandContractInput {
  kilnId: string;
  sandContractorId: string;
  rateType?: SandContractRateType;
  contractedTrolleys?: number; // only meaningful for PER_TROLLEY
  contractPrice?: number; // agreed rate per trolley or per 1000 bricks, shown on the profile
  totalContractValue: number; // always the admin-entered lump sum, no per-unit rate math
  advanceAmount?: number;
  paymentMode?: LedgerPaymentMode;
  cashAmount?: number;
  onlineAmount?: number;
  startDate?: Date;
  endDate?: Date;
}

async function withContractor(contract: typeof sandContracts.$inferSelect) {
  const contractor = (await db
    .select({ _id: people._id, name: people.name, phone: people.phone })
    .from(people)
    .where(eq(people._id, contract.sandContractorId)))[0];
  return { ...contract, sandContractorId: contractor ?? contract.sandContractorId };
}

// Same PER_TROLLEY-vs-fixed-price split soilContract.service.ts uses:
// PER_TROLLEY keeps a pay-as-you-go shape (only the advance posts now,
// each delivery bills its own DUE later — see sandDelivery.service.ts),
// while PER_THOUSAND_BRICKS is a lump sum agreed up front, so its full
// totalContractValue posts as DUE immediately alongside the advance PAID.
export async function createSandContract(input: CreateSandContractInput) {
  await assertPersonOfType(input.kilnId, input.sandContractorId, ["SAND_CONTRACTOR"]);

  const rateType = input.rateType ?? "PER_TROLLEY";
  const contractNumber = await generateContractNumber(input.kilnId);

  const { paymentMode, cashAmount, onlineAmount, ...insertableInput } = input;

  const _id = randomUUID();
  await db.insert(sandContracts).values({ ...insertableInput, _id, rateType, contractNumber });
  const contract = (await db.select().from(sandContracts).where(eq(sandContracts._id, _id)))[0]!;

  if (input.advanceAmount && input.advanceAmount > 0) {
    await addLedgerEntry({
      kilnId: input.kilnId,
      personId: input.sandContractorId,
      direction: "PAID",
      amount: input.advanceAmount,
      reason: `Advance for sand contract ${contractNumber}`,
      category: "ADVANCE",
      contractId: contract._id,
      date: input.startDate,
      paymentMode,
      cashAmount: paymentMode === "CASH_AND_ONLINE" ? cashAmount : undefined,
      onlineAmount: paymentMode === "CASH_AND_ONLINE" ? onlineAmount : undefined,
    });
  }

  if (rateType !== "PER_TROLLEY" && input.totalContractValue > 0) {
    await addLedgerEntry({
      kilnId: input.kilnId,
      personId: input.sandContractorId,
      direction: "DUE",
      amount: input.totalContractValue,
      reason: `Sand contract ${contractNumber}: agreed value`,
      category: "SAND",
      contractId: contract._id,
      date: input.startDate,
    });
  }

  emitToKiln(input.kilnId, "sandContract:update", contract);
  return contract;
}

export interface ListSandContractsFilter {
  sandContractorId?: string;
}

export async function listSandContracts(kilnId: string, filter: ListSandContractsFilter = {}) {
  const conditions = [eq(sandContracts.kilnId, kilnId)];
  if (filter.sandContractorId) conditions.push(eq(sandContracts.sandContractorId, filter.sandContractorId));

  const rows = await db.select().from(sandContracts).where(and(...conditions)).orderBy(desc(sandContracts.createdAt));
  return Promise.all(rows.map(withContractor));
}

export interface UpdateSandContractInput {
  rateType?: SandContractRateType;
  contractedTrolleys?: number;
  contractPrice?: number;
  totalContractValue?: number;
  advanceAmount?: number;
  // How the *additional* advance (if the edit raises advanceAmount) was
  // paid — same "posted on the delta's PAID entry only" convention as
  // CreateSandContractInput's own paymentMode/cashAmount/onlineAmount.
  paymentMode?: LedgerPaymentMode;
  cashAmount?: number;
  onlineAmount?: number;
  startDate?: Date;
  endDate?: Date;
}

// Editing a contract can revise the agreed price — same "revise, then post
// the delta" correction convention soilContract.service.ts's
// updateSoilContract uses, rather than silently rewriting the ledger.
// sandContractorId isn't editable here, same restriction the backend
// enforces for soil contracts' landownerId/landId.
export async function updateSandContract(kilnId: string, contractId: string, input: UpdateSandContractInput) {
  const existing = (await db.select().from(sandContracts).where(and(eq(sandContracts._id, contractId), eq(sandContracts.kilnId, kilnId))))[0];
  if (!existing) throw new Error("Sand contract not found in this kiln");

  const rateType = input.rateType ?? existing.rateType!;
  const newTotalValue = input.totalContractValue ?? existing.totalContractValue;
  const oldAdvance = existing.advanceAmount ?? 0;
  const newAdvance = input.advanceAmount ?? oldAdvance;
  const advanceDelta = Math.round((newAdvance - oldAdvance) * 100) / 100;

  // paymentMode/cashAmount/onlineAmount describe the delta's PAID entry
  // below, not a sandContracts column — never persisted on the contract
  // row itself, same exclusion createSandContract applies on insert.
  const { paymentMode, cashAmount, onlineAmount, ...persistableInput } = input;
  if (paymentMode === "CASH_AND_ONLINE" && advanceDelta > 0) {
    const sum = Math.round(((cashAmount ?? 0) + (onlineAmount ?? 0)) * 100) / 100;
    if (sum !== advanceDelta) {
      throw new Error(`cashAmount + onlineAmount (₹${sum}) must equal the additional advance amount (₹${advanceDelta})`);
    }
  }

  await db.update(sandContracts).set({ ...persistableInput, rateType, totalContractValue: newTotalValue }).where(eq(sandContracts._id, contractId));
  const updated = await withContractor((await db.select().from(sandContracts).where(eq(sandContracts._id, contractId)))[0]!);

  if (rateType !== "PER_TROLLEY") {
    const valueDelta = Math.round((newTotalValue - existing.totalContractValue) * 100) / 100;
    if (valueDelta > 0) {
      await addLedgerEntry({
        kilnId,
        personId: existing.sandContractorId,
        direction: "DUE",
        amount: valueDelta,
        reason: `Sand contract ${existing.contractNumber} correction: revised value to ₹${newTotalValue.toLocaleString("en-IN")}`,
        category: "SAND",
        contractId,
      });
    } else if (valueDelta < 0) {
      await addLedgerEntry({
        kilnId,
        personId: existing.sandContractorId,
        direction: "PAID",
        amount: -valueDelta,
        reason: `Sand contract ${existing.contractNumber} correction: revised value to ₹${newTotalValue.toLocaleString("en-IN")}`,
        category: "SAND",
        contractId,
      });
    }
  }

  if (advanceDelta > 0) {
    await addLedgerEntry({
      kilnId,
      personId: existing.sandContractorId,
      direction: "PAID",
      amount: advanceDelta,
      reason: `Sand contract ${existing.contractNumber}: additional advance`,
      category: "ADVANCE",
      contractId,
      paymentMode,
      cashAmount: paymentMode === "CASH_AND_ONLINE" ? cashAmount : undefined,
      onlineAmount: paymentMode === "CASH_AND_ONLINE" ? onlineAmount : undefined,
    });
  } else if (advanceDelta < 0) {
    await addLedgerEntry({
      kilnId,
      personId: existing.sandContractorId,
      direction: "DUE",
      amount: -advanceDelta,
      reason: `Sand contract ${existing.contractNumber}: advance revised down`,
      category: "ADVANCE",
      contractId,
    });
  }

  emitToKiln(kilnId, "sandContract:update", updated);
  return updated;
}

// Deletion never touches ledger entries or SandDelivery records already
// posted against this contract — they simply keep their contractId
// pointing at a now-deleted document, same "historical records survive
// deletion of the parent" convention deleteSoilContract uses.
// The ADVANCE and lump-sum-value ledger entries this contract posted at
// creation would otherwise sit on the contractor's ledger forever,
// permanently showing money paid/owed against a contract that (from the
// admin's view) no longer exists — reversed here in full, same reasoning
// as soilContract.service.ts/landLeaseContract.service.ts's identical fix.
export async function deleteSandContract(kilnId: string, contractId: string) {
  const existing = (await db.select().from(sandContracts).where(and(eq(sandContracts._id, contractId), eq(sandContracts.kilnId, kilnId))))[0];
  if (!existing) throw new Error("Sand contract not found in this kiln");

  if (existing.advanceAmount && existing.advanceAmount > 0) {
    await addLedgerEntry({
      kilnId,
      personId: existing.sandContractorId,
      direction: "DUE",
      amount: existing.advanceAmount,
      reason: `Sand contract ${existing.contractNumber} deleted — reversing advance`,
      category: "ADVANCE",
      contractId,
    });
  }
  if (existing.rateType !== "PER_TROLLEY" && existing.totalContractValue > 0) {
    await addLedgerEntry({
      kilnId,
      personId: existing.sandContractorId,
      direction: "PAID",
      amount: existing.totalContractValue,
      reason: `Sand contract ${existing.contractNumber} deleted — reversing contract value`,
      category: "SAND",
      contractId,
    });
  }

  await db.delete(sandContracts).where(eq(sandContracts._id, contractId));
  emitToKiln(kilnId, "sandContract:update", { _id: contractId, deleted: true });
  return existing;
}
