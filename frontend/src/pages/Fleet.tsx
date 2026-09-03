import { FormEvent, useEffect, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { DateInput } from "@/components/ui/date-input";
import { Pagination, usePagination } from "@/components/ui/pagination";
import { SegmentedTabs } from "@/components/ui/segmented-tabs";
import { cn, formatINR } from "@/lib/utils";
import { api } from "@/lib/api";
import { useKilnEvent } from "@/hooks/useKilnEvent";
import { useAuthStore } from "@/store/auth.store";
import { useTranslation } from "@/hooks/useTranslation";
import { MachineDetailPage } from "@/components/fleet/MachineDetailPage";
import { useMachineTypeLabels } from "@/components/fleet/machineTypes";
import { buildReportWorkbookBlob, downloadExcelFile } from "@/lib/exportExcel";
import type { Machine, MachineFuelLog, MachineFuelType, MachineMaintenanceLog, MachineType } from "@/types";
import type { ReportColumn } from "@/types/reports";

const FLEET_EXCEL_COLUMNS: ReportColumn[] = [
  { key: "name", labelKey: "common.name", format: "text" },
  { key: "type", labelKey: "common.type", format: "text" },
  { key: "identifier", labelKey: "fleet.identifierColumn", format: "text" },
  { key: "purchaseDate", labelKey: "fleet.purchaseDate", format: "date" },
  { key: "price", labelKey: "fleet.price", format: "currency" },
  { key: "totalPaid", labelKey: "fleet.totalPaidLabel", format: "currency" },
  { key: "remainingDue", labelKey: "fleet.remainingDueLabel", format: "currency" },
];

const inputClass =
  "h-10 rounded-xl border border-border bg-ink-primary/5 px-3 text-sm text-ink-primary outline-none focus:ring-2 focus:ring-series-1";

function emptyForm() {
  return {
    name: "",
    type: "TRACTOR" as MachineType,
    identifier: "",
    purchaseDate: "",
    price: "",
    purchasedByName: "",
    purchasedByPhone: "",
    warrantyDetails: "",
    totalPaid: "",
    tenureMonths: "",
    notes: "",
  };
}

function fuelUnitLabel(t: (key: string) => string, fuelType: MachineFuelType) {
  return fuelType === "ELECTRICITY" ? t("fleet.unitsKwh") : t("fleet.quantityLitres");
}

function fuelTypeLabel(t: (key: string) => string, fuelType: MachineFuelType) {
  if (fuelType === "DIESEL") return t("fleet.fuelDiesel");
  if (fuelType === "PETROL") return t("fleet.fuelPetrol");
  return t("fleet.fuelElectricity");
}

function machineLabel(machineId: MachineFuelLog["machineId"]) {
  return typeof machineId === "string" ? machineId : machineId.name;
}

// Log fuel / electricity use per machine, plus the anomaly alert
// (createMachineFuelLog's own 30-day-baseline check) surfaced right after
// a log that trips it.
function FuelElectricityTab({ machines }: { machines: Machine[] }) {
  const { t } = useTranslation();
  const [logs, setLogs] = useState<MachineFuelLog[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [machineId, setMachineId] = useState("");
  const [fuelType, setFuelType] = useState<MachineFuelType>("DIESEL");
  const [quantity, setQuantity] = useState("");
  const [hoursRun, setHoursRun] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [alertMessage, setAlertMessage] = useState<string | null>(null);

  async function refresh() {
    setLogs(await api.machines.fuelLogs.list());
  }

  useEffect(() => {
    refresh().catch(console.error);
  }, []);

  useKilnEvent("machineFuel:update", () => refresh());

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!machineId || !quantity) return;
    setSaving(true);
    try {
      const result = await api.machines.fuelLogs.create({
        machineId,
        fuelType,
        quantity: Number(quantity),
        hoursRun: hoursRun ? Number(hoursRun) : undefined,
        notes: notes || undefined,
      });
      setAlertMessage(
        result.consumptionAlert && result.ratePerHour != null && result.baselineRatePerHour != null
          ? t("fleet.consumptionAlertMessage", { rate: result.ratePerHour.toFixed(2), baseline: result.baselineRatePerHour.toFixed(2) })
          : null
      );
      setQuantity("");
      setHoursRun("");
      setNotes("");
      setShowForm(false);
      await refresh();
    } finally {
      setSaving(false);
    }
  }

  async function deleteLog(id: string) {
    if (!confirm(t("fleet.confirmDeleteFuelLog"))) return;
    await api.machines.fuelLogs.remove(id);
    await refresh();
  }

  return (
    <div className="space-y-3">
      {alertMessage && (
        <div className="rounded-lg border border-status-warning/30 bg-status-warning/5 px-3 py-2 text-sm text-status-warning">
          {alertMessage}
        </div>
      )}

      <div className="flex justify-end">
        <Button size="sm" onClick={() => setShowForm((s) => !s)}>
          <Plus className="h-4 w-4" /> {t("fleet.logFuelElectricityUse")}
        </Button>
      </div>

      {showForm && (
        <Card>
          <form onSubmit={handleSubmit} className="grid grid-cols-2 gap-2">
            <select required value={machineId} onChange={(e) => setMachineId(e.target.value)} className={cn(inputClass, "col-span-2")}>
              <option value="" disabled>
                {t("fleet.machinePlaceholder")}
              </option>
              {machines.map((m) => (
                <option key={m._id} value={m._id}>
                  {m.name}
                </option>
              ))}
            </select>
            <select value={fuelType} onChange={(e) => setFuelType(e.target.value as MachineFuelType)} className={inputClass}>
              <option value="DIESEL">{t("fleet.fuelDiesel")}</option>
              <option value="PETROL">{t("fleet.fuelPetrol")}</option>
              <option value="ELECTRICITY">{t("fleet.fuelElectricity")}</option>
            </select>
            <input
              required
              type="number"
              placeholder={fuelUnitLabel(t, fuelType)}
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
              className={inputClass}
            />
            <input
              type="number"
              placeholder={t("fleet.hoursRunOptional")}
              value={hoursRun}
              onChange={(e) => setHoursRun(e.target.value)}
              className={inputClass}
            />
            <input
              placeholder={t("fleet.notesOptional")}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className={inputClass}
            />
            <Button type="submit" disabled={saving} className="col-span-2">
              {t("fleet.saveLog")}
            </Button>
          </form>
        </Card>
      )}

      <Card>
        {logs.length === 0 ? (
          <p className="py-8 text-center text-sm text-ink-muted">{t("fleet.noFuelLogsYet")}</p>
        ) : (
          <div className="space-y-1">
            {logs.map((log) => {
              const rateHr = log.hoursRun ? log.quantity / log.hoursRun : null;
              return (
                <div key={log._id} className="flex items-center justify-between rounded-lg border border-border px-3 py-2 text-sm">
                  <div>
                    <p className="text-ink-primary">
                      {new Date(log.date).toLocaleDateString("en-IN")} · {machineLabel(log.machineId)}{" "}
                      <Badge variant="neutral">{fuelTypeLabel(t, log.fuelType)}</Badge>
                    </p>
                    {log.notes && <p className="text-sm text-ink-muted">{log.notes}</p>}
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="tabular-nums font-medium text-ink-primary">
                      {log.quantity} {log.fuelType === "ELECTRICITY" ? "kWh" : "L"}
                    </span>
                    {rateHr != null && <span className="tabular-nums text-sm text-ink-muted">{rateHr.toFixed(2)}/{t("fleet.rateHr")}</span>}
                    <button onClick={() => deleteLog(log._id)} className="text-ink-muted hover:text-status-critical" aria-label={t("common.delete")}>
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Card>
    </div>
  );
}

// Log repairs/breakdowns per machine — a nonzero cost auto-logs as a
// MACHINERY_REPAIR Expense (machine.service.ts's createMaintenanceLog),
// reversed on delete via expenses.machineMaintenanceLogId.
function MaintenanceBreakdownTab({ machines }: { machines: Machine[] }) {
  const { t } = useTranslation();
  const [logs, setLogs] = useState<MachineMaintenanceLog[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [machineId, setMachineId] = useState("");
  const [description, setDescription] = useState("");
  const [cost, setCost] = useState("");
  const [downtimeHours, setDowntimeHours] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);

  async function refresh() {
    setLogs(await api.machines.maintenance.list());
  }

  useEffect(() => {
    refresh().catch(console.error);
  }, []);

  useKilnEvent("machineMaintenance:update", () => refresh());

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!machineId || !description) return;
    setSaving(true);
    try {
      await api.machines.maintenance.create({
        machineId,
        description,
        cost: cost ? Number(cost) : undefined,
        downtimeHours: downtimeHours ? Number(downtimeHours) : undefined,
        notes: notes || undefined,
      });
      setDescription("");
      setCost("");
      setDowntimeHours("");
      setNotes("");
      setShowForm(false);
      await refresh();
    } finally {
      setSaving(false);
    }
  }

  async function deleteLog(id: string) {
    if (!confirm(t("fleet.confirmDeleteMaintenance"))) return;
    await api.machines.maintenance.remove(id);
    await refresh();
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
            <select required value={machineId} onChange={(e) => setMachineId(e.target.value)} className={cn(inputClass, "col-span-2")}>
              <option value="" disabled>
                {t("fleet.machinePlaceholder")}
              </option>
              {machines.map((m) => (
                <option key={m._id} value={m._id}>
                  {m.name}
                </option>
              ))}
            </select>
            <input
              required
              placeholder={t("fleet.whatBrokeRepairDone")}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className={cn(inputClass, "col-span-2")}
            />
            <input type="number" placeholder={t("fleet.repairCost")} value={cost} onChange={(e) => setCost(e.target.value)} className={inputClass} />
            <input
              type="number"
              placeholder={t("fleet.downtimeHours")}
              value={downtimeHours}
              onChange={(e) => setDowntimeHours(e.target.value)}
              className={inputClass}
            />
            <input
              placeholder={t("fleet.notesOptional")}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className={cn(inputClass, "col-span-2")}
            />
            <Button type="submit" disabled={saving} className="col-span-2">
              {t("fleet.saveLog")}
            </Button>
          </form>
        </Card>
      )}

      <Card>
        {logs.length === 0 ? (
          <p className="py-8 text-center text-sm text-ink-muted">{t("fleet.noMaintenanceYet")}</p>
        ) : (
          <div className="space-y-1">
            {logs.map((log) => (
              <div key={log._id} className="flex items-center justify-between rounded-lg border border-border px-3 py-2 text-sm">
                <div>
                  <p className="text-ink-primary">
                    {new Date(log.date).toLocaleDateString("en-IN")} · {machineLabel(log.machineId)}
                  </p>
                  <p className="text-sm text-ink-muted">{log.description}</p>
                  {log.notes && <p className="text-sm text-ink-muted">{log.notes}</p>}
                </div>
                <div className="flex items-center gap-3">
                  {log.downtimeHours > 0 && <Badge variant="neutral">{t("fleet.downtimeSuffix", { hours: log.downtimeHours })}</Badge>}
                  {log.cost > 0 && <span className="tabular-nums font-medium text-ink-primary">₹{formatINR(log.cost)}</span>}
                  <button onClick={() => deleteLog(log._id)} className="text-ink-muted hover:text-status-critical" aria-label={t("common.delete")}>
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}

// The Machine & Vehicle directory, plus its two auxiliary logs (Fuel &
// Electricity, Maintenance & Breakdown) as sibling tabs — the backend for
// both has always supported create+list (and now delete), this just wires
// it into the page.
export function Fleet() {
  const { t } = useTranslation();
  const machineTypeLabels = useMachineTypeLabels();
  const [machines, setMachines] = useState<Machine[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [loading, setLoading] = useState(false);
  const [openMachineId, setOpenMachineId] = useState<string | null>(null);
  const [tab, setTab] = useState<"machines" | "fuel" | "maintenance">("machines");
  const activeKilnId = useAuthStore((s) => s.activeKilnId);

  async function refresh() {
    setMachines(await api.machines.list());
  }

  useEffect(() => {
    if (!activeKilnId) return;
    refresh().catch(console.error);
  }, [activeKilnId]);

  useKilnEvent("machine:update", () => refresh());

  const { page, setPage, pageCount, pageItems: pagedMachines, total } = usePagination(machines, 12);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!form.name) return;
    setLoading(true);
    try {
      await api.machines.create({
        name: form.name,
        type: form.type,
        identifier: form.identifier || undefined,
        purchaseDate: form.purchaseDate || undefined,
        price: form.price ? Number(form.price) : undefined,
        purchasedByName: form.purchasedByName || undefined,
        purchasedByPhone: form.purchasedByPhone || undefined,
        warrantyDetails: form.warrantyDetails || undefined,
        totalPaid: form.totalPaid ? Number(form.totalPaid) : undefined,
        tenureMonths: form.tenureMonths ? Number(form.tenureMonths) : undefined,
        notes: form.notes || undefined,
      });
      setForm(emptyForm());
      setShowForm(false);
      await refresh();
    } finally {
      setLoading(false);
    }
  }

  if (openMachineId) {
    return <MachineDetailPage machineId={openMachineId} onBack={() => setOpenMachineId(null)} />;
  }

  return (
    <div className="space-y-3">
      <SegmentedTabs
        options={[
          { value: "machines" as const, label: t("fleet.machinesVehiclesTab") },
          { value: "fuel" as const, label: t("fleet.fuelElectricityTab") },
          { value: "maintenance" as const, label: t("fleet.maintenanceBreakdownTab") },
        ]}
        value={tab}
        onChange={setTab}
      />

      {tab === "fuel" && <FuelElectricityTab machines={machines} />}
      {tab === "maintenance" && <MaintenanceBreakdownTab machines={machines} />}
      {tab === "machines" && (
      <div className="space-y-3">
      <div className="flex justify-end gap-2">
        {machines.length > 0 && (
          <button
            type="button"
            onClick={() => {
              const rows = machines.map((m) => ({
                name: m.name,
                type: machineTypeLabels[m.type],
                identifier: m.identifier ?? "",
                purchaseDate: m.purchaseDate ?? null,
                price: m.price ?? 0,
                totalPaid: m.totalPaid ?? 0,
                remainingDue: m.remainingDue ?? 0,
              }));
              const labels = Object.fromEntries(FLEET_EXCEL_COLUMNS.map((c) => [c.key, t(c.labelKey)]));
              const blob = buildReportWorkbookBlob(FLEET_EXCEL_COLUMNS, rows, undefined, labels, t("nav.fleet"));
              downloadExcelFile(blob, "fleet.xlsx");
            }}
            className="rounded-lg border border-border px-3 py-1.5 text-xs font-semibold text-ink-secondary hover:bg-ink-primary/5"
          >
            {t("reports.action.downloadExcel")}
          </button>
        )}
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
            <label className="flex flex-col gap-1">
              <span className="text-xs text-ink-muted">{t("fleet.purchaseDate")}</span>
              <DateInput value={form.purchaseDate} onChange={(e) => setForm((f) => ({ ...f, purchaseDate: e.target.value }))} className={inputClass} />
            </label>
            <input
              type="number"
              placeholder={t("fleet.price")}
              value={form.price}
              onChange={(e) => setForm((f) => ({ ...f, price: e.target.value }))}
              className={inputClass}
            />
            <input
              placeholder={t("fleet.purchasedByName")}
              value={form.purchasedByName}
              onChange={(e) => setForm((f) => ({ ...f, purchasedByName: e.target.value }))}
              className={inputClass}
            />
            <input
              placeholder={t("fleet.purchasedByPhone")}
              value={form.purchasedByPhone}
              onChange={(e) => setForm((f) => ({ ...f, purchasedByPhone: e.target.value }))}
              className={inputClass}
            />
            <input
              placeholder={t("fleet.warrantyDetails")}
              value={form.warrantyDetails}
              onChange={(e) => setForm((f) => ({ ...f, warrantyDetails: e.target.value }))}
              className={cn(inputClass, "col-span-2")}
            />
            <input
              type="number"
              placeholder={t("fleet.totalPaidAtPurchase")}
              value={form.totalPaid}
              onChange={(e) => setForm((f) => ({ ...f, totalPaid: e.target.value }))}
              className={inputClass}
            />
            <input
              type="number"
              placeholder={t("fleet.tenureMonths")}
              value={form.tenureMonths}
              onChange={(e) => setForm((f) => ({ ...f, tenureMonths: e.target.value }))}
              className={inputClass}
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
          <>
            <div className="space-y-1">
              {pagedMachines.map((m) => (
                <button
                  key={m._id}
                  onClick={() => setOpenMachineId(m._id)}
                  className="flex w-full items-center justify-between rounded-lg border border-border px-3 py-2 text-left text-sm hover:bg-ink-primary/5"
                >
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
                  {m.remainingDue ? (
                    <span className="text-sm font-medium text-status-critical">
                      {t("fleet.remainingDueLabel")}: ₹{formatINR(m.remainingDue)}
                    </span>
                  ) : null}
                </button>
              ))}
            </div>
            <Pagination page={page} pageCount={pageCount} onChange={setPage} total={total} pageSize={12} />
          </>
        )}
      </Card>
      </div>
      )}
    </div>
  );
}
