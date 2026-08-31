import { listCustomers } from "../customer.service";
import { listInvoices, listGatePasses, listChallans } from "../dispatchDocuments.service";
import { listExpenses } from "../expense.service";
import { listExpenseTypes } from "../expenseType.service";
import { groupRowsByPeriod } from "../../utils/reportPeriod";
import { ReportDefinition, round2 } from "./types";

// One row per customer, totals scoped to the requested period only (not
// lifetime balance — the Customer page already shows that) — satisfies
// "per individual or bulk (all customers)" via the optional customerId
// filter. No groupBy: this is inherently an entity rollup, not a time
// series (see the Invoices report below for the date-bucketed view).
const customers: ReportDefinition = {
  key: "customers",
  titleKey: "reports.title.customers",
  async run(kilnId, filters) {
    const allCustomers = await listCustomers(kilnId);
    const scoped = filters.customerId ? allCustomers.filter((c) => c._id === filters.customerId) : allCustomers;

    const rows = await Promise.all(
      scoped.map(async (c) => {
        // Both totals sum every invoice in the period, brick sale or
        // 0-brick advance/adjustment (see AddCustomerPaymentModal.tsx) alike
        // — invoicedThisPeriod used to skip 0-brick rows while
        // paidThisPeriod counted them, so an advance payment made
        // dueThisPeriod go negative for that customer even though nothing
        // was actually overpaid.
        const invoices = await listInvoices(kilnId, null, { customerId: c._id, from: filters.from, to: filters.to });
        const invoicedThisPeriod = round2(invoices.reduce((s, i) => s + i.netAmount, 0));
        const paidThisPeriod = round2(invoices.reduce((s, i) => s + (i.amountPaidNow ?? i.netAmount), 0));
        return {
          customer: c.name,
          phone: (c.phones ?? [])[0] ?? "",
          invoiceCount: invoices.length,
          invoicedThisPeriod,
          paidThisPeriod,
          dueThisPeriod: round2(invoicedThisPeriod - paidThisPeriod),
        };
      })
    );
    const nonZero = rows.filter((r) => r.invoiceCount > 0);
    const totals = {
      invoicedThisPeriod: round2(nonZero.reduce((s, r) => s + r.invoicedThisPeriod, 0)),
      paidThisPeriod: round2(nonZero.reduce((s, r) => s + r.paidThisPeriod, 0)),
      dueThisPeriod: round2(nonZero.reduce((s, r) => s + r.dueThisPeriod, 0)),
    };
    return {
      reportKey: "customers",
      titleKey: "reports.title.customers",
      columns: [
        { key: "customer", labelKey: "reports.col.customer", format: "text" },
        { key: "phone", labelKey: "reports.col.phone", format: "text" },
        { key: "invoiceCount", labelKey: "reports.col.invoiceCount", format: "number" },
        { key: "invoicedThisPeriod", labelKey: "reports.col.invoicedThisPeriod", format: "currency" },
        { key: "paidThisPeriod", labelKey: "reports.col.paidThisPeriod", format: "currency" },
        { key: "dueThisPeriod", labelKey: "reports.col.dueThisPeriod", format: "currency" },
      ],
      rows: nonZero,
      totals,
    };
  },
};

const invoices: ReportDefinition = {
  key: "invoices",
  titleKey: "reports.title.invoices",
  async run(kilnId, filters) {
    const rows = await listInvoices(kilnId, null, { customerId: filters.customerId, agentId: filters.agentId, from: filters.from, to: filters.to });
    const detail = rows.map((r) => ({
      date: r.invoiceDate ? r.invoiceDate.toISOString() : null,
      serial: r.sequenceNumber != null ? `INV-${r.sequenceNumber}` : "",
      customer: r.customerName,
      bricksCount: r.bricksCount,
      netAmount: r.netAmount,
      paidNow: r.amountPaidNow ?? r.netAmount,
      due: round2(r.netAmount - (r.amountPaidNow ?? r.netAmount)),
    }));

    if (filters.groupBy && filters.groupBy !== "none") {
      const grouped = groupRowsByPeriod(detail, "date", ["netAmount", "paidNow", "due"], filters.groupBy);
      return {
        reportKey: "invoices",
        titleKey: "reports.title.invoices",
        columns: [
          { key: "period", labelKey: "reports.col.period", format: "text" },
          { key: "count", labelKey: "reports.col.entries", format: "number" },
          { key: "netAmount", labelKey: "reports.col.netAmount", format: "currency" },
          { key: "paidNow", labelKey: "reports.col.paidThisPeriod", format: "currency" },
          { key: "due", labelKey: "reports.col.dueAmount", format: "currency" },
        ],
        rows: grouped,
        totals: {
          netAmount: round2(grouped.reduce((s, r) => s + (r.netAmount as number), 0)),
          paidNow: round2(grouped.reduce((s, r) => s + (r.paidNow as number), 0)),
          due: round2(grouped.reduce((s, r) => s + (r.due as number), 0)),
        },
      };
    }

    return {
      reportKey: "invoices",
      titleKey: "reports.title.invoices",
      columns: [
        { key: "date", labelKey: "reports.col.date", format: "date" },
        { key: "serial", labelKey: "reports.col.serial", format: "text" },
        { key: "customer", labelKey: "reports.col.customer", format: "text" },
        { key: "bricksCount", labelKey: "reports.col.bricksCount", format: "number" },
        { key: "netAmount", labelKey: "reports.col.netAmount", format: "currency" },
        { key: "paidNow", labelKey: "reports.col.paidThisPeriod", format: "currency" },
        { key: "due", labelKey: "reports.col.dueAmount", format: "currency" },
      ],
      rows: detail,
      totals: {
        netAmount: round2(detail.reduce((s, r) => s + r.netAmount, 0)),
        paidNow: round2(detail.reduce((s, r) => s + r.paidNow, 0)),
        due: round2(detail.reduce((s, r) => s + r.due, 0)),
      },
    };
  },
};

const gatePasses: ReportDefinition = {
  key: "gatePasses",
  titleKey: "reports.title.gatePasses",
  async run(kilnId, filters) {
    const rows = await listGatePasses(kilnId, null, { from: filters.from, to: filters.to });
    const detail = rows.map((r) => ({
      date: r.gatePassDate ? r.gatePassDate.toISOString() : null,
      serial: r.sequenceNumber != null ? `GP-${r.sequenceNumber}` : "",
      customer: r.customerName,
      vehicleNumber: r.vehicleNumber ?? "",
      vehicleType: r.vehicleType ?? "",
      bricksCount: r.bricksCount,
    }));
    const rowsOut = filters.groupBy && filters.groupBy !== "none" ? groupRowsByPeriod(detail, "date", ["bricksCount"], filters.groupBy) : detail;
    const columns =
      filters.groupBy && filters.groupBy !== "none"
        ? [
            { key: "period", labelKey: "reports.col.period", format: "text" as const },
            { key: "count", labelKey: "reports.col.entries", format: "number" as const },
            { key: "bricksCount", labelKey: "reports.col.bricksCount", format: "number" as const },
          ]
        : [
            { key: "date", labelKey: "reports.col.date", format: "date" as const },
            { key: "serial", labelKey: "reports.col.serial", format: "text" as const },
            { key: "customer", labelKey: "reports.col.customer", format: "text" as const },
            { key: "vehicleNumber", labelKey: "reports.col.vehicleNumber", format: "text" as const },
            { key: "vehicleType", labelKey: "reports.col.vehicleType", format: "text" as const },
            { key: "bricksCount", labelKey: "reports.col.bricksCount", format: "number" as const },
          ];
    return {
      reportKey: "gatePasses",
      titleKey: "reports.title.gatePasses",
      columns,
      rows: rowsOut,
      totals: { bricksCount: round2(detail.reduce((s, r) => s + r.bricksCount, 0)) },
    };
  },
};

const challans: ReportDefinition = {
  key: "challans",
  titleKey: "reports.title.challans",
  async run(kilnId, filters) {
    const rows = await listChallans(kilnId, null, { from: filters.from, to: filters.to });
    const detail = rows.map((r) => ({
      date: r.challanDate ? r.challanDate.toISOString() : null,
      serial: r.sequenceNumber != null ? `CH-${r.sequenceNumber}` : "",
      customer: r.customerName,
      vehicleNumber: r.vehicleNumber ?? "",
      vehicleType: r.vehicleType ?? "",
      bricksCount: r.bricksCount,
    }));
    const rowsOut = filters.groupBy && filters.groupBy !== "none" ? groupRowsByPeriod(detail, "date", ["bricksCount"], filters.groupBy) : detail;
    const columns =
      filters.groupBy && filters.groupBy !== "none"
        ? [
            { key: "period", labelKey: "reports.col.period", format: "text" as const },
            { key: "count", labelKey: "reports.col.entries", format: "number" as const },
            { key: "bricksCount", labelKey: "reports.col.bricksCount", format: "number" as const },
          ]
        : [
            { key: "date", labelKey: "reports.col.date", format: "date" as const },
            { key: "serial", labelKey: "reports.col.serial", format: "text" as const },
            { key: "customer", labelKey: "reports.col.customer", format: "text" as const },
            { key: "vehicleNumber", labelKey: "reports.col.vehicleNumber", format: "text" as const },
            { key: "vehicleType", labelKey: "reports.col.vehicleType", format: "text" as const },
            { key: "bricksCount", labelKey: "reports.col.bricksCount", format: "number" as const },
          ];
    return {
      reportKey: "challans",
      titleKey: "reports.title.challans",
      columns,
      rows: rowsOut,
      totals: { bricksCount: round2(detail.reduce((s, r) => s + r.bricksCount, 0)) },
    };
  },
};

const expenses: ReportDefinition = {
  key: "expenses",
  titleKey: "reports.title.expenses",
  async run(kilnId, filters) {
    const [allRows, types] = await Promise.all([
      listExpenses(kilnId, null, { from: filters.from, to: filters.to }),
      listExpenseTypes(kilnId),
    ]);
    // filters.category is matched against BOTH the modern admin-extensible
    // expenseTypeId and the legacy fixed category enum, since a given
    // expense row is classified by exactly one of the two (see the schema
    // comment on expenses.category) — this lets the frontend's category
    // picker offer the modern expense-type list without missing older rows.
    const rows = filters.category ? allRows.filter((r) => r.expenseTypeId === filters.category || r.category === filters.category) : allRows;
    const typeById = new Map(types.map((t) => [t._id, t.name]));
    const detail = rows.map((r) => ({
      date: r.date ? r.date.toISOString() : null,
      type: r.expenseTypeId ? typeById.get(r.expenseTypeId) ?? "" : r.category ?? "",
      amount: r.amount,
      paymentMode: r.paymentMode ?? "",
      notes: r.notes ?? "",
    }));

    if (filters.groupBy && filters.groupBy !== "none") {
      const grouped = groupRowsByPeriod(detail, "date", ["amount"], filters.groupBy);
      return {
        reportKey: "expenses",
        titleKey: "reports.title.expenses",
        columns: [
          { key: "period", labelKey: "reports.col.period", format: "text" },
          { key: "count", labelKey: "reports.col.entries", format: "number" },
          { key: "amount", labelKey: "reports.col.amount", format: "currency" },
        ],
        rows: grouped,
        totals: { amount: round2(grouped.reduce((s, r) => s + (r.amount as number), 0)) },
      };
    }

    return {
      reportKey: "expenses",
      titleKey: "reports.title.expenses",
      columns: [
        { key: "date", labelKey: "reports.col.date", format: "date" },
        { key: "type", labelKey: "reports.col.expenseType", format: "text" },
        { key: "amount", labelKey: "reports.col.amount", format: "currency" },
        { key: "paymentMode", labelKey: "reports.col.paymentMode", format: "text" },
        { key: "notes", labelKey: "reports.col.notes", format: "text" },
      ],
      rows: detail,
      totals: { amount: round2(detail.reduce((s, r) => s + r.amount, 0)) },
    };
  },
};

export const tradeReports: ReportDefinition[] = [customers, invoices, gatePasses, challans, expenses];
