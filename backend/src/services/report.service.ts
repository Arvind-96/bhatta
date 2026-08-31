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
import { listLandLeaseContracts } from "./landLeaseContract.service";
import { listBrickLoadingEntries } from "./brickLoading.service";
import { listDispatchesForCustomer } from "./dispatch.service";

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
    if (person.workType === "BHARAI_TRANSPORT" || person.workType === "BHARAI_CHAMBER_STACKING") {
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
