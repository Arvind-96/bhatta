import { FormEvent, useEffect, useState } from "react";
import { AlertTriangle, Plus, Wrench } from "lucide-react";
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
import type { Machine, MachineFuelLog, MachineFuelType, MachineMaintenanceLog, MachineType } from "@/types";

const inputClass =
  "h-10 rounded-xl border border-border bg-ink-primary/5 px-3 text-sm text-ink-primary outline-none focus:ring-2 focus:ring-series-1";

function useMachineTypeLabels(): Record<MachineType, string> {
  const { t } = useTranslation();
  return {
    TRACTOR: t("fleet.typeTractor"),
    TRUCK: t("fleet.typeTruck"),
    JCB: t("fleet.typeJcb"),
    PUG_MILL: t("fleet.typePugMill"),
    MOLDING_MACHINE: t("fleet.typeMoldingMachine"),
    WEIGHBRIDGE: t("fleet.typeWeighbridge"),
    GENERATOR: t("fleet.typeGenerator"),
    PUMP: t("fleet.typePump"),
    BLOWER: t("fleet.typeBlower"),
    OTHER: t("fleet.typeOther"),
  };
}

function useFuelTypeLabels(): Record<MachineFuelType, string> {
  const { t } = useTranslation();
  return {
    DIESEL: t("fleet.fuelDiesel"),
    PETROL: t("fleet.fuelPetrol"),
    ELECTRICITY: t("fleet.fuelElectricity"),
  };
}

function useMachines() {
  const [machines, setMachines] = useState<Machine[]>([]);
  const activeKilnId = useAuthStore((s) => s.activeKilnId);

  async function refresh() {
    setMachines(await api.machines.list());
  }

  useEffect(() => {
    if (!activeKilnId) return;
    refresh().catch(console.error);
  }, [activeKilnId]);

  useKilnEvent("machine:update", () => refresh());

  return { machines, refresh };
}

function machineLabel(
  m: { _id: string; name: string; type: MachineType } | string,
  machines: Machine[],
  machineTypeLabels: Record<MachineType, string>
) {
  if (typeof m === "object") return `${m.name} (${machineTypeLabels[m.type]})`;
  const found = machines.find((x) => x._id === m);
  return found ? `${found.name} (${machineTypeLabels[found.type]})` : "—";
}

function MachinesTab() {
  const { t } = useTranslation();
  const machineTypeLabels = useMachineTypeLabels();
  const { machines, refresh } = useMachines();
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ name: "", type: "TRACTOR" as MachineType, identifier: "", notes: "" });
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!form.name) return;
    setLoading(true);
    try {
      await api.machines.create({
        name: form.name,
        type: form.type,
        identifier: form.identifier || undefined,
        notes: form.notes || undefined,
      });
      setForm({ name: "", type: "TRACTOR", identifier: "", notes: "" });
      setShowForm(false);
      await refresh();
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex justify-end">
        <Button size="sm" onClick={() => setShowForm((s) => !s)}>
          <Plus className="h-4 w-4" /> {t("fleet.addMachineVehicle")}
        </Button>
      </div>

      {showForm && (
        <Card>
          <form onSubmit={handleSubmit} className="grid grid-cols-2 gap-2">
            <input
              required
              placeholder={t("fleet.machineNamePlaceholder")}
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              className={inputClass}
            />
            <select
              value={form.type}
              onChange={(e) => setForm((f) => ({ ...f, type: e.target.value as MachineType }))}
              className={inputClass}
            >
              {Object.entries(machineTypeLabels).map(([v, l]) => (
                <option key={v} value={v}>
                  {l}
                </option>
              ))}
            </select>
            <input
              placeholder={t("fleet.registrationIdentifierOptional")}
              value={form.identifier}
              onChange={(e) => setForm((f) => ({ ...f, identifier: e.target.value }))}
              className={cn(inputClass, "col-span-2")}
            />
            <input
              placeholder={t("fleet.notesOptional")}
              value={form.notes}
              onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
              className={cn(inputClass, "col-span-2")}
            />
            <Button type="submit" disabled={loading} className="col-span-2">
              {t("fleet.saveMachine")}
            </Button>
          </form>
        </Card>
      )}

      <Card>
        {machines.length === 0 ? (
          <p className="py-8 text-center text-sm text-ink-muted">{t("fleet.noMachinesYet")}</p>
        ) : (
          <div className="space-y-1">
            {machines.map((m) => (
              <div key={m._id} className="flex items-center justify-between rounded-lg border border-border px-3 py-2 text-sm">
                <div>
                  <p className="text-ink-primary">
                    {m.name} <Badge variant="neutral">{machineTypeLabels[m.type]}</Badge>
                  </p>
                  {(m.identifier || m.notes) && (
                    <p className="mt-0.5 text-sm text-ink-muted">
                      {m.identifier}
                      {m.identifier && m.notes ? " · " : ""}
                      {m.notes}
                    </p>
                  )}
                </div>
                {!m.active && <Badge variant="critical">{t("common.inactive")}</Badge>}
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}

function FuelLogsTab() {
  const { t } = useTranslation();
  const machineTypeLabels = useMachineTypeLabels();
  const fuelTypeLabels = useFuelTypeLabels();
  const { machines } = useMachines();
  const [logs, setLogs] = useState<MachineFuelLog[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ machineId: "", fuelType: "DIESEL" as MachineFuelType, quantity: "", hoursRun: "", notes: "" });
  const [loading, setLoading] = useState(false);
  const [alertMsg, setAlertMsg] = useState<string | null>(null);
  const activeKilnId = useAuthStore((s) => s.activeKilnId);

  async function refresh() {
    setLogs(await api.machines.fuelLogs.list());
  }

  useEffect(() => {
    if (!activeKilnId) return;
    refresh().catch(console.error);
  }, [activeKilnId]);

  useKilnEvent("machineFuelLog:update", () => refresh());

  const { page, setPage, pageCount, pageItems: pagedLogs, total } = usePagination(logs, 10);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!form.machineId || !form.quantity) return;
    setLoading(true);
    try {
      const result = await api.machines.fuelLogs.create({
        machineId: form.machineId,
        fuelType: form.fuelType,
        quantity: Number(form.quantity),
        hoursRun: form.hoursRun ? Number(form.hoursRun) : undefined,
        notes: form.notes || undefined,
      });
      setAlertMsg(
        result.consumptionAlert
          ? t("fleet.consumptionAlertMessage", { rate: result.ratePerHour ?? "", baseline: result.baselineRatePerHour ?? "" })
          : null
      );
      setForm({ machineId: "", fuelType: "DIESEL", quantity: "", hoursRun: "", notes: "" });
      setShowForm(false);
      await refresh();
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-3">
      {alertMsg && (
        <Card className="border-status-critical/40 bg-status-critical/5">
          <div className="flex items-start gap-3">
            <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-status-critical" />
            <p className="text-sm text-status-critical">{alertMsg}</p>
          </div>
        </Card>
      )}

      <div className="flex justify-end">
        <Button size="sm" onClick={() => setShowForm((s) => !s)}>
          <Plus className="h-4 w-4" /> {t("fleet.logFuelElectricityUse")}
        </Button>
      </div>

      {showForm && (
        <Card>
          <form onSubmit={handleSubmit} className="grid grid-cols-2 gap-2">
            <select
              required
              value={form.machineId}
              onChange={(e) => setForm((f) => ({ ...f, machineId: e.target.value }))}
              className={cn(inputClass, "col-span-2")}
            >
              <option value="">{t("fleet.machinePlaceholder")}</option>
              {machines.map((m) => (
                <option key={m._id} value={m._id}>
                  {m.name} ({machineTypeLabels[m.type]})
                </option>
              ))}
            </select>
            <select
              value={form.fuelType}
              onChange={(e) => setForm((f) => ({ ...f, fuelType: e.target.value as MachineFuelType }))}
              className={inputClass}
            >
              {Object.entries(fuelTypeLabels).map(([v, l]) => (
                <option key={v} value={v}>
                  {l}
                </option>
              ))}
            </select>
            <input
              required
              type="number"
              placeholder={form.fuelType === "ELECTRICITY" ? t("fleet.unitsKwh") : t("fleet.quantityLitres")}
              value={form.quantity}
              onChange={(e) => setForm((f) => ({ ...f, quantity: e.target.value }))}
              className={inputClass}
            />
            <input
              type="number"
              placeholder={t("fleet.hoursRunOptional")}
              value={form.hoursRun}
              onChange={(e) => setForm((f) => ({ ...f, hoursRun: e.target.value }))}
              className={inputClass}
            />
            <input
              placeholder={t("fleet.notesOptional")}
              value={form.notes}
              onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
              className={inputClass}
            />
            <Button type="submit" disabled={loading} className="col-span-2">
              {t("fleet.saveLog")}
            </Button>
          </form>
        </Card>
      )}

      <Card>
        {logs.length === 0 ? (
          <p className="py-8 text-center text-sm text-ink-muted">{t("fleet.noFuelLogsYet")}</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-sm">
              <thead>
                <tr className="border-b border-border text-left text-sm text-ink-muted">
                  <th className="pb-2 font-medium">{t("common.date")}</th>
                  <th className="pb-2 font-medium">{t("fleet.machine")}</th>
                  <th className="pb-2 font-medium">{t("fleet.fuelColumn")}</th>
                  <th className="pb-2 font-medium">{t("fleet.qty")}</th>
                  <th className="pb-2 font-medium text-right">{t("fleet.rateHr")}</th>
                </tr>
              </thead>
              <tbody>
                {pagedLogs.map((l) => (
                  <tr key={l._id} className="border-b border-border/60 last:border-0">
                    <td className="py-3 text-ink-secondary">{new Date(l.date).toLocaleDateString("en-IN")}</td>
                    <td className="py-3 text-ink-primary">{machineLabel(l.machineId, [], machineTypeLabels)}</td>
                    <td className="py-3 text-ink-secondary">{fuelTypeLabels[l.fuelType]}</td>
                    <td className="py-3 tabular-nums text-ink-secondary">{l.quantity.toLocaleString("en-IN")}</td>
                    <td className="py-3 text-right">
                      {l.ratePerHour != null ? (
                        <Badge variant={l.consumptionAlert ? "critical" : "neutral"}>{l.ratePerHour}/hr</Badge>
                      ) : (
                        "—"
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <Pagination page={page} pageCount={pageCount} onChange={setPage} total={total} pageSize={10} />
          </div>
        )}
      </Card>
    </div>
  );
}

function MaintenanceTab() {
  const { t } = useTranslation();
  const machineTypeLabels = useMachineTypeLabels();
  const { machines } = useMachines();
  const [logs, setLogs] = useState<MachineMaintenanceLog[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ machineId: "", description: "", cost: "", downtimeHours: "", notes: "" });
  const [loading, setLoading] = useState(false);
  const activeKilnId = useAuthStore((s) => s.activeKilnId);

  async function refresh() {
    setLogs(await api.machines.maintenance.list());
  }

  useEffect(() => {
    if (!activeKilnId) return;
    refresh().catch(console.error);
  }, [activeKilnId]);

  useKilnEvent("machineMaintenance:update", () => refresh());

  const { page, setPage, pageCount, pageItems: pagedLogs, total } = usePagination(logs, 10);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!form.machineId || !form.description) return;
    setLoading(true);
    try {
      await api.machines.maintenance.create({
        machineId: form.machineId,
        description: form.description,
        cost: form.cost ? Number(form.cost) : undefined,
        downtimeHours: form.downtimeHours ? Number(form.downtimeHours) : undefined,
        notes: form.notes || undefined,
      });
      setForm({ machineId: "", description: "", cost: "", downtimeHours: "", notes: "" });
      setShowForm(false);
      await refresh();
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex justify-end">
        <Button size="sm" onClick={() => setShowForm((s) => !s)}>
          <Plus className="h-4 w-4" /> {t("fleet.logRepairBreakdown")}
        </Button>
      </div>

      {showForm && (
        <Card>
          <form onSubmit={handleSubmit} className="grid grid-cols-2 gap-2">
            <select
              required
              value={form.machineId}
              onChange={(e) => setForm((f) => ({ ...f, machineId: e.target.value }))}
              className={cn(inputClass, "col-span-2")}
            >
              <option value="">{t("fleet.machinePlaceholder")}</option>
              {machines.map((m) => (
                <option key={m._id} value={m._id}>
                  {m.name} ({machineTypeLabels[m.type]})
                </option>
              ))}
            </select>
            <input
              required
              placeholder={t("fleet.whatBrokeRepairDone")}
              value={form.description}
              onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
              className={cn(inputClass, "col-span-2")}
            />
            <input
              type="number"
              placeholder={t("fleet.repairCost")}
              value={form.cost}
              onChange={(e) => setForm((f) => ({ ...f, cost: e.target.value }))}
              className={inputClass}
            />
            <input
              type="number"
              placeholder={t("fleet.downtimeHours")}
              value={form.downtimeHours}
              onChange={(e) => setForm((f) => ({ ...f, downtimeHours: e.target.value }))}
              className={inputClass}
            />
            <input
              placeholder={t("fleet.notesOptional")}
              value={form.notes}
              onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
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
          <p className="py-8 text-center text-sm text-ink-muted">{t("fleet.noMaintenanceYet")}</p>
        ) : (
          <div className="space-y-1">
            {pagedLogs.map((l) => (
              <div key={l._id} className="rounded-lg border border-border px-3 py-2 text-sm">
                <div className="flex items-center justify-between">
                  <p className="flex items-center gap-1.5 text-ink-primary">
                    <Wrench className="h-3.5 w-3.5 text-ink-muted" />
                    {machineLabel(l.machineId, [], machineTypeLabels)}
                  </p>
                  <span className="text-sm text-ink-muted">{new Date(l.date).toLocaleDateString("en-IN")}</span>
                </div>
                <p className="mt-1 text-xs text-ink-secondary">{l.description}</p>
                <p className="mt-1 text-sm text-ink-muted">
                  {l.cost > 0 ? `₹${formatINR(l.cost)}` : ""}
                  {l.cost > 0 && l.downtimeHours > 0 ? " · " : ""}
                  {l.downtimeHours > 0 ? t("fleet.downtimeSuffix", { hours: l.downtimeHours }) : ""}
                </p>
              </div>
            ))}
            <Pagination page={page} pageCount={pageCount} onChange={setPage} total={total} pageSize={10} />
          </div>
        )}
      </Card>
    </div>
  );
}

export function Fleet() {
  const { t } = useTranslation();
  const [tab, setTab] = useState<"machines" | "fuel" | "maintenance">("machines");

  return (
    <div className="space-y-4">
      <SegmentedTabs
        options={[
          { value: "machines" as const, label: t("fleet.machinesVehiclesTab") },
          { value: "fuel" as const, label: t("fleet.fuelElectricityTab") },
          { value: "maintenance" as const, label: t("fleet.maintenanceBreakdownTab") },
        ]}
        value={tab}
        onChange={setTab}
      />

      {tab === "machines" && <MachinesTab />}
      {tab === "fuel" && <FuelLogsTab />}
      {tab === "maintenance" && <MaintenanceTab />}
    </div>
  );
}
