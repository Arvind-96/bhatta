import { listAllSupplierInvoices } from "../supplierInvoice.service";
import { listSuppliers } from "../supplier.service";
import { groupRowsByPeriod } from "../../utils/reportPeriod";
import { ReportDefinition, round2 } from "./types";

async function filteredInvoices(kilnId: string, filters: { from?: Date; to?: Date; supplierId?: string }) {
  const all = await listAllSupplierInvoices(kilnId);
  return all.filter((r) => {
    if (filters.supplierId && r.supplierId !== filters.supplierId) return false;
    if (filters.from && (!r.date || r.date < filters.from)) return false;
    if (filters.to && (!r.date || r.date > filters.to)) return false;
    return true;
  });
}

const purchaseRegister: ReportDefinition = {
  key: "purchaseRegister",
  titleKey: "reports.title.purchaseRegister",
  async run(kilnId, filters) {
    const [rows, allSuppliers] = await Promise.all([
      filteredInvoices(kilnId, filters),
      listSuppliers(kilnId),
    ]);
    const supplierById = new Map(allSuppliers.map((s) => [s._id, s.name]));
    // due is clamped at 0 — a due can't sensibly be negative — with any
    // overpayment on a supplier invoice surfaced as its own `credit`
    // column instead, same reasoning as the customer-side invoices report
    // (see trade.reports.ts's own note on why a raw negative due next to
    // a matching bill/paid pair reads as a math error).
    const detail = rows.map((r) => {
      const rawDue = round2(r.totalBillAmount - r.amountPaid);
      return {
        date: r.date ? r.date.toISOString() : null,
        serial: r.sequenceNumber != null ? `PI-${r.sequenceNumber}` : "",
        supplier: supplierById.get(r.supplierId) ?? r.supplierId,
        totalBillAmount: r.totalBillAmount,
        amountPaid: r.amountPaid,
        due: Math.max(0, rawDue),
        credit: Math.max(0, -rawDue),
      };
    });

    if (filters.groupBy && filters.groupBy !== "none") {
      const grouped = groupRowsByPeriod(detail, "date", ["totalBillAmount", "amountPaid", "due", "credit"], filters.groupBy);
      return {
        reportKey: "purchaseRegister",
        titleKey: "reports.title.purchaseRegister",
        columns: [
          { key: "period", labelKey: "reports.col.period", format: "text" },
          { key: "count", labelKey: "reports.col.entries", format: "number" },
          { key: "totalBillAmount", labelKey: "reports.col.totalBillAmount", format: "currency" },
          { key: "amountPaid", labelKey: "reports.col.amountPaid", format: "currency" },
          { key: "due", labelKey: "reports.col.dueAmount", format: "currency" },
          { key: "credit", labelKey: "reports.col.credit", format: "currency" },
        ],
        rows: grouped,
        totals: {
          totalBillAmount: round2(grouped.reduce((s, r) => s + (r.totalBillAmount as number), 0)),
          amountPaid: round2(grouped.reduce((s, r) => s + (r.amountPaid as number), 0)),
          due: round2(grouped.reduce((s, r) => s + (r.due as number), 0)),
          credit: round2(grouped.reduce((s, r) => s + (r.credit as number), 0)),
        },
      };
    }

    return {
      reportKey: "purchaseRegister",
      titleKey: "reports.title.purchaseRegister",
      columns: [
        { key: "date", labelKey: "reports.col.date", format: "date" },
        { key: "serial", labelKey: "reports.col.serial", format: "text" },
        { key: "supplier", labelKey: "reports.col.supplier", format: "text" },
        { key: "totalBillAmount", labelKey: "reports.col.totalBillAmount", format: "currency" },
        { key: "amountPaid", labelKey: "reports.col.amountPaid", format: "currency" },
        { key: "due", labelKey: "reports.col.dueAmount", format: "currency" },
        { key: "credit", labelKey: "reports.col.credit", format: "currency" },
      ],
      rows: detail,
      totals: {
        totalBillAmount: round2(detail.reduce((s, r) => s + r.totalBillAmount, 0)),
        amountPaid: round2(detail.reduce((s, r) => s + r.amountPaid, 0)),
        due: round2(detail.reduce((s, r) => s + r.due, 0)),
        credit: round2(detail.reduce((s, r) => s + r.credit, 0)),
      },
    };
  },
};

const purchaseBySupplier: ReportDefinition = {
  key: "purchaseBySupplier",
  titleKey: "reports.title.purchaseBySupplier",
  async run(kilnId, filters) {
    const [rows, allSuppliers] = await Promise.all([filteredInvoices(kilnId, filters), listSuppliers(kilnId)]);
    const supplierById = new Map(allSuppliers.map((s) => [s._id, s.name]));
    const byId = new Map<string, { supplier: string; invoiceCount: number; totalBillAmount: number; amountPaid: number }>();
    for (const r of rows) {
      const existing = byId.get(r.supplierId) ?? { supplier: supplierById.get(r.supplierId) ?? r.supplierId, invoiceCount: 0, totalBillAmount: 0, amountPaid: 0 };
      existing.invoiceCount += 1;
      existing.totalBillAmount += r.totalBillAmount;
      existing.amountPaid += r.amountPaid;
      byId.set(r.supplierId, existing);
    }
    const detail = [...byId.values()].map((v) => {
      const rawDue = round2(v.totalBillAmount - v.amountPaid);
      return { ...v, due: Math.max(0, rawDue), credit: Math.max(0, -rawDue) };
    });
    return {
      reportKey: "purchaseBySupplier",
      titleKey: "reports.title.purchaseBySupplier",
      columns: [
        { key: "supplier", labelKey: "reports.col.supplier", format: "text" },
        { key: "invoiceCount", labelKey: "reports.col.invoiceCount", format: "number" },
        { key: "totalBillAmount", labelKey: "reports.col.totalBillAmount", format: "currency" },
        { key: "amountPaid", labelKey: "reports.col.amountPaid", format: "currency" },
        { key: "due", labelKey: "reports.col.dueAmount", format: "currency" },
        { key: "credit", labelKey: "reports.col.credit", format: "currency" },
      ],
      rows: detail,
      totals: {
        totalBillAmount: round2(detail.reduce((s, r) => s + r.totalBillAmount, 0)),
        amountPaid: round2(detail.reduce((s, r) => s + r.amountPaid, 0)),
        due: round2(detail.reduce((s, r) => s + r.due, 0)),
        credit: round2(detail.reduce((s, r) => s + r.credit, 0)),
      },
    };
  },
};

function itemRollupReport(key: string, titleKey: string, groupField: "itemName" | "itemGroup"): ReportDefinition {
  return {
    key,
    titleKey,
    async run(kilnId, filters) {
      const rows = await filteredInvoices(kilnId, filters);
      const byGroup = new Map<string, { label: string; quantity: number; invoiceCount: number }>();
      for (const r of rows) {
        for (const item of r.itemsReceived ?? []) {
          const label = (groupField === "itemGroup" ? item.itemGroup : item.itemName) || "Unspecified";
          const existing = byGroup.get(label) ?? { label, quantity: 0, invoiceCount: 0 };
          existing.quantity += item.quantity;
          existing.invoiceCount += 1;
          byGroup.set(label, existing);
        }
      }
      const detail = [...byGroup.values()].map((v) => ({ item: v.label, quantity: round2(v.quantity), invoiceCount: v.invoiceCount }));
      return {
        reportKey: key,
        titleKey,
        columns: [
          { key: "item", labelKey: groupField === "itemGroup" ? "reports.col.itemGroup" : "reports.col.itemName", format: "text" },
          { key: "quantity", labelKey: "reports.col.quantity", format: "number" },
          { key: "invoiceCount", labelKey: "reports.col.invoiceCount", format: "number" },
        ],
        rows: detail,
        totals: { quantity: round2(detail.reduce((s, r) => s + r.quantity, 0)) },
      };
    },
  };
}

const purchaseByItem = itemRollupReport("purchaseByItem", "reports.title.purchaseByItem", "itemName");
const purchaseByItemGroup = itemRollupReport("purchaseByItemGroup", "reports.title.purchaseByItemGroup", "itemGroup");

export const purchaseReports: ReportDefinition[] = [purchaseRegister, purchaseBySupplier, purchaseByItem, purchaseByItemGroup];
