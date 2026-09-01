import fs from "fs";
import path from "path";
import PDFDocument from "pdfkit";
import { randomUUID } from "crypto";
import { and, desc, eq, gte, inArray, isNotNull, lt, lte } from "drizzle-orm";
import { db, DATA_DIR } from "../db/client";
import { kilns, people, salarySlips, ledgerEntries } from "../db/schema";
import { attendanceSummaryForMonth, MonthAttendanceSummary } from "./attendance.service";
import { addLedgerEntry, deleteLedgerEntry, updateLedgerEntry } from "./ledger.service";
import { emitToKiln } from "../config/socket";

const SLIPS_DIR = path.join(DATA_DIR, "salary-slips");
const DEVANAGARI_FONT = path.join(__dirname, "..", "..", "assets", "fonts", "NotoSansDevanagari-Regular.ttf");

function daysInMonth(year: number, month: number) {
  return new Date(year, month, 0).getDate();
}

function monthDateRange(year: number, month: number) {
  // `end` is midnight (00:00:00) on the month's last calendar day — the
  // same time-of-day convention every other ledger entry in this app
  // already uses (see the sample data: every non-salary entry is dated at
  // 00:00:00). A non-midnight time here is NOT safe: `ledger_entries.date`
  // round-trips through the DB as a naive datetime and gets displayed in
  // the *viewer's* local zone (India, UTC+5:30) — 23:59:59 shifts forward
  // across midnight into the next calendar day for any such viewer,
  // visibly mis-dating this month's SALARY ledger entry (see
  // generateSalarySlip below) by one day, and would even push it past
  // ledgerBalanceBefore's strict `lt` cutoff into the next month's
  // carriedForward instead of this one's.
  return { start: new Date(year, month - 1, 1), end: new Date(year, month, 0) };
}

// The Salary module's population: MUNIM/CHOWKIDAR, office-flagged HELPER,
// every DRIVER, and FITTER (kiln machinery staff paid monthly, with real
// salary-slip history even though they aren't on the Staff page's own
// roster) — NOT "anyone with monthlySalary set" (which used to also sweep
// in salaried Labour Contractors/Thekedars/piece-rate Workers, who belong
// to the People page's own Labour/Thekedar tabs and are paid via the
// ledger/WorkEntry system, not "Salary"), and not Suppliers, Partners, or
// Customers either (paid via their own supplier-invoice/ledger,
// partnership, and billing flows, not monthly payroll).
function isStaffPerson(person: { type: string; isOfficeStaff?: boolean | null }) {
  return (
    person.type === "MUNIM" ||
    person.type === "CHOWKIDAR" ||
    (person.type === "HELPER" && !!person.isOfficeStaff) ||
    person.type === "DRIVER" ||
    person.type === "FITTER"
  );
}

// Absent/Half-day reduce pay proportionally against the monthly rate; Late
// is tracked on the slip but doesn't reduce pay by default (see plan —
// easy to change to a fixed penalty later if that's wrong for this kiln).
function computeAbsenceDeduction(monthlySalary: number, year: number, month: number, summary: MonthAttendanceSummary) {
  const dailyRate = monthlySalary / daysInMonth(year, month);
  return Math.round((summary.daysAbsent * dailyRate + summary.daysHalfDay * dailyRate * 0.5) * 100) / 100;
}

// This person's ledger balance using only entries dated strictly before
// `beforeDate` — same sum(DUE) - sum(PAID) convention as
// listLedgerForPerson's own balance (positive = kiln owes them, negative
// = they've drawn more than earned). Used as the "carried forward"
// starting point for a given month's slip: as long as every month gets
// its own SALARY ledger entry posted (see generateSalarySlip below), this
// naturally accumulates an overdrawn or owed balance across months
// without any separate month-to-month bookkeeping.
async function ledgerBalanceBefore(kilnId: string, personId: string, beforeDate: Date): Promise<number> {
  const rows = await db
    .select({ direction: ledgerEntries.direction, amount: ledgerEntries.amount })
    .from(ledgerEntries)
    .where(and(eq(ledgerEntries.kilnId, kilnId), eq(ledgerEntries.personId, personId), lt(ledgerEntries.date, beforeDate)));
  return Math.round(rows.reduce((sum, e) => sum + (e.direction === "DUE" ? e.amount : -e.amount), 0) * 100) / 100;
}

const MONTH_NAMES_EN = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];
const MONTH_NAMES_HI = [
  "जनवरी", "फ़रवरी", "मार्च", "अप्रैल", "मई", "जून",
  "जुलाई", "अगस्त", "सितंबर", "अक्टूबर", "नवंबर", "दिसंबर",
];

interface SlipData {
  kilnName: string;
  personName: string;
  designation: string;
  year: number;
  month: number;
  summary: MonthAttendanceSummary;
  grossSalary: number;
  deductions: number;
  advanceDeducted: number;
  carriedForward: number;
  netSalary: number;
}

function renderPdf(data: SlipData, filePath: string, lang: "en" | "hi"): Promise<void> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: "A4", margin: 50 });
    const stream = fs.createWriteStream(filePath);
    doc.pipe(stream);
    stream.on("finish", resolve);
    stream.on("error", reject);

    if (lang === "hi") {
      doc.registerFont("body", DEVANAGARI_FONT);
      doc.font("body");
    } else {
      doc.font("Helvetica");
    }

    const t = (en: string, hi: string) => (lang === "hi" ? hi : en);
    const monthLabel = lang === "hi" ? MONTH_NAMES_HI[data.month - 1] : MONTH_NAMES_EN[data.month - 1];

    doc.fontSize(18).text(data.kilnName, { align: "center" });
    doc.moveDown(0.3);
    doc.fontSize(14).text(t("Salary Slip", "वेतन पर्ची"), { align: "center" });
    doc.moveDown(0.2);
    doc.fontSize(11).fillColor("#555").text(`${monthLabel} ${data.year}`, { align: "center" });
    doc.fillColor("#000");
    doc.moveDown(1.2);

    doc.fontSize(12);
    const headerRow = (label: string, value: string) => {
      doc.text(`${label}: ${value}`);
      doc.moveDown(0.4);
    };
    headerRow(t("Name", "नाम"), data.personName);
    headerRow(t("Designation", "पदनाम"), data.designation);
    doc.moveDown(0.6);

    // Two-column bordered grid: label cell + value cell per row, drawn
    // manually since pdfkit has no built-in table primitive.
    const tableLeft = doc.page.margins.left;
    const tableWidth = doc.page.width - doc.page.margins.left - doc.page.margins.right;
    const labelColWidth = tableWidth * 0.6;
    const rowHeight = 24;

    function drawTable(rows: Array<[string, string]>, opts?: { boldLastRow?: boolean }) {
      let y = doc.y;
      const tableTop = y;
      rows.forEach(([label, value], i) => {
        const rowTop = tableTop + i * rowHeight;
        const isLast = opts?.boldLastRow && i === rows.length - 1;
        doc.fontSize(isLast ? 13 : 11).font(lang === "hi" ? "body" : isLast ? "Helvetica-Bold" : "Helvetica");
        doc.rect(tableLeft, rowTop, labelColWidth, rowHeight).stroke("#ccc");
        doc.rect(tableLeft + labelColWidth, rowTop, tableWidth - labelColWidth, rowHeight).stroke("#ccc");
        doc.fillColor("#000").text(label, tableLeft + 8, rowTop + 6, { width: labelColWidth - 16 });
        doc.text(value, tableLeft + labelColWidth + 8, rowTop + 6, { width: tableWidth - labelColWidth - 16 });
      });
      doc.y = tableTop + rows.length * rowHeight;
      doc.font(lang === "hi" ? "body" : "Helvetica").fontSize(12);
    }

    drawTable([
      [t("Days in Month", "महीने के दिन"), String(data.summary.daysInMonth)],
      [t("Days Present", "उपस्थित दिन"), String(data.summary.daysPresent)],
      [t("Days Absent", "अनुपस्थित दिन"), String(data.summary.daysAbsent)],
      [t("Half Days", "आधा दिन"), String(data.summary.daysHalfDay)],
      [t("Late Days", "देर से आने के दिन"), String(data.summary.daysLate)],
    ]);
    doc.moveDown(0.8);

    drawTable(
      [
        [t("Gross Salary", "सकल वेतन"), `Rs. ${data.grossSalary.toLocaleString("en-IN")}`],
        [t("Deductions (Absence)", "कटौती (अनुपस्थिति)"), `Rs. ${data.deductions.toLocaleString("en-IN")}`],
        ...(data.advanceDeducted > 0
          ? [[t("Advance/Kharchi/Medical Deducted", "एडवांस/खर्ची/मेडिकल काटा गया"), `Rs. ${data.advanceDeducted.toLocaleString("en-IN")}`] as [string, string]]
          : []),
        ...(data.carriedForward !== 0
          ? [
              data.carriedForward < 0
                ? ([t("Carried Forward (overdrawn last month)", "पिछले महीने से अधिक लिया (आगे बढ़ाया गया)"), `Rs. ${Math.abs(data.carriedForward).toLocaleString("en-IN")}`] as [string, string])
                : ([t("Carried Forward (owed from last month)", "पिछले महीने से बकाया (आगे बढ़ाया गया)"), `Rs. ${data.carriedForward.toLocaleString("en-IN")}`] as [string, string]),
            ]
          : []),
        data.netSalary < 0
          ? [t("Overdrawn (owed back)", "अधिक लिया गया (वापस देय)"), `Rs. ${Math.abs(data.netSalary).toLocaleString("en-IN")}`]
          : [t("Net Salary", "कुल वेतन"), `Rs. ${data.netSalary.toLocaleString("en-IN")}`],
      ],
      { boldLastRow: true }
    );

    doc.moveDown(1.5);
    doc.fontSize(9).fillColor("#888").text(`${t("Generated on", "जनरेट किया गया")}: ${new Date().toLocaleDateString("en-IN")}`);

    doc.end();
  });
}

export async function generateSalarySlip(kilnId: string, personId: string, month: string) {
  const [year, monthNum] = month.split("-").map(Number);

  const [kiln, person] = await Promise.all([
    db.select().from(kilns).where(eq(kilns._id, kilnId)).then((r) => r[0]),
    db.select().from(people).where(and(eq(people._id, personId), eq(people.kilnId, kilnId))).then((r) => r[0]),
  ]);
  if (!kiln) throw new Error("Kiln not found");
  if (!person) throw new Error("Person not found in this kiln");
  if (!person.monthlySalary) throw new Error("This person has no monthly salary set");

  const summary = await attendanceSummaryForMonth(kilnId, personId, year, monthNum);

  // Advance/Kharchi/Medical-category ledger entries dated within this
  // slip's month — money already handed to this person this month,
  // recovered against pay the same way a real payroll advance is settled
  // at salary time. Previously ADVANCE-only, which silently ignored
  // Kharchi (daily allowance) and Medical payments made the same month,
  // understating how much had already been drawn — same 3-category
  // "money already given" bucket molding.service.ts's
  // advanceDeductedForWorkers already uses for gang workers.
  const { start, end } = monthDateRange(year, monthNum);
  const advanceRows = await db
    .select()
    .from(ledgerEntries)
    .where(
      and(
        eq(ledgerEntries.kilnId, kilnId),
        eq(ledgerEntries.personId, personId),
        eq(ledgerEntries.direction, "PAID"),
        inArray(ledgerEntries.category, ["ADVANCE", "KHARCHI", "MEDICAL"]),
        gte(ledgerEntries.date, start),
        lte(ledgerEntries.date, end)
      )
    );
  const advanceDeducted = Math.round(advanceRows.reduce((sum, e) => sum + e.amount, 0) * 100) / 100;

  const deductions = computeAbsenceDeduction(person.monthlySalary, year, monthNum, summary);
  const thisMonthEarned = Math.round((person.monthlySalary - deductions) * 100) / 100;

  // Carried forward from every prior month's own SALARY-vs-advances net,
  // via this person's real ledger balance as of the start of this month —
  // see ledgerBalanceBefore's own comment. Positive = kiln still owed
  // them from before, negative = they'd drawn more than earned, either
  // way folded straight into this month's net pay below rather than
  // resetting every month.
  const carriedForward = await ledgerBalanceBefore(kilnId, personId, start);
  const netSalary = Math.round((carriedForward + thisMonthEarned - advanceDeducted) * 100) / 100;

  const existingBeforeSlip = (
    await db
      .select()
      .from(salarySlips)
      .where(and(eq(salarySlips.personId, personId), eq(salarySlips.month, month)))
  )[0];

  // Posts (or updates, on regeneration) the ledger entry that makes the
  // carry-forward above actually work: this month's earned pay as a real
  // SALARY-category DUE entry, so it nets against whatever
  // Advance/Kharchi/Medical was PAID out — and so this person's own
  // Financial Ledger ("Total Earnings") reflects real salary instead of
  // staying at zero forever. `end` (last calendar day) is used rather
  // than `start` so this entry always sorts after every other entry
  // dated within the same month, matching a real "posted at month-end"
  // payroll run.
  const monthLabel = `${MONTH_NAMES_EN[monthNum - 1]} ${year}`;
  const salaryLedgerReason = `Salary earned — ${monthLabel}`;
  let salaryLedgerEntryId = existingBeforeSlip?.salaryLedgerEntryId ?? null;
  if (salaryLedgerEntryId) {
    await updateLedgerEntry(kilnId, salaryLedgerEntryId, { amount: thisMonthEarned, date: end, reason: salaryLedgerReason });
  } else {
    const entry = await addLedgerEntry({
      kilnId,
      personId,
      direction: "DUE",
      amount: thisMonthEarned,
      reason: salaryLedgerReason,
      date: end,
      category: "SALARY",
    });
    salaryLedgerEntryId = entry._id;
  }

  const dir = path.join(SLIPS_DIR, kilnId, personId);
  fs.mkdirSync(dir, { recursive: true });
  const pdfPathEn = path.join(dir, `${month}-en.pdf`);
  const pdfPathHi = path.join(dir, `${month}-hi.pdf`);

  const slipData: SlipData = {
    kilnName: kiln.name,
    personName: person.name,
    designation: person.designation ?? person.type,
    year,
    month: monthNum,
    summary,
    grossSalary: person.monthlySalary,
    deductions,
    advanceDeducted,
    carriedForward,
    netSalary,
  };
  await Promise.all([renderPdf(slipData, pdfPathEn, "en"), renderPdf(slipData, pdfPathHi, "hi")]);

  const values = {
    kilnId,
    personId,
    month,
    daysPresent: summary.daysPresent,
    daysAbsent: summary.daysAbsent,
    daysHalfDay: summary.daysHalfDay,
    daysLate: summary.daysLate,
    grossSalary: person.monthlySalary,
    deductions,
    advanceDeducted,
    carriedForward,
    netSalary,
    pdfPathEn,
    pdfPathHi,
    salaryLedgerEntryId,
  };

  if (existingBeforeSlip) {
    await db.update(salarySlips).set(values).where(eq(salarySlips._id, existingBeforeSlip._id));
  } else {
    await db.insert(salarySlips).values({ _id: randomUUID(), ...values });
  }

  const slip = (await db.select().from(salarySlips).where(and(eq(salarySlips.personId, personId), eq(salarySlips.month, month))))[0]!;
  emitToKiln(kilnId, "salary:update", slip);
  return slip;
}

// Called by the cron job on the 1st of each month (generates the just-
// completed month), and available for a manual re-run. Idempotent: an
// existing slip for the same person+month is simply regenerated with
// current attendance data, never duplicated (unique index on personId+month).
export async function runMonthlySalaryGeneration(month?: string) {
  const targetMonth = month ?? previousMonthString();
  const rows = await db
    .select({ _id: people._id, kilnId: people.kilnId, type: people.type, isOfficeStaff: people.isOfficeStaff })
    .from(people)
    .where(and(isNotNull(people.monthlySalary), eq(people.active, true)));
  const salariedPeople = rows.filter(isStaffPerson);

  const results: { personId: string; ok: boolean; error?: string }[] = [];
  for (const p of salariedPeople) {
    try {
      await generateSalarySlip(p.kilnId, p._id, targetMonth);
      results.push({ personId: p._id, ok: true });
    } catch (err) {
      results.push({ personId: p._id, ok: false, error: (err as Error).message });
    }
  }
  return { month: targetMonth, generated: results.filter((r) => r.ok).length, failed: results.filter((r) => !r.ok) };
}

// The Salary page's "Generate now" button — scoped to one kiln, unlike the
// cron sweep above which runs across every kiln in the system.
export async function generateForKiln(kilnId: string, month?: string) {
  const targetMonth = month ?? previousMonthString();
  const rows = await db
    .select({ _id: people._id, type: people.type, isOfficeStaff: people.isOfficeStaff })
    .from(people)
    .where(and(eq(people.kilnId, kilnId), isNotNull(people.monthlySalary), eq(people.active, true)));
  const salariedPeople = rows.filter(isStaffPerson);

  const results: { personId: string; ok: boolean; error?: string }[] = [];
  for (const p of salariedPeople) {
    try {
      await generateSalarySlip(kilnId, p._id, targetMonth);
      results.push({ personId: p._id, ok: true });
    } catch (err) {
      results.push({ personId: p._id, ok: false, error: (err as Error).message });
    }
  }
  return { month: targetMonth, generated: results.filter((r) => r.ok).length, failed: results.filter((r) => !r.ok) };
}

export function previousMonthString(reference = new Date()) {
  const d = new Date(reference.getFullYear(), reference.getMonth() - 1, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

export function currentMonthString(reference = new Date()) {
  return `${reference.getFullYear()}-${String(reference.getMonth() + 1).padStart(2, "0")}`;
}

// Salary page: every payroll-eligible person in the kiln (see
// isStaffPerson), with their slip for the given month if one's been
// generated yet (so the UI can show "generated"/"pending" per person
// without a second round trip). A staff member with no monthlySalary set
// yet still shows (as permanently "pending" until one's set).
export async function listSalaryStatus(kilnId: string, month: string) {
  const rows = await db
    .select()
    .from(people)
    .where(and(eq(people.kilnId, kilnId), eq(people.active, true)));
  const salariedPeople = rows.filter(isStaffPerson);
  if (salariedPeople.length === 0) return [];

  const personIds = salariedPeople.map((p) => p._id);
  const slips = await db
    .select()
    .from(salarySlips)
    .where(and(inArray(salarySlips.personId, personIds), eq(salarySlips.month, month)));
  const slipByPerson = new Map(slips.map((s) => [s.personId, s]));

  return salariedPeople.map((p) => ({
    person: { _id: p._id, name: p.name, designation: p.designation ?? p.type, monthlySalary: p.monthlySalary },
    slip: slipByPerson.get(p._id) ?? null,
  }));
}

export interface ListSalarySlipsForKilnFilter {
  personId?: string;
  from?: Date;
  to?: Date;
}

// Kiln-wide across every staff member's slips, optionally scoped to one
// person and/or a month range (month is compared as its first-of-month
// date, since `month` is stored as a plain "YYYY-MM" string) — contrast
// with listSalaryStatus above, which is always scoped to exactly one month.
export async function listSalarySlipsForKiln(kilnId: string, filter: ListSalarySlipsForKilnFilter = {}) {
  const conditions = [eq(salarySlips.kilnId, kilnId)];
  if (filter.personId) conditions.push(eq(salarySlips.personId, filter.personId));
  if (filter.from) conditions.push(gte(salarySlips.month, `${filter.from.getFullYear()}-${String(filter.from.getMonth() + 1).padStart(2, "0")}`));
  if (filter.to) conditions.push(lte(salarySlips.month, `${filter.to.getFullYear()}-${String(filter.to.getMonth() + 1).padStart(2, "0")}`));

  const rows = await db.select().from(salarySlips).where(and(...conditions)).orderBy(desc(salarySlips.month));
  const personIds = [...new Set(rows.map((r) => r.personId))];
  if (personIds.length === 0) return rows;
  const peopleRows = await db.select({ _id: people._id, name: people.name, designation: people.designation, type: people.type }).from(people).where(inArray(people._id, personIds));
  const personById = new Map(peopleRows.map((p) => [p._id, p]));
  return rows.map((r) => ({ ...r, personId: personById.get(r.personId) ?? r.personId }));
}

export async function listSlipsForPerson(kilnId: string, personId: string) {
  return await db
    .select()
    .from(salarySlips)
    .where(and(eq(salarySlips.kilnId, kilnId), eq(salarySlips.personId, personId)))
    .orderBy(desc(salarySlips.month));
}

export async function getSlipFile(kilnId: string, slipId: string, lang: "en" | "hi") {
  const slip = (await db.select().from(salarySlips).where(and(eq(salarySlips._id, slipId), eq(salarySlips.kilnId, kilnId))))[0];
  if (!slip) throw new Error("Salary slip not found");
  return lang === "hi" ? slip.pdfPathHi : slip.pdfPathEn;
}

export interface UpdateSalarySlipInput {
  deductions?: number;
  advanceDeducted?: number;
  netSalary?: number;
}

// A manual correction to an already-generated slip's final numbers — for
// when the automatic attendance/advance-based calculation needs
// overriding (a late attendance fix, a one-off adjustment the admin wants
// to apply directly) rather than regenerating from scratch. Does not
// re-render the PDF; the stored numbers are the source of truth shown on
// the slip's profile-page entry, the PDF stays as originally generated.
export async function updateSalarySlip(kilnId: string, slipId: string, input: UpdateSalarySlipInput) {
  const existing = (await db.select().from(salarySlips).where(and(eq(salarySlips._id, slipId), eq(salarySlips.kilnId, kilnId))))[0];
  if (!existing) throw new Error("Salary slip not found in this kiln");
  await db.update(salarySlips).set(input).where(eq(salarySlips._id, slipId));
  const updated = (await db.select().from(salarySlips).where(eq(salarySlips._id, slipId)))[0]!;
  emitToKiln(kilnId, "salary:update", updated);
  return updated;
}

export async function deleteSalarySlip(kilnId: string, slipId: string) {
  const existing = (await db.select().from(salarySlips).where(and(eq(salarySlips._id, slipId), eq(salarySlips.kilnId, kilnId))))[0];
  if (!existing) throw new Error("Salary slip not found in this kiln");
  await db.delete(salarySlips).where(eq(salarySlips._id, slipId));
  // Also removes the linked SALARY ledger entry (see generateSalarySlip's
  // salaryLedgerEntryId) — otherwise this month's "earned" entry would
  // linger in the ledger even though the slip claiming it now doesn't
  // exist, corrupting every later month's carried-forward balance.
  if (existing.salaryLedgerEntryId) {
    await deleteLedgerEntry(kilnId, existing.salaryLedgerEntryId).catch(() => {});
  }
  for (const p of [existing.pdfPathEn, existing.pdfPathHi]) {
    fs.rm(p, { force: true }, () => {});
  }
  emitToKiln(kilnId, "salary:update", { _id: slipId, deleted: true });
}
