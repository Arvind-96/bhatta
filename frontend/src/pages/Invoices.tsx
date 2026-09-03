import { useEffect, useState } from "react";
import { Pencil, Plus, Printer, Search, Trash2 } from "lucide-react";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Pagination, usePagination } from "@/components/ui/pagination";
import { api } from "@/lib/api";
import { useKilnEvent } from "@/hooks/useKilnEvent";
import { useAuthStore } from "@/store/auth.store";
import { useTranslation } from "@/hooks/useTranslation";
import { cn, formatDateTime, formatINR } from "@/lib/utils";
import { formatInvoiceNumber, printPaymentReceipt, resolveItemRows } from "@/lib/printDocument";
import { InvoiceDetailPage } from "@/components/dispatch/InvoiceDetailPage";
import { CreatePaymentReceiptModal } from "@/components/billing/CreatePaymentReceiptModal";
import { EditPaymentReceiptModal } from "@/components/billing/EditPaymentReceiptModal";
import { buildReportWorkbookBlob, downloadExcelFile } from "@/lib/exportExcel";
import type { BrickCategory, CustomerCreditAging, Invoice, PaymentReceipt } from "@/types";
import type { ReportColumn } from "@/types/reports";

const INVOICE_EXCEL_COLUMNS: ReportColumn[] = [
  { key: "date", labelKey: "reports.col.date", format: "date" },
  { key: "serial", labelKey: "reports.col.serial", format: "text" },
  { key: "customer", labelKey: "reports.col.customer", format: "text" },
  { key: "bricksCount", labelKey: "reports.col.bricksCount", format: "number" },
  { key: "netAmount", labelKey: "reports.col.netAmount", format: "currency" },
  { key: "paidNow", labelKey: "reports.col.paidThisPeriod", format: "currency" },
  { key: "due", labelKey: "reports.col.dueAmount", format: "currency" },
];

const inputClass =
  "h-10 rounded-xl border border-border bg-ink-primary/5 px-3 text-sm text-ink-primary outline-none focus:ring-2 focus:ring-series-1";

// Every Invoice (priced/GST commercial bill) ever generated from a
// Dispatch's detail page — its own list, live-synced via the same
// invoice:update socket event DispatchDetailPage/InvoiceDetailPage listen
// for. Also carries Payment Receipts and Outstanding Credit tracking
// (moved here from the old, now-removed Billing & Challan page — both are
// billing/collections concerns, and neither needed its own nav item).
export function Invoices() {
  const [entries, setEntries] = useState<Invoice[]>([]);
  const [categories, setCategories] = useState<BrickCategory[]>([]);
  const [search, setSearch] = useState("");
  const [openId, setOpenId] = useState<string | null>(null);
  const [creditAging, setCreditAging] = useState<CustomerCreditAging[]>([]);
  const [receipts, setReceipts] = useState<PaymentReceipt[]>([]);
  const [showReceiptModal, setShowReceiptModal] = useState(false);
  const [editingReceipt, setEditingReceipt] = useState<PaymentReceipt | null>(null);
  const activeKilnId = useAuthStore((s) => s.activeKilnId);
  const kilns = useAuthStore((s) => s.kilns);
  const activeKiln = kilns.find((k) => k.kilnId === activeKilnId);
  const kilnName = activeKiln?.name ?? "Bhatta Cloud";
  const { t } = useTranslation();

  async function refresh() {
    const [entriesData, categoryData, agingData, receiptData] = await Promise.all([
      api.invoices.list(),
      api.brickCategories.list(),
      api.people.creditAging(),
      api.paymentReceipts.list(),
    ]);
    setEntries(entriesData);
    setCategories(categoryData);
    setCreditAging(agingData);
    setReceipts(receiptData);
  }

  useEffect(() => {
    if (!activeKilnId) return;
    refresh().catch(console.error);
  }, [activeKilnId]);

  useKilnEvent("invoice:update", () => refresh());
  useKilnEvent("ledger:update", () => refresh());
  useKilnEvent("paymentReceipt:update", () => refresh());

  async function deleteReceipt(r: PaymentReceipt, name: string) {
    if (!confirm(t("billing.confirmDeleteReceipt", { receiptNumber: r.receiptNumber, name }))) return;
    await api.paymentReceipts.remove(r._id);
    await refresh();
  }

  const filteredEntries = entries.filter((e) => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return (
      formatInvoiceNumber(e, kilnName).toLowerCase().includes(q) ||
      e.customerName.toLowerCase().includes(q) ||
      (e.customerPhone ?? "").includes(q)
    );
  });
  const { page, setPage, pageCount, pageItems: pagedEntries, total } = usePagination(filteredEntries, 10);
  const receiptsPg = usePagination(receipts, 10);
  const openEntry = entries.find((e) => e._id === openId) ?? null;
  const totalOutstanding = creditAging.reduce((sum, c) => sum + c.outstandingCredit, 0);
  // entries includes cancelled invoices (the list endpoint passes
  // includeCancelled so this page can show them with a badge, per the
  // client's "stays visible" answer) — excluded here so a cancelled
  // invoice's reversed amount doesn't still count toward this total.
  const activeEntries = entries.filter((e) => !e.cancelled);
  const totalInvoiced = activeEntries.reduce((sum, e) => sum + e.netAmount, 0);

  if (openEntry) {
    return <InvoiceDetailPage invoice={openEntry} categories={categories} onBack={() => setOpenId(null)} onDeleted={() => setOpenId(null)} />;
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button size="sm" onClick={() => setShowReceiptModal(true)}>
          <Plus className="h-4 w-4" /> {t("billing.newPaymentReceipt")}
        </Button>
      </div>

      <div className="grid grid-cols-2 gap-2 md:grid-cols-3">
        <Card className="p-3 text-center">
          <p className="text-xl font-semibold tabular-nums text-ink-primary">₹{formatINR(totalInvoiced)}</p>
          <p className="text-sm text-ink-muted">{t("dispatchDocs.totalInvoicedLabel")}</p>
        </Card>
        <Card className="p-3 text-center">
          <p className="text-xl font-semibold tabular-nums text-ink-primary">{activeEntries.length}</p>
          <p className="text-sm text-ink-muted">{t("dispatchDocs.totalInvoicesLabel")}</p>
        </Card>
        <Card className="p-3 text-center">
          <p className="text-xl font-semibold tabular-nums text-status-critical">₹{formatINR(totalOutstanding)}</p>
          <p className="text-sm text-ink-muted">{t("billing.outstandingCredit")}</p>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{t("nav.invoices")}</CardTitle>
          <button
            type="button"
            onClick={() => {
              const rows = filteredEntries.filter((e) => !e.cancelled).map((e) => ({
                date: e.invoiceDate ?? null,
                serial: formatInvoiceNumber(e, kilnName),
                customer: e.customerName,
                bricksCount: e.bricksCount,
                netAmount: e.netAmount,
                paidNow: e.amountPaidNow ?? e.netAmount,
                due: Math.round((e.netAmount - (e.amountPaidNow ?? e.netAmount)) * 100) / 100,
              }));
              const labels = Object.fromEntries(INVOICE_EXCEL_COLUMNS.map((c) => [c.key, t(c.labelKey)]));
              const blob = buildReportWorkbookBlob(INVOICE_EXCEL_COLUMNS, rows, undefined, labels, t("nav.invoices"));
              downloadExcelFile(blob, "invoices.xlsx");
            }}
            className="rounded-lg border border-border px-3 py-1.5 text-xs font-semibold text-ink-secondary hover:bg-ink-primary/5"
          >
            {t("reports.action.downloadExcel")}
          </button>
        </CardHeader>
        <div className="relative mb-3">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-muted" />
          <input
            placeholder={t("dispatchDocs.searchInvoicesPlaceholder")}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className={cn(inputClass, "w-full max-w-sm pl-9")}
          />
        </div>
        {entries.length === 0 ? (
          <p className="py-8 text-center text-sm text-ink-muted">{t("dispatchDocs.noInvoicesYet")}</p>
        ) : filteredEntries.length === 0 ? (
          <p className="py-8 text-center text-sm text-ink-muted">{t("dispatchDocs.noMatchSearch")}</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-sm">
              <thead>
                <tr className="border-b border-border text-left text-sm text-ink-muted">
                  <th className="pb-2 font-medium">{t("dispatchDocs.numberHeader")}</th>
                  <th className="pb-2 font-medium">{t("common.date")}</th>
                  <th className="pb-2 font-medium">{t("dispatch.customerHeader")}</th>
                  <th className="pb-2 font-medium">{t("brickLoading.categoryHeader")}</th>
                  <th className="pb-2 font-medium">{t("common.paymentMode")}</th>
                  <th className="pb-2 font-medium text-right">{t("common.amount")}</th>
                </tr>
              </thead>
              <tbody>
                {pagedEntries.map((e) => {
                  const itemRows = resolveItemRows(e.items, categories, { categoryId: e.categoryId, bricksCount: e.bricksCount });
                  return (
                  <tr key={e._id} onClick={() => setOpenId(e._id)} className="cursor-pointer border-b border-border/60 last:border-0 hover:bg-ink-primary/5">
                    <td className="py-3 text-ink-primary hover:underline">
                      <span className="flex items-center gap-2">
                        {formatInvoiceNumber(e, kilnName)}
                        {e.cancelled && (
                          <span className="rounded-full bg-ink-primary/10 px-2 py-0.5 text-xs font-semibold text-ink-muted">
                            {t("common.cancelledBadge")}
                          </span>
                        )}
                      </span>
                    </td>
                    <td className="py-3 text-ink-secondary">{e.invoiceDate ? new Date(e.invoiceDate).toLocaleDateString("en-IN") : "—"}</td>
                    <td className="py-3 text-ink-primary">{e.customerName}</td>
                    <td className="py-3 text-ink-secondary">
                      {itemRows.length > 1 ? t("brickLoading.multipleCategoriesLabel", { count: itemRows.length }) : itemRows[0]?.label ?? "—"}
                    </td>
                    <td className="py-3 text-ink-secondary">{e.paymentMode ?? "—"}</td>
                    <td className="py-3 text-right tabular-nums font-medium text-ink-primary">₹{formatINR(e.netAmount)}</td>
                  </tr>
                  );
                })}
              </tbody>
            </table>
            <Pagination page={page} pageCount={pageCount} onChange={setPage} total={total} pageSize={10} />
          </div>
        )}
      </Card>

      {creditAging.length > 0 && (
        <Card>
          <h4 className="mb-3 text-xs font-semibold uppercase tracking-wide text-ink-muted">{t("billing.outstandingCreditByCustomer")}</h4>
          <div className="space-y-1">
            {creditAging.map((c) => (
              <div key={c.person._id} className="flex items-center justify-between rounded-lg border border-border px-3 py-2 text-sm">
                <div>
                  <p className="text-ink-primary">{c.person.name}</p>
                  <p className="text-sm text-ink-muted">{t("billing.daysPending", { days: c.daysPending })}</p>
                </div>
                <span className={`tabular-nums font-medium ${c.overLimit ? "text-status-critical" : "text-ink-primary"}`}>
                  ₹{formatINR(c.outstandingCredit)}
                </span>
              </div>
            ))}
          </div>
        </Card>
      )}

      {receipts.length > 0 && (
        <Card>
          <h4 className="mb-3 text-xs font-semibold uppercase tracking-wide text-ink-muted">{t("billing.paymentReceiptsHeading")}</h4>
          <div className="space-y-1">
            {receiptsPg.pageItems.map((r) => {
              const name = typeof r.personId === "object" ? r.personId.name : "—";
              return (
                <div key={r._id} className="flex items-center justify-between rounded-lg border border-border px-3 py-2 text-sm">
                  <div>
                    <p className="text-ink-primary">{name}</p>
                    <p className="text-sm text-ink-muted">
                      {r.receiptNumber} · {new Date(r.date).toLocaleDateString("en-IN")}
                    </p>
                    <p className="text-xs text-ink-muted/70">{t("common.entryDateTime")}: {formatDateTime(r.createdAt)}</p>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="tabular-nums font-medium text-status-good">₹{formatINR(r.amountPaid)}</span>
                    <button
                      onClick={() => printPaymentReceipt(r, name, kilnName)}
                      className="flex items-center gap-1 text-xs font-medium text-series-1 hover:underline"
                    >
                      <Printer className="h-3.5 w-3.5" /> {t("common.print")}
                    </button>
                    <button
                      onClick={() => setEditingReceipt(r)}
                      className="flex items-center gap-1 text-xs font-medium text-ink-secondary hover:text-ink-primary"
                    >
                      <Pencil className="h-3.5 w-3.5" /> {t("common.edit")}
                    </button>
                    <button
                      onClick={() => deleteReceipt(r, name)}
                      className="flex items-center gap-1 text-xs font-medium text-status-critical hover:underline"
                    >
                      <Trash2 className="h-3.5 w-3.5" /> {t("common.delete")}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
          <Pagination page={receiptsPg.page} pageCount={receiptsPg.pageCount} onChange={receiptsPg.setPage} total={receiptsPg.total} pageSize={10} />
        </Card>
      )}

      {showReceiptModal && (
        <CreatePaymentReceiptModal kilnName={kilnName} onClose={() => setShowReceiptModal(false)} onCreated={refresh} />
      )}
      {editingReceipt && (
        <EditPaymentReceiptModal
          receipt={editingReceipt}
          personName={typeof editingReceipt.personId === "object" ? editingReceipt.personId.name : "—"}
          onClose={() => setEditingReceipt(null)}
          onSaved={refresh}
        />
      )}
    </div>
  );
}
