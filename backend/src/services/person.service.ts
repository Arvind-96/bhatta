import { randomUUID } from "crypto";
import fs from "fs";
import path from "path";
import { and, asc, eq, ne, or, sql } from "drizzle-orm";
import { db, DATA_DIR } from "../db/client";
import {
  people,
  ledgerEntries,
  customers,
  paymentReceipts,
  attendances,
  familyMembers,
  suppliedItems,
  salarySlips,
  doctorVisits,
  moldingEntries,
  stackingEntries,
  nikasiEntries,
  firingShifts,
  loadingEntries,
  productionLogs,
  stackingVehicles,
  labourSessions,
  soilContracts,
  sandContracts,
  landLeaseContracts,
  lands,
  soilTrips,
  soilArrivals,
  jcbWorkLogs,
  sandDeliveries,
  vehicleDieselEntries,
  brickLoadingEntries,
  partnerAssets,
  invoices,
  PERSON_TYPES,
  SEX_OPTIONS,
  WORK_TYPES,
  STACKING_STAGES,
} from "../db/schema";
import { getCustomerDetail } from "./customer.service";
import { getCurrentSeasonId } from "./season.util";
import { listLedgerForKiln } from "./ledger.service";
import { listSupplierDuesAcrossKiln } from "./supplierInvoice.service";
import { totalFuelPurchaseSupplierDues } from "./fuelPurchase.service";
import { emitToKiln } from "../config/socket";

export type PersonType = (typeof PERSON_TYPES)[number];
export type Sex = (typeof SEX_OPTIONS)[number];
export type WorkType = (typeof WORK_TYPES)[number];
export type StackingStage = (typeof STACKING_STAGES)[number];

export interface CreatePersonInput {
  kilnId: string;
  type: PersonType;
  name: string;
  phone?: string;
  address?: string;
  notes?: string;
  status?: "ACTIVE" | "ABSCONDED";
  idNumber?: string;
  age?: number;
  sex?: Sex;
  workType?: WorkType;
  dailyWage?: number;
  ratePerThousand?: number;
  contractorId?: string;
  familyHeadId?: string;
  payType?: "MONTHLY" | "PER_THOUSAND";
  commissionPerThousand?: number;
  defaultRatePerThousand?: number;
  bharaiRatePerThousand?: number;
  monthlySalary?: number;
  stackingStage?: StackingStage;
  bharaiContractorId?: string;
  nikasiContractorId?: string;
  pakayiContractorId?: string;
  firingShiftAnchorDate?: Date;
  firingShiftAnchorType?: "DAY" | "NIGHT";
  vehicleNumber?: string;
  licenseNumber?: string;
  ratePerTrolley?: number;
  designation?: string;
  isOfficeStaff?: boolean;
  gstNumber?: string;
  contractRate?: number;
  contractUnit?: string;
  partnershipDate?: Date;
  profitSharePercent?: number;
  commissionType?: "PERCENT_OF_SALE" | "PER_THOUSAND_BRICKS";
  commissionPercent?: number;
  monthlySalesTarget?: number;
  referralCode?: string;
  khetArea?: number;
  khetAreaUnit?: string;
  khetLocation?: string;
  agreedDepthFeet?: number;
  agreedDepthUnit?: string;
  creditLimit?: number;
  nickname?: string;
  joiningDate?: Date;
}

// Shared by every service that accepts a personId from client input
// (soil trips, molding, attendance, contractor links) — confirms the
// reference actually exists, belongs to *this* kiln, and is the type the
// caller expects, so a stale/cross-kiln/wrong-type id fails loudly at
// write time instead of silently corrupting a ledger or attendance record.
export async function assertPersonOfType(kilnId: string, personId: string, allowedTypes: PersonType[]) {
  const person = (await db.select().from(people).where(and(eq(people._id, personId), eq(people.kilnId, kilnId))))[0];
  if (!person) throw new Error("Referenced person not found in this kiln");
  if (!allowedTypes.includes(person.type as PersonType)) {
    throw new Error(`Expected ${allowedTypes.join(" or ")}, got ${person.type}`);
  }
  return person;
}

// The two Bharai work types correspond 1:1 to stackingStage, which is
// what actually drives the Bharai page's gang filtering — kept in sync so
// a labourer created from the simplified Add Labour form immediately shows
// up in the right Bharai stage without a second edit. Only fills the gap
// when the caller hasn't set stackingStage explicitly themselves.
function deriveStackingStage(input: { workType?: WorkType; stackingStage?: "PHAD_TO_STOCK" | "STOCK_TO_CHAMBER" }) {
  if (input.stackingStage) return input.stackingStage;
  if (input.workType === "BHARAI_PHAD_TO_STOCK") return "PHAD_TO_STOCK" as const;
  if (input.workType === "BHARAI_STOCK_TO_CHAMBER") return "STOCK_TO_CHAMBER" as const;
  return input.stackingStage;
}

// Guards against the SUM of every active PARTNER's profitSharePercent in a
// kiln exceeding 100% — nothing else on the create/update path stops an
// admin from giving five partners 30% each. `excludePersonId` leaves the
// partner currently being saved out of the "other partners" sum (their own
// new value is passed in as `newSharePercent` and added back separately),
// so re-saving an already-registered partner's own percentage doesn't
// double-count their old stored figure against itself.
async function assertPartnerShareWithinLimit(kilnId: string, excludePersonId: string | undefined, newSharePercent: number) {
  const otherPartners = await db
    .select({ profitSharePercent: people.profitSharePercent })
    .from(people)
    .where(and(eq(people.kilnId, kilnId), eq(people.type, "PARTNER"), eq(people.active, true), excludePersonId ? ne(people._id, excludePersonId) : undefined));
  const othersTotal = otherPartners.reduce((sum, p) => sum + (p.profitSharePercent ?? 0), 0);
  const total = Math.round((othersTotal + newSharePercent) * 100) / 100;
  if (total > 100) {
    throw new Error(`Total partner profit share would be ${total}% — cannot exceed 100%.`);
  }
}

export async function createPerson(input: CreatePersonInput) {
  if (input.type === "PARTNER" && input.profitSharePercent != null) {
    await assertPartnerShareWithinLimit(input.kilnId, undefined, input.profitSharePercent);
  }
  if (input.contractorId) {
    await assertPersonOfType(input.kilnId, input.contractorId, ["LABOUR_CONTRACTOR"]);
  }
  if (input.bharaiContractorId) {
    await assertPersonOfType(input.kilnId, input.bharaiContractorId, ["LABOUR_CONTRACTOR"]);
  }
  if (input.nikasiContractorId) {
    await assertPersonOfType(input.kilnId, input.nikasiContractorId, ["LABOUR_CONTRACTOR"]);
  }
  if (input.pakayiContractorId) {
    await assertPersonOfType(input.kilnId, input.pakayiContractorId, ["LABOUR_CONTRACTOR"]);
  }
  // "Landowner - N" / "Sand - N" / "Land Lease - N", simple per-kiln
  // count-based sequences — both types are added one at a time by a
  // single admin, not a high-concurrency flow like dispatch slip numbers,
  // so this skips that flow's retry-on-collision machinery as unnecessary
  // complexity here. Filtered to active=true so this starting value
  // agrees with computeLandownerSerials/computeSandContractorSerials/
  // computeLandLeaseSerials below (which only ever count active records)
  // — otherwise a kiln with any deactivated record of this type would get
  // a stored value here that's immediately wrong the moment the list is
  // next read back, since count(*) without the active filter counts
  // deactivated rows the recompute never will.
  let landownerSerial: number | undefined;
  if (input.type === "LANDOWNER") {
    const countRow = (await db.select({ count: sql<number>`count(*)` }).from(people).where(and(eq(people.kilnId, input.kilnId), eq(people.type, "LANDOWNER"), eq(people.active, true))))[0];
    landownerSerial = (countRow?.count ?? 0) + 1;
  }
  let sandContractorSerial: number | undefined;
  if (input.type === "SAND_CONTRACTOR") {
    const countRow = (await db.select({ count: sql<number>`count(*)` }).from(people).where(and(eq(people.kilnId, input.kilnId), eq(people.type, "SAND_CONTRACTOR"), eq(people.active, true))))[0];
    sandContractorSerial = (countRow?.count ?? 0) + 1;
  }
  let landLeaseSerial: number | undefined;
  if (input.type === "LAND_LEASE") {
    const countRow = (await db.select({ count: sql<number>`count(*)` }).from(people).where(and(eq(people.kilnId, input.kilnId), eq(people.type, "LAND_LEASE"), eq(people.active, true))))[0];
    landLeaseSerial = (countRow?.count ?? 0) + 1;
  }
  const _id = randomUUID();
  await db.insert(people).values({ ...input, _id, stackingStage: deriveStackingStage(input), landownerSerial, sandContractorSerial, landLeaseSerial });
  const person = (await db.select().from(people).where(eq(people._id, _id)))[0]!;
  emitToKiln(input.kilnId, "person:update", person);
  return person;
}

// Landowner "serial" numbers (Landowner - N) are derived live from each
// active landowner's position in creation order, never read back from the
// stored landownerSerial column — so deleting one automatically closes the
// gap for everyone after it, with no renumbering step needed. The column
// itself is still written at creation as a defensive fallback in case a
// landowner is somehow missing from this computation.
async function computeLandownerSerials(kilnId: string): Promise<Map<string, number>> {
  const rows = await db
    .select({ _id: people._id })
    .from(people)
    .where(and(eq(people.kilnId, kilnId), eq(people.type, "LANDOWNER"), eq(people.active, true)))
    .orderBy(asc(people.createdAt));
  return new Map(rows.map((r, i) => [r._id, i + 1]));
}

// Same idea as computeLandownerSerials above, for Land Lease (Patta).
async function computeLandLeaseSerials(kilnId: string): Promise<Map<string, number>> {
  const rows = await db
    .select({ _id: people._id })
    .from(people)
    .where(and(eq(people.kilnId, kilnId), eq(people.type, "LAND_LEASE"), eq(people.active, true)))
    .orderBy(asc(people.createdAt));
  return new Map(rows.map((r, i) => [r._id, i + 1]));
}

// Same idea again, for Sand Contractor — previously missing entirely, so
// sandContractorSerial only ever held its stale creation-time value
// forever, with no recompute to close the gap left by a deactivated
// contractor the way Landowner/Land Lease already did.
async function computeSandContractorSerials(kilnId: string): Promise<Map<string, number>> {
  const rows = await db
    .select({ _id: people._id })
    .from(people)
    .where(and(eq(people.kilnId, kilnId), eq(people.type, "SAND_CONTRACTOR"), eq(people.active, true)))
    .orderBy(asc(people.createdAt));
  return new Map(rows.map((r, i) => [r._id, i + 1]));
}

export async function listPeople(kilnId: string, type?: PersonType) {
  const conditions = [eq(people.kilnId, kilnId), eq(people.active, true)];
  if (type) conditions.push(eq(people.type, type));
  const rows = await db.select().from(people).where(and(...conditions)).orderBy(asc(people.name));
  if (type === "LANDOWNER") {
    const serials = await computeLandownerSerials(kilnId);
    return rows.map((r) => ({ ...r, landownerSerial: serials.get(r._id) ?? r.landownerSerial }));
  }
  if (type === "LAND_LEASE") {
    const serials = await computeLandLeaseSerials(kilnId);
    return rows.map((r) => ({ ...r, landLeaseSerial: serials.get(r._id) ?? r.landLeaseSerial }));
  }
  if (type === "SAND_CONTRACTOR") {
    const serials = await computeSandContractorSerials(kilnId);
    return rows.map((r) => ({ ...r, sandContractorSerial: serials.get(r._id) ?? r.sandContractorSerial }));
  }
  if (type) return rows;
  const [landownerSerials, landLeaseSerials, sandContractorSerials] = await Promise.all([
    computeLandownerSerials(kilnId),
    computeLandLeaseSerials(kilnId),
    computeSandContractorSerials(kilnId),
  ]);
  return rows.map((r) => {
    if (r.type === "LANDOWNER") return { ...r, landownerSerial: landownerSerials.get(r._id) ?? r.landownerSerial };
    if (r.type === "LAND_LEASE") return { ...r, landLeaseSerial: landLeaseSerials.get(r._id) ?? r.landLeaseSerial };
    if (r.type === "SAND_CONTRACTOR") return { ...r, sandContractorSerial: sandContractorSerials.get(r._id) ?? r.sandContractorSerial };
    return r;
  });
}

// Everyone linked to a LABOUR_CONTRACTOR across every module they might be
// linked through — a worker's "reports to" contractor can be set via any
// of contractorId (Pathai/general), bharaiContractorId (stacking),
// nikasiContractorId, or pakayiContractorId (firing), so this unions all
// four rather than assuming one. Returns the contractor's own id first,
// then their gang — the direct data source for "all laborers under
// Contractor X" reports and rollups.
export async function resolveContractorGang(kilnId: string, contractorId: string): Promise<string[]> {
  const rows = await db
    .select({ _id: people._id })
    .from(people)
    .where(
      and(
        eq(people.kilnId, kilnId),
        or(
          eq(people.contractorId, contractorId),
          eq(people.bharaiContractorId, contractorId),
          eq(people.nikasiContractorId, contractorId),
          eq(people.pakayiContractorId, contractorId)
        )
      )
    );
  return [contractorId, ...rows.map((r) => r._id)];
}

// Profile-level filtering for reports — narrows the person pool by any
// combination of type/workType/status before the report resolves which
// ledger/production rows to pull, so the admin can filter "every specific
// field" that actually distinguishes one laborer/contractor from another
// (their role, work type, and whether they're still active) rather than
// just picking one person by name at a time.
export async function findPeopleIds(kilnId: string, filter: { type?: PersonType; workType?: WorkType; status?: "ACTIVE" | "ABSCONDED" } = {}): Promise<string[]> {
  const conditions = [eq(people.kilnId, kilnId)];
  if (filter.type) conditions.push(eq(people.type, filter.type));
  if (filter.workType) conditions.push(eq(people.workType, filter.workType));
  if (filter.status) conditions.push(eq(people.status, filter.status));
  const rows = await db.select({ _id: people._id }).from(people).where(and(...conditions));
  return rows.map((r) => r._id);
}

export async function getBalance(kilnId: string, personId: string) {
  const entries = await db
    .select()
    .from(ledgerEntries)
    .where(and(eq(ledgerEntries.kilnId, kilnId), eq(ledgerEntries.personId, personId)));
  const balance = entries.reduce((sum, e) => sum + (e.direction === "DUE" ? e.amount : -e.amount), 0);
  // Summing many float amounts drifts off whole-paisa precision (e.g.
  // 0.1 + 0.2 territory) — round back to paisa here, the one place every
  // other balance computation in this file and financialOverview.service.ts
  // ultimately derives from, so it doesn't have to be re-fixed per call site.
  return Math.round(balance * 100) / 100;
}

// The four "money handed out mid-cycle, not yet earned back" categories —
// same set listOutstandingAdvances already treats as advance-like — that
// count as drawn against a contractor's own pool when paid straight to one
// of their gang instead of through them.
const CONTRACTOR_DRAWDOWN_CATEGORIES = ["ADVANCE", "KHARCHI", "MEDICAL", "FESTIVAL"];

export interface ContractorNetBalance {
  ownBalance: number;
  gangDrawdown: number;
  netBalance: number;
}

// A LABOUR_CONTRACTOR's own ledger balance (ownBalance — their own
// advances/commission/settlements) doesn't reflect money the kiln paid
// directly to their gang instead of through them. Most of the time the
// kiln pays the contractor a lump sum and the contractor distributes it;
// when the kiln pays a gang member directly instead (Advance/Kharchi/
// Medical/Festival), that payment is really drawn against the same pool,
// so it's added back here to net the contractor's true remaining exposure
// — the same idea labourSession.service.ts already applies for Pathai
// specifically, generalized to every contractor type via
// resolveContractorGang's union of all four contractorId fields, and
// computed live (not a duplicated ledger entry) so it can never drift out
// of sync with the gang's own entries, and needs no correction/reversal
// bookkeeping when one of those entries is later edited or deleted.
export async function contractorNetBalance(kilnId: string, contractorId: string): Promise<ContractorNetBalance> {
  const gangIds = (await resolveContractorGang(kilnId, contractorId)).filter((id) => id !== contractorId);
  const ownBalance = await getBalance(kilnId, contractorId);
  if (gangIds.length === 0) return { ownBalance, gangDrawdown: 0, netBalance: ownBalance };

  const gangEntries = await listLedgerForKiln(kilnId, { personIds: gangIds });
  const gangDrawdown =
    Math.round(
      gangEntries
        .filter((e) => e.direction === "PAID" && e.category && CONTRACTOR_DRAWDOWN_CATEGORIES.includes(e.category))
        .reduce((sum, e) => sum + e.amount, 0) * 100
    ) / 100;

  return { ownBalance, gangDrawdown, netBalance: Math.round((ownBalance + gangDrawdown) * 100) / 100 };
}

export async function getPersonWithBalance(kilnId: string, personId: string) {
  const person = (await db.select().from(people).where(and(eq(people._id, personId), eq(people.kilnId, kilnId))))[0];
  if (!person) throw new Error("Person not found");
  const balance = await getBalance(kilnId, personId);
  if (person.type === "LANDOWNER") {
    const serials = await computeLandownerSerials(kilnId);
    person.landownerSerial = serials.get(person._id) ?? person.landownerSerial;
  }
  if (person.type === "LAND_LEASE") {
    const serials = await computeLandLeaseSerials(kilnId);
    person.landLeaseSerial = serials.get(person._id) ?? person.landLeaseSerial;
  }
  if (person.type === "SAND_CONTRACTOR") {
    const serials = await computeSandContractorSerials(kilnId);
    person.sandContractorSerial = serials.get(person._id) ?? person.sandContractorSerial;
  }
  return { person, balance };
}

export interface UpdatePersonInput extends Partial<Omit<CreatePersonInput, "kilnId" | "type">> {
  active?: boolean;
}

export async function updatePerson(kilnId: string, personId: string, input: UpdatePersonInput) {
  if (input.contractorId) {
    await assertPersonOfType(kilnId, input.contractorId, ["LABOUR_CONTRACTOR"]);
  }
  if (input.bharaiContractorId) {
    await assertPersonOfType(kilnId, input.bharaiContractorId, ["LABOUR_CONTRACTOR"]);
  }
  if (input.nikasiContractorId) {
    await assertPersonOfType(kilnId, input.nikasiContractorId, ["LABOUR_CONTRACTOR"]);
  }
  if (input.pakayiContractorId) {
    await assertPersonOfType(kilnId, input.pakayiContractorId, ["LABOUR_CONTRACTOR"]);
  }
  const existing = (await db.select().from(people).where(and(eq(people._id, personId), eq(people.kilnId, kilnId))))[0];
  if (!existing) throw new Error("Person not found");

  if (existing.type === "PARTNER") {
    const effectiveActive = input.active ?? existing.active;
    const effectiveShare = input.profitSharePercent !== undefined ? input.profitSharePercent : existing.profitSharePercent;
    if (effectiveActive && effectiveShare != null) {
      await assertPartnerShareWithinLimit(kilnId, personId, effectiveShare);
    }
  }

  await db.update(people)
    .set({ ...input, stackingStage: deriveStackingStage(input) })
    .where(and(eq(people._id, personId), eq(people.kilnId, kilnId)));
  const person = (await db.select().from(people).where(eq(people._id, personId)))[0]!;
  emitToKiln(kilnId, "person:update", person);
  return person;
}

// Permanent, irreversible removal — the People page's "Delete" action.
// Separate from the existing "Mark absconded"/active:false toggle (which
// just hides someone from active lists while keeping their real history
// intact) — this genuinely erases the row, so it's only ever safe for a
// person with NO real history at all (a duplicate entered twice, a test
// record, someone added by mistake). Never for a person with genuine
// business activity, since erasing real financial/production history is
// exactly what this app's audit-trail design exists to prevent. Refuses
// (same check-then-throw pattern as deleteCustomer/deleteSupplier/
// deleteVehicle) rather than cascading through 20+ tables if ANY real
// record still references this person — several of those references
// (moldingEntries.workerId, stackingEntries.gangId, firingShifts.fitterId,
// loadingEntries.palledarId) are NOT-NULL columns on real production
// events, so there is no safe way to null them out even if we wanted to;
// blocking is the only correct behavior once such a record exists.
export async function deletePerson(kilnId: string, personId: string) {
  const existing = (await db.select().from(people).where(and(eq(people._id, personId), eq(people.kilnId, kilnId))))[0];
  if (!existing) throw new Error("Person not found in this kiln");

  const [
    ledgerRows,
    receiptRows,
    attendanceRows,
    familyRows,
    suppliedRows,
    salaryRows,
    doctorVisitRows,
    moldingRows,
    stackingRows,
    nikasiRows,
    firingRows,
    loadingRows,
    productionLogRows,
    stackingVehicleRows,
    labourSessionRows,
    soilContractRows,
    sandContractRows,
    landLeaseContractRows,
    landRows,
    soilTripRows,
    soilArrivalRows,
    jcbWorkLogRows,
    sandDeliveryRows,
    dieselRows,
    brickLoadingRows,
    dependentPeopleRows,
    partnerAssetRows,
    attributedInvoiceRows,
  ] = await Promise.all([
    db.select({ _id: ledgerEntries._id }).from(ledgerEntries).where(and(eq(ledgerEntries.kilnId, kilnId), eq(ledgerEntries.personId, personId))),
    db.select({ _id: paymentReceipts._id }).from(paymentReceipts).where(and(eq(paymentReceipts.kilnId, kilnId), eq(paymentReceipts.personId, personId))),
    db.select({ _id: attendances._id }).from(attendances).where(and(eq(attendances.kilnId, kilnId), eq(attendances.personId, personId))),
    db.select({ _id: familyMembers._id }).from(familyMembers).where(and(eq(familyMembers.kilnId, kilnId), eq(familyMembers.headPersonId, personId))),
    db.select({ _id: suppliedItems._id }).from(suppliedItems).where(and(eq(suppliedItems.kilnId, kilnId), eq(suppliedItems.personId, personId))),
    db.select({ _id: salarySlips._id }).from(salarySlips).where(and(eq(salarySlips.kilnId, kilnId), eq(salarySlips.personId, personId))),
    db.select({ _id: doctorVisits._id }).from(doctorVisits).where(and(eq(doctorVisits.kilnId, kilnId), eq(doctorVisits.personId, personId))),
    db.select({ _id: moldingEntries._id }).from(moldingEntries).where(and(eq(moldingEntries.kilnId, kilnId), eq(moldingEntries.workerId, personId))),
    db.select({ _id: stackingEntries._id }).from(stackingEntries).where(and(eq(stackingEntries.kilnId, kilnId), eq(stackingEntries.gangId, personId))),
    db.select({ _id: nikasiEntries._id }).from(nikasiEntries).where(and(eq(nikasiEntries.kilnId, kilnId), eq(nikasiEntries.gangId, personId))),
    db.select({ _id: firingShifts._id }).from(firingShifts).where(and(eq(firingShifts.kilnId, kilnId), eq(firingShifts.fitterId, personId))),
    db.select({ _id: loadingEntries._id }).from(loadingEntries).where(and(eq(loadingEntries.kilnId, kilnId), eq(loadingEntries.palledarId, personId))),
    db.select({ _id: productionLogs._id }).from(productionLogs).where(and(eq(productionLogs.kilnId, kilnId), eq(productionLogs.thekedarId, personId))),
    db.select({ _id: stackingVehicles._id }).from(stackingVehicles).where(and(eq(stackingVehicles.kilnId, kilnId), eq(stackingVehicles.contractorId, personId))),
    db.select({ contractorId: labourSessions.contractorId }).from(labourSessions).where(and(eq(labourSessions.kilnId, kilnId), eq(labourSessions.contractorId, personId))),
    db.select({ _id: soilContracts._id }).from(soilContracts).where(and(eq(soilContracts.kilnId, kilnId), eq(soilContracts.landownerId, personId))),
    db.select({ _id: sandContracts._id }).from(sandContracts).where(and(eq(sandContracts.kilnId, kilnId), eq(sandContracts.sandContractorId, personId))),
    db.select({ _id: landLeaseContracts._id }).from(landLeaseContracts).where(and(eq(landLeaseContracts.kilnId, kilnId), eq(landLeaseContracts.landLeaseId, personId))),
    db.select({ _id: lands._id }).from(lands).where(and(eq(lands.kilnId, kilnId), eq(lands.landownerId, personId))),
    db.select({ _id: soilTrips._id }).from(soilTrips).where(and(eq(soilTrips.kilnId, kilnId), or(eq(soilTrips.landownerId, personId), eq(soilTrips.driverId, personId)))),
    db.select({ _id: soilArrivals._id }).from(soilArrivals).where(and(eq(soilArrivals.kilnId, kilnId), or(eq(soilArrivals.landownerId, personId), eq(soilArrivals.jcbDriverId, personId), eq(soilArrivals.tractorDriverId, personId)))),
    db.select({ _id: jcbWorkLogs._id }).from(jcbWorkLogs).where(and(eq(jcbWorkLogs.kilnId, kilnId), or(eq(jcbWorkLogs.landownerId, personId), eq(jcbWorkLogs.driverId, personId)))),
    db.select({ _id: sandDeliveries._id }).from(sandDeliveries).where(and(eq(sandDeliveries.kilnId, kilnId), eq(sandDeliveries.sandContractorId, personId))),
    db.select({ _id: vehicleDieselEntries._id }).from(vehicleDieselEntries).where(and(eq(vehicleDieselEntries.kilnId, kilnId), eq(vehicleDieselEntries.driverId, personId))),
    db.select({ _id: brickLoadingEntries._id }).from(brickLoadingEntries).where(and(eq(brickLoadingEntries.kilnId, kilnId), eq(brickLoadingEntries.driverId, personId))),
    db.select({ _id: people._id }).from(people).where(and(eq(people.kilnId, kilnId), or(eq(people.contractorId, personId), eq(people.bharaiContractorId, personId), eq(people.nikasiContractorId, personId), eq(people.pakayiContractorId, personId)))),
    db.select({ _id: partnerAssets._id }).from(partnerAssets).where(and(eq(partnerAssets.kilnId, kilnId), eq(partnerAssets.partnerId, personId))),
    db.select({ _id: invoices._id }).from(invoices).where(and(eq(invoices.kilnId, kilnId), or(eq(invoices.partnerId, personId), eq(invoices.agentId, personId)))),
  ]);

  const blockers: string[] = [];
  if (ledgerRows.length) blockers.push(`${ledgerRows.length} ledger entr${ledgerRows.length === 1 ? "y" : "ies"}`);
  if (receiptRows.length) blockers.push(`${receiptRows.length} payment receipt(s)`);
  if (attendanceRows.length) blockers.push(`${attendanceRows.length} attendance record(s)`);
  if (familyRows.length) blockers.push(`${familyRows.length} family member(s)`);
  if (suppliedRows.length) blockers.push(`${suppliedRows.length} supplied item(s)`);
  if (salaryRows.length) blockers.push(`${salaryRows.length} salary slip(s)`);
  if (doctorVisitRows.length) blockers.push(`${doctorVisitRows.length} doctor visit(s)`);
  if (moldingRows.length) blockers.push(`${moldingRows.length} molding entr${moldingRows.length === 1 ? "y" : "ies"}`);
  if (stackingRows.length) blockers.push(`${stackingRows.length} stacking entr${stackingRows.length === 1 ? "y" : "ies"}`);
  if (nikasiRows.length) blockers.push(`${nikasiRows.length} nikasi entr${nikasiRows.length === 1 ? "y" : "ies"}`);
  if (firingRows.length) blockers.push(`${firingRows.length} firing shift(s)`);
  if (loadingRows.length) blockers.push(`${loadingRows.length} loading entr${loadingRows.length === 1 ? "y" : "ies"}`);
  if (productionLogRows.length) blockers.push(`${productionLogRows.length} production log(s)`);
  if (stackingVehicleRows.length) blockers.push(`${stackingVehicleRows.length} stacking vehicle(s)`);
  if (labourSessionRows.length) blockers.push(`${labourSessionRows.length} labour session(s)`);
  if (soilContractRows.length) blockers.push(`${soilContractRows.length} soil contract(s)`);
  if (sandContractRows.length) blockers.push(`${sandContractRows.length} sand contract(s)`);
  if (landLeaseContractRows.length) blockers.push(`${landLeaseContractRows.length} land lease contract(s)`);
  if (landRows.length) blockers.push(`${landRows.length} land record(s)`);
  if (soilTripRows.length) blockers.push(`${soilTripRows.length} soil trip(s)`);
  if (soilArrivalRows.length) blockers.push(`${soilArrivalRows.length} soil arrival(s)`);
  if (jcbWorkLogRows.length) blockers.push(`${jcbWorkLogRows.length} JCB work log(s)`);
  if (sandDeliveryRows.length) blockers.push(`${sandDeliveryRows.length} sand delivery/deliveries`);
  if (dieselRows.length) blockers.push(`${dieselRows.length} diesel entr${dieselRows.length === 1 ? "y" : "ies"}`);
  if (brickLoadingRows.length) blockers.push(`${brickLoadingRows.length} brick loading trip(s)`);
  if (dependentPeopleRows.length) blockers.push(`${dependentPeopleRows.length} person/people listing them as their contractor`);
  if (partnerAssetRows.length) blockers.push(`${partnerAssetRows.length} partner asset(s)`);
  if (attributedInvoiceRows.length) blockers.push(`${attributedInvoiceRows.length} invoice(s) attributed to them as partner/agent`);

  if (blockers.length > 0) {
    throw new Error(
      `Cannot delete ${existing.name} — they have real history: ${blockers.join(", ")}. Deleting them would erase that history, so this is refused.`
    );
  }

  await db.delete(people).where(and(eq(people._id, personId), eq(people.kilnId, kilnId)));
  emitToKiln(kilnId, "person:update", { _id: personId, deleted: true });
  return existing;
}

// Fixes an accidental duplicate person record (e.g. the same contractor
// entered twice under slightly different names) by reassigning every
// ledger entry from one to the other, then deactivating the "from" record
// — the "Ledgers-Merge" report menu item. Deliberately narrow: only
// ledgerEntries move; no other module's rows (work entries, attendance,
// etc.) are touched, since those represent actual attributed work and
// merging them would rewrite history rather than just fix a bookkeeping
// duplicate. Irreversible in the sense that entries.personId isn't
// tracked back to its original owner afterward — the caller (a
// confirmation dialog on the frontend) is expected to make that clear.
export async function mergeLedgers(kilnId: string, fromPersonId: string, intoPersonId: string) {
  if (fromPersonId === intoPersonId) throw new Error("Cannot merge a person's ledger into themselves");
  const [fromPerson, intoPerson] = await Promise.all([
    (await db.select().from(people).where(and(eq(people._id, fromPersonId), eq(people.kilnId, kilnId))))[0],
    (await db.select().from(people).where(and(eq(people._id, intoPersonId), eq(people.kilnId, kilnId))))[0],
  ]);
  if (!fromPerson) throw new Error("Source person not found in this kiln");
  if (!intoPerson) throw new Error("Target person not found in this kiln");

  await db.update(ledgerEntries).set({ personId: intoPersonId }).where(and(eq(ledgerEntries.kilnId, kilnId), eq(ledgerEntries.personId, fromPersonId)));
  await db.update(people).set({ active: false }).where(eq(people._id, fromPersonId));

  const updatedTarget = (await db.select().from(people).where(eq(people._id, intoPersonId)))[0]!;
  emitToKiln(kilnId, "person:update", updatedTarget);
  emitToKiln(kilnId, "person:update", { ...fromPerson, active: false });
  return updatedTarget;
}

const PEOPLE_FILES_DIR = path.join(DATA_DIR, "people");

function personFileDir(personId: string) {
  return path.join(PEOPLE_FILES_DIR, personId);
}

// Re-upload always replaces — there's exactly one current photo/ID-proof
// per person, not a history of them, so any previous file for this
// personId+kind is removed first rather than accumulating orphaned files
// under a new extension.
async function replacePersonFile(
  kilnId: string,
  personId: string,
  kind: "photo" | "identity-proof",
  columnName: "photoPath" | "identityProofPath",
  file: { buffer: Buffer; originalname: string }
) {
  const existing = (await db.select().from(people).where(and(eq(people._id, personId), eq(people.kilnId, kilnId))))[0];
  if (!existing) throw new Error("Person not found in this kiln");

  const dir = personFileDir(personId);
  fs.mkdirSync(dir, { recursive: true });
  for (const stale of fs.readdirSync(dir).filter((f) => f.startsWith(kind))) {
    fs.unlinkSync(path.join(dir, stale));
  }

  const ext = path.extname(file.originalname) || ".bin";
  const relativePath = path.join("people", personId, `${kind}${ext}`);
  fs.writeFileSync(path.join(DATA_DIR, relativePath), file.buffer);

  await db.update(people).set({ [columnName]: relativePath }).where(eq(people._id, personId));
  const person = (await db.select().from(people).where(eq(people._id, personId)))[0]!;
  emitToKiln(kilnId, "person:update", person);
  return person;
}

export async function savePersonPhoto(kilnId: string, personId: string, file: { buffer: Buffer; originalname: string }) {
  return replacePersonFile(kilnId, personId, "photo", "photoPath", file);
}

export async function savePersonIdentityProof(kilnId: string, personId: string, file: { buffer: Buffer; originalname: string }) {
  return replacePersonFile(kilnId, personId, "identity-proof", "identityProofPath", file);
}

// Resolves a stored relative path (e.g. "people/<id>/photo.jpg") to an
// absolute on-disk path for res.sendFile — re-checks the person exists in
// THIS kiln first, same defensive pattern as every other kiln-scoped
// lookup in this file, so one kiln can never fetch another's uploaded
// files just by guessing a personId.
export async function getPersonFilePath(kilnId: string, personId: string, column: "photoPath" | "identityProofPath") {
  const person = (await db.select().from(people).where(and(eq(people._id, personId), eq(people.kilnId, kilnId))))[0];
  if (!person) throw new Error("Person not found in this kiln");
  const relativePath = person[column];
  if (!relativePath) return null;
  return path.join(DATA_DIR, relativePath);
}

// "Kis mazdoor/sardar ke paas kitna advance bacha hai" — a negative balance
// means the kiln paid out more (advance/peshgi) than the person has earned
// back in wages so far. Surfacing this list is the whole point: it's how an
// owner notices an outstanding advance risk before someone disappears with
// it, not after.
//
// Bug fix: this used to hard-scope to WORKER/HELPER/LABOUR_CONTRACTOR only
// — a Landowner, Sand Contractor, Land Lease, Partner, or Staff member who
// has been overpaid (negative balance, the exact same real-money risk this
// list exists to surface) never appeared here at all. Same non-allow-list
// fix personLedgerBalances/listPaymentsDue already apply for the identical
// reason: a forgotten type here silently hides a real advance risk.
export async function listOutstandingAdvances(kilnId: string) {
  const rows = await db
    .select()
    .from(people)
    .where(and(eq(people.kilnId, kilnId), ne(people.type, "CUSTOMER")));

  const results = [];
  for (const person of rows) {
    const entries = await db
      .select()
      .from(ledgerEntries)
      .where(and(eq(ledgerEntries.kilnId, kilnId), eq(ledgerEntries.personId, person._id)))
      .orderBy(asc(ledgerEntries.date));
    const balance = Math.round(entries.reduce((sum, e) => sum + (e.direction === "DUE" ? e.amount : -e.amount), 0) * 100) / 100;
    if (balance < 0) {
      const oldestAdvance = entries.find((e) => e.direction === "PAID");
      const daysPending = oldestAdvance
        ? Math.floor((Date.now() - oldestAdvance.date!.getTime()) / (1000 * 60 * 60 * 24))
        : 0;
      results.push({ person, outstandingAdvance: -balance, daysPending });
    }
  }
  return results.sort((a, b) => b.outstandingAdvance - a.outstandingAdvance);
}

// "Whose payment is due" — the Overview dashboard's flip side of
// listOutstandingAdvances: every person the kiln itself still owes money
// to (wages/commission/salary earned but not yet paid out, purchases not
// yet settled, soil/contract dues not yet settled). Every non-CUSTOMER
// type is included — not a hand-maintained allow-list, since a forgotten
// type here (this previously missed LANDOWNER, THEKEDAR, and PARTNER —
// real money, no other aggregate view surfaces it) silently hides real
// dues from the owner rather than just failing loudly. Positive balance =
// kiln owes them.
// Every non-customer person's ledger balance, positive, negative, and
// zero alike — the full-population version of listPaymentsDue (which only
// keeps balance > 0) for reports that need to see the whole roster (Trial
// Balance, Show Nil Accounts). Same balance formula, deliberately kept as
// its own query rather than refactoring listPaymentsDue to filter after
// the fact, so a change here can't accidentally alter that existing,
// already-relied-upon function's behavior.
export async function personLedgerBalances(kilnId: string) {
  const rows = await db.select().from(people).where(and(eq(people.kilnId, kilnId), ne(people.type, "CUSTOMER")));
  const results = [];
  for (const person of rows) {
    const entries = await db.select().from(ledgerEntries).where(and(eq(ledgerEntries.kilnId, kilnId), eq(ledgerEntries.personId, person._id)));
    const balance = Math.round(entries.reduce((sum, e) => sum + (e.direction === "DUE" ? e.amount : -e.amount), 0) * 100) / 100;
    results.push({ person: { id: person._id, name: person.name, type: person.type, phone: person.phone ?? null }, balance });
  }
  return results;
}

// Bug fix (admin decision): this used to be structurally unable to see
// Supplier debt at all — suppliers live in their own `suppliers` table,
// never in `people`/`ledgerEntries`, which every row here otherwise comes
// from. Financial Overview/Dashboard's "Total Dues" (built on this
// function) claims to mean "what the kiln owes labor/contractors/
// suppliers," but silently excluded every supplier due — while Reports →
// Debtors & Creditors (which loops suppliers directly) already included
// them, so the two disagreed by exactly that amount. Now merges in both
// supplier debt streams (goods invoices and fuel purchases — two
// genuinely separate systems, see supplierInvoice.service.ts's
// listSupplierDuesAcrossKiln and fuelPurchase.service.ts's
// totalFuelPurchaseSupplierDues), combined into one row per supplier so a
// supplier with both kinds of debt doesn't appear twice.
export async function listPaymentsDue(kilnId: string) {
  const rows = await db
    .select()
    .from(people)
    .where(and(eq(people.kilnId, kilnId), ne(people.type, "CUSTOMER")));

  const results: { person: { id: string; name: string; type: string; phone: string | null }; amountDue: number }[] = [];
  for (const person of rows) {
    const entries = await db
      .select()
      .from(ledgerEntries)
      .where(and(eq(ledgerEntries.kilnId, kilnId), eq(ledgerEntries.personId, person._id)));
    const balance = Math.round(entries.reduce((sum, e) => sum + (e.direction === "DUE" ? e.amount : -e.amount), 0) * 100) / 100;
    if (balance > 0) {
      results.push({
        person: { id: person._id, name: person.name, type: person.type, phone: person.phone ?? null },
        amountDue: balance,
      });
    }
  }

  const [goodsDues, fuelDues] = await Promise.all([listSupplierDuesAcrossKiln(kilnId), totalFuelPurchaseSupplierDues(kilnId)]);
  const supplierDueById = new Map<string, { name: string; phone: string | null; amountDue: number }>();
  for (const { supplier, amountDue } of [...goodsDues, ...fuelDues]) {
    const existing = supplierDueById.get(supplier.id);
    supplierDueById.set(supplier.id, { name: supplier.name, phone: supplier.phone, amountDue: (existing?.amountDue ?? 0) + amountDue });
  }
  for (const [id, s] of supplierDueById) {
    results.push({ person: { id, name: s.name, type: "SUPPLIER", phone: s.phone }, amountDue: Math.round(s.amountDue * 100) / 100 });
  }

  return results.sort((a, b) => b.amountDue - a.amountDue);
}

// The sell-side mirror of listOutstandingAdvances: same "flag it before it
// becomes a bad debt" purpose, but here a positive balance means the
// *customer* owes the kiln (a sale on credit that outpaced payments)
// rather than the kiln owing them. Real sales/billing runs through the
// dedicated `customers`/`invoices` tables (Dispatch/Invoice flow), NOT
// `people`/`ledgerEntries` — this used to query `people.type = "CUSTOMER"`,
// a legacy/essentially-unused concept predating the Customer feature, which
// silently made this always read ~empty. Reuses getCustomerDetail's exact
// balance formula (customer.service.ts) so this can never drift from what
// a Customer's own profile page shows. daysPending is measured from the
// oldest invoice that still isn't fully paid.
export async function customerCreditAging(kilnId: string) {
  const customerRows = await db.select().from(customers).where(eq(customers.kilnId, kilnId));
  const currentSeasonId = await getCurrentSeasonId(kilnId);

  const results = [];
  for (const customer of customerRows) {
    const detail = await getCustomerDetail(kilnId, customer._id, currentSeasonId);
    if (detail.totalDue <= 0) continue;

    // invoices come back newest-first (see listInvoicesForCustomer) — the
    // oldest still-unpaid one is what actually determines urgency.
    const oldestUnpaidInvoice = [...detail.invoices]
      .reverse()
      .find((inv) => inv.bricksCount > 0 && (inv.amountPaidNow ?? inv.netAmount) < inv.netAmount);
    const oldestUnpaidDate = oldestUnpaidInvoice ? new Date(oldestUnpaidInvoice.invoiceDate ?? oldestUnpaidInvoice.createdAt ?? Date.now()) : undefined;
    const daysPending = oldestUnpaidDate ? Math.floor((Date.now() - oldestUnpaidDate.getTime()) / (1000 * 60 * 60 * 24)) : 0;

    results.push({
      person: { _id: customer._id, name: customer.name, phone: customer.phones?.[0] },
      outstandingCredit: detail.totalDue,
      daysPending,
      // `customers` carries no per-customer credit-limit field (unlike the
      // legacy `people.creditLimit`) — always false until/unless that's
      // added to the Customer model.
      overLimit: false,
    });
  }

  return results.sort((a, b) => b.daysPending - a.daysPending);
}
