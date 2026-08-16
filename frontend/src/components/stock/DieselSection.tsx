import { FormEvent, useEffect, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { cn, formatINR } from "@/lib/utils";
import { api } from "@/lib/api";
import { useKilnEvent } from "@/hooks/useKilnEvent";
import { useAuthStore } from "@/store/auth.store";
import { useTranslation } from "@/hooks/useTranslation";
import type { DieselPeriodTotals, KilnVehicle, SimplePaymentMode, VehicleDieselEntry } from "@/types";

const inputClass =
  "h-10 rounded-xl border border-border bg-ink-primary/5 px-3 text-sm text-ink-primary outline-none focus:ring-2 focus:ring-series-1";

// The Stock page's Diesel tracking — a kiln-owned vehicle roster
// (Tractor/JCB/Buggi/...) the admin manages directly, and a per-vehicle
// diesel log with a day/week/month/year breakdown. Kept separate from the
// Fleet page's broader Machine/MachineFuelLog system (which also covers
// non-vehicle equipment like the pug mill or generators) since this is
// specifically the kiln owner's own vehicles, tracked from Stock as asked.
export function DieselSection() {
  const { t } = useTranslation();
  const PERIOD_COLUMNS: { key: keyof DieselPeriodTotals; label: string }[] = [
    { key: "today", label: t("common.today") },
    { key: "week", label: t("common.thisWeek") },
    { key: "month", label: t("common.thisMonth") },
    { key: "year", label: t("common.thisYear") },
  ];

  const [vehicles, setVehicles] = useState<KilnVehicle[]>([]);
  const [entries, setEntries] = useState<VehicleDieselEntry[]>([]);
  const [totals, setTotals] = useState<DieselPeriodTotals | null>(null);

  const [showAddVehicle, setShowAddVehicle] = useState(false);
  const [vehicleForm, setVehicleForm] = useState({ name: "", type: "" });
  const [savingVehicle, setSavingVehicle] = useState(false);

  const [showLogForm, setShowLogForm] = useState(false);
  const [logForm, setLogForm] = useState({ vehicleId: "", quantityLiters: "", costAmount: "", paymentMode: "" as "" | SimplePaymentMode, notes: "" });
  const [savingLog, setSavingLog] = useState(false);

  const activeKilnId = useAuthStore((s) => s.activeKilnId);

  async function refresh() {
    const [vehicleData, entryData, totalsData] = await Promise.all([
      api.kilnVehicles.list(),
      api.kilnVehicles.listDiesel(),
      api.kilnVehicles.dieselPeriodTotals(),
    ]);
    setVehicles(vehicleData);
    setEntries(entryData);
    setTotals(totalsData);
  }

  useEffect(() => {
    if (!activeKilnId) return;
    refresh().catch(console.error);
  }, [activeKilnId]);

  useKilnEvent("kilnVehicle:update", () => refresh());
  useKilnEvent("vehicleDiesel:update", () => refresh());

  useEffect(() => {
    if (!logForm.vehicleId && vehicles.length > 0) {
      setLogForm((f) => ({ ...f, vehicleId: vehicles[0]._id }));
    }
  }, [vehicles, logForm.vehicleId]);

  async function addVehicle(e: FormEvent) {
    e.preventDefault();
    if (!vehicleForm.name.trim() || !vehicleForm.type.trim()) return;
    setSavingVehicle(true);
    try {
      await api.kilnVehicles.create({ name: vehicleForm.name.trim(), type: vehicleForm.type.trim() });
      setVehicleForm({ name: "", type: "" });
      setShowAddVehicle(false);
      await refresh();
    } finally {
      setSavingVehicle(false);
    }
  }

  async function deleteVehicle(vehicle: KilnVehicle) {
    if (!confirm(t("stock.confirmRemoveVehicle", { name: vehicle.name }))) return;
    await api.kilnVehicles.remove(vehicle._id);
    await refresh();
  }

  async function logDiesel(e: FormEvent) {
    e.preventDefault();
    if (!logForm.vehicleId || !logForm.quantityLiters) return;
    setSavingLog(true);
    try {
      await api.kilnVehicles.logDiesel({
        vehicleId: logForm.vehicleId,
        quantityLiters: Number(logForm.quantityLiters),
        costAmount: logForm.costAmount ? Number(logForm.costAmount) : undefined,
        paymentMode: logForm.paymentMode || undefined,
        notes: logForm.notes || undefined,
      });
      setLogForm((f) => ({ ...f, quantityLiters: "", costAmount: "", paymentMode: "", notes: "" }));
      setShowLogForm(false);
      await refresh();
    } finally {
      setSavingLog(false);
    }
  }

  async function removeDieselEntry(id: string) {
    await api.kilnVehicles.removeDiesel(id);
    await refresh();
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold text-ink-primary">{t("stock.diesel")}</h3>
          <p className="text-sm text-ink-muted">{t("stock.dieselSubtitle")}</p>
        </div>
        <Button size="sm" onClick={() => setShowAddVehicle((s) => !s)}>
          <Plus className="h-4 w-4" /> {t("stock.addVehicle")}
        </Button>
      </div>

      {showAddVehicle && (
        <Card>
          <form onSubmit={addVehicle} className="grid grid-cols-2 gap-2">
            <input
              required
              placeholder={t("stock.vehicleTypePlaceholder")}
              value={vehicleForm.type}
              onChange={(e) => setVehicleForm((f) => ({ ...f, type: e.target.value }))}
              className={inputClass}
            />
            <input
              required
              placeholder={t("stock.vehicleNamePlaceholder")}
              value={vehicleForm.name}
              onChange={(e) => setVehicleForm((f) => ({ ...f, name: e.target.value }))}
              className={inputClass}
            />
            <Button type="submit" disabled={savingVehicle} className="col-span-2">
              {t("stock.addVehicle")}
            </Button>
          </form>
        </Card>
      )}

      {vehicles.length === 0 ? (
        <Card>
          <p className="py-6 text-center text-sm text-ink-muted">{t("stock.noVehiclesYet")}</p>
        </Card>
      ) : (
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {vehicles.map((v) => (
            <Card key={v._id} className="flex items-center justify-between p-3">
              <div>
                <p className="text-sm font-medium text-ink-primary">{v.name}</p>
                <p className="text-sm text-ink-muted">{v.type}</p>
              </div>
              <button onClick={() => deleteVehicle(v)} className="text-ink-muted hover:text-status-critical">
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </Card>
          ))}
        </div>
      )}

      {totals && vehicles.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>{t("stock.dieselUsedPerVehicle")}</CardTitle>
          </CardHeader>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-sm">
              <thead>
                <tr className="border-b border-border text-left text-sm text-ink-muted">
                  <th className="pb-2 font-medium">{t("common.vehicle")}</th>
                  {PERIOD_COLUMNS.map((c) => (
                    <th key={c.key} className="pb-2 font-medium text-right">
                      {c.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {vehicles.map((v) => (
                  <tr key={v._id} className="border-b border-border/60 last:border-0">
                    <td className="py-2 text-ink-primary">
                      {v.name} <span className="text-sm text-ink-muted">({v.type})</span>
                    </td>
                    {PERIOD_COLUMNS.map((c) => (
                      <td key={c.key} className="py-2 text-right tabular-nums text-ink-secondary">
                        {(totals[c.key].byVehicle[v.name] ?? 0).toLocaleString("en-IN")} L
                      </td>
                    ))}
                  </tr>
                ))}
                <tr className="font-semibold">
                  <td className="py-2 text-ink-primary">{t("common.total")}</td>
                  {PERIOD_COLUMNS.map((c) => (
                    <td key={c.key} className="py-2 text-right tabular-nums text-ink-primary">
                      {totals[c.key].total.toLocaleString("en-IN")} L
                    </td>
                  ))}
                </tr>
              </tbody>
            </table>
          </div>
        </Card>
      )}

      <div className="flex justify-end">
        <Button size="sm" onClick={() => setShowLogForm((s) => !s)} disabled={vehicles.length === 0}>
          <Plus className="h-4 w-4" /> {t("stock.logDieselFillUp")}
        </Button>
      </div>

      {showLogForm && (
        <Card>
          <form onSubmit={logDiesel} className="grid grid-cols-2 gap-2">
            <select
              value={logForm.vehicleId}
              onChange={(e) => setLogForm((f) => ({ ...f, vehicleId: e.target.value }))}
              className={inputClass}
            >
              {vehicles.map((v) => (
                <option key={v._id} value={v._id}>
                  {v.name} ({v.type})
                </option>
              ))}
            </select>
            <input
              required
              type="number"
              min={0}
              placeholder={t("stock.quantityLiters")}
              value={logForm.quantityLiters}
              onChange={(e) => setLogForm((f) => ({ ...f, quantityLiters: e.target.value }))}
              className={inputClass}
            />
            <input
              type="number"
              min={0}
              placeholder={t("stock.costOptional")}
              value={logForm.costAmount}
              onChange={(e) => setLogForm((f) => ({ ...f, costAmount: e.target.value }))}
              className={inputClass}
            />
            <select
              value={logForm.paymentMode}
              onChange={(e) => setLogForm((f) => ({ ...f, paymentMode: e.target.value as "" | SimplePaymentMode }))}
              className={inputClass}
            >
              <option value="">{t("common.paymentMode")}</option>
              <option value="CASH">{t("billing.paymentCash")}</option>
              <option value="BANK">{t("billing.paymentBank")}</option>
              <option value="UPI">{t("billing.paymentUpi")}</option>
            </select>
            <input
              placeholder={t("common.notesOptional")}
              value={logForm.notes}
              onChange={(e) => setLogForm((f) => ({ ...f, notes: e.target.value }))}
              className={cn(inputClass, "col-span-2")}
            />
            <Button type="submit" disabled={savingLog} className="col-span-2">
              {t("common.save")}
            </Button>
          </form>
        </Card>
      )}

      <Card>
        {entries.length === 0 ? (
          <p className="py-8 text-center text-sm text-ink-muted">{t("stock.noDieselFillUpsYet")}</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-sm">
              <thead>
                <tr className="border-b border-border text-left text-sm text-ink-muted">
                  <th className="pb-2 font-medium">{t("common.date")}</th>
                  <th className="pb-2 font-medium">{t("common.vehicle")}</th>
                  <th className="pb-2 font-medium">{t("common.quantity")}</th>
                  <th className="pb-2 font-medium">{t("stock.cost")}</th>
                  <th className="pb-2 font-medium">{t("common.notes")}</th>
                  <th className="pb-2 font-medium text-right"></th>
                </tr>
              </thead>
              <tbody>
                {entries.map((entry) => (
                  <tr key={entry._id} className="border-b border-border/60 last:border-0">
                    <td className="py-3 text-ink-secondary">{new Date(entry.date).toLocaleDateString("en-IN")}</td>
                    <td className="py-3 text-ink-primary">
                      {typeof entry.vehicleId === "object" ? `${entry.vehicleId.name} (${entry.vehicleId.type})` : "—"}
                    </td>
                    <td className="py-3 tabular-nums text-ink-secondary">{entry.quantityLiters.toLocaleString("en-IN")} L</td>
                    <td className="py-3 tabular-nums text-ink-secondary">
                      {entry.costAmount != null ? `₹${formatINR(entry.costAmount)}` : "—"}
                    </td>
                    <td className="py-3 text-ink-secondary">{entry.notes ?? "—"}</td>
                    <td className="py-3 text-right">
                      <button
                        onClick={() => removeDieselEntry(entry._id)}
                        className="text-xs font-medium text-status-critical hover:underline"
                      >
                        {t("common.delete")}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
