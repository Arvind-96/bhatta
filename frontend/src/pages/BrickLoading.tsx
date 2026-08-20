import { FormEvent, useEffect, useState } from "react";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Pagination, usePagination } from "@/components/ui/pagination";
import { DateInput } from "@/components/ui/date-input";
import { formatDateTime, formatINR } from "@/lib/utils";
import { api } from "@/lib/api";
import { EditBrickLoadingEntryModal } from "@/components/dispatch/EditBrickLoadingEntryModal";
import { LedgerModal } from "@/components/people/LedgerModal";
import { AddPersonModal } from "@/components/people/AddPersonModal";
import { useKilnEvent } from "@/hooks/useKilnEvent";
import { useAuthStore } from "@/store/auth.store";
import { useUiStore } from "@/store/ui.store";
import { useTranslation } from "@/hooks/useTranslation";
import type { BrickCategory, BrickLoadingDriverSummary, BrickLoadingEntry, Person } from "@/types";

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
  const emptyForm = {
    customerName: "",
    customerPhone: "",
    customerAddress: "",
    driverName: "",
    driverPhone: "",
    tipAmount: "",
    date: new Date().toISOString().slice(0, 10),
    loadingLaborerCount: "",
    loadingRatePerThousand: "",
    unloadingRatePerThousand: "",
    categoryId: "",
    bricksCount: "",
    unloadedBricksCount: "",
    vehicleNumber: "",
    unloadingLaborerCount: "",
    unloadingDate: "",
  };
  const [form, setForm] = useState(emptyForm);
  const [loading, setLoading] = useState(false);
  const [categories, setCategories] = useState<BrickCategory[]>([]);
  const activeKilnId = useAuthStore((s) => s.activeKilnId);
  const navigateAndHighlight = useUiStore((s) => s.navigateAndHighlight);
  const { t } = useTranslation();
  const { page, setPage, pageCount, pageItems: pagedEntries, total } = usePagination(entries, 10);

  async function refresh() {
    const [entriesData, driversData, summary, categoryData] = await Promise.all([
      api.brickLoading.list(),
      api.people.list("DRIVER"),
      api.brickLoading.driverSummary(),
      api.brickCategories.list(),
    ]);
    setEntries(entriesData);
    setDrivers(driversData);
    setDriverSummary(summary);
    setCategories(categoryData);
  }

  useEffect(() => {
    if (!activeKilnId) return;
    refresh().catch(console.error);
  }, [activeKilnId]);

  useKilnEvent("brickLoading:update", () => refresh());
  useKilnEvent("ledger:update", () => refresh());
  useKilnEvent("person:update", () => refresh());

  function openLedgerFor(personId: string) {
    const person = drivers.find((p) => p._id === personId);
    if (person) setLedgerFor(person);
  }

  async function handleDriverCreated() {
    setDrivers(await api.people.list("DRIVER"));
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!form.customerName || !form.customerPhone || !form.driverName || !form.driverPhone || !form.vehicleNumber || !form.categoryId || !form.bricksCount) return;
    setLoading(true);
    try {
      await api.brickLoading.create({
        customerName: form.customerName,
        customerPhone: form.customerPhone,
        customerAddress: form.customerAddress || undefined,
        driverName: form.driverName,
        driverPhone: form.driverPhone,
        tipAmount: form.tipAmount ? Number(form.tipAmount) : undefined,
        // Vehicle type isn't collected on this form anymore -- TRUCK is a
        // safe default for the still-required DB column.
        vehicleType: "TRUCK",
        vehicleNumber: form.vehicleNumber,
        bricksCount: Number(form.bricksCount),
        unloadedBricksCount: form.unloadedBricksCount ? Number(form.unloadedBricksCount) : undefined,
        loadingLaborerCount: form.loadingLaborerCount ? Number(form.loadingLaborerCount) : undefined,
        loadingRatePerThousand: form.loadingRatePerThousand ? Number(form.loadingRatePerThousand) : undefined,
        unloadingLaborerCount: form.unloadingLaborerCount ? Number(form.unloadingLaborerCount) : undefined,
        unloadingRatePerThousand: form.unloadingRatePerThousand ? Number(form.unloadingRatePerThousand) : undefined,
        categoryId: form.categoryId,
        date: form.date || undefined,
        unloadingDate: form.unloadingDate || undefined,
      });
      setForm({ ...emptyForm, date: new Date().toISOString().slice(0, 10) });
      setShowForm(false);
      await refresh();
    } finally {
      setLoading(false);
    }
  }

  async function deleteEntry(entry: BrickLoadingEntry) {
    if (!confirm(t("brickLoading.confirmDeleteTrip", { vehicleNumber: entry.vehicleNumber }))) return;
    await api.brickLoading.remove(entry._id);
    await refresh();
  }

  const selectedCategory = categories.find((c) => c._id === form.categoryId);
  const pricePerBrick = selectedCategory?.pricePerBrick ?? 0;
  // Total Amount = Loaded Brick Count x price per brick of the loaded
  // category — the brick sale value alone; loading/unloading charges are
  // shown as entirely separate figures below.
  const totalAmount = form.bricksCount ? Number(form.bricksCount) * pricePerBrick : 0;
  const totalLoadingCharge =
    form.bricksCount && form.loadingLaborerCount && form.loadingRatePerThousand
      ? (Number(form.bricksCount) / 1000) * Number(form.loadingLaborerCount) * Number(form.loadingRatePerThousand)
      : 0;
  const totalUnloadingCharge =
    form.unloadedBricksCount && form.unloadingLaborerCount && form.unloadingRatePerThousand
      ? (Number(form.unloadedBricksCount) / 1000) * Number(form.unloadingLaborerCount) * Number(form.unloadingRatePerThousand)
      : 0;

  return (
    <div className="space-y-4">
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
                <input
                  required
                  placeholder={t("brickLoading.customerNamePlaceholder")}
                  value={form.customerName}
                  onChange={(e) => setForm((f) => ({ ...f, customerName: e.target.value }))}
                  className={inputClass}
                />
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
              </div>
            </div>

            <div>
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-muted">{t("brickLoading.loadingSection")}</p>
              <div className="grid grid-cols-2 gap-2">
                <select
                  required
                  value={form.categoryId}
                  onChange={(e) => setForm((f) => ({ ...f, categoryId: e.target.value }))}
                  className={inputClass}
                >
                  <option value="">{t("brickLoading.categoryPlaceholder")}</option>
                  {categories.map((c) => (
                    <option key={c._id} value={c._id}>
                      {c.grade ? `${c.category} (${c.grade})` : c.category}
                    </option>
                  ))}
                </select>
                <input
                  required
                  placeholder={t("brickLoading.vehicleNumber")}
                  value={form.vehicleNumber}
                  onChange={(e) => setForm((f) => ({ ...f, vehicleNumber: e.target.value }))}
                  className={inputClass}
                />
                <input
                  required
                  type="number"
                  placeholder={t("brickLoading.bricksLoadedPlaceholder")}
                  value={form.bricksCount}
                  onChange={(e) => setForm((f) => ({ ...f, bricksCount: e.target.value }))}
                  className={inputClass}
                />
                <input
                  type="number"
                  placeholder={t("brickLoading.loadingLaborerCountPlaceholder")}
                  value={form.loadingLaborerCount}
                  onChange={(e) => setForm((f) => ({ ...f, loadingLaborerCount: e.target.value }))}
                  className={inputClass}
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
                  <DateInput value={form.date} onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))} className={inputClass} />
                </label>
              </div>

              <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-3">
                <div className="rounded-xl border border-border bg-ink-primary/5 px-3 py-2">
                  <p className="text-xs text-ink-muted">{t("brickLoading.pricePerBrickLabel")}</p>
                  <p className="text-sm font-semibold tabular-nums text-ink-primary">₹{formatINR(pricePerBrick)}</p>
                </div>
                <div className="rounded-xl border border-series-1/30 bg-series-1/5 px-3 py-2">
                  <p className="text-xs text-ink-muted">{t("brickLoading.totalAmountLabel")}</p>
                  <p className="text-sm font-semibold tabular-nums text-ink-primary">₹{formatINR(totalAmount)}</p>
                </div>
                <div className="rounded-xl border border-border bg-ink-primary/5 px-3 py-2">
                  <p className="text-xs text-ink-muted">{t("brickLoading.totalLoadingChargeLabel")}</p>
                  <p className="text-sm font-semibold tabular-nums text-ink-primary">₹{formatINR(totalLoadingCharge)}</p>
                </div>
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
                  placeholder={t("brickLoading.unloadingLaborerCountPlaceholder")}
                  value={form.unloadingLaborerCount}
                  onChange={(e) => setForm((f) => ({ ...f, unloadingLaborerCount: e.target.value }))}
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
            </div>

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
        {entries.length === 0 ? (
          <p className="py-8 text-center text-sm text-ink-muted">{t("brickLoading.noTripsYet")}</p>
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
                  <th className="pb-2 font-medium text-right"></th>
                </tr>
              </thead>
              <tbody>
                {pagedEntries.map((entry) => {
                  const category = typeof entry.categoryId === "object" ? entry.categoryId : null;
                  const linkedDispatch = typeof entry.dispatchId === "object" ? entry.dispatchId : null;
                  return (
                  <tr key={entry._id} className="border-b border-border/60 last:border-0">
                    <td className="py-3 text-ink-primary">{entry.tripNumber ? `#${entry.tripNumber}` : "—"}</td>
                    <td className="py-3 text-ink-secondary">
                      {new Date(entry.date).toLocaleDateString("en-IN")}
                      <p className="text-xs text-ink-muted/70">{formatDateTime(entry.createdAt)}</p>
                    </td>
                    <td className="py-3 text-ink-secondary">
                      {entry.vehicleType === "TRUCK" ? "🚚" : "🚜"} {entry.vehicleNumber}
                    </td>
                    <td className="py-3 text-ink-secondary">
                      {category ? (category.grade ? `${category.category} (${category.grade})` : category.category) : "—"}
                    </td>
                    <td className="py-3 tabular-nums text-ink-secondary">{entry.bricksCount.toLocaleString("en-IN")}</td>
                    <td className="py-3 tabular-nums text-ink-secondary">{entry.amount ? `₹${formatINR(entry.amount)}` : "—"}</td>
                    <td className="py-3 text-ink-secondary">
                      {linkedDispatch ? (
                        <button
                          type="button"
                          onClick={() => navigateAndHighlight("dispatch", linkedDispatch._id)}
                          className="text-series-1 hover:underline"
                        >
                          {linkedDispatch.slipNumber}
                        </button>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className="py-3 text-right">
                      <div className="flex justify-end gap-3">
                        <button
                          onClick={() => setEditingEntry(entry)}
                          className="flex items-center gap-1 text-xs font-medium text-series-1 hover:underline"
                        >
                          <Pencil className="h-3.5 w-3.5" /> {t("common.edit")}
                        </button>
                        <button
                          onClick={() => deleteEntry(entry)}
                          className="flex items-center gap-1 text-xs font-medium text-status-critical hover:underline"
                        >
                          <Trash2 className="h-3.5 w-3.5" /> {t("common.delete")}
                        </button>
                      </div>
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

      {ledgerFor && <LedgerModal person={ledgerFor} onClose={() => setLedgerFor(null)} />}
      {showAddDriver && (
        <AddPersonModal defaultType="DRIVER" onClose={() => setShowAddDriver(false)} onCreated={handleDriverCreated} />
      )}
      {editingEntry && (
        <EditBrickLoadingEntryModal entry={editingEntry} onClose={() => setEditingEntry(null)} onSaved={refresh} />
      )}
    </div>
  );
}
