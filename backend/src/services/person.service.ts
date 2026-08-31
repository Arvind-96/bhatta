import { randomUUID } from "crypto";
import fs from "fs";
import path from "path";
import { and, asc, eq, inArray, ne, or, sql } from "drizzle-orm";
import { db, DATA_DIR } from "../db/client";
import { people, ledgerEntries, customers, PERSON_TYPES, SEX_OPTIONS, WORK_TYPES } from "../db/schema";
import { getCustomerDetail } from "./customer.service";
import { getCurrentSeasonId } from "./season.util";
import { emitToKiln } from "../config/socket";

export type PersonType = (typeof PERSON_TYPES)[number];
export type Sex = (typeof SEX_OPTIONS)[number];
export type WorkType = (typeof WORK_TYPES)[number];

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
  stackingStage?: "TRANSPORT" | "CHAMBER_STACKING";
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

// The two Bharai work types correspond 1:1 to stackingStage, which is what
// actually drives the Bharai page's gang filtering — kept in sync so a
// labourer created from the simplified Add Labour form immediately shows
// up in the right Bharai stage without a second edit. Only fills the gap
// when the caller hasn't set stackingStage explicitly themselves.
function deriveStackingStage(input: { workType?: WorkType; stackingStage?: "TRANSPORT" | "CHAMBER_STACKING" }) {
  if (input.stackingStage) return input.stackingStage;
  if (input.workType === "BHARAI_TRANSPORT") return "TRANSPORT" as const;
  if (input.workType === "BHARAI_CHAMBER_STACKING") return "CHAMBER_STACKING" as const;
  return input.stackingStage;
}

export async function createPerson(input: CreatePersonInput) {
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
  // "Landowner - N" / "Sand - N", simple per-kiln count-based sequences —
  // both types are added one at a time by a single admin, not a
  // high-concurrency flow like dispatch slip numbers, so this skips that
  // flow's retry-on-collision machinery as unnecessary complexity here.
  let landownerSerial: number | undefined;
  if (input.type === "LANDOWNER") {
    const countRow = (await db.select({ count: sql<number>`count(*)` }).from(people).where(and(eq(people.kilnId, input.kilnId), eq(people.type, "LANDOWNER"))))[0];
    landownerSerial = (countRow?.count ?? 0) + 1;
  }
  let sandContractorSerial: number | undefined;
  if (input.type === "SAND_CONTRACTOR") {
    const countRow = (await db.select({ count: sql<number>`count(*)` }).from(people).where(and(eq(people.kilnId, input.kilnId), eq(people.type, "SAND_CONTRACTOR"))))[0];
    sandContractorSerial = (countRow?.count ?? 0) + 1;
  }
  const _id = randomUUID();
  await db.insert(people).values({ ...input, _id, stackingStage: deriveStackingStage(input), landownerSerial, sandContractorSerial });
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

export async function listPeople(kilnId: string, type?: PersonType) {
  const conditions = [eq(people.kilnId, kilnId), eq(people.active, true)];
  if (type) conditions.push(eq(people.type, type));
  const rows = await db.select().from(people).where(and(...conditions)).orderBy(asc(people.name));
  if (type && type !== "LANDOWNER") return rows;
  const serials = await computeLandownerSerials(kilnId);
  return rows.map((r) => (r.type === "LANDOWNER" ? { ...r, landownerSerial: serials.get(r._id) ?? r.landownerSerial } : r));
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

export async function getPersonWithBalance(kilnId: string, personId: string) {
  const person = (await db.select().from(people).where(and(eq(people._id, personId), eq(people.kilnId, kilnId))))[0];
  if (!person) throw new Error("Person not found");
  const balance = await getBalance(kilnId, personId);
  if (person.type === "LANDOWNER") {
    const serials = await computeLandownerSerials(kilnId);
    person.landownerSerial = serials.get(person._id) ?? person.landownerSerial;
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

  await db.update(people)
    .set({ ...input, stackingStage: deriveStackingStage(input) })
    .where(and(eq(people._id, personId), eq(people.kilnId, kilnId)));
  const person = (await db.select().from(people).where(eq(people._id, personId)))[0]!;
  emitToKiln(kilnId, "person:update", person);
  return person;
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
export async function listOutstandingAdvances(kilnId: string) {
  const rows = await db
    .select()
    .from(people)
    .where(and(eq(people.kilnId, kilnId), inArray(people.type, ["WORKER", "HELPER", "LABOUR_CONTRACTOR"])));

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
export async function listPaymentsDue(kilnId: string) {
  const rows = await db
    .select()
    .from(people)
    .where(and(eq(people.kilnId, kilnId), ne(people.type, "CUSTOMER")));

  const results = [];
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
