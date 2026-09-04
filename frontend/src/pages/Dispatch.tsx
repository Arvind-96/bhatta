import { FormEvent, useEffect, useState } from "react";
import { AlertTriangle, Plus, Truck } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Pagination, usePagination } from "@/components/ui/pagination";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { DateInput } from "@/components/ui/date-input";
import { cn, formatDateTime, formatINR } from "@/lib/utils";
import { api } from "@/lib/api";
import { useKilnEvent } from "@/hooks/useKilnEvent";
import { useAuthStore } from "@/store/auth.store";
import { useUiStore } from "@/store/ui.store";
import { useTranslation } from "@/hooks/useTranslation";
import { EditDispatchModal } from "@/components/dispatch/EditDispatchModal";
import { DispatchDetailPage } from "@/components/dispatch/DispatchDetailPage";
import { MissingPaymentModeSection } from "@/components/dispatch/MissingPaymentModeSection";
import { BrickLineItemsEditor, emptyLineItemRow, isValidLineItemRow, lineItemRowsFrom, type LineItemRow } from "@/components/dispatch/BrickLineItemsEditor";
import { AmountPaymentModeFields } from "@/components/shared/AmountPaymentModeFields";
import { PaymentSplitFields, isPaymentSplitMismatched } from "@/components/shared/PaymentSplitFields";
import { VehicleNumberInput } from "@/components/shared/VehicleNumberInput";
import type { BrickCategory, BrickLoadingEntry, BrickVehicleType, Dispatch as DispatchEntry, FinishedGoodsReconciliation, LaborPaymentMode, PaymentMode, Person } from "@/types";

const inputClass =
  "h-10 rounded-xl border border-border bg-ink-primary/5 px-3 text-sm text-ink-primary outline-none focus:ring-2 focus:ring-series-1";

const PAGE_SIZE = 10;

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
    driverTipPaymentMode: "" as LaborPaymentMode | "",
    driverTipCashAmount: "",
    driverTipOnlineAmount: "",
    amount: "",
    amountAutoFilled: true,
    discountAmount: "",
    paymentMode: "" as "" | PaymentMode,
    cashAmount: "",
    onlineAmount: "",
    items: [emptyLineItemRow()] as LineItemRow[],
    placeOfSupply: "",
    notes: "",
    transportCost: "",
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
  const [editingDispatch, setEditingDispatch] = useState<DispatchEntry | null>(null);
  const [openDispatchId, setOpenDispatchId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm());
  const [loading, setLoading] = useState(false);
  const [formError, setFormError] = useState("");
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
  // desc(date)) — re-sorted here too as a belt-and-suspenders guarantee so
  // the picker never silently depends on that staying true.
  const unlinkedTrips = loadingTrips
    .filter((t) => !t.dispatchId)
    .slice()
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime() || new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  const selectedTrip = unlinkedTrips.find((t) => t._id === form.loadingEntryId);
  const tripLocked = !!form.loadingEntryId;
  const totalBricksFromItems = form.items.reduce((sum, row) => sum + (Number(row.bricksCount) || 0), 0);

  // Recomputes the suggested top-level `amount` from summed item amounts —
  // an editable default, never enforced server-side (see createDispatch's
  // items branch: the billed amount stays whatever the admin types at the
  // top level, same as before multi-category items). Stops overwriting the
  // admin's own typed value the moment they edit `amount` directly (see the
  // amount input's onChange below, which flips amountAutoFilled off).
  function handleItemsChange(items: LineItemRow[]) {
    setForm((f) => {
      const newTotal = items.reduce((s, r) => s + (Number(r.bricksCount) || 0) * (Number(r.pricePerBrick) || 0), 0);
      return { ...f, items, amount: f.amountAutoFilled && newTotal ? String(newTotal) : f.amount };
    });
  }

  // Cross-navigation from another page (e.g. a Loading Trip's "linked
  // dispatch" link) now opens this dispatch's own detail page directly,
  // rather than scrolling to a highlighted row in a list the detail page
  // would immediately cover anyway.
  useEffect(() => {
    if (!highlightTarget || highlightTarget.view !== "dispatch" || dispatches.length === 0) return;
    const exists = dispatches.some((d) => d._id === highlightTarget.id);
    clearHighlightTarget();
    if (!exists) return;
    setOpenDispatchId(highlightTarget.id);
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
      setForm((f) => ({ ...f, loadingEntryId: "", vehicleNumber: "", vehicleType: "", amount: "", amountAutoFilled: true, discountAmount: "", items: [emptyLineItemRow()] }));
      return;
    }
    const trip = unlinkedTrips.find((t) => t._id === id);
    if (!trip) return;
    setForm((f) => ({
      ...f,
      loadingEntryId: id,
      vehicleNumber: trip.vehicleNumber,
      vehicleType: trip.vehicleType,
      amount: trip.amount != null ? String(trip.amount) : "",
      amountAutoFilled: false,
      discountAmount: trip.discountAmount != null ? String(trip.discountAmount) : "",
      items: lineItemRowsFrom(trip),
      // These, unlike the fields above, are never backend-overridden for a
      // linked trip — just a starting point the admin can still edit freely.
      customerName: trip.customerName || f.customerName,
      customerPhone: trip.customerPhone || f.customerPhone,
      customerAddress: trip.customerAddress || f.customerAddress,
      driverName: trip.driverName || f.driverName,
      driverPhone: trip.driverPhone || f.driverPhone,
      // Deliberately NOT pre-filled from trip.tipAmount — the trip already
      // auto-logged its own "Driver Reward / Inam" Expense when it was
      // created, and the backend now clears these for a trip-linked
      // dispatch (see createDispatch's loadingEntryId branch), so a
      // pre-filled value here would just be silently dropped instead of
      // double-logging it — worse than not showing it at all.
      placeOfSupply: trip.placeOfSupply || f.placeOfSupply,
      notes: trip.notes || f.notes,
      dispatchedOn: trip.date ? trip.date.slice(0, 10) : f.dispatchedOn,
    }));
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!form.customerName) return;
    if (!tripLocked && (totalBricksFromItems === 0 || !form.amount)) return;
    if (!tripLocked && Number(form.discountAmount) > Number(form.amount)) {
      setFormError(t("dispatch.discountExceedsAmount"));
      return;
    }
    if (isPaymentSplitMismatched(form.driverTipPaymentMode, Number(form.driverTipAmount) || 0, form.driverTipCashAmount, form.driverTipOnlineAmount)) {
      setFormError(t("payment.splitMismatch", { total: (Number(form.driverTipAmount) || 0).toLocaleString("en-IN") }));
      return;
    }
    const netAmountForSplit = tripLocked ? Number(form.amount) || 0 : (Number(form.amount) || 0) - (Number(form.discountAmount) || 0);
    if (isPaymentSplitMismatched(form.paymentMode, netAmountForSplit, form.cashAmount, form.onlineAmount)) {
      setFormError(t("payment.splitMismatch", { total: netAmountForSplit.toLocaleString("en-IN") }));
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
        amount: form.amount ? Number(form.amount) : undefined,
        discountAmount: form.discountAmount ? Number(form.discountAmount) : undefined,
        paymentMode: form.paymentMode || undefined,
        cashAmount: form.paymentMode === "CASH_AND_ONLINE" ? Number(form.cashAmount) : undefined,
        onlineAmount: form.paymentMode === "CASH_AND_ONLINE" ? Number(form.onlineAmount) : undefined,
        items: tripLocked
          ? undefined
          : form.items
              .filter(isValidLineItemRow)
              .map((row) => ({
                categoryId: row.categoryId,
                bricksCount: Number(row.bricksCount),
                pricePerBrick: row.pricePerBrick ? Number(row.pricePerBrick) : undefined,
              })),
        vehicleNumber: form.vehicleNumber || undefined,
        vehicleType: form.vehicleType || undefined,
        driverName: form.driverName || undefined,
        driverPhone: form.driverPhone || undefined,
        driverTipAmount: form.driverTipAmount ? Number(form.driverTipAmount) : undefined,
        driverTipPaymentMode: form.driverTipPaymentMode || undefined,
        driverTipCashAmount: form.driverTipPaymentMode === "CASH_AND_ONLINE" ? Number(form.driverTipCashAmount) : undefined,
        driverTipOnlineAmount: form.driverTipPaymentMode === "CASH_AND_ONLINE" ? Number(form.driverTipOnlineAmount) : undefined,
        transportCost: form.transportCost ? Number(form.transportCost) : undefined,
        placeOfSupply: form.placeOfSupply || undefined,
        notes: form.notes || undefined,
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

  async function cancelDispatch(d: DispatchEntry) {
    if (!confirm(t("dispatch.confirmDeleteDispatch", { slipNumber: d.slipNumber }))) return false;
    await api.dispatch.remove(d._id);
    await refresh();
    return true;
  }

  // Net of discount, same subtraction as handleSubmit's netAmountForSplit —
  // dispatches.amount is stored net of discount, so this preview must agree
  // with it rather than showing the pre-discount gross.
  const netAmountForTotal = tripLocked ? Number(form.amount) || 0 : (Number(form.amount) || 0) - (Number(form.discountAmount) || 0);
  const totalAmountPreview = netAmountForTotal + (Number(form.transportCost) || 0);
  const openDispatch = dispatches.find((d) => d._id === openDispatchId) ?? null;

  const listView = (
    <>
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
                // Editing this name does NOT clear customerId — the dropdown
                // above is the only thing that links/unlinks a real Customer
                // (its own "walk-in customer" option is how to go back to
                // none). This used to reset customerId on every keystroke,
                // so fixing a typo or adding a business-name suffix right
                // after picking a real customer would silently detach the
                // sale from them — the exact bug behind two real invoices
                // (₹63,900 and ₹48,800) that never showed up in the
                // customer's own due/paid totals or the Customers report.
                onChange={(e) => setForm((f) => ({ ...f, customerName: e.target.value }))}
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
              <VehicleNumberInput
                placeholder={t("dispatch.vehicleNumberPlaceholder")}
                value={form.vehicleNumber}
                onChange={(value) => setForm((f) => ({ ...f, vehicleNumber: value }))}
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

            <input
              type="number"
              placeholder={tripLocked ? t("dispatch.driverTipLockedPlaceholder") : t("dispatch.driverTipPlaceholder")}
              value={form.driverTipAmount}
              onChange={(e) => setForm((f) => ({ ...f, driverTipAmount: e.target.value }))}
              disabled={tripLocked}
              className={cn(inputClass, tripLocked && "cursor-not-allowed opacity-70")}
            />
            {!tripLocked && Number(form.driverTipAmount) > 0 && (
              <AmountPaymentModeFields
                amount={Number(form.driverTipAmount)}
                paymentMode={form.driverTipPaymentMode}
                cashAmount={form.driverTipCashAmount}
                onlineAmount={form.driverTipOnlineAmount}
                onPaymentModeChange={(mode) => setForm((f) => ({ ...f, driverTipPaymentMode: mode }))}
                onCashAmountChange={(v) => setForm((f) => ({ ...f, driverTipCashAmount: v }))}
                onOnlineAmountChange={(v) => setForm((f) => ({ ...f, driverTipOnlineAmount: v }))}
                inputClassName={inputClass}
              />
            )}

            <BrickLineItemsEditor items={form.items} onChange={handleItemsChange} categories={categories} readOnly={tripLocked} />

            <div className="grid grid-cols-2 gap-2">
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
                onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value, amountAutoFilled: false }))}
                disabled={tripLocked}
                className={cn(inputClass, tripLocked && "cursor-not-allowed opacity-70")}
              />
            </div>

            <label className="flex flex-col gap-1">
              <span className="text-xs text-ink-muted">{t("common.howWasThisPaid")}</span>
              <select
                value={form.paymentMode}
                onChange={(e) => setForm((f) => ({ ...f, paymentMode: e.target.value as PaymentMode }))}
                className={inputClass}
              >
                <option value="">{t("common.select")}</option>
                <option value="CASH">{t("dispatch.paymentCash")}</option>
                <option value="BANK">{t("dispatch.paymentBankTransfer")}</option>
                <option value="UPI">{t("dispatch.paymentUpi")}</option>
                <option value="GST_INVOICE">{t("dispatch.paymentGstInvoice")}</option>
                <option value="CASH_AND_ONLINE">{t("common.paymentModeCashAndOnline")}</option>
              </select>
            </label>
            {form.paymentMode === "CASH_AND_ONLINE" && (
              <PaymentSplitFields
                totalAmount={Math.max(0, (Number(form.amount) || 0) - (Number(form.discountAmount) || 0))}
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
                <DateInput
                  required
                  value={form.dispatchedOn}
                  onChange={(e) => setForm((f) => ({ ...f, dispatchedOn: e.target.value }))}
                  className={inputClass}
                />
              </label>
            </div>

            <input
              placeholder={t("dispatchDocs.placeOfSupplyPlaceholder")}
              value={form.placeOfSupply}
              onChange={(e) => setForm((f) => ({ ...f, placeOfSupply: e.target.value }))}
              className={cn(inputClass, "w-full")}
            />

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

      <div className="float-track" aria-hidden>
        <span className="float-ico">
          <Truck className="h-[18px] w-[18px]" />
        </span>
      </div>

      <MissingPaymentModeSection dispatches={dispatches} onUpdated={refresh} />

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
                </tr>
              </thead>
              <tbody>
                {pagedDispatches.map((d) => (
                  <tr
                    key={d._id}
                    onClick={() => setOpenDispatchId(d._id)}
                    className="cursor-pointer border-b border-border/60 last:border-0 hover:bg-ink-primary/5"
                  >
                    <td className="py-3 text-sm text-ink-muted hover:underline">
                      <span className="flex items-center gap-2">
                        {d.slipNumber}
                        {d.cancelled && (
                          <span className="rounded-full bg-ink-primary/10 px-2 py-0.5 text-xs font-semibold text-ink-muted">
                            {t("common.cancelledBadge")}
                          </span>
                        )}
                      </span>
                    </td>
                    <td className="py-3 text-ink-secondary">
                      {new Date(d.dispatchedOn).toLocaleDateString("en-IN")}
                      <p className="text-xs text-ink-muted/70">{formatDateTime(d.createdAt)}</p>
                    </td>
                    <td className="py-3 text-ink-primary">{d.customerName}</td>
                    <td className="py-3">
                      <Badge variant="neutral">{dispatchCategoryGradeLabel(d, GRADE_LABELS)}</Badge>
                    </td>
                    <td className="py-3 tabular-nums text-ink-secondary">{d.bricksCount.toLocaleString("en-IN")}</td>
                    <td className="py-3 text-xs text-ink-muted">
                      {d.breakageCount > 0 || d.returnedCount > 0
                        ? t("dispatch.brokenReturnedSummary", { broken: d.breakageCount, returned: d.returnedCount })
                        : "—"}
                    </td>
                    <td className="py-3 text-right tabular-nums font-medium text-ink-primary">
                      ₹{formatINR(d.amount)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <Pagination page={page} pageCount={pageCount} onChange={setPage} total={total} pageSize={PAGE_SIZE} />
          </div>
        )}
      </Card>
    </>
  );

  return (
    <div className="space-y-4">
      {openDispatch ? (
        <DispatchDetailPage
          dispatch={openDispatch}
          categories={categories}
          onBack={() => setOpenDispatchId(null)}
          onEdit={() => setEditingDispatch(openDispatch)}
          onAdjusted={refresh}
          onDelete={async () => {
            if (await cancelDispatch(openDispatch)) setOpenDispatchId(null);
          }}
        />
      ) : (
        listView
      )}

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
