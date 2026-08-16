import { FormEvent, useEffect, useState } from "react";
import { Plus } from "lucide-react";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Pagination, usePagination } from "@/components/ui/pagination";
import { cn, formatINR } from "@/lib/utils";
import { api } from "@/lib/api";
import { EditBrickLoadingEntryModal } from "@/components/dispatch/EditBrickLoadingEntryModal";
import { LedgerModal } from "@/components/people/LedgerModal";
import { AddPersonModal } from "@/components/people/AddPersonModal";
import { useKilnEvent } from "@/hooks/useKilnEvent";
import { useAuthStore } from "@/store/auth.store";
import { useTranslation } from "@/hooks/useTranslation";
import type { BrickCategory, BrickLoadingDriverSummary, BrickLoadingEntry, BrickVehicleType, Dispatch, Person } from "@/types";

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
  const [dispatches, setDispatches] = useState<Dispatch[]>([]);
  const [driverSummary, setDriverSummary] = useState<BrickLoadingDriverSummary | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [ledgerFor, setLedgerFor] = useState<Person | null>(null);
  const [showAddDriver, setShowAddDriver] = useState(false);
  const [editingEntry, setEditingEntry] = useState<BrickLoadingEntry | null>(null);
  const [form, setForm] = useState({
    vehicleType: "TRUCK" as BrickVehicleType,
    vehicleNumber: "",
    driverId: "",
    bricksCount: "",
    tipAmount: "",
    loadingCharge: "",
    categoryId: "",
    discountAmount: "",
    dispatchId: "",
    notes: "",
  });
  const [loading, setLoading] = useState(false);
  const [categories, setCategories] = useState<BrickCategory[]>([]);
  const activeKilnId = useAuthStore((s) => s.activeKilnId);
  const { t } = useTranslation();
  const { page, setPage, pageCount, pageItems: pagedEntries, total } = usePagination(entries, 10);

  async function refresh() {
    const [entriesData, driversData, dispatchData, summary, categoryData] = await Promise.all([
      api.brickLoading.list(),
      api.people.list("DRIVER"),
      api.dispatch.list(),
      api.brickLoading.driverSummary(),
      api.brickCategories.list(),
    ]);
    setEntries(entriesData);
    setDrivers(driversData);
    setDispatches(dispatchData);
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

  function handleDriverChange(driverId: string, driverList: Person[] = drivers) {
    const driver = driverList.find((d) => d._id === driverId);
    setForm((f) => ({
      ...f,
      driverId,
      vehicleNumber: driver?.vehicleNumber ? driver.vehicleNumber : f.vehicleNumber,
    }));
  }

  // A driver created via "+ New driver" (opened from within this same form)
  // should end up selected, not left for the admin to find and reselect
  // from a list that just grew by one — found by diffing driver ids before
  // vs. after, since Person doesn't carry a createdAt field client-side.
  async function handleDriverCreated() {
    const previousIds = new Set(drivers.map((d) => d._id));
    const freshDrivers = await api.people.list("DRIVER");
    setDrivers(freshDrivers);
    const newest = freshDrivers.find((d) => !previousIds.has(d._id));
    if (newest) handleDriverChange(newest._id, freshDrivers);
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!form.vehicleNumber || !form.driverId || !form.bricksCount) return;
    setLoading(true);
    try {
      await api.brickLoading.create({
        vehicleType: form.vehicleType,
        vehicleNumber: form.vehicleNumber,
        driverId: form.driverId,
        bricksCount: Number(form.bricksCount),
        tipAmount: form.tipAmount ? Number(form.tipAmount) : undefined,
        loadingCharge: form.loadingCharge ? Number(form.loadingCharge) : undefined,
        categoryId: form.categoryId || undefined,
        discountAmount: form.discountAmount ? Number(form.discountAmount) : undefined,
        dispatchId: form.dispatchId || undefined,
        notes: form.notes || undefined,
      });
      setForm({ vehicleType: "TRUCK", vehicleNumber: "", driverId: "", bricksCount: "", tipAmount: "", loadingCharge: "", categoryId: "", discountAmount: "", dispatchId: "", notes: "" });
      setShowForm(false);
      await refresh();
    } finally {
      setLoading(false);
    }
  }

  const selectedCategory = categories.find((c) => c._id === form.categoryId);
  const estimatedGrossAmount =
    selectedCategory && form.bricksCount && selectedCategory.pricePerBrick > 0
      ? Number(form.bricksCount) * selectedCategory.pricePerBrick
      : null;
  const discountForPreview = Number(form.discountAmount) || 0;
  const estimatedNetAmount = estimatedGrossAmount != null ? Math.max(0, estimatedGrossAmount - discountForPreview) : null;

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
          <form onSubmit={handleSubmit} className="grid grid-cols-2 gap-2">
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
            <div className="flex gap-2">
              <select required value={form.driverId} onChange={(e) => handleDriverChange(e.target.value)} className={cn(inputClass, "flex-1")}>
                <option value="">{t("brickLoading.driverPlaceholder")}</option>
                {drivers.map((d) => (
                  <option key={d._id} value={d._id}>
                    {d.name}
                  </option>
                ))}
              </select>
              <button
                type="button"
                onClick={() => setShowAddDriver(true)}
                title={t("brickLoading.newDriver")}
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-border bg-ink-primary/5 text-ink-muted hover:bg-ink-primary/10 hover:text-ink-primary"
              >
                <Plus className="h-4 w-4" />
              </button>
            </div>
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
              placeholder={t("brickLoading.tipPlaceholder")}
              value={form.tipAmount}
              onChange={(e) => setForm((f) => ({ ...f, tipAmount: e.target.value }))}
              className={inputClass}
            />
            <input
              type="number"
              placeholder={t("brickLoading.loadingChargePlaceholder")}
              value={form.loadingCharge}
              onChange={(e) => setForm((f) => ({ ...f, loadingCharge: e.target.value }))}
              className={inputClass}
            />
            <select
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
              value={form.dispatchId}
              onChange={(e) => setForm((f) => ({ ...f, dispatchId: e.target.value }))}
              className={inputClass}
            >
              <option value="">{t("brickLoading.linkedDispatchOptional")}</option>
              {dispatches.map((d) => (
                <option key={d._id} value={d._id}>
                  {d.slipNumber} — {d.customerName}
                </option>
              ))}
            </select>
            <input
              type="number"
              placeholder={t("brickLoading.discountPlaceholder")}
              value={form.discountAmount}
              onChange={(e) => setForm((f) => ({ ...f, discountAmount: e.target.value }))}
              className={inputClass}
            />
            {estimatedGrossAmount != null && (
              <p className="col-span-2 text-sm text-ink-secondary">
                {t("brickLoading.grossAmountLabel")}: <span className="font-semibold text-ink-primary">₹{formatINR(estimatedGrossAmount)}</span>
                {discountForPreview > 0 && (
                  <>
                    {" · "}
                    {t("brickLoading.discountLabel")}: <span className="font-semibold text-ink-primary">− ₹{formatINR(discountForPreview)}</span>
                    {" · "}
                    {t("brickLoading.netAmountLabel")}: <span className="font-semibold text-ink-primary">₹{formatINR(estimatedNetAmount ?? 0)}</span>
                  </>
                )}
              </p>
            )}
            {estimatedNetAmount != null && estimatedNetAmount <= 0 && discountForPreview > 0 && (
              <p className="col-span-2 text-sm text-status-warning">{t("brickLoading.discountExceedsGrossWarning")}</p>
            )}
            <input
              placeholder={t("common.notes")}
              value={form.notes}
              onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
              className={cn(inputClass, "col-span-2")}
            />
            <Button type="submit" disabled={loading} className="col-span-2">
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
                  <th className="pb-2 font-medium">{t("common.date")}</th>
                  <th className="pb-2 font-medium">{t("common.vehicle")}</th>
                  <th className="pb-2 font-medium">{t("common.driver")}</th>
                  <th className="pb-2 font-medium">{t("brickLoading.categoryHeader")}</th>
                  <th className="pb-2 font-medium">{t("brickLoading.bricksHeader")}</th>
                  <th className="pb-2 font-medium">{t("brickLoading.tipHeader")}</th>
                  <th className="pb-2 font-medium">{t("brickLoading.dispatchHeader")}</th>
                  <th className="pb-2 font-medium text-right"></th>
                </tr>
              </thead>
              <tbody>
                {pagedEntries.map((entry) => {
                  const driver = typeof entry.driverId === "object" ? entry.driverId : null;
                  const category = typeof entry.categoryId === "object" ? entry.categoryId : null;
                  return (
                  <tr key={entry._id} className="border-b border-border/60 last:border-0">
                    <td className="py-3 text-ink-secondary">{new Date(entry.date).toLocaleDateString("en-IN")}</td>
                    <td className="py-3 text-ink-secondary">
                      {entry.vehicleType === "TRUCK" ? "🚚" : "🚜"} {entry.vehicleNumber}
                    </td>
                    <td className="py-3 text-ink-primary">
                      {driver ? (
                        <button onClick={() => openLedgerFor(driver._id)} className="hover:underline">
                          {driver.name}
                        </button>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className="py-3 text-ink-secondary">
                      {category ? (category.grade ? `${category.category} (${category.grade})` : category.category) : "—"}
                    </td>
                    <td className="py-3 tabular-nums text-ink-secondary">{entry.bricksCount.toLocaleString("en-IN")}</td>
                    <td className="py-3 tabular-nums text-ink-secondary">{entry.tipAmount ? `₹${formatINR(entry.tipAmount)}` : "—"}</td>
                    <td className="py-3 text-ink-secondary">
                      {typeof entry.dispatchId === "object" && entry.dispatchId ? entry.dispatchId.slipNumber : "—"}
                    </td>
                    <td className="py-3 text-right">
                      <button onClick={() => setEditingEntry(entry)} className="text-xs font-medium text-series-1 hover:underline">
                        {t("common.edit")}
                      </button>
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
