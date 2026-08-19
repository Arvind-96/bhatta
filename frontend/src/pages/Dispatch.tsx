import { Fragment, FormEvent, useEffect, useState } from "react";
import { AlertTriangle, Pencil, Plus, Trash2 } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Pagination, usePagination } from "@/components/ui/pagination";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { cn, formatDateTime, formatINR } from "@/lib/utils";
import { api } from "@/lib/api";
import { useKilnEvent } from "@/hooks/useKilnEvent";
import { useAuthStore } from "@/store/auth.store";
import { useUiStore } from "@/store/ui.store";
import { useTranslation } from "@/hooks/useTranslation";
import { EditDispatchModal } from "@/components/dispatch/EditDispatchModal";
import { isPaymentSplitMismatched, PaymentSplitFields } from "@/components/shared/PaymentSplitFields";
import type { BrickCategory, BrickLoadingEntry, BrickVehicleType, Dispatch as DispatchEntry, FinishedGoodsReconciliation, PaymentMode, Person } from "@/types";

const inputClass =
  "h-10 rounded-xl border border-border bg-ink-primary/5 px-3 text-sm text-ink-primary outline-none focus:ring-2 focus:ring-series-1";

const PAGE_SIZE = 10;

function categoryGradeLabel(c: BrickCategory) {
  return c.grade ? `${c.category} (${c.grade})` : c.category;
}

// Prefer the free-form category+grade this dispatch was linked to over the
// older fixed A1/JHAMA/PELA classification — same fallback rule used on the
// Gate Pass/Challan print templates.
function dispatchCategoryGradeLabel(d: DispatchEntry, gradeLabels: Record<string, string>) {
  const cat = d.categoryId;
  if (cat && typeof cat === "object") {
    return cat.grade ? `${cat.category} (${cat.grade})` : cat.category;
  }
  return gradeLabels[d.grade] ?? d.grade;
}

function tripLabel(t: BrickLoadingEntry) {
  const category = typeof t.categoryId === "object" ? t.categoryId : null;
  const parts = [
    t.tripNumber ? `#${t.tripNumber}` : null,
    t.vehicleNumber,
    `${t.bricksCount.toLocaleString("en-IN")} bricks`,
    category ? (category.grade ? `${category.category} (${category.grade})` : category.category) : null,
  ].filter(Boolean);
  return parts.join(" · ");
}

function emptyForm() {
  return {
    loadingEntryId: "",
    customerId: "",
    customerName: "",
    customerAddress: "",
    customerPhone: "",
    vehicleNumber: "",
    vehicleType: "" as "" | BrickVehicleType,
    driverName: "",
    driverPhone: "",
    driverTipAmount: "",
    bricksCount: "",
    amount: "",
    discountAmount: "",
    categoryId: "",
    notes: "",
    transportCost: "",
    paymentMode: "CASH" as PaymentMode,
    cashAmount: "",
    onlineAmount: "",
    dispatchedOn: new Date().toISOString().slice(0, 10),
  };
}

export function Dispatch() {
  const [dispatches, setDispatches] = useState<DispatchEntry[]>([]);
  const [customers, setCustomers] = useState<Person[]>([]);
  const [categories, setCategories] = useState<BrickCategory[]>([]);
  const [loadingTrips, setLoadingTrips] = useState<BrickLoadingEntry[]>([]);
  const [reconciliation, setReconciliation] = useState<FinishedGoodsReconciliation | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [adjustingId, setAdjustingId] = useState<string | null>(null);
  const [adjustForm, setAdjustForm] = useState({ breakageCount: "", returnedCount: "", returnReason: "" });
  const [editingDispatch, setEditingDispatch] = useState<DispatchEntry | null>(null);
  const [form, setForm] = useState(emptyForm());
  const [loading, setLoading] = useState(false);
  const [formError, setFormError] = useState("");
  const [highlightedId, setHighlightedId] = useState<string | null>(null);
  const activeKilnId = useAuthStore((s) => s.activeKilnId);
  const highlightTarget = useUiStore((s) => s.highlightTarget);
  const clearHighlightTarget = useUiStore((s) => s.clearHighlightTarget);
  const { t } = useTranslation();
  const { page, setPage, pageCount, pageItems: pagedDispatches, total } = usePagination(dispatches, PAGE_SIZE);
  const GRADE_LABELS: Record<string, string> = {
    A1: t("dispatch.gradeA1"),
    JHAMA: t("dispatch.gradeJhama"),
    PELA: t("dispatch.gradePela"),
  };

  async function refresh() {
    const [dispatchData, customerData, recon, categoryData, tripData] = await Promise.all([
      api.dispatch.list(),
      api.people.list("CUSTOMER"),
      api.finishedGoodsReconciliation(),
      api.brickCategories.list(),
      api.brickLoading.list(),
    ]);
    setDispatches(dispatchData);
    setCustomers(customerData);
    setReconciliation(recon);
    setCategories(categoryData);
    setLoadingTrips(tripData);
  }

  useEffect(() => {
    if (!activeKilnId) return;
    refresh().catch(console.error);
  }, [activeKilnId]);

  useKilnEvent("dispatch:update", () => refresh());
  useKilnEvent("grading:update", () => refresh());
  useKilnEvent("brickLoading:update", () => refresh());

  // A trip linked to some OTHER dispatch already can't be selected here
  // (createDispatch rejects it server-side too) — so it's excluded from the
  // picker entirely rather than shown and then failing on submit. Already
  // sorted latest-first by the backend (listBrickLoadingEntries orders
  // desc(date)).
  const unlinkedTrips = loadingTrips.filter((t) => !t.dispatchId);
  const selectedTrip = unlinkedTrips.find((t) => t._id === form.loadingEntryId);
  const tripLocked = !!form.loadingEntryId;

  useEffect(() => {
    if (!highlightTarget || highlightTarget.view !== "dispatch" || dispatches.length === 0) return;
    const idx = dispatches.findIndex((d) => d._id === highlightTarget.id);
    clearHighlightTarget();
    if (idx === -1) return;
    setPage(Math.floor(idx / PAGE_SIZE) + 1);
    setHighlightedId(highlightTarget.id);
    const scrollTimer = setTimeout(() => {
      document.getElementById(`dispatch-row-${highlightTarget.id}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 50);
    const clearTimer = setTimeout(() => setHighlightedId(null), 2500);
    return () => {
      clearTimeout(scrollTimer);
      clearTimeout(clearTimer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [highlightTarget, dispatches]);

  function handleCustomerSelect(id: string) {
    const customer = customers.find((c) => c._id === id);
    setForm((f) => ({
      ...f,
      customerId: id,
      customerName: customer?.name ?? f.customerName,
      customerAddress: customer?.address ?? f.customerAddress,
      customerPhone: customer?.phone ?? f.customerPhone,
    }));
  }

  function handleTripSelect(id: string) {
    if (!id) {
      setForm((f) => ({ ...f, loadingEntryId: "", vehicleNumber: "", vehicleType: "", bricksCount: "", amount: "", discountAmount: "", categoryId: "" }));
      return;
    }
    const trip = unlinkedTrips.find((t) => t._id === id);
    if (!trip) return;
    const categoryId = typeof trip.categoryId === "object" ? trip.categoryId?._id ?? "" : trip.categoryId ?? "";
    setForm((f) => ({
      ...f,
      loadingEntryId: id,
      vehicleNumber: trip.vehicleNumber,
      vehicleType: trip.vehicleType,
      bricksCount: String(trip.bricksCount),
      amount: trip.amount != null ? String(trip.amount) : "",
      discountAmount: trip.discountAmount != null ? String(trip.discountAmount) : "",
      categoryId,
    }));
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!form.customerName) return;
    if (!tripLocked && (!form.bricksCount || !form.amount)) return;
    if (!tripLocked && Number(form.discountAmount) > Number(form.amount)) {
      setFormError(t("dispatch.discountExceedsAmount"));
      return;
    }
    // A linked trip's `amount` is already the net, post-discount figure
    // (see handleTripSelect) — only a manual entry's amount is the
    // pre-discount gross that still needs discountAmount subtracted.
    const netAmount = tripLocked ? Number(form.amount) || 0 : (Number(form.amount) || 0) - (Number(form.discountAmount) || 0);
    if (isPaymentSplitMismatched(form.paymentMode, netAmount, form.cashAmount, form.onlineAmount)) {
      setFormError(t("payment.splitMismatch", { total: netAmount.toLocaleString("en-IN") }));
      return;
    }
    setFormError("");
    setLoading(true);
    try {
      await api.dispatch.create({
        customerName: form.customerName,
        customerId: form.customerId || undefined,
        customerAddress: form.customerAddress || undefined,
        customerPhone: form.customerPhone || undefined,
        loadingEntryId: form.loadingEntryId || undefined,
        bricksCount: form.bricksCount ? Number(form.bricksCount) : undefined,
        amount: form.amount ? Number(form.amount) : undefined,
        discountAmount: form.discountAmount ? Number(form.discountAmount) : undefined,
        categoryId: form.categoryId || undefined,
        vehicleNumber: form.vehicleNumber || undefined,
        vehicleType: form.vehicleType || undefined,
        driverName: form.driverName || undefined,
        driverPhone: form.driverPhone || undefined,
        driverTipAmount: form.driverTipAmount ? Number(form.driverTipAmount) : undefined,
        transportCost: form.transportCost ? Number(form.transportCost) : undefined,
        notes: form.notes || undefined,
        paymentMode: form.paymentMode,
        cashAmount: form.paymentMode === "CASH_AND_ONLINE" ? Number(form.cashAmount) : undefined,
        onlineAmount: form.paymentMode === "CASH_AND_ONLINE" ? Number(form.onlineAmount) : undefined,
        dispatchedOn: form.dispatchedOn || undefined,
      });
      setForm(emptyForm());
      setShowForm(false);
      await refresh();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : t("common.somethingWentWrong"));
    } finally {
      setLoading(false);
    }
  }

  async function submitAdjustment(id: string) {
    await api.dispatch.adjustment(id, {
      breakageCount: adjustForm.breakageCount ? Number(adjustForm.breakageCount) : undefined,
      returnedCount: adjustForm.returnedCount ? Number(adjustForm.returnedCount) : undefined,
      returnReason: adjustForm.returnReason || undefined,
    });
    setAdjustingId(null);
    setAdjustForm({ breakageCount: "", returnedCount: "", returnReason: "" });
    refresh();
  }

  async function deleteDispatch(d: DispatchEntry) {
    if (!confirm(t("dispatch.confirmDeleteDispatch", { slipNumber: d.slipNumber }))) return;
    await api.dispatch.remove(d._id);
    await refresh();
  }

  const totalAmountPreview = (Number(form.amount) || 0) + (Number(form.transportCost) || 0);

  return (
    <div className="space-y-4">
      {reconciliation?.alert && (
        <Card className="border-status-critical/40 bg-status-critical/5">
          <div className="flex items-start gap-3">
            <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-status-critical" />
            <div>
              <p className="text-sm font-medium text-status-critical">
                {t("dispatch.mismatchAlert", { percent: reconciliation.mismatchPercent, days: reconciliation.days })}
              </p>
              <p className="mt-1 text-sm text-ink-muted">
                {t("dispatch.producedA1")} {reconciliation.totalA1Produced.toLocaleString("en-IN")} · {t("dispatch.dispatchedLabel")}{" "}
                {reconciliation.totalDispatched.toLocaleString("en-IN")} · {t("dispatch.inStockLabel")}{" "}
                {reconciliation.currentStock.toLocaleString("en-IN")} · {t("dispatch.unaccountedLabel")}{" "}
                {reconciliation.unaccounted.toLocaleString("en-IN")} {t("dispatch.checkUnloggedNote")}
              </p>
            </div>
          </div>
        </Card>
      )}

      <div className="flex justify-end">
        <Button size="sm" onClick={() => setShowForm((s) => !s)}>
          <Plus className="h-4 w-4" /> {t("dispatch.logDispatch")}
        </Button>
      </div>

      {showForm && (
        <Card>
          <form onSubmit={handleSubmit} className="flex flex-col gap-3">
            <div>
              <label className="mb-1 block text-xs text-ink-muted">{t("dispatch.linkedLoadingTrip")}</label>
              <SearchableSelect
                options={unlinkedTrips.map((tr) => ({ value: tr._id, label: tripLabel(tr) }))}
                value={form.loadingEntryId}
                onChange={handleTripSelect}
                placeholder={t("dispatch.linkedLoadingTripPlaceholder")}
                emptyMessage={t("dispatch.noUnlinkedTrips")}
              />
            </div>

            <select value={form.customerId} onChange={(e) => handleCustomerSelect(e.target.value)} className={inputClass}>
              <option value="">{t("dispatch.walkInCustomer")}</option>
              {customers.map((c) => (
                <option key={c._id} value={c._id}>
                  {c.name}
                </option>
              ))}
            </select>

            <div className="grid grid-cols-2 gap-2">
              <input
                required
                placeholder={t("dispatch.customerNamePlaceholder")}
                value={form.customerName}
                onChange={(e) => setForm((f) => ({ ...f, customerName: e.target.value, customerId: "" }))}
                className={inputClass}
              />
              <input
                placeholder={t("dispatch.clientPhonePlaceholder")}
                value={form.customerPhone}
                onChange={(e) => setForm((f) => ({ ...f, customerPhone: e.target.value }))}
                className={inputClass}
              />
            </div>
            <input
              placeholder={t("dispatch.clientAddressPlaceholder")}
              value={form.customerAddress}
              onChange={(e) => setForm((f) => ({ ...f, customerAddress: e.target.value }))}
              className={inputClass}
            />

            <div className="grid grid-cols-2 gap-2">
              <input
                placeholder={t("dispatch.vehicleNumberPlaceholder")}
                value={form.vehicleNumber}
                onChange={(e) => setForm((f) => ({ ...f, vehicleNumber: e.target.value }))}
                disabled={tripLocked}
                className={cn(inputClass, tripLocked && "cursor-not-allowed opacity-70")}
              />
              <select
                value={form.vehicleType}
                onChange={(e) => setForm((f) => ({ ...f, vehicleType: e.target.value as "" | BrickVehicleType }))}
                disabled={tripLocked}
                className={cn(inputClass, tripLocked && "cursor-not-allowed opacity-70")}
              >
                <option value="">{t("dispatch.vehicleTypePlaceholder")}</option>
                <option value="TRUCK">{t("brickLoading.truck")}</option>
                <option value="TRACTOR">{t("brickLoading.tractor")}</option>
              </select>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <input
                placeholder={t("dispatch.driverNamePlaceholder")}
                value={form.driverName}
                onChange={(e) => setForm((f) => ({ ...f, driverName: e.target.value }))}
                className={inputClass}
              />
              <input
                placeholder={t("dispatch.driverPhonePlaceholder")}
                value={form.driverPhone}
                onChange={(e) => setForm((f) => ({ ...f, driverPhone: e.target.value }))}
                className={inputClass}
              />
            </div>

            <div className="grid grid-cols-2 gap-2">
              <input
                type="number"
                placeholder={t("dispatch.driverTipPlaceholder")}
                value={form.driverTipAmount}
                onChange={(e) => setForm((f) => ({ ...f, driverTipAmount: e.target.value }))}
                className={inputClass}
              />
              <select
                value={form.categoryId}
                onChange={(e) => setForm((f) => ({ ...f, categoryId: e.target.value }))}
                disabled={tripLocked}
                className={cn(inputClass, tripLocked && "cursor-not-allowed opacity-70")}
              >
                <option value="">{t("dispatch.categoryPlaceholder")}</option>
                {categories.map((c) => (
                  <option key={c._id} value={c._id}>
                    {categoryGradeLabel(c)}
                  </option>
                ))}
              </select>
            </div>

            <div className="grid grid-cols-3 gap-2">
              <input
                required={!tripLocked}
                type="number"
                placeholder={t("dispatch.bricksDispatchedPlaceholder")}
                value={form.bricksCount}
                onChange={(e) => setForm((f) => ({ ...f, bricksCount: e.target.value }))}
                disabled={tripLocked}
                className={cn(inputClass, tripLocked && "cursor-not-allowed opacity-70")}
              />
              <input
                type="number"
                placeholder={t("dispatch.discountPlaceholder")}
                value={form.discountAmount}
                onChange={(e) => setForm((f) => ({ ...f, discountAmount: e.target.value }))}
                disabled={tripLocked}
                className={cn(inputClass, tripLocked && "cursor-not-allowed opacity-70")}
              />
              <input
                required={!tripLocked}
                type="number"
                placeholder={t("dispatch.amountPlaceholder")}
                value={form.amount}
                onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))}
                disabled={tripLocked}
                className={cn(inputClass, tripLocked && "cursor-not-allowed opacity-70")}
              />
            </div>

            <select
              value={form.paymentMode}
              onChange={(e) => setForm((f) => ({ ...f, paymentMode: e.target.value as PaymentMode }))}
              className={inputClass}
            >
              <option value="CASH">{t("dispatch.paymentCash")}</option>
              <option value="BANK">{t("dispatch.paymentBankTransfer")}</option>
              <option value="UPI">{t("dispatch.paymentUpi")}</option>
              <option value="GST_INVOICE">{t("dispatch.paymentGstInvoice")}</option>
              <option value="CASH_AND_ONLINE">{t("common.paymentModeCashAndOnline")}</option>
            </select>
            {form.paymentMode === "CASH_AND_ONLINE" && (
              <PaymentSplitFields
                totalAmount={Math.max(0, tripLocked ? Number(form.amount) || 0 : (Number(form.amount) || 0) - (Number(form.discountAmount) || 0))}
                cashAmount={form.cashAmount}
                onlineAmount={form.onlineAmount}
                onCashAmountChange={(v) => setForm((f) => ({ ...f, cashAmount: v }))}
                onOnlineAmountChange={(v) => setForm((f) => ({ ...f, onlineAmount: v }))}
                inputClassName={inputClass}
              />
            )}

            <div className="grid grid-cols-2 gap-2">
              <input
                placeholder={t("dispatch.notesPlaceholder")}
                value={form.notes}
                onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
                className={inputClass}
              />
              <label className="flex flex-col gap-1">
                <span className="text-xs text-ink-muted">{t("common.transactionDate")}</span>
                <input
                  type="date"
                  value={form.dispatchedOn}
                  onChange={(e) => setForm((f) => ({ ...f, dispatchedOn: e.target.value }))}
                  className={inputClass}
                />
              </label>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <input
                type="number"
                placeholder={t("dispatch.transportCostPlaceholder")}
                value={form.transportCost}
                onChange={(e) => setForm((f) => ({ ...f, transportCost: e.target.value }))}
                className={inputClass}
              />
              <div className="flex items-center justify-between rounded-xl border border-series-1/30 bg-series-1/5 px-4">
                <span className="text-sm font-medium text-ink-secondary">{t("dispatch.totalAmountLabel")}</span>
                <span className="text-lg font-semibold tabular-nums text-ink-primary">₹{formatINR(Math.max(0, totalAmountPreview))}</span>
              </div>
            </div>

            {selectedTrip && (
              <p className="text-xs text-ink-muted">{t("dispatch.tripLockedHint")}</p>
            )}
            {formError && <p className="text-sm text-status-critical">{formError}</p>}
            <Button type="submit" disabled={loading}>
              {t("dispatch.saveDispatch")}
            </Button>
          </form>
        </Card>
      )}

      <Card>
        {dispatches.length === 0 ? (
          <p className="py-8 text-center text-sm text-ink-muted">{t("dispatch.noDispatchesYet")}</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-sm">
              <thead>
                <tr className="border-b border-border text-left text-sm text-ink-muted">
                  <th className="pb-2 font-medium">{t("dispatch.slipHeader")}</th>
                  <th className="pb-2 font-medium">{t("common.transactionDate")}</th>
                  <th className="pb-2 font-medium">{t("dispatch.customerHeader")}</th>
                  <th className="pb-2 font-medium">{t("dispatch.gradeHeader")}</th>
                  <th className="pb-2 font-medium">{t("dispatch.bricksHeader")}</th>
                  <th className="pb-2 font-medium">{t("dispatch.adjustmentsHeader")}</th>
                  <th className="pb-2 font-medium text-right">{t("common.amount")}</th>
                  <th className="pb-2 font-medium text-right" />
                </tr>
              </thead>
              <tbody>
                {pagedDispatches.map((d) => (
                  <Fragment key={d._id}>
                    <tr
                      id={`dispatch-row-${d._id}`}
                      className={cn("border-b border-border/60 last:border-0 transition-colors", highlightedId === d._id && "bg-series-1/10")}
                    >
                      <td className="py-3 text-sm text-ink-muted">{d.slipNumber}</td>
                      <td className="py-3 text-ink-secondary">
                        {new Date(d.dispatchedOn).toLocaleDateString("en-IN")}
                        <p className="text-xs text-ink-muted/70">{formatDateTime(d.createdAt)}</p>
                      </td>
                      <td className="py-3 text-ink-primary">{d.customerName}</td>
                      <td className="py-3">
                        <Badge variant="neutral">{dispatchCategoryGradeLabel(d, GRADE_LABELS)}</Badge>
                      </td>
                      <td className="py-3 tabular-nums text-ink-secondary">{d.bricksCount.toLocaleString("en-IN")}</td>
                      <td className="py-3">
                        <button
                          onClick={() => setAdjustingId(adjustingId === d._id ? null : d._id)}
                          className="text-xs text-series-1 hover:underline"
                        >
                          {d.breakageCount > 0 || d.returnedCount > 0
                            ? t("dispatch.brokenReturnedSummary", { broken: d.breakageCount, returned: d.returnedCount })
                            : t("dispatch.addBreakageReturn")}
                        </button>
                      </td>
                      <td className="py-3 text-right tabular-nums font-medium text-ink-primary">
                        ₹{formatINR(d.amount)}
                      </td>
                      <td className="py-3 text-right">
                        <div className="flex justify-end gap-3">
                          <button
                            onClick={() => setEditingDispatch(d)}
                            className="flex items-center gap-1 text-xs font-medium text-series-1 hover:underline"
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
                    {adjustingId === d._id && (
                      <tr key={`${d._id}-adjust`}>
                        <td colSpan={8} className="bg-ink-primary/5 p-3">
                          <div className="flex flex-wrap items-end gap-2">
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
                            <Button size="sm" onClick={() => submitAdjustment(d._id)}>
                              {t("common.save")}
                            </Button>
                          </div>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                ))}
              </tbody>
            </table>
            <Pagination page={page} pageCount={pageCount} onChange={setPage} total={total} pageSize={PAGE_SIZE} />
          </div>
        )}
      </Card>

      {editingDispatch && (
        <EditDispatchModal
          dispatch={editingDispatch}
          onClose={() => setEditingDispatch(null)}
          onSaved={refresh}
        />
      )}
    </div>
  );
}
