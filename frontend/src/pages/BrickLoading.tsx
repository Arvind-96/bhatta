import { FormEvent, useEffect, useState } from "react";
import { Plus, Search } from "lucide-react";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Pagination, usePagination } from "@/components/ui/pagination";
import { DateInput } from "@/components/ui/date-input";
import { cn, formatDateTime, formatINR, formatVehicleNumber } from "@/lib/utils";
import { api } from "@/lib/api";
import { EditBrickLoadingEntryModal } from "@/components/dispatch/EditBrickLoadingEntryModal";
import { BrickLineItemsEditor, emptyLineItemRow, isValidLineItemRow, type LineItemRow } from "@/components/dispatch/BrickLineItemsEditor";
import { AmountPaymentModeFields } from "@/components/shared/AmountPaymentModeFields";
import { isPaymentSplitMismatched } from "@/components/shared/PaymentSplitFields";
import { VehicleNumberInput } from "@/components/shared/VehicleNumberInput";
import { VehicleTypeRadioCards } from "@/components/shared/VehicleTypeRadioCards";
import { ConfirmDialog } from "@/components/shared/ConfirmDialog";
import { BrickLoadingTripDetailPage } from "@/components/dispatch/BrickLoadingTripDetailPage";
import { LedgerModal } from "@/components/people/LedgerModal";
import { AddPersonModal } from "@/components/people/AddPersonModal";
import { useKilnEvent } from "@/hooks/useKilnEvent";
import { useAuthStore } from "@/store/auth.store";
import { useUiStore } from "@/store/ui.store";
import { useTranslation } from "@/hooks/useTranslation";
import type { BrickCategory, BrickLoadingDriverSummary, BrickLoadingEntry, BrickVehicleType, Customer, Person, LaborPaymentMode } from "@/types";

const inputClass =
  "h-10 rounded-xl border border-border bg-ink-primary/5 px-3 text-sm text-ink-primary outline-none focus:ring-2 focus:ring-series-1";

// Per-driver rollup — every driver who's loaded a delivery, their total
// bricks moved, total tips/inaam earned, and ledger balance.
function DriverSummarySection({
  summary,
  onOpenLedger,
  onAddDriver,
}: {
  summary: BrickLoadingDriverSummary | null;
  onOpenLedger: (personId: string) => void;
  onAddDriver: () => void;
}) {
  const { t } = useTranslation();
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-ink-primary">{t("brickLoading.driverWiseHeading")}</h3>
        <div className="flex items-center gap-3">
          {summary && (
            <p className="text-sm text-ink-muted">
              {t("brickLoading.totalLabel")}{" "}
              <span className="font-medium text-ink-primary">{summary.totalBricksLoadedAllDrivers.toLocaleString("en-IN")}</span>{" "}
              {t("brickLoading.bricksUnit")}
            </p>
          )}
          <Button size="sm" onClick={onAddDriver}>
            <Plus className="h-4 w-4" /> {t("brickLoading.newDriver")}
          </Button>
        </div>
      </div>

      {!summary ? null : summary.drivers.length === 0 ? (
        <Card>
          <p className="py-6 text-center text-sm text-ink-muted">{t("brickLoading.noTripsYet")}</p>
        </Card>
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {summary.drivers.map((d) => (
            <Card key={d.driver.id}>
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-ink-primary">{d.driver.name}</p>
                  <p className="text-sm text-ink-muted">
                    {d.tripCount} {d.tripCount === 1 ? t("brickLoading.tripSingular") : t("brickLoading.tripPlural")}
                    {d.driver.vehicleNumber ? ` · ${d.driver.vehicleNumber}` : ""}
                  </p>
                </div>
                <button
                  onClick={() => onOpenLedger(d.driver.id)}
                  className="shrink-0 rounded-lg border border-border bg-ink-primary/5 px-2.5 py-1 text-xs font-medium text-ink-secondary hover:bg-ink-primary/10 hover:text-ink-primary"
                >
                  {t("brickLoading.ledgerAdvance")}
                </button>
              </div>

              <div className="mt-3 grid grid-cols-4 gap-2 text-center">
                <div>
                  <p className="text-lg font-semibold tabular-nums text-ink-primary">{d.totalBricksLoaded.toLocaleString("en-IN")}</p>
                  <p className="text-sm text-ink-muted">{t("brickLoading.bricksUnit")}</p>
                </div>
                <div>
                  <p className="text-lg font-semibold tabular-nums text-ink-primary">₹{formatINR(d.totalTips)}</p>
                  <p className="text-sm text-ink-muted">{t("brickLoading.tipsUnit")}</p>
                </div>
                <div>
                  <p className="text-lg font-semibold tabular-nums text-ink-primary">₹{formatINR(d.totalPaid)}</p>
                  <p className="text-sm text-ink-muted">{t("brickLoading.paidUnit")}</p>
                </div>
                <div>
                  <p className={`text-lg font-semibold tabular-nums ${d.balance > 0 ? "text-status-critical" : d.balance < 0 ? "text-status-warning" : "text-status-good"}`}>
                    ₹{formatINR(Math.abs(d.balance))}
                  </p>
                  <p className="text-sm text-ink-muted">{d.balance >= 0 ? t("brickLoading.dueUnit") : t("brickLoading.advanceUnit")}</p>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

export function BrickLoading() {
  const [entries, setEntries] = useState<BrickLoadingEntry[]>([]);
  const [drivers, setDrivers] = useState<Person[]>([]);
  const [driverSummary, setDriverSummary] = useState<BrickLoadingDriverSummary | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [ledgerFor, setLedgerFor] = useState<Person | null>(null);
  const [showAddDriver, setShowAddDriver] = useState(false);
  const [editingEntry, setEditingEntry] = useState<BrickLoadingEntry | null>(null);
  const [openTripId, setOpenTripId] = useState<string | null>(null);
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [search, setSearch] = useState("");
  const emptyForm = {
    customerName: "",
    customerPhone: "",
    customerAddress: "",
    driverName: "",
    driverPhone: "",
    tipAmount: "",
    tipPaymentMode: "" as LaborPaymentMode | "",
    tipCashAmount: "",
    tipOnlineAmount: "",
    date: new Date().toISOString().slice(0, 10),
    loadingRatePerThousand: "",
    loadingPaymentMode: "" as LaborPaymentMode | "",
    loadingCashAmount: "",
    loadingOnlineAmount: "",
    unloadingRatePerThousand: "",
    unloadingPaymentMode: "" as LaborPaymentMode | "",
    unloadingCashAmount: "",
    unloadingOnlineAmount: "",
    items: [emptyLineItemRow()] as LineItemRow[],
    unloadedBricksCount: "",
    vehicleNumber: "",
    vehicleType: "TRUCK" as BrickVehicleType,
    unloadingDate: "",
    placeOfSupply: "",
  };
  const [form, setForm] = useState(emptyForm);
  const [loading, setLoading] = useState(false);
  const [formError, setFormError] = useState("");
  const [categories, setCategories] = useState<BrickCategory[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [showCustomerSuggestions, setShowCustomerSuggestions] = useState(false);
  const activeKilnId = useAuthStore((s) => s.activeKilnId);
  const navigateAndHighlight = useUiStore((s) => s.navigateAndHighlight);
  const { t } = useTranslation();
  const filteredEntries = entries.filter((entry) => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    const category = typeof entry.categoryId === "object" ? entry.categoryId : null;
    return (
      (entry.tripNumber ?? "").toLowerCase().includes(q) ||
      entry.vehicleNumber.toLowerCase().includes(q) ||
      (entry.customerName ?? "").toLowerCase().includes(q) ||
      (entry.customerPhone ?? "").includes(q) ||
      (entry.driverName ?? "").toLowerCase().includes(q) ||
      (entry.driverPhone ?? "").includes(q) ||
      (category ? category.category.toLowerCase().includes(q) : false)
    );
  });
  const { page, setPage, pageCount, pageItems: pagedEntries, total } = usePagination(filteredEntries, 10);

  async function refresh() {
    const [entriesData, driversData, summary, categoryData, customerData] = await Promise.all([
      api.brickLoading.list(),
      api.people.list("DRIVER"),
      api.brickLoading.driverSummary(),
      api.brickCategories.list(),
      api.customers.list(),
    ]);
    setEntries(entriesData);
    setDrivers(driversData);
    setDriverSummary(summary);
    setCategories(categoryData);
    setCustomers(customerData);
  }

  useEffect(() => {
    if (!activeKilnId) return;
    refresh().catch(console.error);
  }, [activeKilnId]);

  useKilnEvent("brickLoading:update", () => refresh());
  useKilnEvent("ledger:update", () => refresh());
  useKilnEvent("person:update", () => refresh());
  useKilnEvent("customer:update", () => refresh());

  function openLedgerFor(personId: string) {
    const person = drivers.find((p) => p._id === personId);
    if (person) setLedgerFor(person);
  }

  async function handleDriverCreated() {
    setDrivers(await api.people.list("DRIVER"));
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const validItems = form.items.filter(isValidLineItemRow);
    if (
      !form.customerName ||
      !form.customerPhone ||
      !form.driverName ||
      !form.driverPhone ||
      !form.vehicleNumber ||
      validItems.length === 0
    )
      return;
    if (isPaymentSplitMismatched(form.tipPaymentMode, Number(form.tipAmount) || 0, form.tipCashAmount, form.tipOnlineAmount)) {
      setFormError(t("payment.splitMismatch", { total: (Number(form.tipAmount) || 0).toLocaleString("en-IN") }));
      return;
    }
    if (isPaymentSplitMismatched(form.loadingPaymentMode, totalLoadingCharge, form.loadingCashAmount, form.loadingOnlineAmount)) {
      setFormError(t("payment.splitMismatch", { total: totalLoadingCharge.toLocaleString("en-IN") }));
      return;
    }
    if (isPaymentSplitMismatched(form.unloadingPaymentMode, totalUnloadingCharge, form.unloadingCashAmount, form.unloadingOnlineAmount)) {
      setFormError(t("payment.splitMismatch", { total: totalUnloadingCharge.toLocaleString("en-IN") }));
      return;
    }
    setFormError("");
    setLoading(true);
    try {
      await api.brickLoading.create({
        customerName: form.customerName,
        customerPhone: form.customerPhone,
        customerAddress: form.customerAddress || undefined,
        driverName: form.driverName,
        driverPhone: form.driverPhone,
        tipAmount: form.tipAmount ? Number(form.tipAmount) : undefined,
        tipPaymentMode: form.tipPaymentMode || undefined,
        tipCashAmount: form.tipPaymentMode === "CASH_AND_ONLINE" ? Number(form.tipCashAmount) : undefined,
        tipOnlineAmount: form.tipPaymentMode === "CASH_AND_ONLINE" ? Number(form.tipOnlineAmount) : undefined,
        vehicleType: form.vehicleType,
        vehicleNumber: form.vehicleNumber,
        items: validItems.map((row) => ({
          categoryId: row.categoryId,
          bricksCount: Number(row.bricksCount),
          pricePerBrick: row.pricePerBrick ? Number(row.pricePerBrick) : undefined,
        })),
        unloadedBricksCount: form.unloadedBricksCount ? Number(form.unloadedBricksCount) : undefined,
        loadingRatePerThousand: form.loadingRatePerThousand ? Number(form.loadingRatePerThousand) : undefined,
        loadingPaymentMode: form.loadingPaymentMode || undefined,
        loadingCashAmount: form.loadingPaymentMode === "CASH_AND_ONLINE" ? Number(form.loadingCashAmount) : undefined,
        loadingOnlineAmount: form.loadingPaymentMode === "CASH_AND_ONLINE" ? Number(form.loadingOnlineAmount) : undefined,
        unloadingRatePerThousand: form.unloadingRatePerThousand ? Number(form.unloadingRatePerThousand) : undefined,
        unloadingPaymentMode: form.unloadingPaymentMode || undefined,
        unloadingCashAmount: form.unloadingPaymentMode === "CASH_AND_ONLINE" ? Number(form.unloadingCashAmount) : undefined,
        unloadingOnlineAmount: form.unloadingPaymentMode === "CASH_AND_ONLINE" ? Number(form.unloadingOnlineAmount) : undefined,
        placeOfSupply: form.placeOfSupply || undefined,
        date: form.date || undefined,
        unloadingDate: form.unloadingDate || undefined,
      });
      setForm({ ...emptyForm, date: new Date().toISOString().slice(0, 10), items: [emptyLineItemRow()] });
      setShowForm(false);
      await refresh();
    } finally {
      setLoading(false);
    }
  }

  async function cancelEntry(entry: BrickLoadingEntry) {
    setDeleting(true);
    try {
      await api.brickLoading.remove(entry._id);
      await refresh();
      return true;
    } finally {
      setDeleting(false);
    }
  }

  // Filtered as the admin types the Customer/Party Name — picking one
  // auto-fills their saved phone/address/driver/vehicle. A name that
  // doesn't match anything here just stays as free text; whether that
  // becomes a new Customer profile is decided later, once this trip is
  // actually turned into a Dispatch (see dispatch.service.ts's
  // createDispatch, the loadingEntryId branch).
  const customerSuggestions = form.customerName.trim()
    ? customers.filter((c) => c.name.toLowerCase().includes(form.customerName.trim().toLowerCase())).slice(0, 8)
    : [];

  function selectCustomer(c: Customer) {
    setForm((f) => ({
      ...f,
      customerName: c.name,
      customerPhone: c.phones[0] ?? f.customerPhone,
      customerAddress: c.addresses[0] ?? f.customerAddress,
      driverName: c.drivers[0]?.name ?? f.driverName,
      driverPhone: c.drivers[0]?.phone ?? f.driverPhone,
      vehicleNumber: c.vehicles[0]?.vehicleNumber ? formatVehicleNumber(c.vehicles[0].vehicleNumber) : f.vehicleNumber,
    }));
    setShowCustomerSuggestions(false);
  }

  // Total Amount = sum across every category row's (bricks x this trip's
  // admin-entered price) — deliberately never defaulted from the category's
  // own pricePerBrick, since the price varies customer to customer; that
  // default is only shown as a reference hint next to each row's input.
  const totalBricksAcrossItems = form.items.reduce((sum, row) => sum + (Number(row.bricksCount) || 0), 0);
  const totalAmount = form.items.reduce((sum, row) => sum + (Number(row.bricksCount) || 0) * (Number(row.pricePerBrick) || 0), 0);
  // Total loading/unloading charge = brick count x rate per 1,000 bricks —
  // laborer count is no longer part of this formula.
  const totalLoadingCharge =
    totalBricksAcrossItems && form.loadingRatePerThousand ? (totalBricksAcrossItems / 1000) * Number(form.loadingRatePerThousand) : 0;
  const totalUnloadingCharge =
    form.unloadedBricksCount && form.unloadingRatePerThousand
      ? (Number(form.unloadedBricksCount) / 1000) * Number(form.unloadingRatePerThousand)
      : 0;

  const openTrip = entries.find((e) => e._id === openTripId) ?? null;

  return (
    <div className="space-y-4">
      {openTrip ? (
        <BrickLoadingTripDetailPage
          trip={openTrip}
          onBack={() => setOpenTripId(null)}
          onEdit={() => setEditingEntry(openTrip)}
          onDelete={() => setPendingDeleteId(openTrip._id)}
        />
      ) : (
        <>
      <DriverSummarySection summary={driverSummary} onOpenLedger={openLedgerFor} onAddDriver={() => setShowAddDriver(true)} />

      <div className="flex justify-end">
        <Button size="sm" onClick={() => setShowForm((s) => !s)}>
          <Plus className="h-4 w-4" /> {t("brickLoading.logTrip")}
        </Button>
      </div>

      {showForm && (
        <Card>
          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <div>
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-muted">{t("brickLoading.customerPartySection")}</p>
              <div className="grid grid-cols-2 gap-2">
                <div className="relative">
                  <input
                    required
                    autoComplete="off"
                    placeholder={t("brickLoading.customerNamePlaceholder")}
                    value={form.customerName}
                    onChange={(e) => {
                      setForm((f) => ({ ...f, customerName: e.target.value }));
                      setShowCustomerSuggestions(true);
                    }}
                    onFocus={() => setShowCustomerSuggestions(true)}
                    onBlur={() => setTimeout(() => setShowCustomerSuggestions(false), 150)}
                    className={cn(inputClass, "w-full")}
                  />
                  {showCustomerSuggestions && customerSuggestions.length > 0 && (
                    <div className="absolute z-20 mt-1 max-h-56 w-full overflow-y-auto rounded-xl border border-border bg-surface shadow-lg">
                      {customerSuggestions.map((c) => (
                        <button
                          key={c._id}
                          type="button"
                          onMouseDown={() => selectCustomer(c)}
                          className="flex w-full flex-col items-start px-3 py-2 text-left text-sm hover:bg-ink-primary/5"
                        >
                          <span className="text-ink-primary">{c.name}</span>
                          {c.phones[0] && <span className="text-xs text-ink-muted">{c.phones[0]}</span>}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
                <input
                  required
                  placeholder={t("brickLoading.customerPhonePlaceholder")}
                  value={form.customerPhone}
                  onChange={(e) => setForm((f) => ({ ...f, customerPhone: e.target.value }))}
                  className={inputClass}
                />
                <input
                  placeholder={t("brickLoading.customerAddressPlaceholder")}
                  value={form.customerAddress}
                  onChange={(e) => setForm((f) => ({ ...f, customerAddress: e.target.value }))}
                  className="col-span-2 h-10 rounded-xl border border-border bg-ink-primary/5 px-3 text-sm text-ink-primary outline-none focus:ring-2 focus:ring-series-1"
                />
                <input
                  placeholder={t("dispatchDocs.placeOfSupplyPlaceholder")}
                  value={form.placeOfSupply}
                  onChange={(e) => setForm((f) => ({ ...f, placeOfSupply: e.target.value }))}
                  className="col-span-2 h-10 rounded-xl border border-border bg-ink-primary/5 px-3 text-sm text-ink-primary outline-none focus:ring-2 focus:ring-series-1"
                />
              </div>
            </div>

            <div>
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-muted">{t("brickLoading.driverSection")}</p>
              <div className="grid grid-cols-3 gap-2">
                <input
                  required
                  placeholder={t("brickLoading.driverNamePlaceholder")}
                  value={form.driverName}
                  onChange={(e) => setForm((f) => ({ ...f, driverName: e.target.value }))}
                  className={inputClass}
                />
                <input
                  required
                  placeholder={t("brickLoading.driverPhonePlaceholder")}
                  value={form.driverPhone}
                  onChange={(e) => setForm((f) => ({ ...f, driverPhone: e.target.value }))}
                  className={inputClass}
                />
                <input
                  type="number"
                  placeholder={t("brickLoading.driverRewardPlaceholder")}
                  value={form.tipAmount}
                  onChange={(e) => setForm((f) => ({ ...f, tipAmount: e.target.value }))}
                  className={inputClass}
                />
                {Number(form.tipAmount) > 0 && (
                  <AmountPaymentModeFields
                    amount={Number(form.tipAmount)}
                    paymentMode={form.tipPaymentMode}
                    cashAmount={form.tipCashAmount}
                    onlineAmount={form.tipOnlineAmount}
                    onPaymentModeChange={(mode) => setForm((f) => ({ ...f, tipPaymentMode: mode }))}
                    onCashAmountChange={(v) => setForm((f) => ({ ...f, tipCashAmount: v }))}
                    onOnlineAmountChange={(v) => setForm((f) => ({ ...f, tipOnlineAmount: v }))}
                    inputClassName={inputClass}
                  />
                )}
              </div>
            </div>

            <div>
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-muted">{t("brickLoading.loadingSection")}</p>
              <div className="mb-2 grid grid-cols-2 gap-2">
                <VehicleNumberInput
                  required
                  placeholder={t("brickLoading.vehicleNumber")}
                  value={form.vehicleNumber}
                  onChange={(value) => setForm((f) => ({ ...f, vehicleNumber: value }))}
                  className={cn(inputClass, "col-span-2")}
                />
                <VehicleTypeRadioCards
                  value={form.vehicleType}
                  onChange={(vehicleType) => setForm((f) => ({ ...f, vehicleType }))}
                  className="col-span-2"
                />
                <input
                  type="number"
                  placeholder={t("brickLoading.loadingRatePlaceholder")}
                  value={form.loadingRatePerThousand}
                  onChange={(e) => setForm((f) => ({ ...f, loadingRatePerThousand: e.target.value }))}
                  className={inputClass}
                />
                <label className="flex flex-col gap-1">
                  <span className="text-xs text-ink-muted">{t("brickLoading.loadingDateLabel")}</span>
                  <DateInput required value={form.date} onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))} className={inputClass} />
                </label>
              </div>

              <BrickLineItemsEditor
                items={form.items}
                onChange={(items) => setForm((f) => ({ ...f, items }))}
                categories={categories}
              />

              <div className="mt-2 grid grid-cols-2 gap-2">
                <div className="rounded-xl border border-series-1/30 bg-series-1/5 px-3 py-2">
                  <p className="text-xs text-ink-muted">{t("brickLoading.totalAmountLabel")}</p>
                  <p className="text-sm font-semibold tabular-nums text-ink-primary">₹{formatINR(totalAmount)}</p>
                </div>
                <div className="rounded-xl border border-border bg-ink-primary/5 px-3 py-2">
                  <p className="text-xs text-ink-muted">{t("brickLoading.totalLoadingChargeLabel")}</p>
                  <p className="text-sm font-semibold tabular-nums text-ink-primary">₹{formatINR(totalLoadingCharge)}</p>
                </div>
                {totalLoadingCharge > 0 && (
                  <AmountPaymentModeFields
                    amount={totalLoadingCharge}
                    paymentMode={form.loadingPaymentMode}
                    cashAmount={form.loadingCashAmount}
                    onlineAmount={form.loadingOnlineAmount}
                    onPaymentModeChange={(mode) => setForm((f) => ({ ...f, loadingPaymentMode: mode }))}
                    onCashAmountChange={(v) => setForm((f) => ({ ...f, loadingCashAmount: v }))}
                    onOnlineAmountChange={(v) => setForm((f) => ({ ...f, loadingOnlineAmount: v }))}
                    inputClassName={inputClass}
                  />
                )}
              </div>
            </div>

            <div>
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-muted">{t("brickLoading.unloadingSection")}</p>
              <div className="grid grid-cols-2 gap-2">
                <input
                  type="number"
                  placeholder={t("brickLoading.bricksUnloadedPlaceholder")}
                  value={form.unloadedBricksCount}
                  onChange={(e) => setForm((f) => ({ ...f, unloadedBricksCount: e.target.value }))}
                  className={inputClass}
                />
                <input
                  type="number"
                  placeholder={t("brickLoading.unloadingRatePlaceholder")}
                  value={form.unloadingRatePerThousand}
                  onChange={(e) => setForm((f) => ({ ...f, unloadingRatePerThousand: e.target.value }))}
                  className={inputClass}
                />
                <label className="flex flex-col gap-1">
                  <span className="text-xs text-ink-muted">{t("brickLoading.unloadingDateLabel")}</span>
                  <DateInput
                    value={form.unloadingDate}
                    onChange={(e) => setForm((f) => ({ ...f, unloadingDate: e.target.value }))}
                    className={inputClass}
                  />
                </label>
              </div>

              <div className="mt-2 rounded-xl border border-border bg-ink-primary/5 px-3 py-2">
                <p className="text-xs text-ink-muted">{t("brickLoading.totalUnloadingChargeLabel")}</p>
                <p className="text-sm font-semibold tabular-nums text-ink-primary">₹{formatINR(totalUnloadingCharge)}</p>
              </div>
              {totalUnloadingCharge > 0 && (
                <div className="mt-2">
                  <AmountPaymentModeFields
                    amount={totalUnloadingCharge}
                    paymentMode={form.unloadingPaymentMode}
                    cashAmount={form.unloadingCashAmount}
                    onlineAmount={form.unloadingOnlineAmount}
                    onPaymentModeChange={(mode) => setForm((f) => ({ ...f, unloadingPaymentMode: mode }))}
                    onCashAmountChange={(v) => setForm((f) => ({ ...f, unloadingCashAmount: v }))}
                    onOnlineAmountChange={(v) => setForm((f) => ({ ...f, unloadingOnlineAmount: v }))}
                    inputClassName={inputClass}
                  />
                </div>
              )}
            </div>

            {formError && <p className="text-sm text-status-critical">{formError}</p>}
            <Button type="submit" disabled={loading}>
              {t("brickLoading.saveEntry")}
            </Button>
          </form>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>{t("brickLoading.loadingTrips")}</CardTitle>
        </CardHeader>
        <div className="relative mb-3">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-muted" />
          <input
            placeholder={t("brickLoading.searchTripsPlaceholder")}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className={cn(inputClass, "w-full max-w-sm pl-9")}
          />
        </div>
        {entries.length === 0 ? (
          <p className="py-8 text-center text-sm text-ink-muted">{t("brickLoading.noTripsYet")}</p>
        ) : filteredEntries.length === 0 ? (
          <p className="py-8 text-center text-sm text-ink-muted">{t("brickLoading.noTripsMatchSearch")}</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-sm">
              <thead>
                <tr className="border-b border-border text-left text-sm text-ink-muted">
                  <th className="pb-2 font-medium">{t("brickLoading.tripNumberHeader")}</th>
                  <th className="pb-2 font-medium">{t("common.transactionDate")}</th>
                  <th className="pb-2 font-medium">{t("common.vehicle")}</th>
                  <th className="pb-2 font-medium">{t("brickLoading.categoryHeader")}</th>
                  <th className="pb-2 font-medium">{t("brickLoading.bricksHeader")}</th>
                  <th className="pb-2 font-medium">{t("common.amount")}</th>
                  <th className="pb-2 font-medium">{t("brickLoading.dispatchHeader")}</th>
                </tr>
              </thead>
              <tbody>
                {pagedEntries.map((entry) => {
                  const category = typeof entry.categoryId === "object" ? entry.categoryId : null;
                  const linkedDispatch = typeof entry.dispatchId === "object" ? entry.dispatchId : null;
                  return (
                  <tr
                    key={entry._id}
                    onClick={() => setOpenTripId(entry._id)}
                    className="cursor-pointer border-b border-border/60 last:border-0 hover:bg-ink-primary/5"
                  >
                    <td className="py-3 text-ink-primary hover:underline">
                      <span className="flex items-center gap-2">
                        {entry.tripNumber ? `#${entry.tripNumber}` : "—"}
                        {entry.cancelled && (
                          <span className="rounded-full bg-ink-primary/10 px-2 py-0.5 text-xs font-semibold text-ink-muted">
                            {t("common.cancelledBadge")}
                          </span>
                        )}
                      </span>
                    </td>
                    <td className="py-3 text-ink-secondary">
                      {new Date(entry.date).toLocaleDateString("en-IN")}
                      <p className="text-xs text-ink-muted/70">{formatDateTime(entry.createdAt)}</p>
                    </td>
                    <td className="py-3 text-ink-secondary">
                      {entry.vehicleType === "TRUCK" ? "🚚" : "🚜"} {entry.vehicleNumber}
                    </td>
                    <td className="py-3 text-ink-secondary">
                      {entry.items && entry.items.length > 1
                        ? t("brickLoading.multipleCategoriesLabel", { count: entry.items.length })
                        : category
                        ? category.grade
                          ? `${category.category} (${category.grade})`
                          : category.category
                        : "—"}
                    </td>
                    <td className="py-3 tabular-nums text-ink-secondary">{entry.bricksCount.toLocaleString("en-IN")}</td>
                    <td className="py-3 tabular-nums text-ink-secondary">{entry.amount ? `₹${formatINR(entry.amount)}` : "—"}</td>
                    <td className="py-3 text-ink-secondary">
                      {linkedDispatch ? (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            navigateAndHighlight("dispatch", linkedDispatch._id);
                          }}
                          className="text-series-1 hover:underline"
                        >
                          {linkedDispatch.slipNumber}
                        </button>
                      ) : (
                        "—"
                      )}
                    </td>
                  </tr>
                  );
                })}
              </tbody>
            </table>
            <Pagination page={page} pageCount={pageCount} onChange={setPage} total={total} pageSize={10} />
          </div>
        )}
      </Card>
        </>
      )}

      {ledgerFor && <LedgerModal person={ledgerFor} onClose={() => setLedgerFor(null)} />}
      {showAddDriver && (
        <AddPersonModal defaultType="DRIVER" onClose={() => setShowAddDriver(false)} onCreated={handleDriverCreated} />
      )}
      {editingEntry && (
        <EditBrickLoadingEntryModal entry={editingEntry} onClose={() => setEditingEntry(null)} onSaved={refresh} />
      )}
      {pendingDeleteId &&
        (() => {
          const target = entries.find((e) => e._id === pendingDeleteId);
          if (!target) return null;
          return (
            <ConfirmDialog
              title={t("brickLoading.confirmDeleteTripTitle")}
              detail={t("brickLoading.confirmDeleteTrip", { vehicleNumber: target.vehicleNumber })}
              confirmLabel={t("common.confirmCancelAction")}
              loading={deleting}
              onCancel={() => setPendingDeleteId(null)}
              onConfirm={async () => {
                if (await cancelEntry(target)) {
                  setPendingDeleteId(null);
                  if (openTripId === target._id) setOpenTripId(null);
                }
              }}
            />
          );
        })()}
    </div>
  );
}
