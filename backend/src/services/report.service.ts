import { getPersonWithBalance } from "./person.service";
import { listLedgerForPerson } from "./ledger.service";
import { listPaymentReceipts } from "./paymentReceipt.service";
import { listWorkEntries } from "./workEntry.service";
import { getFamilyForPerson } from "./familyMember.service";
import { listSuppliedItems } from "./suppliedItem.service";
import { listSlipsForPerson } from "./salary.service";
import { listAttendanceForPerson } from "./attendance.service";
import { listStackingEntries } from "./stacking.service";
import { listNikasiEntries } from "./nikasi.service";
import { moldingContractorSummary } from "./molding.service";
import { listFiringShifts } from "./firingShift.service";
import { listSoilArrivals } from "./soilArrival.service";
import { listSoilContracts } from "./soilContract.service";
import { listSandDeliveries } from "./sandDelivery.service";
import { listSandContracts } from "./sandContract.service";
import { listLandLeaseContracts } from "./landLeaseContract.service";
import { listBrickLoadingEntries } from "./brickLoading.service";
import { listDispatchesForCustomer } from "./dispatch.service";
import { listDoctorVisits } from "./doctorVisit.service";

// One complete "everything about this person, from the start of records to
// now" report, fanning out to each module's own already-scoped list
// function rather than querying tables directly — this is the same fan-out
// every bespoke person/contractor detail page already does client-side,
// just unified server-side and reachable for ANY person from one search
// box, not gated behind knowing their type/tab first. `sections` only ever
// contains the keys relevant to this person's type/workType, so the
// frontend can render whatever's present without its own type branching.
export async function getPersonFullReport(kilnId: string, personId: string) {
  const { person, balance } = await getPersonWithBalance(kilnId, personId);

  const sections: Record<string, unknown> = {};

  const [ledger, paymentReceipts] = await Promise.all([
    listLedgerForPerson(kilnId, personId),
    listPaymentReceipts(kilnId, null, personId),
  ]);
  sections.ledger = ledger;
  sections.paymentReceipts = paymentReceipts;

  // Bug fix: a doctor visit can be logged against ANY person (personId on
  // doctorVisits isn't gated to a specific PersonType) — but this report
  // never attached them, so the one place explicitly designed to show
  // "everything about this person, from one search box" had no doctor-
  // visit section for anyone, ever. They only ever surfaced indirectly as
  // a generic "Doctor / Medical" line in the Expenses report, with no way
  // to see "every time this specific person got sick" from their own
  // profile.
  const doctorVisits = await listDoctorVisits(kilnId, { personId });
  if (doctorVisits.length > 0) sections.doctorVisits = doctorVisits;

  const isLabourish = person.type === "WORKER" || person.type === "HELPER" || person.type === "LABOUR_CONTRACTOR";
  if (isLabourish) {
    sections.workEntries = await listWorkEntries(kilnId, null, { personId });
  }

  if (person.type === "WORKER" || person.type === "HELPER") {
    const [family, suppliedItems] = await Promise.all([
      getFamilyForPerson(kilnId, personId),
      listSuppliedItems(kilnId, null, personId),
    ]);
    sections.family = family;
    sections.suppliedItems = suppliedItems;
  }

  // Matches StaffDetailPage's own eligibility rule for showing
  // attendance/salary — anyone with a monthlySalary set, regardless of
  // their base PersonType.
  if (person.monthlySalary != null) {
    const [salarySlips, attendance] = await Promise.all([
      listSlipsForPerson(kilnId, personId),
      listAttendanceForPerson(kilnId, personId),
    ]);
    sections.salarySlips = salarySlips;
    sections.attendance = attendance;
  }

  if (person.type === "LABOUR_CONTRACTOR") {
    if (person.workType === "BHARAI_PHAD_TO_STOCK" || person.workType === "BHARAI_STOCK_TO_CHAMBER") {
      sections.stackingEntries = await listStackingEntries(kilnId, null, { gangId: personId });
    } else if (person.workType === "NIKASI") {
      sections.nikasiEntries = await listNikasiEntries(kilnId, null, { gangId: personId });
    } else if (person.workType === "PATHAI") {
      // moldingContractorSummary is kiln-wide (every Pathai contractor at
      // once) — narrowed to this one contractor rather than writing a
      // second, single-contractor query that would have to duplicate its
      // gang/ledger aggregation logic. null = every season, matching this
      // report's own "from the start of records to now" scope.
      const summary = await moldingContractorSummary(kilnId, null);
      sections.moldingContractor = summary.contractors.find((c) => c.contractor.id === personId) ?? null;
    }
  }

  if (person.type === "FITTER") {
    sections.firingShifts = await listFiringShifts(kilnId, null, { fitterId: personId });
  }

  if (person.type === "LANDOWNER") {
    const [soilArrivals, soilContracts] = await Promise.all([
      listSoilArrivals(kilnId, null, { landownerId: personId }),
      listSoilContracts(kilnId, { landownerId: personId }),
    ]);
    sections.soilArrivals = soilArrivals;
    sections.soilContracts = soilContracts;
  }

  // Bug fix: every other contract-bearing person type (LANDOWNER above,
  // LAND_LEASE below) already had its contracts/deliveries attached here —
  // SAND_CONTRACTOR was simply missed, so searching one from the Reports
  // page's "search any person" box returned only ledger entries, none of
  // their actual sand contracts/deliveries.
  if (person.type === "SAND_CONTRACTOR") {
    const [sandDeliveries, sandContracts] = await Promise.all([
      listSandDeliveries(kilnId, null, { sandContractorId: personId }),
      listSandContracts(kilnId, { sandContractorId: personId }),
    ]);
    sections.sandDeliveries = sandDeliveries;
    sections.sandContracts = sandContracts;
  }

  if (person.type === "LAND_LEASE") {
    sections.landLeaseContracts = await listLandLeaseContracts(kilnId, { landLeaseId: personId });
  }

  if (person.type === "DRIVER") {
    sections.brickLoadingEntries = await listBrickLoadingEntries(kilnId, null, { driverId: personId });
  }

  if (person.type === "CUSTOMER") {
    sections.dispatches = await listDispatchesForCustomer(kilnId, personId);
  }

  return { person, balance, sections };
}
