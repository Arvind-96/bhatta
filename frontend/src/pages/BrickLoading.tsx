import { FormEvent, useEffect, useState } from "react";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Pagination, usePagination } from "@/components/ui/pagination";
import { formatINR } from "@/lib/utils";
import { api } from "@/lib/api";
import { EditBrickLoadingEntryModal } from "@/components/dispatch/EditBrickLoadingEntryModal";
import { LedgerModal } from "@/components/people/LedgerModal";
import { AddPersonModal } from "@/components/people/AddPersonModal";
import { useKilnEvent } from "@/hooks/useKilnEvent";
import { useAuthStore } from "@/store/auth.store";
import { useUiStore } from "@/store/ui.store";
import { useTranslation } from "@/hooks/useTranslation";
import type { BrickCategory, BrickLoadingDriverSummary, BrickLoadingEntry, BrickVehicleType, Person } from "@/types";

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
  const [form, setForm] = useState({
    vehicleType: "TRUCK" as BrickVehicleType,
    vehicleNumber: "",
    bricksCount: "",
    categoryId: "",
    discountAmount: "",
    loadingCharge: "",
    unloadingCharge: "",
  });
  const [loading, setLoading] = useState(false);
  const [syncWarning, setSyncWarning] = useState(false);
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
    if (!form.vehicleNumber || !form.categoryId || !form.bricksCount) return;
    setLoading(true);
    try {
      const created = await api.brickLoading.create({
        vehicleType: form.vehicleType,
        vehicleNumber: form.vehicleNumber,
        bricksCount: Number(form.bricksCount),
        categoryId: form.categoryId,
        discountAmount: form.discountAmount ? Number(form.discountAmount) : undefined,
        loadingCharge: form.loadingCharge ? Number(form.loadingCharge) : undefined,
        unloadingCharge: form.unloadingCharge ? Number(form.unloadingCharge) : undefined,
      });
      setSyncWarning(!!created.dispatchSyncFailed);
      setForm({ vehicleType: "TRUCK", vehicleNumber: "", bricksCount: "", categoryId: "", discountAmount: "", loadingCharge: "", unloadingCharge: "" });
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
  const grossAmount = selectedCategory && form.bricksCount ? Number(form.bricksCount) * selectedCategory.pricePerBrick : 0;
  const discountForPreview = Number(form.discountAmount) || 0;
  const netAfterDiscount = grossAmount - discountForPreview;
  const computedAmount = netAfterDiscount + (Number(form.loadingCharge) || 0) + (Number(form.unloadingCharge) || 0);

  return (
    <div className="space-y-4">
      <DriverSummarySection summary={driverSummary} onOpenLedger={openLedgerFor} onAddDriver={() => setShowAddDriver(true)} />

      {syncWarning && (
        <Card className="border-status-warning/40 bg-status-warning/5">
          <div className="flex items-start justify-between gap-3">
            <p className="text-sm text-status-warning">{t("brickLoading.dispatchSyncFailedWarning")}</p>
            <button onClick={() => setSyncWarning(false)} className="shrink-0 text-xs font-medium text-ink-muted hover:text-ink-primary">
              {t("common.dismiss")}
            </button>
          </div>
        </Card>
      )}

      <div className="flex justify-end">
        <Button size="sm" onClick={() => setShowForm((s) => !s)}>
          <Plus className="h-4 w-4" /> {t("brickLoading.logTrip")}
        </Button>
      </div>

      {showForm && (
        <Card>
          <form onSubmit={handleSubmit} className="flex flex-col gap-3">
            <div className="grid grid-cols-2 gap-2">
              <input
                required
                type="number"
                placeholder={t("brickLoading.bricksLoadedPlaceholder")}
                value={form.bricksCount}
                onChange={(e) => setForm((f) => ({ ...f, bricksCount: e.target.value }))}
                className={inputClass}
              />
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
              <select
                value={form.vehicleType}
                onChange={(e) => setForm((f) => ({ ...f, vehicleType: e.target.value as BrickVehicleType }))}
                className={inputClass}
              >
                <option value="TRUCK">{t("brickLoading.truck")}</option>
                <option value="TRACTOR">{t("brickLoading.tractor")}</option>
              </select>
              <input
                required
                placeholder={t("brickLoading.vehicleNumber")}
                value={form.vehicleNumber}
                onChange={(e) => setForm((f) => ({ ...f, vehicleNumber: e.target.value }))}
                className={inputClass}
              />
            </div>

            <div className="grid grid-cols-3 gap-2">
              <input
                type="number"
                placeholder={t("brickLoading.discountPlaceholder")}
                value={form.discountAmount}
                onChange={(e) => setForm((f) => ({ ...f, discountAmount: e.target.value }))}
                className={inputClass}
              />
              <input
                type="number"
                placeholder={t("brickLoading.loadingChargePlaceholder")}
                value={form.loadingCharge}
                onChange={(e) => setForm((f) => ({ ...f, loadingCharge: e.target.value }))}
                className={inputClass}
              />
              <input
                type="number"
                placeholder={t("brickLoading.unloadingChargePlaceholder")}
                value={form.unloadingCharge}
                onChange={(e) => setForm((f) => ({ ...f, unloadingCharge: e.target.value }))}
                className={inputClass}
              />
            </div>

            <div className="flex items-center justify-between rounded-xl border border-series-1/30 bg-series-1/5 px-4 py-3">
              <span className="text-sm font-medium text-ink-secondary">{t("brickLoading.amountLabel")}</span>
              <span className="text-lg font-semibold tabular-nums text-ink-primary">₹{formatINR(Math.max(0, computedAmount))}</span>
            </div>
            {selectedCategory && form.bricksCount && netAfterDiscount <= 0 && discountForPreview > 0 && (
              <p className="text-sm text-status-warning">{t("brickLoading.discountExceedsGrossWarning")}</p>
            )}

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
                  <th className="pb-2 font-medium">{t("common.date")}</th>
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
                    <td className="py-3 text-ink-secondary">{new Date(entry.date).toLocaleDateString("en-IN")}</td>
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
