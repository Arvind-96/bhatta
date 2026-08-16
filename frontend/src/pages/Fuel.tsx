import { FormEvent, useEffect, useState } from "react";
import { AlertTriangle, Plus, Trash2 } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { SegmentedTabs } from "@/components/ui/segmented-tabs";
import { Pagination, usePagination } from "@/components/ui/pagination";
import { cn, formatINR } from "@/lib/utils";
import { api } from "@/lib/api";
import { useKilnEvent } from "@/hooks/useKilnEvent";
import { useAuthStore } from "@/store/auth.store";
import { useTranslation } from "@/hooks/useTranslation";
import type { FuelEfficiency, FuelLog, FuelPurchase, FuelType, Gher, Person, SupplierFuelBalance } from "@/types";

const inputClass =
  "h-10 rounded-xl border border-border bg-ink-primary/5 px-3 text-sm text-ink-primary outline-none focus:ring-2 focus:ring-series-1";

function useGhers() {
  const [ghers, setGhers] = useState<Gher[]>([]);
  const activeKilnId = useAuthStore((s) => s.activeKilnId);

  useEffect(() => {
    if (!activeKilnId) return;
    api.ghers.list().then(setGhers).catch(console.error);
  }, [activeKilnId]);

  useKilnEvent("gher:update", () => {
    api.ghers.list().then(setGhers).catch(console.error);
  });

  return ghers;
}

function useFuelTypes() {
  const [fuelTypes, setFuelTypes] = useState<FuelType[]>([]);
  const activeKilnId = useAuthStore((s) => s.activeKilnId);

  async function refresh() {
    setFuelTypes(await api.fuelTypes.list());
  }

  useEffect(() => {
    if (!activeKilnId) return;
    refresh().catch(console.error);
  }, [activeKilnId]);

  useKilnEvent("fuelType:update", () => refresh());

  return { fuelTypes, refresh };
}

// Admin-managed fuel types (coal, tudi, wood, ...) — swapped in for the old
// fixed COAL/TUDI/LAKDI/OTHER enum so a kiln tracks exactly the fuels it
// actually burns. Purchases and daily feeding both pick from this list.
function FuelTypesSection({ fuelTypes, onChanged }: { fuelTypes: FuelType[]; onChanged: () => void }) {
  const { t } = useTranslation();
  const [showAdd, setShowAdd] = useState(false);
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setSaving(true);
    try {
      await api.fuelTypes.create(name.trim());
      setName("");
      setShowAdd(false);
      onChanged();
    } finally {
      setSaving(false);
    }
  }

  async function remove(ft: FuelType) {
    if (!confirm(t("fuel.confirmRemoveFuelType", { name: ft.name }))) return;
    await api.fuelTypes.remove(ft._id);
    onChanged();
  }

  return (
    <Card>
      <div className="mb-3 flex items-center justify-between">
        <h4 className="text-xs font-semibold uppercase tracking-wide text-ink-muted">{t("fuel.fuelTypesHeading")}</h4>
        <Button size="sm" onClick={() => setShowAdd((s) => !s)}>
          <Plus className="h-4 w-4" /> {t("fuel.addFuelType")}
        </Button>
      </div>

      {showAdd && (
        <form onSubmit={handleSubmit} className="mb-3 flex items-end gap-2">
          <input
            autoFocus
            placeholder={t("fuel.fuelTypeNamePlaceholder")}
            value={name}
            onChange={(e) => setName(e.target.value)}
            className={cn(inputClass, "flex-1")}
          />
          <Button type="submit" disabled={saving}>
            {t("common.add")}
          </Button>
        </form>
      )}

      {fuelTypes.length === 0 ? (
        <p className="py-4 text-center text-sm text-ink-muted">{t("fuel.noFuelTypesYet")}</p>
      ) : (
        <div className="flex flex-wrap gap-2">
          {fuelTypes.map((ft) => (
            <span
              key={ft._id}
              className="flex items-center gap-1.5 rounded-full border border-border bg-ink-primary/5 px-3 py-1.5 text-xs font-medium text-ink-secondary"
            >
              {ft.name}
              <button onClick={() => remove(ft)} className="text-ink-muted hover:text-status-critical">
                <Trash2 className="h-3 w-3" />
              </button>
            </span>
          ))}
        </div>
      )}
    </Card>
  );
}

function StockBalanceRow({ fuelTypes }: { fuelTypes: FuelType[] }) {
  const { t } = useTranslation();
  const [balance, setBalance] = useState<Record<string, number>>({});
  const activeKilnId = useAuthStore((s) => s.activeKilnId);

  async function refresh() {
    setBalance(await api.fuelPurchases.stockBalance());
  }

  useEffect(() => {
    if (!activeKilnId) return;
    refresh().catch(console.error);
  }, [activeKilnId]);

  useKilnEvent("fuelPurchase:update", () => refresh());
  useKilnEvent("fuelLog:update", () => refresh());

  if (fuelTypes.length === 0) return null;

  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
      {fuelTypes.map((ft) => (
        <Card key={ft._id} className="p-3 text-center">
          <p
            className={`text-xl font-semibold tabular-nums ${
              (balance[ft.name] ?? 0) < 0 ? "text-status-critical" : "text-ink-primary"
            }`}
          >
            {(balance[ft.name] ?? 0).toLocaleString("en-IN")} kg
          </p>
          <p className="text-sm text-ink-muted">{t("fuel.inStock", { name: ft.name })}</p>
        </Card>
      ))}
    </div>
  );
}

function SupplierBalancesSection() {
  const { t } = useTranslation();
  const [balances, setBalances] = useState<SupplierFuelBalance[]>([]);
  const activeKilnId = useAuthStore((s) => s.activeKilnId);

  async function refresh() {
    setBalances(await api.fuelPurchases.supplierBalances());
  }

  useEffect(() => {
    if (!activeKilnId) return;
    refresh().catch(console.error);
  }, [activeKilnId]);

  useKilnEvent("fuelPurchase:update", () => refresh());
  useKilnEvent("ledger:update", () => refresh());

  if (balances.length === 0) return null;

  return (
    <Card>
      <h4 className="mb-3 text-xs font-semibold uppercase tracking-wide text-ink-muted">{t("fuel.supplierPaymentStatus")}</h4>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[640px] text-sm">
          <thead>
            <tr className="border-b border-border text-left text-sm text-ink-muted">
              <th className="pb-2 font-medium">{t("fuel.supplier")}</th>
              <th className="pb-2 font-medium">{t("fuel.purchases")}</th>
              <th className="pb-2 font-medium">{t("fuel.weight")}</th>
              <th className="pb-2 font-medium">{t("fuel.totalDue")}</th>
              <th className="pb-2 font-medium">{t("fuel.totalPaid")}</th>
              <th className="pb-2 font-medium text-right">{t("common.balance")}</th>
            </tr>
          </thead>
          <tbody>
            {balances.map((b) => (
              <tr key={b.supplier.id} className="border-b border-border/60 last:border-0">
                <td className="py-3 text-ink-primary">{b.supplier.name}</td>
                <td className="py-3 tabular-nums text-ink-secondary">{b.purchaseCount}</td>
                <td className="py-3 tabular-nums text-ink-secondary">{b.totalWeightKg.toLocaleString("en-IN")} kg</td>
                <td className="py-3 tabular-nums text-ink-secondary">₹{formatINR(b.totalDue)}</td>
                <td className="py-3 tabular-nums text-ink-secondary">₹{formatINR(b.totalPaid)}</td>
                <td
                  className={`py-3 text-right tabular-nums font-medium ${
                    b.balance > 0 ? "text-status-critical" : b.balance < 0 ? "text-status-warning" : "text-status-good"
                  }`}
                >
                  ₹{formatINR(Math.abs(b.balance))} {b.balance >= 0 ? t("fuel.due") : t("fuel.advance")}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

function PurchasesTab({ fuelTypes }: { fuelTypes: FuelType[] }) {
  const { t } = useTranslation();
  const [purchases, setPurchases] = useState<FuelPurchase[]>([]);
  const { page, setPage, pageCount, pageItems: pagedPurchases, total } = usePagination(purchases, 10);
  const [suppliers, setSuppliers] = useState<Person[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({
    fuelType: "",
    supplierId: "",
    vehicleNumber: "",
    invoicedWeightKg: "",
    actualWeightKg: "",
    amount: "",
    paidAmount: "",
  });
  const [loading, setLoading] = useState(false);
  const activeKilnId = useAuthStore((s) => s.activeKilnId);

  useEffect(() => {
    if (!form.fuelType && fuelTypes.length > 0) {
      setForm((f) => ({ ...f, fuelType: fuelTypes[0].name }));
    }
  }, [fuelTypes, form.fuelType]);

  const shortfall =
    form.invoicedWeightKg && form.actualWeightKg
      ? Number(form.invoicedWeightKg) - Number(form.actualWeightKg)
      : 0;
  const variancePercent = form.invoicedWeightKg
    ? Math.round((shortfall / Number(form.invoicedWeightKg)) * 1000) / 10
    : 0;

  async function refresh() {
    const [purchaseData, supplierData] = await Promise.all([
      api.fuelPurchases.list(),
      api.people.list("SUPPLIER"),
    ]);
    setPurchases(purchaseData);
    setSuppliers(supplierData);
  }

  useEffect(() => {
    if (!activeKilnId) return;
    refresh().catch(console.error);
  }, [activeKilnId]);

  useKilnEvent("fuelPurchase:update", () => refresh());

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!form.fuelType || !form.invoicedWeightKg || !form.actualWeightKg || !form.amount) return;
    setLoading(true);
    try {
      await api.fuelPurchases.create({
        fuelType: form.fuelType,
        supplierId: form.supplierId || undefined,
        vehicleNumber: form.vehicleNumber || undefined,
        invoicedWeightKg: Number(form.invoicedWeightKg),
        actualWeightKg: Number(form.actualWeightKg),
        amount: Number(form.amount),
        paidAmount: form.paidAmount ? Number(form.paidAmount) : undefined,
      });
      setForm((f) => ({
        ...f,
        supplierId: "",
        vehicleNumber: "",
        invoicedWeightKg: "",
        actualWeightKg: "",
        amount: "",
        paidAmount: "",
      }));
      setShowForm(false);
      await refresh();
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-3">
      <SupplierBalancesSection />

      <div className="flex justify-end">
        <Button size="sm" onClick={() => setShowForm((s) => !s)} disabled={fuelTypes.length === 0}>
          <Plus className="h-4 w-4" /> {t("fuel.logPurchase")}
        </Button>
      </div>

      {showForm && (
        <Card>
          <form onSubmit={handleSubmit} className="grid grid-cols-2 gap-2">
            <select
              value={form.fuelType}
              onChange={(e) => setForm((f) => ({ ...f, fuelType: e.target.value }))}
              className={inputClass}
            >
              {fuelTypes.map((ft) => (
                <option key={ft._id} value={ft.name}>
                  {ft.name}
                </option>
              ))}
            </select>
            <select
              value={form.supplierId}
              onChange={(e) => setForm((f) => ({ ...f, supplierId: e.target.value }))}
              className={inputClass}
            >
              <option value="">{t("fuel.supplierSourceOptional")}</option>
              {suppliers.map((s) => (
                <option key={s._id} value={s._id}>
                  {s.name}
                </option>
              ))}
            </select>
            <input
              placeholder={t("fuel.transportVehicleNumber")}
              value={form.vehicleNumber}
              onChange={(e) => setForm((f) => ({ ...f, vehicleNumber: e.target.value }))}
              className={cn(inputClass, "col-span-2")}
            />
            <input
              required
              type="number"
              placeholder={t("fuel.invoicedWeightKg")}
              value={form.invoicedWeightKg}
              onChange={(e) => setForm((f) => ({ ...f, invoicedWeightKg: e.target.value }))}
              className={inputClass}
            />
            <input
              required
              type="number"
              placeholder={t("fuel.actualWeighbridgeWeightKg")}
              value={form.actualWeightKg}
              onChange={(e) => setForm((f) => ({ ...f, actualWeightKg: e.target.value }))}
              className={inputClass}
            />
            <input
              required
              type="number"
              placeholder={t("fuel.totalAmount")}
              value={form.amount}
              onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))}
              className={inputClass}
            />
            <input
              type="number"
              placeholder={t("fuel.paidNowOptional")}
              value={form.paidAmount}
              onChange={(e) => setForm((f) => ({ ...f, paidAmount: e.target.value }))}
              className={inputClass}
            />
            {shortfall > 0 && (
              <p
                className={cn(
                  "col-span-2 rounded-lg px-3 py-2 text-xs",
                  variancePercent > 3 ? "bg-status-critical/10 text-status-critical" : "bg-ink-primary/5 text-ink-muted"
                )}
              >
                {t("fuel.shortfallMessage", { shortfall: shortfall.toLocaleString("en-IN"), percent: variancePercent })}
                {variancePercent > 3 ? t("fuel.shortfallWarning") : ""}
              </p>
            )}
            {form.supplierId && (
              <p className="col-span-2 text-sm text-ink-muted">
                {t("fuel.postsDueToSupplier", { amount: form.amount || 0 })}
                {form.paidAmount ? t("fuel.paidNowSuffix", { amount: form.paidAmount }) : ""}
                {t("fuel.balanceShowsAbove")}
              </p>
            )}
            <Button type="submit" disabled={loading} className="col-span-2">
              {t("fuel.savePurchase")}
            </Button>
          </form>
        </Card>
      )}

      <Card>
        {purchases.length === 0 ? (
          <p className="py-8 text-center text-sm text-ink-muted">{t("fuel.noPurchasesYet")}</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-sm">
              <thead>
                <tr className="border-b border-border text-left text-sm text-ink-muted">
                  <th className="pb-2 font-medium">{t("common.date")}</th>
                  <th className="pb-2 font-medium">{t("nav.fuel")}</th>
                  <th className="pb-2 font-medium">{t("fuel.source")}</th>
                  <th className="pb-2 font-medium">{t("common.vehicle")}</th>
                  <th className="pb-2 font-medium">{t("fuel.actual")}</th>
                  <th className="pb-2 font-medium">{t("fuel.variance")}</th>
                  <th className="pb-2 font-medium text-right">{t("common.amount")}</th>
                </tr>
              </thead>
              <tbody>
                {pagedPurchases.map((p) => {
                  const gap = p.invoicedWeightKg - p.actualWeightKg;
                  const variance = p.invoicedWeightKg > 0 ? Math.round((gap / p.invoicedWeightKg) * 1000) / 10 : 0;
                  return (
                    <tr key={p._id} className="border-b border-border/60 last:border-0">
                      <td className="py-3 text-ink-secondary">{new Date(p.date).toLocaleDateString("en-IN")}</td>
                      <td className="py-3 text-ink-primary">{p.fuelType}</td>
                      <td className="py-3 text-ink-secondary">
                        {typeof p.supplierId === "object" ? p.supplierId.name : "—"}
                      </td>
                      <td className="py-3 text-ink-secondary">{p.vehicleNumber ?? "—"}</td>
                      <td className="py-3 tabular-nums text-ink-secondary">{p.actualWeightKg.toLocaleString("en-IN")} kg</td>
                      <td className="py-3">
                        {gap > 0 ? (
                          <Badge variant={variance > 3 ? "critical" : "neutral"}>-{variance}%</Badge>
                        ) : (
                          <span className="text-sm text-ink-muted">—</span>
                        )}
                      </td>
                      <td className="py-3 text-right tabular-nums font-medium text-ink-primary">
                        ₹{formatINR(p.amount)}
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
    </div>
  );
}

function ConsumptionTab({ fuelTypes }: { fuelTypes: FuelType[] }) {
  const { t } = useTranslation();
  const [logs, setLogs] = useState<FuelLog[]>([]);
  const [efficiency, setEfficiency] = useState<FuelEfficiency | null>(null);
  const ghers = useGhers();
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ gherId: "", fuelType: "", quantityKg: "" });
  const [loading, setLoading] = useState(false);
  const activeKilnId = useAuthStore((s) => s.activeKilnId);

  useEffect(() => {
    if (!form.fuelType && fuelTypes.length > 0) {
      setForm((f) => ({ ...f, fuelType: fuelTypes[0].name }));
    }
  }, [fuelTypes, form.fuelType]);

  async function refresh() {
    const [logData, effData] = await Promise.all([api.fuelLogs.list(), api.fuelLogs.efficiency()]);
    setLogs(logData);
    setEfficiency(effData);
  }

  useEffect(() => {
    if (!activeKilnId) return;
    refresh().catch(console.error);
  }, [activeKilnId]);

  useKilnEvent("fuelLog:update", () => refresh());

  const { page, setPage, pageCount, pageItems: pagedLogs, total } = usePagination(logs, 10);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!form.gherId || !form.fuelType || !form.quantityKg) return;
    setLoading(true);
    try {
      await api.fuelLogs.create({
        gherId: form.gherId,
        fuelType: form.fuelType,
        quantityKg: Number(form.quantityKg),
      });
      setForm((f) => ({ ...f, quantityKg: "" }));
      setShowForm(false);
      await refresh();
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-3">
      {efficiency?.highConsumptionAlert && (
        <Card className="border-status-critical/40 bg-status-critical/5">
          <div className="flex items-start gap-3">
            <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-status-critical" />
            <div>
              <p className="text-sm font-medium text-status-critical">{t("fuel.highFuelConsumption")}</p>
              <p className="mt-1 text-sm text-ink-muted">
                {t("fuel.consumptionAlertMessage", {
                  days: efficiency.days,
                  recent: efficiency.recentKgPer1000 ?? 0,
                  baseline: efficiency.baselineKgPer1000 ?? 0,
                  baselineDays: efficiency.baselineDays,
                })}
              </p>
            </div>
          </div>
        </Card>
      )}

      {efficiency && !efficiency.highConsumptionAlert && efficiency.recentKgPer1000 != null && (
        <Card>
          <p className="text-sm text-ink-muted">{t("fuel.fuelEfficiencyDays", { days: efficiency.days })}</p>
          <p className="text-2xl font-semibold tabular-nums text-ink-primary">
            {t("fuel.kgPer1000Bricks", { kg: efficiency.recentKgPer1000 })}
          </p>
        </Card>
      )}

      <div className="flex justify-end">
        <Button size="sm" onClick={() => setShowForm((s) => !s)} disabled={fuelTypes.length === 0}>
          <Plus className="h-4 w-4" /> {t("fuel.logDailyFeeding")}
        </Button>
      </div>

      {showForm && (
        <Card>
          <form onSubmit={handleSubmit} className="grid grid-cols-2 gap-2">
            <select
              required
              value={form.gherId}
              onChange={(e) => setForm((f) => ({ ...f, gherId: e.target.value }))}
              className={inputClass}
            >
              <option value="">{t("fuel.chamberPlaceholder")}</option>
              {ghers.map((g) => (
                <option key={g._id} value={g._id}>
                  {t("fuel.gherNumber", { number: g.number })}
                </option>
              ))}
            </select>
            <select
              value={form.fuelType}
              onChange={(e) => setForm((f) => ({ ...f, fuelType: e.target.value }))}
              className={inputClass}
            >
              {fuelTypes.map((ft) => (
                <option key={ft._id} value={ft.name}>
                  {ft.name}
                </option>
              ))}
            </select>
            <input
              required
              type="number"
              placeholder={t("fuel.quantityFedKg")}
              value={form.quantityKg}
              onChange={(e) => setForm((f) => ({ ...f, quantityKg: e.target.value }))}
              className={cn(inputClass, "col-span-2")}
            />
            <Button type="submit" disabled={loading} className="col-span-2">
              {t("common.save")}
            </Button>
          </form>
        </Card>
      )}

      <Card>
        {logs.length === 0 ? (
          <p className="py-8 text-center text-sm text-ink-muted">{t("fuel.noFeedingYet")}</p>
        ) : (
          <div className="space-y-1">
            {pagedLogs.map((l) => (
              <div key={l._id} className="flex items-center justify-between rounded-lg border border-border px-3 py-2 text-sm">
                <div>
                  <p className="text-ink-primary">
                    {t("fuel.gherNumber", { number: typeof l.gherId === "object" ? l.gherId.number : "—" })} · {l.fuelType}
                  </p>
                  <p className="text-sm text-ink-muted">{new Date(l.date).toLocaleDateString("en-IN")}</p>
                </div>
                <span className="tabular-nums font-medium text-ink-primary">{l.quantityKg.toLocaleString("en-IN")} kg</span>
              </div>
            ))}
            <Pagination page={page} pageCount={pageCount} onChange={setPage} total={total} pageSize={10} />
          </div>
        )}
      </Card>
    </div>
  );
}

export function Fuel() {
  const { t } = useTranslation();
  const [tab, setTab] = useState<"purchases" | "consumption">("purchases");
  const { fuelTypes, refresh: refreshFuelTypes } = useFuelTypes();

  return (
    <div className="space-y-4">
      <FuelTypesSection fuelTypes={fuelTypes} onChanged={refreshFuelTypes} />
      <StockBalanceRow fuelTypes={fuelTypes} />

      <SegmentedTabs
        options={[
          { value: "purchases" as const, label: t("fuel.purchases") },
          { value: "consumption" as const, label: t("fuel.dailyFeedingConsumption") },
        ]}
        value={tab}
        onChange={setTab}
      />

      {tab === "purchases" && <PurchasesTab fuelTypes={fuelTypes} />}
      {tab === "consumption" && <ConsumptionTab fuelTypes={fuelTypes} />}
    </div>
  );
}
