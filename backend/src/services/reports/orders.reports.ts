import { listInvoices } from "../dispatchDocuments.service";
import { listSaleOrders } from "../saleOrder.service";
import { listPurchaseOrders } from "../purchaseOrder.service";
import { listBrickCategories } from "../brickCategory.service";
import { listSuppliers } from "../supplier.service";
import { listCustomers } from "../customer.service";
import { unbilledDispatchRows, belongsToCustomer } from "./trade.reports";
import { ReportDefinition, round2 } from "./types";

// Average ₹/brick actually realized per category over the period — the
// invoice's own ratePerBrick where set, else netAmount/bricksCount as a
// fallback for older rows created before ratePerBrick was captured.
const itemWiseAvgSaleRate: ReportDefinition = {
  key: "itemWiseAvgSaleRate",
  titleKey: "reports.title.itemWiseAvgSaleRate",
  async run(kilnId, filters) {
    // Bug fix: a dispatch that's a real, complete sale but hasn't been
    // formally invoiced yet was silently missing from this report — same
    // undercount, same fix as keyAverages's "Average sale rate per brick"
    // (averages.reports.ts), and the same customerId-scoping approach the
    // Invoices report already established (belongsToCustomer).
    const [invoiceRows, unbilledAll, categories, targetCustomer] = await Promise.all([
      listInvoices(kilnId, null, { customerId: filters.customerId, from: filters.from, to: filters.to }),
      unbilledDispatchRows(kilnId, { from: filters.from, to: filters.to }),
      listBrickCategories(kilnId),
      filters.customerId ? listCustomers(kilnId).then((cs) => cs.find((c) => c._id === filters.customerId)) : Promise.resolve(undefined),
    ]);
    const unbilledRows = filters.customerId ? unbilledAll.filter((d) => targetCustomer && belongsToCustomer(d, targetCustomer._id, targetCustomer.name)) : unbilledAll;
    const rows = [...invoiceRows, ...unbilledRows];
    const categoryById = new Map(categories.map((c) => [c._id, c.category]));

    const byCategory = new Map<string, { bricksCount: number; amount: number }>();
    for (const r of rows) {
      const catId = r.categoryId ?? "uncategorized";
      const rate = r.ratePerBrick ?? (r.bricksCount > 0 ? r.netAmount / r.bricksCount : 0);
      const existing = byCategory.get(catId) ?? { bricksCount: 0, amount: 0 };
      existing.bricksCount += r.bricksCount;
      existing.amount += rate * r.bricksCount;
      byCategory.set(catId, existing);
    }

    const detail = [...byCategory.entries()].map(([catId, v]) => ({
      category: catId === "uncategorized" ? "Uncategorized" : categoryById.get(catId) ?? catId,
      bricksCount: v.bricksCount,
      averageRate: v.bricksCount > 0 ? round2(v.amount / v.bricksCount) : 0,
    }));

    return {
      reportKey: "itemWiseAvgSaleRate",
      titleKey: "reports.title.itemWiseAvgSaleRate",
      columns: [
        { key: "category", labelKey: "reports.col.category", format: "text" },
        { key: "bricksCount", labelKey: "reports.col.bricksCount", format: "number" },
        { key: "averageRate", labelKey: "reports.col.averageRate", format: "currency" },
      ],
      rows: detail,
      totals: { bricksCount: detail.reduce((s, r) => s + r.bricksCount, 0) },
    };
  },
};

function saleOrderDetailRow(o: Awaited<ReturnType<typeof listSaleOrders>>[number]) {
  return {
    date: o.orderDate ? o.orderDate.toISOString() : null,
    serial: o.sequenceNumber != null ? `SO-${o.sequenceNumber}` : "",
    customer: o.customerName,
    bricksCount: o.bricksCount,
    bricksFulfilled: o.bricksFulfilled,
    bricksPending: o.bricksCount - o.bricksFulfilled,
    status: o.status,
  };
}

const saleOrdersPendingDetail: ReportDefinition = {
  key: "saleOrdersPendingDetail",
  titleKey: "reports.title.saleOrdersPendingDetail",
  async run(kilnId, filters) {
    // Report-engine callers scope by kiln/date only — every open sale order
    // regardless of which season it was booked in stays visible until
    // fulfilled or cancelled, same as any other "pending" list.
    const orders = await listSaleOrders(kilnId, null, { customerId: filters.customerId, from: filters.from, to: filters.to });
    const pending = orders.filter((o) => o.status === "PENDING" || o.status === "PARTIALLY_FULFILLED");
    const detail = pending.map(saleOrderDetailRow);
    return {
      reportKey: "saleOrdersPendingDetail",
      titleKey: "reports.title.saleOrdersPendingDetail",
      columns: [
        { key: "date", labelKey: "reports.col.date", format: "date" },
        { key: "serial", labelKey: "reports.col.serial", format: "text" },
        { key: "customer", labelKey: "reports.col.customer", format: "text" },
        { key: "bricksCount", labelKey: "reports.col.bricksCount", format: "number" },
        { key: "bricksFulfilled", labelKey: "reports.col.bricksFulfilled", format: "number" },
        { key: "bricksPending", labelKey: "reports.col.bricksPending", format: "number" },
        { key: "status", labelKey: "reports.col.status", format: "text" },
      ],
      rows: detail,
      totals: { bricksPending: detail.reduce((s, r) => s + r.bricksPending, 0) },
    };
  },
};

const saleOrdersPendingSummary: ReportDefinition = {
  key: "saleOrdersPendingSummary",
  titleKey: "reports.title.saleOrdersPendingSummary",
  async run(kilnId, filters) {
    const orders = await listSaleOrders(kilnId, null, { customerId: filters.customerId, from: filters.from, to: filters.to });
    const pending = orders.filter((o) => o.status === "PENDING" || o.status === "PARTIALLY_FULFILLED");
    const byCustomer = new Map<string, { customer: string; orderCount: number; bricksPending: number }>();
    for (const o of pending) {
      const key = o.customerId ?? o.customerName;
      const existing = byCustomer.get(key) ?? { customer: o.customerName, orderCount: 0, bricksPending: 0 };
      existing.orderCount += 1;
      existing.bricksPending += o.bricksCount - o.bricksFulfilled;
      byCustomer.set(key, existing);
    }
    const detail = [...byCustomer.values()];
    return {
      reportKey: "saleOrdersPendingSummary",
      titleKey: "reports.title.saleOrdersPendingSummary",
      columns: [
        { key: "customer", labelKey: "reports.col.customer", format: "text" },
        { key: "orderCount", labelKey: "reports.col.orderCount", format: "number" },
        { key: "bricksPending", labelKey: "reports.col.bricksPending", format: "number" },
      ],
      rows: detail,
      totals: { bricksPending: detail.reduce((s, r) => s + r.bricksPending, 0) },
    };
  },
};

const purchaseOrderDetail: ReportDefinition = {
  key: "purchaseOrderDetail",
  titleKey: "reports.title.purchaseOrderDetail",
  async run(kilnId, filters) {
    const [orders, allSuppliers] = await Promise.all([
      listPurchaseOrders(kilnId, null, { supplierId: filters.supplierId, from: filters.from, to: filters.to }),
      listSuppliers(kilnId),
    ]);
    const supplierById = new Map(allSuppliers.map((s) => [s._id, s.name]));
    const detail = orders.map((o) => ({
      date: o.orderDate ? o.orderDate.toISOString() : null,
      serial: o.sequenceNumber != null ? `PO-${o.sequenceNumber}` : "",
      supplier: supplierById.get(o.supplierId) ?? o.supplierId,
      itemCount: (o.items ?? []).length,
      expectedAmount: o.expectedAmount ?? 0,
      status: o.status,
    }));
    return {
      reportKey: "purchaseOrderDetail",
      titleKey: "reports.title.purchaseOrderDetail",
      columns: [
        { key: "date", labelKey: "reports.col.date", format: "date" },
        { key: "serial", labelKey: "reports.col.serial", format: "text" },
        { key: "supplier", labelKey: "reports.col.supplier", format: "text" },
        { key: "itemCount", labelKey: "reports.col.itemCount", format: "number" },
        { key: "expectedAmount", labelKey: "reports.col.expectedAmount", format: "currency" },
        { key: "status", labelKey: "reports.col.status", format: "text" },
      ],
      rows: detail,
      totals: { expectedAmount: round2(detail.reduce((s, r) => s + r.expectedAmount, 0)) },
    };
  },
};

export const ordersReports: ReportDefinition[] = [itemWiseAvgSaleRate, saleOrdersPendingDetail, saleOrdersPendingSummary, purchaseOrderDetail];
