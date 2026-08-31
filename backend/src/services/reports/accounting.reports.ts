import { listPaymentsDue, customerCreditAging, personLedgerBalances } from "../person.service";
import { listCustomers, getCustomerDetail } from "../customer.service";
import { listSuppliers } from "../supplier.service";
import { getSupplierDetail } from "../supplierInvoice.service";
import { listExpenseTypes, getExpenseTypeDetail } from "../expenseType.service";
import { getCurrentSeasonId } from "../season.util";
import { dayBook } from "../dayBook.service";
import { listReturnedDispatches } from "../dispatch.service";
import { listBrickLoadingEntries } from "../brickLoading.service";
import { ReportDefinition, round2 } from "./types";

// "Debtors" (owe the kiln money) and "Creditors" (the kiln owes them) in
// one combined list — reuses each subledger's own existing balance
// function rather than recomputing any of them (listPaymentsDue/
// customerCreditAging from person.service.ts, getSupplierDetail from
// supplierInvoice.service.ts), per the app's four-independent-subledgers
// reality (see the schema exploration this feature was planned against).
const debtorsAndCreditors: ReportDefinition = {
  key: "debtorsAndCreditors",
  titleKey: "reports.title.debtorsAndCreditors",
  async run(kilnId) {
    const [creditorRows, debtorRows, allSuppliers] = await Promise.all([listPaymentsDue(kilnId), customerCreditAging(kilnId), listSuppliers(kilnId)]);

    const rows: { name: string; type: string; phone: string; amount: number }[] = [];
    for (const r of creditorRows) rows.push({ name: r.person.name, type: "Creditor (people)", phone: r.person.phone ?? "", amount: r.amountDue });
    for (const r of debtorRows) rows.push({ name: r.person.name, type: "Debtor (customer)", phone: r.person.phone ?? "", amount: r.outstandingCredit });
    for (const s of allSuppliers) {
      const detail = await getSupplierDetail(kilnId, s._id);
      if (detail.totalDue > 0) rows.push({ name: s.name, type: "Creditor (supplier)", phone: "", amount: round2(detail.totalDue) });
    }

    rows.sort((a, b) => b.amount - a.amount);
    return {
      reportKey: "debtorsAndCreditors",
      titleKey: "reports.title.debtorsAndCreditors",
      columns: [
        { key: "name", labelKey: "reports.col.name", format: "text" },
        { key: "type", labelKey: "reports.col.accountType", format: "text" },
        { key: "phone", labelKey: "reports.col.phone", format: "text" },
        { key: "amount", labelKey: "reports.col.amount", format: "currency" },
      ],
      rows,
      totals: { amount: round2(rows.reduce((s, r) => s + r.amount, 0)) },
    };
  },
};

// Every "account" this app implicitly keeps a balance for (people ledger,
// customers, suppliers, expense types), each with its own existing balance
// formula — an informed approximation of a Trial Balance, not a real
// chart-of-accounts one (this app has no double-entry ledger to draw a
// literal Trial Balance from). Dr = the account owes the kiln (or the kiln
// paid out more than billed there); Cr = the kiln owes the account.
async function allAccountBalances(kilnId: string): Promise<{ name: string; type: string; debit: number; credit: number }[]> {
  const currentSeasonId = await getCurrentSeasonId(kilnId);
  const rows: { name: string; type: string; debit: number; credit: number }[] = [];

  const peopleBalances = await personLedgerBalances(kilnId);
  for (const p of peopleBalances) {
    if (p.balance > 0) rows.push({ name: p.person.name, type: p.person.type, debit: 0, credit: p.balance });
    else if (p.balance < 0) rows.push({ name: p.person.name, type: p.person.type, debit: -p.balance, credit: 0 });
    else rows.push({ name: p.person.name, type: p.person.type, debit: 0, credit: 0 });
  }

  const allCustomers = await listCustomers(kilnId);
  for (const c of allCustomers) {
    const detail = await getCustomerDetail(kilnId, c._id, currentSeasonId);
    if (detail.totalDue > 0) rows.push({ name: c.name, type: "CUSTOMER", debit: round2(detail.totalDue), credit: 0 });
    else if (detail.totalDue < 0) rows.push({ name: c.name, type: "CUSTOMER", debit: 0, credit: round2(-detail.totalDue) });
    else rows.push({ name: c.name, type: "CUSTOMER", debit: 0, credit: 0 });
  }

  const allSuppliers = await listSuppliers(kilnId);
  for (const s of allSuppliers) {
    const detail = await getSupplierDetail(kilnId, s._id);
    if (detail.totalDue > 0) rows.push({ name: s.name, type: "SUPPLIER", debit: 0, credit: round2(detail.totalDue) });
    else rows.push({ name: s.name, type: "SUPPLIER", debit: 0, credit: 0 });
  }

  const allExpenseTypes = await listExpenseTypes(kilnId);
  for (const et of allExpenseTypes) {
    const detail = await getExpenseTypeDetail(kilnId, et._id, currentSeasonId);
    if (detail.totalDue > 0) rows.push({ name: et.name, type: "EXPENSE_TYPE", debit: round2(detail.totalDue), credit: 0 });
    else if (detail.totalDue < 0) rows.push({ name: et.name, type: "EXPENSE_TYPE", debit: 0, credit: round2(-detail.totalDue) });
    else rows.push({ name: et.name, type: "EXPENSE_TYPE", debit: 0, credit: 0 });
  }

  return rows;
}

const trialBalance: ReportDefinition = {
  key: "trialBalance",
  titleKey: "reports.title.trialBalance",
  async run(kilnId) {
    const rows = (await allAccountBalances(kilnId)).filter((r) => r.debit !== 0 || r.credit !== 0);
    return {
      reportKey: "trialBalance",
      titleKey: "reports.title.trialBalance",
      columns: [
        { key: "name", labelKey: "reports.col.name", format: "text" },
        { key: "type", labelKey: "reports.col.accountType", format: "text" },
        { key: "debit", labelKey: "reports.col.debit", format: "currency" },
        { key: "credit", labelKey: "reports.col.credit", format: "currency" },
      ],
      rows,
      totals: { debit: round2(rows.reduce((s, r) => s + r.debit, 0)), credit: round2(rows.reduce((s, r) => s + r.credit, 0)) },
    };
  },
};

const nilAccounts: ReportDefinition = {
  key: "nilAccounts",
  titleKey: "reports.title.nilAccounts",
  async run(kilnId) {
    const rows = (await allAccountBalances(kilnId)).filter((r) => r.debit === 0 && r.credit === 0).map((r) => ({ name: r.name, type: r.type }));
    return {
      reportKey: "nilAccounts",
      titleKey: "reports.title.nilAccounts",
      columns: [
        { key: "name", labelKey: "reports.col.name", format: "text" },
        { key: "type", labelKey: "reports.col.accountType", format: "text" },
      ],
      rows,
    };
  },
};

const dayBookReport: ReportDefinition = {
  key: "dayBook",
  titleKey: "reports.title.dayBook",
  async run(kilnId, filters) {
    const date = filters.from ?? new Date();
    const entries = await dayBook(kilnId, date);
    const detail = entries.map((e) => ({
      time: e.time ? e.time.toISOString() : null,
      type: e.type,
      party: e.party,
      description: e.description,
      cashAmount: e.direction === "OUT" ? -e.cashAmount : e.cashAmount,
      onlineAmount: e.direction === "OUT" ? -e.onlineAmount : e.onlineAmount,
    }));
    return {
      reportKey: "dayBook",
      titleKey: "reports.title.dayBook",
      columns: [
        { key: "time", labelKey: "reports.col.date", format: "date" },
        { key: "type", labelKey: "reports.col.transactionType", format: "text" },
        { key: "party", labelKey: "reports.col.party", format: "text" },
        { key: "description", labelKey: "reports.col.description", format: "text" },
        { key: "cashAmount", labelKey: "reports.col.cashAmount", format: "currency" },
        { key: "onlineAmount", labelKey: "reports.col.onlineAmount", format: "currency" },
      ],
      rows: detail,
      totals: {
        cashAmount: round2(detail.reduce((s, r) => s + r.cashAmount, 0)),
        onlineAmount: round2(detail.reduce((s, r) => s + r.onlineAmount, 0)),
      },
    };
  },
};

const cashReturns: ReportDefinition = {
  key: "cashReturns",
  titleKey: "reports.title.cashReturns",
  async run(kilnId, filters) {
    const rows = await listReturnedDispatches(kilnId, { from: filters.from, to: filters.to });
    const detail = rows.map((r) => ({
      date: r.dispatchedOn ? r.dispatchedOn.toISOString() : null,
      serial: r.slipNumber,
      customer: r.customerName,
      breakageCount: r.breakageCount ?? 0,
      returnedCount: r.returnedCount ?? 0,
      returnReason: r.returnReason ?? "",
    }));
    return {
      reportKey: "cashReturns",
      titleKey: "reports.title.cashReturns",
      columns: [
        { key: "date", labelKey: "reports.col.date", format: "date" },
        { key: "serial", labelKey: "reports.col.serial", format: "text" },
        { key: "customer", labelKey: "reports.col.customer", format: "text" },
        { key: "breakageCount", labelKey: "reports.col.breakageCount", format: "number" },
        { key: "returnedCount", labelKey: "reports.col.returnedCount", format: "number" },
        { key: "returnReason", labelKey: "reports.col.returnReason", format: "text" },
      ],
      rows: detail,
      totals: { breakageCount: detail.reduce((s, r) => s + r.breakageCount, 0), returnedCount: detail.reduce((s, r) => s + r.returnedCount, 0) },
    };
  },
};

const extraCharges: ReportDefinition = {
  key: "extraCharges",
  titleKey: "reports.title.extraCharges",
  async run(kilnId, filters) {
    const rows = await listBrickLoadingEntries(kilnId, null, { from: filters.from, to: filters.to });
    const detail = rows
      .filter((r) => (r.loadingCharge ?? 0) > 0 || (r.unloadingCharge ?? 0) > 0)
      .map((r) => ({
        date: r.date ? r.date.toISOString() : null,
        driver: r.driverName ?? "",
        vehicleNumber: r.vehicleNumber ?? "",
        loadingCharge: r.loadingCharge ?? 0,
        unloadingCharge: r.unloadingCharge ?? 0,
      }));
    return {
      reportKey: "extraCharges",
      titleKey: "reports.title.extraCharges",
      columns: [
        { key: "date", labelKey: "reports.col.date", format: "date" },
        { key: "driver", labelKey: "reports.col.driver", format: "text" },
        { key: "vehicleNumber", labelKey: "reports.col.vehicleNumber", format: "text" },
        { key: "loadingCharge", labelKey: "reports.col.loadingCharge", format: "currency" },
        { key: "unloadingCharge", labelKey: "reports.col.unloadingCharge", format: "currency" },
      ],
      rows: detail,
      totals: {
        loadingCharge: round2(detail.reduce((s, r) => s + r.loadingCharge, 0)),
        unloadingCharge: round2(detail.reduce((s, r) => s + r.unloadingCharge, 0)),
      },
    };
  },
};

export const accountingReports: ReportDefinition[] = [debtorsAndCreditors, trialBalance, nilAccounts, dayBookReport, cashReturns, extraCharges];
