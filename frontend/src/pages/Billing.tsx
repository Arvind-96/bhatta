import { useEffect, useState } from "react";
import { Pencil, Plus, Printer, Trash2 } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Pagination, usePagination } from "@/components/ui/pagination";
import { api } from "@/lib/api";
import { useKilnEvent } from "@/hooks/useKilnEvent";
import { useAuthStore } from "@/store/auth.store";
import { useTranslation } from "@/hooks/useTranslation";
import { printInvoice, printPaymentReceipt } from "@/lib/printDocument";
import { CreatePaymentReceiptModal } from "@/components/billing/CreatePaymentReceiptModal";
import { EditPaymentReceiptModal } from "@/components/billing/EditPaymentReceiptModal";
import { EditDispatchModal } from "@/components/dispatch/EditDispatchModal";
import type { CustomerCreditAging, Dispatch as DispatchEntry, DispatchTotals, PaymentReceipt } from "@/types";
import { formatINR } from "@/lib/utils";

// Every bill this kiln issues is generated from a Dispatch record — the
// same brick sale that already produced a gate pass. This screen is the
// billing/commercial view of that same data: an invoice number instead
// of a slip number, itemized amount instead of just a bricks count, and
// a credit-aging summary so outstanding bills don't go unnoticed.
export function Billing() {
  const [dispatches, setDispatches] = useState<DispatchEntry[]>([]);
  const [totals, setTotals] = useState<DispatchTotals | null>(null);
  const [creditAging, setCreditAging] = useState<CustomerCreditAging[]>([]);
  const [receipts, setReceipts] = useState<PaymentReceipt[]>([]);
  const [showReceiptModal, setShowReceiptModal] = useState(false);
  const [editingReceipt, setEditingReceipt] = useState<PaymentReceipt | null>(null);
  const [editingDispatch, setEditingDispatch] = useState<DispatchEntry | null>(null);
  const kilns = useAuthStore((s) => s.kilns);
  const activeKilnId = useAuthStore((s) => s.activeKilnId);
  const activeKiln = kilns.find((k) => k.kilnId === activeKilnId);
  const kilnName = activeKiln?.name ?? "Bhatta Cloud";
  const kilnInfo = {
    name: kilnName,
    location: activeKiln?.location,
    phone: activeKiln?.phone,
    gstNumber: activeKiln?.gstNumber,
  };
  const { t } = useTranslation();
  const { page, setPage, pageCount, pageItems: pagedDispatches, total } = usePagination(dispatches, 10);
  const receiptsPg = usePagination(receipts, 10);
  const GRADE_LABELS: Record<string, string> = {
    A1: t("billing.gradeA1"),
    JHAMA: t("billing.gradeJhama"),
    PELA: t("billing.gradePela"),
  };
  // Prefer the free-form category+grade this dispatch was linked to; fall
  // back to the older fixed A1/JHAMA/PELA classification otherwise — same
  // rule the print templates and Dispatch.tsx use.
  function categoryGradeLabel(d: DispatchEntry) {
    const cat = d.categoryId;
    if (cat && typeof cat === "object") {
      return cat.grade ? `${cat.category} (${cat.grade})` : cat.category;
    }
    return GRADE_LABELS[d.grade] ?? d.grade;
  }

  async function refresh() {
    const [dispatchData, totalsData, agingData, receiptData] = await Promise.all([
      api.dispatch.list(60),
      api.dispatch.totals(30),
      api.people.creditAging(),
      api.paymentReceipts.list(),
    ]);
    setDispatches(dispatchData);
    setTotals(totalsData);
    setCreditAging(agingData);
    setReceipts(receiptData);
  }

  useEffect(() => {
    if (!activeKilnId) return;
    refresh().catch(console.error);
  }, [activeKilnId]);

  useKilnEvent("dispatch:update", () => refresh());
  useKilnEvent("ledger:update", () => refresh());
  useKilnEvent("paymentReceipt:update", () => refresh());

  // The customer's account balance isn't stored on the dispatch — fetched
  // live right before printing so the Challan never shows a stale figure.
  async function handlePrintInvoice(d: DispatchEntry) {
    const customerId = typeof d.customerId === "object" ? d.customerId?._id : d.customerId;
    let balance: number | undefined;
    if (customerId) {
      try {
        const res = await api.people.get(customerId);
        balance = res.balance;
      } catch {
        balance = undefined;
      }
    }
    printInvoice(d, kilnInfo, balance);
  }

  async function deleteReceipt(r: PaymentReceipt, name: string) {
    if (!confirm(t("billing.confirmDeleteReceipt", { receiptNumber: r.receiptNumber, name }))) return;
    await api.paymentReceipts.remove(r._id);
    await refresh();
  }

  async function deleteDispatch(d: DispatchEntry) {
    if (!confirm(t("dispatch.confirmDeleteDispatch", { slipNumber: d.slipNumber }))) return;
    await api.dispatch.remove(d._id);
    await refresh();
  }

  const totalOutstanding = creditAging.reduce((sum, c) => sum + c.outstandingCredit, 0);

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button size="sm" onClick={() => setShowReceiptModal(true)}>
          <Plus className="h-4 w-4" /> {t("billing.newPaymentReceipt")}
        </Button>
      </div>

      <div className="grid grid-cols-3 gap-2">
        <Card className="p-3 text-center">
          <p className="text-xl font-semibold tabular-nums text-ink-primary">₹{formatINR((totals?.amount ?? 0))}</p>
          <p className="text-sm text-ink-muted">{t("billing.billedLast30Days")}</p>
        </Card>
        <Card className="p-3 text-center">
          <p className="text-xl font-semibold tabular-nums text-ink-primary">{totals?.dispatchCount ?? 0}</p>
          <p className="text-sm text-ink-muted">{t("billing.billsLast30Days")}</p>
        </Card>
        <Card className="p-3 text-center">
          <p className="text-xl font-semibold tabular-nums text-status-critical">₹{formatINR(totalOutstanding)}</p>
          <p className="text-sm text-ink-muted">{t("billing.outstandingCredit")}</p>
        </Card>
      </div>

      <Card>
        {dispatches.length === 0 ? (
          <p className="py-8 text-center text-sm text-ink-muted">{t("billing.noBillsLast60Days")}</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-sm">
              <thead>
                <tr className="border-b border-border text-left text-sm text-ink-muted">
                  <th className="pb-2 font-medium">{t("billing.invoiceHeader")}</th>
                  <th className="pb-2 font-medium">{t("common.date")}</th>
                  <th className="pb-2 font-medium">{t("billing.customerHeader")}</th>
                  <th className="pb-2 font-medium">{t("billing.gradeHeader")}</th>
                  <th className="pb-2 font-medium">{t("billing.bricksHeader")}</th>
                  <th className="pb-2 font-medium">{t("common.paymentMode")}</th>
                  <th className="pb-2 font-medium text-right">{t("common.amount")}</th>
                  <th className="pb-2 font-medium" />
                </tr>
              </thead>
              <tbody>
                {pagedDispatches.map((d) => (
                  <tr key={d._id} className="border-b border-border/60 last:border-0 hover:bg-ink-primary/5">
                    <td className="py-3 text-ink-primary">{d.slipNumber}</td>
                    <td className="py-3 text-ink-secondary">{new Date(d.dispatchedOn).toLocaleDateString("en-IN")}</td>
                    <td className="py-3 text-ink-secondary">{d.customerName}</td>
                    <td className="py-3">
                      <Badge variant="neutral">{categoryGradeLabel(d)}</Badge>
                    </td>
                    <td className="py-3 tabular-nums text-ink-secondary">{d.bricksCount.toLocaleString("en-IN")}</td>
                    <td className="py-3 text-ink-secondary">{d.paymentMode ?? "—"}</td>
                    <td className="py-3 text-right tabular-nums font-medium text-ink-primary">₹{formatINR(d.amount)}</td>
                    <td className="py-3 text-right">
                      <div className="flex justify-end gap-3">
                        <button
                          onClick={() => handlePrintInvoice(d)}
                          className="flex items-center gap-1 text-xs font-medium text-series-1 hover:underline"
                        >
                          <Printer className="h-3.5 w-3.5" /> {t("common.print")}
                        </button>
                        <button
                          onClick={() => setEditingDispatch(d)}
                          className="flex items-center gap-1 text-xs font-medium text-ink-secondary hover:text-ink-primary"
                        >
                          <Pencil className="h-3.5 w-3.5" /> {t("common.edit")}
                        </button>
                        <button
                          onClick={() => deleteDispatch(d)}
                          className="flex items-center gap-1 text-xs font-medium text-status-critical hover:underline"
                        >
                          <Trash2 className="h-3.5 w-3.5" /> {t("common.delete")}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
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
      {editingDispatch && (
        <EditDispatchModal dispatch={editingDispatch} onClose={() => setEditingDispatch(null)} onSaved={refresh} />
      )}
    </div>
  );
}
