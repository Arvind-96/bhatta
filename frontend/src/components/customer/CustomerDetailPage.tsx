import { useEffect, useState } from "react";
import { ArrowLeft, Banknote, Pencil, Trash2 } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api";
import { useKilnEvent } from "@/hooks/useKilnEvent";
import { useTranslation } from "@/hooks/useTranslation";
import { useAuthStore } from "@/store/auth.store";
import { formatINR } from "@/lib/utils";
import { formatInvoiceNumber } from "@/lib/printDocument";
import { AddCustomerForm } from "./AddCustomerForm";
import { AddCustomerPaymentModal } from "./AddCustomerPaymentModal";
import { InvoiceDetailPage } from "@/components/dispatch/InvoiceDetailPage";
import type { BrickCategory, CustomerDetail } from "@/types";

interface CustomerDetailPageProps {
  customerId: string;
  onBack: () => void;
  onDeleted: () => void;
}

// The profile-style page for a single Customer — details, then (item 6) a
// live Total Paid/Total Due balance, then (item 7) every invoice
// generated under their name (reusing InvoiceDetailPage as-is, so
// edit/delete/print and sync to the Dispatch/Invoices pages all just
// work), then (item 9) an "Add Amount" quick-payment action. The balance
// is never stored — getCustomerDetail recomputes it from openingPaid/
// openingDue plus every matched invoice's own paid/due split on every
// fetch, so it can never drift (item 8).
export function CustomerDetailPage({ customerId, onBack, onDeleted }: CustomerDetailPageProps) {
  const { t } = useTranslation();
  const kilns = useAuthStore((s) => s.kilns);
  const activeKilnId = useAuthStore((s) => s.activeKilnId);
  const kilnName = kilns.find((k) => k.kilnId === activeKilnId)?.name ?? "Bhatta Cloud";
  const [detail, setDetail] = useState<CustomerDetail | null>(null);
  const [categories, setCategories] = useState<BrickCategory[]>([]);
  const [editing, setEditing] = useState(false);
  const [showAddAmount, setShowAddAmount] = useState(false);
  const [openInvoiceId, setOpenInvoiceId] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState("");

  async function refresh() {
    const [detailData, categoryData] = await Promise.all([api.customers.detail(customerId), api.brickCategories.list()]);
    setDetail(detailData);
    setCategories(categoryData);
  }

  useEffect(() => {
    refresh().catch(console.error);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [customerId]);

  useKilnEvent<{ _id: string; deleted?: boolean }>("customer:update", (payload) => {
    if (payload._id === customerId && payload.deleted) {
      onDeleted();
      return;
    }
    refresh().catch(console.error);
  });
  useKilnEvent("invoice:update", () => refresh().catch(console.error));

  async function handleDelete() {
    if (!detail) return;
    if (!confirm(t("customer.confirmDeleteCustomer", { name: detail.customer.name }))) return;
    setDeleteError("");
    try {
      await api.customers.remove(customerId);
      onDeleted();
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : t("common.somethingWentWrong"));
    }
  }

  if (!detail) {
    return (
      <div>
        <button onClick={onBack} className="mb-3 flex items-center gap-1.5 text-sm text-ink-secondary hover:text-ink-primary">
          <ArrowLeft className="h-4 w-4" /> {t("customer.backToCustomers")}
        </button>
        <Card>
          <p className="py-8 text-center text-sm text-ink-muted">{t("common.loading")}</p>
        </Card>
      </div>
    );
  }

  const openInvoice = detail.invoices.find((i) => i._id === openInvoiceId) ?? null;
  if (openInvoice) {
    return (
      <InvoiceDetailPage
        invoice={openInvoice}
        categories={categories}
        onBack={() => setOpenInvoiceId(null)}
        onDeleted={() => setOpenInvoiceId(null)}
      />
    );
  }

  const { customer, invoices, totalPaid, totalDue } = detail;
  // totalDue sums every invoice's raw (unclamped) charge-minus-paid, so a
  // customer who's paid more overall than they've been billed (a large
  // advance with no matching sale yet) reads negative — same "credit, not
  // a negative due" situation as a single invoice row below, just at the
  // whole-customer level. formatINR renders a negative number with a
  // literal minus sign, which showed as e.g. "₹-4,000" in this card's red
  // "due" styling. Same clamp-and-relabel fix as the Invoices table.
  const dueDisplay = Math.max(0, totalDue);
  const creditDisplay = Math.max(0, -totalDue);

  return (
    <div>
      <button onClick={onBack} className="mb-3 flex items-center gap-1.5 text-sm text-ink-secondary hover:text-ink-primary">
        <ArrowLeft className="h-4 w-4" /> {t("customer.backToCustomers")}
      </button>

      {editing ? (
        <AddCustomerForm
          existing={customer}
          onClose={() => setEditing(false)}
          onSaved={() => {
            setEditing(false);
            refresh();
          }}
        />
      ) : (
        <>
          <Card className="mb-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <h3 className="text-lg font-semibold text-ink-primary">{customer.name}</h3>
              <div className="flex gap-2">
                <button
                  onClick={() => setEditing(true)}
                  className="flex items-center gap-1 rounded-lg border border-border bg-ink-primary/5 px-3 py-1.5 text-xs font-medium text-ink-secondary hover:bg-ink-primary/10"
                >
                  <Pencil className="h-3.5 w-3.5" /> {t("common.edit")}
                </button>
                <button
                  onClick={handleDelete}
                  className="flex items-center gap-1 rounded-lg border border-status-critical/30 bg-status-critical/5 px-3 py-1.5 text-xs font-medium text-status-critical hover:bg-status-critical/10"
                >
                  <Trash2 className="h-3.5 w-3.5" /> {t("common.delete")}
                </button>
              </div>
            </div>
            {deleteError && <p className="mt-3 text-sm text-status-critical">{deleteError}</p>}
          </Card>

          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-muted">{t("customer.phonesSection")}</h4>
              {customer.phones.length === 0 ? <p className="text-sm text-ink-muted">—</p> : customer.phones.map((p, i) => <p key={i} className="text-sm text-ink-primary">{p}</p>)}
            </Card>
            <Card>
              <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-muted">{t("customer.addressesSection")}</h4>
              {customer.addresses.length === 0 ? <p className="text-sm text-ink-muted">—</p> : customer.addresses.map((a, i) => <p key={i} className="text-sm text-ink-primary">{a}</p>)}
            </Card>

            <Card>
              <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-muted">{t("customer.driversSection")}</h4>
              {customer.drivers.length === 0 ? (
                <p className="text-sm text-ink-muted">—</p>
              ) : (
                <div className="space-y-2">
                  {customer.drivers.map((d, i) => (
                    <div key={i} className="text-sm">
                      <p className="text-ink-primary">{d.name || "—"}</p>
                      <p className="text-ink-muted">{[d.phone, d.address].filter(Boolean).join(" · ") || "—"}</p>
                    </div>
                  ))}
                </div>
              )}
            </Card>
            <Card>
              <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-muted">{t("customer.vehiclesSection")}</h4>
              {customer.vehicles.length === 0 ? (
                <p className="text-sm text-ink-muted">—</p>
              ) : (
                <div className="space-y-1">
                  {customer.vehicles.map((v, i) => (
                    <p key={i} className="text-sm text-ink-primary">
                      {v.vehicleType === "TRUCK" ? t("brickLoading.truck") : t("brickLoading.tractor")} · {v.vehicleNumber}
                    </p>
                  ))}
                </div>
              )}
            </Card>

            <Card className="lg:col-span-2">
              <div className="mb-3 flex items-center justify-between">
                <h4 className="text-xs font-semibold uppercase tracking-wide text-ink-muted">{t("customer.balanceSection")}</h4>
                <Button size="sm" onClick={() => setShowAddAmount(true)}>
                  <Banknote className="h-4 w-4" /> {t("customer.addAmountButton")}
                </Button>
              </div>
              <div className="grid grid-cols-2 gap-2 text-center">
                <div className="rounded-xl border border-status-good/30 bg-status-good/5 p-3">
                  <p className="text-xl font-semibold tabular-nums text-status-good">₹{formatINR(totalPaid)}</p>
                  <p className="text-sm text-ink-muted">{t("customer.totalPaidLabel")}</p>
                </div>
                <div className={`rounded-xl border p-3 ${creditDisplay > 0 ? "border-status-good/30 bg-status-good/5" : "border-status-critical/30 bg-status-critical/5"}`}>
                  <p className={`text-xl font-semibold tabular-nums ${creditDisplay > 0 ? "text-status-good" : "text-status-critical"}`}>
                    {creditDisplay > 0 ? `${t("customer.invoiceCreditPrefix")} ₹${formatINR(creditDisplay)}` : `₹${formatINR(dueDisplay)}`}
                  </p>
                  <p className="text-sm text-ink-muted">{t("customer.totalDueLabel")}</p>
                </div>
              </div>
            </Card>

            <Card className="lg:col-span-2">
              <h4 className="mb-3 text-xs font-semibold uppercase tracking-wide text-ink-muted">{t("customer.invoicesSection")}</h4>
              {invoices.length === 0 ? (
                <p className="py-6 text-center text-sm text-ink-muted">{t("dispatchDocs.noInvoicesYet")}</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[520px] text-sm">
                    <thead>
                      <tr className="border-b border-border text-left text-sm text-ink-muted">
                        <th className="pb-2 font-medium">{t("dispatchDocs.numberHeader")}</th>
                        <th className="pb-2 font-medium">{t("common.date")}</th>
                        <th className="pb-2 font-medium text-right">{t("customer.invoiceTotalHeader")}</th>
                        <th className="pb-2 font-medium text-right">{t("customer.invoicePaidHeader")}</th>
                        <th className="pb-2 font-medium text-right">{t("customer.invoiceDueHeader")}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {invoices.map((inv) => {
                        // Bug fix: this used to show each invoice's raw,
                        // unresolved (charge − paid), which could disagree
                        // with the Reports "Invoices" report's own FIFO-
                        // settled due for the identical invoice whenever a
                        // later top-up payment cleared an earlier
                        // shortfall. inv.fifoDue (customer.service.ts's
                        // fifoResolveInvoiceDues) is the same settlement
                        // logic, so the two screens can no longer disagree.
                        // charge/paid below are still shown as their own
                        // columns (what was billed, what came in against
                        // THIS invoice specifically) — only the Due column
                        // changed. credit (a 0-brick payment row, or an
                        // invoice paid for more than it charged) is still
                        // its own raw per-row figure — FIFO settlement is
                        // about clearing an EARLIER invoice's due, not
                        // this row's own credit display.
                        const charge = inv.bricksCount > 0 ? inv.netAmount : 0;
                        const paid = inv.amountPaidNow ?? inv.netAmount;
                        const rawDue = Math.round((charge - paid) * 100) / 100;
                        const due = inv.fifoDue;
                        const credit = Math.max(0, -rawDue);
                        return (
                          <tr key={inv._id} onClick={() => setOpenInvoiceId(inv._id)} className="cursor-pointer border-b border-border/60 last:border-0 hover:bg-ink-primary/5">
                            <td className="py-3 text-ink-primary hover:underline">{formatInvoiceNumber(inv, kilnName)}</td>
                            <td className="py-3 text-ink-secondary">{inv.invoiceDate ? new Date(inv.invoiceDate).toLocaleDateString("en-IN") : "—"}</td>
                            <td className="py-3 text-right tabular-nums font-medium text-ink-primary">₹{formatINR(charge)}</td>
                            <td className="py-3 text-right tabular-nums text-status-good">₹{formatINR(paid)}</td>
                            <td className={`py-3 text-right tabular-nums ${credit > 0 ? "text-status-good" : "text-status-critical"}`}>
                              {credit > 0 ? `${t("customer.invoiceCreditPrefix")} ₹${formatINR(credit)}` : `₹${formatINR(due)}`}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </Card>
          </div>
        </>
      )}

      {showAddAmount && (
        <AddCustomerPaymentModal
          customer={customer}
          currentDue={totalDue}
          onClose={() => setShowAddAmount(false)}
          onSaved={refresh}
        />
      )}
    </div>
  );
}
