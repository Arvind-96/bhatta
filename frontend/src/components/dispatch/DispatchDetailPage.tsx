import { FormEvent, useEffect, useState } from "react";
import { ArrowLeft, Ban, FileText, Pencil, Printer, Receipt, Truck } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useTranslation } from "@/hooks/useTranslation";
import { useKilnEvent } from "@/hooks/useKilnEvent";
import { useAuthStore } from "@/store/auth.store";
import { api } from "@/lib/api";
import { formatDateTime, formatINR } from "@/lib/utils";
import { formatInvoiceNumber, printChallanRecord, printGatePassRecord, printInvoiceRecord, resolveItemRows } from "@/lib/printDocument";
import { resolvePaymentInfo } from "@/lib/paymentStatus";
import { LineItemsDetailTable } from "@/components/dispatch/BrickLineItemsEditor";
import { CreateChallanForm } from "./CreateChallanForm";
import { CreateGatePassForm } from "./CreateGatePassForm";
import { CreateInvoiceForm } from "./CreateInvoiceForm";
import type { BrickCategory, Challan, Customer, Dispatch as DispatchEntry, GatePassRecord, Invoice } from "@/types";

function Field({ label, value }: { label: string; value?: string | number | null }) {
  if (value === undefined || value === null || value === "") return null;
  return (
    <div>
      <p className="text-sm text-ink-muted">{label}</p>
      <p className="text-sm text-ink-primary">{value}</p>
    </div>
  );
}

// Same muted "stays visible, marked Cancelled" tone SaleOrders.tsx's own
// STATUS_TONE.CANCELLED uses — not the shared Badge component, which has
// no cancelled variant.
function CancelledBadge({ label }: { label: string }) {
  return <span className="rounded-full bg-ink-primary/10 px-2 py-0.5 text-xs font-semibold text-ink-muted">{label}</span>;
}

interface DispatchDetailPageProps {
  dispatch: DispatchEntry;
  categories: BrickCategory[];
  onBack: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onAdjusted: () => void;
}

// The profile-style page for a single Dispatch record — reached by
// clicking a row on Dispatch.tsx's table. Shows every field, Edit/Delete
// (reusing the existing EditDispatchModal via the parent's onEdit), and
// three "Create X" buttons that each open the matching form inline below
// (CreateChallanForm/CreateGatePassForm/CreateInvoiceForm) — every one of
// Challan, Gate Pass, and Invoice is its own saved record here, distinct
// from this dispatch and from each other, with its own Print/Edit/Delete
// once created.
export function DispatchDetailPage({ dispatch, categories, onBack, onEdit, onDelete, onAdjusted }: DispatchDetailPageProps) {
  const { t } = useTranslation();
  const kilns = useAuthStore((s) => s.kilns);
  const activeKilnId = useAuthStore((s) => s.activeKilnId);
  const activeKiln = kilns.find((k) => k.kilnId === activeKilnId);
  const kilnInfo = {
    name: activeKiln?.name ?? "Bhatta Cloud",
    location: activeKiln?.location,
    phone: activeKiln?.phone,
    gstNumber: activeKiln?.gstNumber,
    stateCode: activeKiln?.stateCode,
    bankAccountNumber: activeKiln?.bankAccountNumber,
    bankName: activeKiln?.bankName,
    bankIfscCode: activeKiln?.bankIfscCode,
  };

  const [activeForm, setActiveForm] = useState<"challan" | "gatePass" | "invoice" | null>(null);
  const [challansList, setChallansList] = useState<Challan[]>([]);
  const [gatePassesList, setGatePassesList] = useState<GatePassRecord[]>([]);
  const [invoicesList, setInvoicesList] = useState<Invoice[]>([]);
  const [customersList, setCustomersList] = useState<Customer[]>([]);
  const [editingChallan, setEditingChallan] = useState<Challan | null>(null);
  const [editingGatePass, setEditingGatePass] = useState<GatePassRecord | null>(null);
  const [editingInvoice, setEditingInvoice] = useState<Invoice | null>(null);
  const [showAdjustment, setShowAdjustment] = useState(false);
  const [adjustForm, setAdjustForm] = useState({
    breakageCount: String(dispatch.breakageCount || ""),
    returnedCount: String(dispatch.returnedCount || ""),
    returnReason: dispatch.returnReason ?? "",
  });
  const [savingAdjustment, setSavingAdjustment] = useState(false);

  async function submitAdjustment(e: FormEvent) {
    e.preventDefault();
    setSavingAdjustment(true);
    try {
      await api.dispatch.adjustment(dispatch._id, {
        breakageCount: adjustForm.breakageCount ? Number(adjustForm.breakageCount) : undefined,
        returnedCount: adjustForm.returnedCount ? Number(adjustForm.returnedCount) : undefined,
        returnReason: adjustForm.returnReason || undefined,
      });
      setShowAdjustment(false);
      onAdjusted();
    } finally {
      setSavingAdjustment(false);
    }
  }

  async function refreshDocs() {
    const [c, g, i, cust] = await Promise.all([
      api.challans.list(dispatch._id),
      api.gatePasses.list(dispatch._id),
      api.invoices.list(dispatch._id),
      api.customers.list(),
    ]);
    setChallansList(c);
    setGatePassesList(g);
    setInvoicesList(i);
    setCustomersList(cust);
  }

  useEffect(() => {
    refreshDocs().catch(console.error);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dispatch._id]);

  useKilnEvent("challan:update", () => refreshDocs());
  useKilnEvent("gatePass:update", () => refreshDocs());
  useKilnEvent("invoice:update", () => refreshDocs());
  useKilnEvent("customer:update", () => refreshDocs());

  function closeForms() {
    setActiveForm(null);
    setEditingChallan(null);
    setEditingGatePass(null);
    setEditingInvoice(null);
  }

  function toggleForm(form: "challan" | "gatePass" | "invoice") {
    if (activeForm === form) {
      closeForms();
    } else {
      closeForms();
      setActiveForm(form);
    }
  }

  async function cancelChallan(c: Challan) {
    if (!confirm(t("dispatchDocs.confirmDeleteChallan", { number: c.sequenceNumber ?? "—" }))) return;
    await api.challans.remove(c._id);
    await refreshDocs();
  }
  async function cancelGatePass(g: GatePassRecord) {
    if (!confirm(t("dispatchDocs.confirmDeleteGatePass", { number: g.sequenceNumber ?? "—" }))) return;
    await api.gatePasses.remove(g._id);
    await refreshDocs();
  }
  async function cancelInvoice(i: Invoice) {
    if (!confirm(t("dispatchDocs.confirmDeleteInvoice", { number: formatInvoiceNumber(i, kilnInfo.name) }))) return;
    await api.invoices.remove(i._id);
    await refreshDocs();
  }

  async function printChallan(c: Challan) {
    const { stamp } = await resolvePaymentInfo({ customerName: c.customerName, remainingOnThisDoc: 0 });
    printChallanRecord(c, kilnInfo, categories, stamp);
  }
  async function printGatePass(g: GatePassRecord) {
    const { stamp } = await resolvePaymentInfo({ customerName: g.customerName, remainingOnThisDoc: 0 });
    printGatePassRecord(g, kilnInfo, categories, stamp);
  }
  async function printInvoice(i: Invoice) {
    const remainingOnThisDoc = Math.max(0, Math.round((i.netAmount - (i.amountPaidNow ?? i.netAmount)) * 100) / 100);
    const [{ stamp }, signatureDataUri] = await Promise.all([
      resolvePaymentInfo({ customerId: i.customerId, customerName: i.customerName, remainingOnThisDoc }),
      api.kilns.fetchSignatureDataUri(),
    ]);
    printInvoiceRecord(i, { ...kilnInfo, signatureDataUri }, categories, stamp);
  }

  const driver = dispatch.driverName || (typeof dispatch.driverId === "object" ? dispatch.driverId?.name : undefined);
  const itemRows = resolveItemRows(dispatch.items, categories, { categoryId: dispatch.categoryId, bricksCount: dispatch.bricksCount });

  return (
    <div>
      <button onClick={onBack} className="mb-3 flex items-center gap-1.5 text-sm text-ink-secondary hover:text-ink-primary">
        <ArrowLeft className="h-4 w-4" /> {t("dispatchDocs.backToDispatch")}
      </button>

      <Card className="mb-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h3 className="flex items-center gap-2 text-lg font-semibold text-ink-primary">
              {dispatch.slipNumber} · {dispatch.customerName}
              {dispatch.cancelled && <CancelledBadge label={t("common.cancelledBadge")} />}
            </h3>
            <p className="text-sm text-ink-muted">
              {new Date(dispatch.dispatchedOn).toLocaleDateString("en-IN")} · {formatDateTime(dispatch.createdAt)}
            </p>
          </div>
          {!dispatch.cancelled && (
            <div className="flex gap-2">
              <button onClick={onEdit} className="flex items-center gap-1 rounded-lg border border-border bg-ink-primary/5 px-3 py-1.5 text-xs font-medium text-ink-secondary hover:bg-ink-primary/10">
                <Pencil className="h-3.5 w-3.5" /> {t("common.edit")}
              </button>
              <button onClick={onDelete} className="flex items-center gap-1 rounded-lg border border-status-critical/30 bg-status-critical/5 px-3 py-1.5 text-xs font-medium text-status-critical hover:bg-status-critical/10">
                <Ban className="h-3.5 w-3.5" /> {t("common.cancel")}
              </button>
            </div>
          )}
        </div>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-muted">{t("brickLoading.customerPartySection")}</h4>
          <div className="grid grid-cols-2 gap-3">
            <Field label={t("brickLoading.customerNamePlaceholder")} value={dispatch.customerName} />
            <Field label={t("brickLoading.customerPhonePlaceholder")} value={dispatch.customerPhone} />
            <Field label={t("brickLoading.customerAddressPlaceholder")} value={dispatch.customerAddress} />
            <Field label={t("dispatchDocs.placeOfSupplyPlaceholder")} value={dispatch.placeOfSupply} />
          </div>
        </Card>

        <Card>
          <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-muted">{t("brickLoading.driverSection")}</h4>
          <div className="grid grid-cols-2 gap-3">
            <Field label={t("brickLoading.driverNamePlaceholder")} value={driver} />
            <Field label={t("brickLoading.driverPhonePlaceholder")} value={dispatch.driverPhone} />
            <Field label={t("brickLoading.driverRewardPlaceholder")} value={dispatch.driverTipAmount ? `₹${formatINR(dispatch.driverTipAmount)}` : undefined} />
          </div>
        </Card>

        <Card className="lg:col-span-2">
          <h4 className="mb-3 text-xs font-semibold uppercase tracking-wide text-ink-muted">{t("dispatchDocs.dispatchDetailsSection")}</h4>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Field label={t("common.vehicle")} value={dispatch.vehicleNumber} />
            {itemRows.length <= 1 && <Field label={t("brickLoading.categoryHeader")} value={itemRows[0]?.label ?? "—"} />}
            <Field label={t("dispatch.bricksHeader")} value={dispatch.bricksCount.toLocaleString("en-IN")} />
            <Field label={t("common.amount")} value={`₹${formatINR(dispatch.amount)}`} />
            <Field label={t("common.paymentMode")} value={dispatch.paymentMode ?? undefined} />
            <Field label={t("dispatch.transportCostPlaceholder")} value={dispatch.transportCost ? `₹${formatINR(dispatch.transportCost)}` : undefined} />
          </div>
          {itemRows.length > 1 && (
            <div className="mt-3">
              <LineItemsDetailTable rows={itemRows} />
            </div>
          )}
        </Card>

        <Card className="lg:col-span-2">
          <div className="mb-3 flex items-center justify-between">
            <h4 className="text-xs font-semibold uppercase tracking-wide text-ink-muted">{t("dispatch.adjustmentsHeader")}</h4>
            {dispatch.cancelled ? (
              (dispatch.breakageCount > 0 || dispatch.returnedCount > 0) && (
                <span className="text-xs font-medium text-ink-muted">
                  {t("dispatch.brokenReturnedSummary", { broken: dispatch.breakageCount, returned: dispatch.returnedCount })}
                </span>
              )
            ) : (
              <button onClick={() => setShowAdjustment((s) => !s)} className="text-xs font-medium text-series-1 hover:underline">
                {dispatch.breakageCount > 0 || dispatch.returnedCount > 0
                  ? t("dispatch.brokenReturnedSummary", { broken: dispatch.breakageCount, returned: dispatch.returnedCount })
                  : t("dispatch.addBreakageReturn")}
              </button>
            )}
          </div>
          {showAdjustment && !dispatch.cancelled && (
            <form onSubmit={submitAdjustment} className="flex flex-wrap items-end gap-2">
              <input
                type="number"
                placeholder={t("dispatch.breakageCountPlaceholder")}
                value={adjustForm.breakageCount}
                onChange={(e) => setAdjustForm((f) => ({ ...f, breakageCount: e.target.value }))}
                className="h-9 w-32 rounded-lg border border-border bg-ink-primary/5 px-2 text-xs text-ink-primary outline-none"
              />
              <input
                type="number"
                placeholder={t("dispatch.returnedCountPlaceholder")}
                value={adjustForm.returnedCount}
                onChange={(e) => setAdjustForm((f) => ({ ...f, returnedCount: e.target.value }))}
                className="h-9 w-32 rounded-lg border border-border bg-ink-primary/5 px-2 text-xs text-ink-primary outline-none"
              />
              <input
                placeholder={t("dispatch.returnReasonPlaceholder")}
                value={adjustForm.returnReason}
                onChange={(e) => setAdjustForm((f) => ({ ...f, returnReason: e.target.value }))}
                className="h-9 flex-1 rounded-lg border border-border bg-ink-primary/5 px-2 text-xs text-ink-primary outline-none"
              />
              <Button type="submit" size="sm" disabled={savingAdjustment}>
                {t("common.save")}
              </Button>
            </form>
          )}
        </Card>

        {!dispatch.cancelled && (
        <Card className="lg:col-span-2">
          <h4 className="mb-3 text-xs font-semibold uppercase tracking-wide text-ink-muted">{t("dispatchDocs.generateDocumentsSection")}</h4>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="outline" onClick={() => toggleForm("challan")}>
              <FileText className="h-4 w-4" /> {t("dispatchDocs.createChallanButton")}
            </Button>
            <Button size="sm" variant="outline" onClick={() => toggleForm("gatePass")}>
              <Truck className="h-4 w-4" /> {t("dispatchDocs.createGatePassButton")}
            </Button>
            <Button size="sm" variant="outline" onClick={() => toggleForm("invoice")}>
              <Receipt className="h-4 w-4" /> {t("dispatchDocs.createInvoiceButton")}
            </Button>
          </div>
        </Card>
        )}

        {(activeForm === "challan" || editingChallan) && (
          <div className="lg:col-span-2">
            <CreateChallanForm
              dispatch={dispatch}
              categories={categories}
              existing={editingChallan}
              onClose={closeForms}
              onSaved={() => {
                closeForms();
                refreshDocs();
              }}
            />
          </div>
        )}
        {(activeForm === "gatePass" || editingGatePass) && (
          <div className="lg:col-span-2">
            <CreateGatePassForm
              dispatch={dispatch}
              categories={categories}
              existing={editingGatePass}
              onClose={closeForms}
              onSaved={() => {
                closeForms();
                refreshDocs();
              }}
            />
          </div>
        )}
        {(activeForm === "invoice" || editingInvoice) && (
          <div className="lg:col-span-2">
            <CreateInvoiceForm
              dispatch={dispatch}
              categories={categories}
              existing={editingInvoice}
              customers={customersList}
              defaultCustomerId={customersList.find((c) => c.name.trim().toLowerCase() === dispatch.customerName.trim().toLowerCase())?._id}
              onClose={closeForms}
              onSaved={() => {
                closeForms();
                refreshDocs();
              }}
            />
          </div>
        )}

        {challansList.length > 0 && (
          <Card className="lg:col-span-2">
            <h4 className="mb-3 text-xs font-semibold uppercase tracking-wide text-ink-muted">{t("dispatchDocs.challansListTitle")}</h4>
            <div className="space-y-1">
              {challansList.map((c) => (
                <div key={c._id} className="flex items-center justify-between rounded-lg border border-border px-3 py-2 text-sm">
                  <div>
                    <p className="flex items-center gap-2 text-ink-primary">
                      CH-{c.sequenceNumber ?? "—"}
                      {c.cancelled && <CancelledBadge label={t("common.cancelledBadge")} />}
                    </p>
                    <p className="text-sm text-ink-muted">{c.bricksCount.toLocaleString("en-IN")} {t("brickLoading.bricksUnit")} · {c.customerName}</p>
                  </div>
                  <div className="flex items-center gap-3">
                    <button onClick={() => printChallan(c)} className="flex items-center gap-1 text-xs font-medium text-series-1 hover:underline">
                      <Printer className="h-3.5 w-3.5" /> {t("common.print")}
                    </button>
                    {!c.cancelled && (
                      <>
                        <button onClick={() => { closeForms(); setEditingChallan(c); }} className="flex items-center gap-1 text-xs font-medium text-ink-secondary hover:text-ink-primary">
                          <Pencil className="h-3.5 w-3.5" /> {t("common.edit")}
                        </button>
                        <button onClick={() => cancelChallan(c)} className="flex items-center gap-1 text-xs font-medium text-status-critical hover:underline">
                          <Ban className="h-3.5 w-3.5" /> {t("common.cancel")}
                        </button>
                      </>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </Card>
        )}

        {gatePassesList.length > 0 && (
          <Card className="lg:col-span-2">
            <h4 className="mb-3 text-xs font-semibold uppercase tracking-wide text-ink-muted">{t("dispatchDocs.gatePassesListTitle")}</h4>
            <div className="space-y-1">
              {gatePassesList.map((g) => (
                <div key={g._id} className="flex items-center justify-between rounded-lg border border-border px-3 py-2 text-sm">
                  <div>
                    <p className="flex items-center gap-2 text-ink-primary">
                      GP-{g.sequenceNumber ?? "—"}
                      {g.cancelled && <CancelledBadge label={t("common.cancelledBadge")} />}
                    </p>
                    <p className="text-sm text-ink-muted">{g.bricksCount.toLocaleString("en-IN")} {t("brickLoading.bricksUnit")} · {g.customerName}</p>
                  </div>
                  <div className="flex items-center gap-3">
                    <button onClick={() => printGatePass(g)} className="flex items-center gap-1 text-xs font-medium text-series-1 hover:underline">
                      <Printer className="h-3.5 w-3.5" /> {t("common.print")}
                    </button>
                    {!g.cancelled && (
                      <>
                        <button onClick={() => { closeForms(); setEditingGatePass(g); }} className="flex items-center gap-1 text-xs font-medium text-ink-secondary hover:text-ink-primary">
                          <Pencil className="h-3.5 w-3.5" /> {t("common.edit")}
                        </button>
                        <button onClick={() => cancelGatePass(g)} className="flex items-center gap-1 text-xs font-medium text-status-critical hover:underline">
                          <Ban className="h-3.5 w-3.5" /> {t("common.cancel")}
                        </button>
                      </>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </Card>
        )}

        {invoicesList.length > 0 && (
          <Card className="lg:col-span-2">
            <h4 className="mb-3 text-xs font-semibold uppercase tracking-wide text-ink-muted">{t("dispatchDocs.invoicesListTitle")}</h4>
            <div className="space-y-1">
              {invoicesList.map((i) => (
                <div key={i._id} className="flex items-center justify-between rounded-lg border border-border px-3 py-2 text-sm">
                  <div>
                    <p className="flex items-center gap-2 text-ink-primary">
                      {formatInvoiceNumber(i, kilnInfo.name)}
                      {i.cancelled && <CancelledBadge label={t("common.cancelledBadge")} />}
                    </p>
                    <p className="text-sm text-ink-muted">₹{formatINR(i.netAmount)} · {i.customerName}</p>
                  </div>
                  <div className="flex items-center gap-3">
                    <button onClick={() => printInvoice(i)} className="flex items-center gap-1 text-xs font-medium text-series-1 hover:underline">
                      <Printer className="h-3.5 w-3.5" /> {t("common.print")}
                    </button>
                    {!i.cancelled && (
                      <>
                        <button onClick={() => { closeForms(); setEditingInvoice(i); }} className="flex items-center gap-1 text-xs font-medium text-ink-secondary hover:text-ink-primary">
                          <Pencil className="h-3.5 w-3.5" /> {t("common.edit")}
                        </button>
                        <button onClick={() => cancelInvoice(i)} className="flex items-center gap-1 text-xs font-medium text-status-critical hover:underline">
                          <Ban className="h-3.5 w-3.5" /> {t("common.cancel")}
                        </button>
                      </>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </Card>
        )}

        {dispatch.notes && (
          <Card className="lg:col-span-2">
            <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-muted">{t("common.notes")}</h4>
            <p className="text-sm text-ink-primary">{dispatch.notes}</p>
          </Card>
        )}
      </div>
    </div>
  );
}
