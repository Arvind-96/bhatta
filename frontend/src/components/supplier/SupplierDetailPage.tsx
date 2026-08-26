import { useEffect, useState } from "react";
import { ArrowLeft, Pencil, Phone, Plus, Printer, Trash2 } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/shared/ConfirmDialog";
import { AddSupplierForm } from "./AddSupplierForm";
import { AddSupplierInvoiceForm } from "./AddSupplierInvoiceForm";
import { api } from "@/lib/api";
import { useKilnEvent } from "@/hooks/useKilnEvent";
import { useAuthStore } from "@/store/auth.store";
import { useTranslation } from "@/hooks/useTranslation";
import { formatINR } from "@/lib/utils";
import { printSupplierInvoiceRecord } from "@/lib/printDocument";
import type { Supplier, SupplierDetail, SupplierInvoice } from "@/types";

interface SupplierDetailPageProps {
  supplierId: string;
  onBack: () => void;
  onDeleted: () => void;
}

export function SupplierDetailPage({ supplierId, onBack, onDeleted }: SupplierDetailPageProps) {
  const { t } = useTranslation();
  const [detail, setDetail] = useState<SupplierDetail | null>(null);
  const [allSuppliers, setAllSuppliers] = useState<Supplier[]>([]);
  const [editing, setEditing] = useState(false);
  const [showNewInvoice, setShowNewInvoice] = useState(false);
  const [editingInvoice, setEditingInvoice] = useState<SupplierInvoice | null>(null);
  const [pendingDeleteInvoiceId, setPendingDeleteInvoiceId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const activeKiln = useAuthStore((s) => s.kilns.find((k) => k.kilnId === s.activeKilnId));

  async function refresh() {
    const [detailData, suppliersData] = await Promise.all([api.suppliers.detail(supplierId), api.suppliers.list()]);
    setDetail(detailData);
    setAllSuppliers(suppliersData);
  }

  useEffect(() => {
    refresh().catch(console.error);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [supplierId]);

  useKilnEvent<{ _id: string; deleted?: boolean }>("supplier:update", (payload) => {
    if (payload._id === supplierId && payload.deleted) {
      onDeleted();
      return;
    }
    refresh().catch(console.error);
  });
  useKilnEvent("supplierInvoice:update", () => refresh().catch(console.error));

  async function handleDeleteSupplier() {
    if (!detail) return;
    if (!confirm(t("supplier.confirmDeleteSupplier", { name: detail.supplier.name }))) return;
    await api.suppliers.remove(supplierId);
    onDeleted();
  }

  if (!detail) {
    return (
      <div>
        <button onClick={onBack} className="mb-3 flex items-center gap-1.5 text-sm text-ink-secondary hover:text-ink-primary">
          <ArrowLeft className="h-4 w-4" /> {t("supplier.backToSuppliers")}
        </button>
        <Card>
          <p className="py-8 text-center text-sm text-ink-muted">{t("common.loading")}</p>
        </Card>
      </div>
    );
  }

  const { supplier, invoices, totalPaid, totalDue } = detail;
  const pendingDeleteInvoice = invoices.find((i) => i._id === pendingDeleteInvoiceId) ?? null;

  return (
    <div>
      <button onClick={onBack} className="mb-3 flex items-center gap-1.5 text-sm text-ink-secondary hover:text-ink-primary">
        <ArrowLeft className="h-4 w-4" /> {t("supplier.backToSuppliers")}
      </button>

      {editing ? (
        <AddSupplierForm existing={supplier} onClose={() => setEditing(false)} onSaved={() => { setEditing(false); refresh(); }} />
      ) : showNewInvoice || editingInvoice ? (
        <AddSupplierInvoiceForm
          suppliers={allSuppliers}
          existing={editingInvoice}
          defaultSupplierId={supplierId}
          onClose={() => {
            setShowNewInvoice(false);
            setEditingInvoice(null);
          }}
          onSaved={() => {
            setShowNewInvoice(false);
            setEditingInvoice(null);
            refresh();
          }}
        />
      ) : (
        <>
          <Card className="mb-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h3 className="text-lg font-semibold text-ink-primary">{supplier.name}</h3>
                {supplier.phone && (
                  <a href={`tel:${supplier.phone}`} className="flex items-center gap-1.5 text-sm text-ink-secondary hover:text-series-1">
                    <Phone className="h-3.5 w-3.5" /> {supplier.phone}
                  </a>
                )}
                {supplier.address && <p className="mt-0.5 text-sm text-ink-muted">{supplier.address}</p>}
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => setEditing(true)}
                  className="flex items-center gap-1 rounded-lg border border-border bg-ink-primary/5 px-3 py-1.5 text-xs font-medium text-ink-secondary hover:bg-ink-primary/10"
                >
                  <Pencil className="h-3.5 w-3.5" /> {t("common.edit")}
                </button>
                <button
                  onClick={handleDeleteSupplier}
                  className="flex items-center gap-1 rounded-lg border border-status-critical/30 bg-status-critical/5 px-3 py-1.5 text-xs font-medium text-status-critical hover:bg-status-critical/10"
                >
                  <Trash2 className="h-3.5 w-3.5" /> {t("common.delete")}
                </button>
              </div>
            </div>
          </Card>

          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-muted">{t("supplier.suppliesListSection")}</h4>
              {supplier.suppliesList.length === 0 ? (
                <p className="text-sm text-ink-muted">—</p>
              ) : (
                <div className="flex flex-wrap gap-1.5">
                  {supplier.suppliesList.map((item, i) => (
                    <span key={i} className="rounded-full border border-border bg-ink-primary/5 px-2.5 py-1 text-xs text-ink-secondary">
                      {item.itemName} · {item.unit}
                      {item.rate != null ? ` · ₹${item.rate}` : ""}
                    </span>
                  ))}
                </div>
              )}
            </Card>

            <Card>
              <div className="mb-3 flex items-center justify-between">
                <h4 className="text-xs font-semibold uppercase tracking-wide text-ink-muted">{t("supplier.totalPaidLabel")} / {t("supplier.totalDueLabel")}</h4>
                <Button size="sm" onClick={() => setShowNewInvoice(true)}>
                  <Plus className="h-4 w-4" /> {t("supplier.createInvoiceButton")}
                </Button>
              </div>
              <div className="grid grid-cols-2 gap-2 text-center">
                <div className="rounded-xl border border-status-good/30 bg-status-good/5 p-3">
                  <p className="text-xl font-semibold tabular-nums text-status-good">₹{formatINR(totalPaid)}</p>
                  <p className="text-sm text-ink-muted">{t("supplier.totalPaidLabel")}</p>
                </div>
                <div className="rounded-xl border border-status-critical/30 bg-status-critical/5 p-3">
                  <p className="text-xl font-semibold tabular-nums text-status-critical">₹{formatINR(totalDue)}</p>
                  <p className="text-sm text-ink-muted">{t("supplier.totalDueLabel")}</p>
                </div>
              </div>
            </Card>

            <Card className="lg:col-span-2">
              <h4 className="mb-3 text-xs font-semibold uppercase tracking-wide text-ink-muted">{t("supplier.invoiceListSection")}</h4>
              {invoices.length === 0 ? (
                <p className="py-6 text-center text-sm text-ink-muted">{t("supplier.noInvoicesYet")}</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[560px] text-sm">
                    <thead>
                      <tr className="border-b border-border text-left text-sm text-ink-muted">
                        <th className="pb-2 font-medium">{t("dispatchDocs.numberHeader")}</th>
                        <th className="pb-2 font-medium">{t("common.date")}</th>
                        <th className="pb-2 font-medium text-right">{t("supplier.totalBillAmountLabel")}</th>
                        <th className="pb-2 font-medium text-right">{t("supplier.amountPaidLabel")}</th>
                        <th className="pb-2 font-medium text-right">{t("supplier.dueAmountLabel")}</th>
                        <th className="pb-2 font-medium text-right">{t("common.actions")}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {invoices.map((inv) => {
                        const due = Math.max(0, inv.totalBillAmount - inv.amountPaid);
                        return (
                          <tr key={inv._id} className="cursor-pointer border-b border-border/60 last:border-0 hover:bg-ink-primary/5" onClick={() => setEditingInvoice(inv)}>
                            <td className="py-3 text-ink-primary hover:underline">
                              {inv.sequenceNumber ? `SUP-INV-${inv.sequenceNumber}` : "—"}
                            </td>
                            <td className="py-3 text-ink-secondary">{inv.date ? new Date(inv.date).toLocaleDateString("en-IN") : "—"}</td>
                            <td className="py-3 text-right tabular-nums font-medium text-ink-primary">₹{formatINR(inv.totalBillAmount)}</td>
                            <td className="py-3 text-right tabular-nums text-status-good">₹{formatINR(inv.amountPaid)}</td>
                            <td className="py-3 text-right tabular-nums text-status-critical">₹{formatINR(due)}</td>
                            <td className="py-3">
                              <div className="flex justify-end gap-1.5" onClick={(e) => e.stopPropagation()}>
                                <button
                                  onClick={() => printSupplierInvoiceRecord(inv, supplier, activeKiln?.name ?? "Bhatta Cloud")}
                                  className="flex h-7 w-7 items-center justify-center rounded-lg border border-border text-ink-secondary hover:border-series-1/50 hover:text-series-1"
                                  aria-label={t("supplier.printReceipt")}
                                >
                                  <Printer className="h-3.5 w-3.5" />
                                </button>
                                <button
                                  onClick={() => setEditingInvoice(inv)}
                                  className="flex h-7 w-7 items-center justify-center rounded-lg border border-border text-ink-secondary hover:border-series-1/50 hover:text-series-1"
                                  aria-label={t("common.edit")}
                                >
                                  <Pencil className="h-3.5 w-3.5" />
                                </button>
                                <button
                                  onClick={() => setPendingDeleteInvoiceId(inv._id)}
                                  className="flex h-7 w-7 items-center justify-center rounded-lg border border-status-critical/30 text-status-critical hover:bg-status-critical/10"
                                  aria-label={t("common.delete")}
                                >
                                  <Trash2 className="h-3.5 w-3.5" />
                                </button>
                              </div>
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

      {pendingDeleteInvoice && (
        <ConfirmDialog
          title={t("common.delete")}
          detail={t("supplier.confirmDeleteInvoice")}
          confirmLabel={t("common.delete")}
          loading={deleting}
          onCancel={() => setPendingDeleteInvoiceId(null)}
          onConfirm={async () => {
            setDeleting(true);
            try {
              await api.supplierInvoices.remove(pendingDeleteInvoice._id);
              setPendingDeleteInvoiceId(null);
            } finally {
              setDeleting(false);
            }
          }}
        />
      )}
    </div>
  );
}
