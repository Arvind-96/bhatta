import { FormEvent, useEffect, useState } from "react";
import { ArrowLeft, Plus } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { cn, formatINR } from "@/lib/utils";
import { api } from "@/lib/api";
import { useKilnEvent } from "@/hooks/useKilnEvent";
import { LedgerQuickActions } from "@/components/people/LedgerQuickActions";
import { LedgerCategoryHistorySections } from "@/components/people/LedgerCategoryHistorySections";
import { AddPersonModal } from "@/components/people/AddPersonModal";
import { ContractorNetBalanceCard } from "@/components/people/ContractorNetBalanceCard";
import { VehicleNumberInput } from "@/components/shared/VehicleNumberInput";
import { OperatorDetailPage } from "./OperatorDetailPage";
import { EditStackingEntryModal } from "./EditStackingEntryModal";
import { useTranslation } from "@/hooks/useTranslation";
import type {
  LedgerEntry,
  Person,
  StackingContractorEntry,
  StackingEntry,
  StackingStage,
  StackingVehicle,
  StackingVehicleType,
} from "@/types";

const inputClass =
  "h-10 rounded-xl border border-border bg-ink-primary/5 px-3 text-sm text-ink-primary outline-none focus:ring-2 focus:ring-series-1";

function useStageLabels(): Record<StackingStage, string> {
  const { t } = useTranslation();
  return {
    PHAD_TO_STOCK: t("stacking.stage1Label"),
    PHAD_TO_CHAMBER: t("stacking.stage2Label"),
    STOCK_TO_CHAMBER: t("stacking.stage3Label"),
  };
}

interface StackingContractorDetailPageProps {
  contractorId: string;
  onBack: () => void;
}

function Field({ label, value }: { label: string; value?: string | null }) {
  if (!value) return null;
  return (
    <div>
      <p className="text-sm text-ink-muted">{label}</p>
      <p className="text-sm text-ink-primary">{value}</p>
    </div>
  );
}

// The bharai "Thekedar profile" — mirrors molding/ContractorDetailPage.tsx:
// rate setup, combined gang ledger, every laborer mapped under this
// contractor for stacking, their vehicle/driver roster, and daily
// production history, all in one page.
export function StackingContractorDetailPage({ contractorId, onBack }: StackingContractorDetailPageProps) {
  const { t } = useTranslation();
  const stageLabels = useStageLabels();
  const [contractor, setContractor] = useState<Person | null>(null);
  const [entry, setEntry] = useState<StackingContractorEntry | null>(null);
  const [laborers, setLaborers] = useState<Person[]>([]);
  const [vehicles, setVehicles] = useState<StackingVehicle[]>([]);
  const [productionHistory, setProductionHistory] = useState<StackingEntry[]>([]);
  const [salaryInput, setSalaryInput] = useState("");
  const [stageInput, setStageInput] = useState<"" | StackingStage>("");
  const [savingRate, setSavingRate] = useState(false);
  const [ledgerEntries, setLedgerEntries] = useState<LedgerEntry[]>([]);
  const [showAddLabor, setShowAddLabor] = useState(false);
  const [showAddVehicle, setShowAddVehicle] = useState(false);
  const [openOperatorId, setOpenOperatorId] = useState<string | null>(null);
  const [editingEntry, setEditingEntry] = useState<StackingEntry | null>(null);
  const [vehicleForm, setVehicleForm] = useState({
    vehicleType: "TRACTOR" as StackingVehicleType,
    vehicleNumber: "",
    buggiCount: "",
    driverName: "",
  });
  const [savingVehicle, setSavingVehicle] = useState(false);

  async function refresh() {
    const [personDetail, summary, allLaborers, vehicleList, allEntries, ledger] = await Promise.all([
      api.people.get(contractorId),
      api.stacking.contractorSummary(),
      api.people.list("WORKER"),
      api.stackingVehicles.list(contractorId),
      api.stacking.list(),
      api.people.listLedger(contractorId),
    ]);
    setContractor(personDetail.person);
    setSalaryInput(personDetail.person.monthlySalary ? String(personDetail.person.monthlySalary) : "");
    setStageInput(personDetail.person.stackingStage ?? "");
    const found = summary.contractors.find((c) => c.contractor.id === contractorId) ?? null;
    setEntry(found);
    setLaborers(allLaborers.filter((w) => w.bharaiContractorId === contractorId));
    setVehicles(vehicleList);
    const laborerIds = new Set(allLaborers.filter((w) => w.bharaiContractorId === contractorId).map((w) => w._id));
    setProductionHistory(
      allEntries.filter((e) => {
        const gangId = typeof e.gangId === "object" ? e.gangId._id : e.gangId;
        return gangId === contractorId || laborerIds.has(gangId);
      })
    );
    setLedgerEntries(ledger);
  }

  useEffect(() => {
    refresh().catch(console.error);
  }, [contractorId]);

  useKilnEvent("stacking:update", () => refresh());
  useKilnEvent("stackingVehicle:update", () => refresh());
  useKilnEvent("ledger:update", () => refresh());
  useKilnEvent("person:update", () => refresh());

  async function saveRate(e: FormEvent) {
    e.preventDefault();
    setSavingRate(true);
    try {
      await api.people.update(contractorId, {
        monthlySalary: salaryInput ? Number(salaryInput) : undefined,
        stackingStage: stageInput || undefined,
      });
      await refresh();
    } finally {
      setSavingRate(false);
    }
  }

  async function handleAddVehicle(e: FormEvent) {
    e.preventDefault();
    setSavingVehicle(true);
    try {
      await api.stackingVehicles.create({
        contractorId,
        vehicleType: vehicleForm.vehicleType,
        vehicleNumber: vehicleForm.vehicleType === "TRACTOR" ? vehicleForm.vehicleNumber || undefined : undefined,
        buggiCount: vehicleForm.vehicleType === "BUGGI" && vehicleForm.buggiCount ? Number(vehicleForm.buggiCount) : undefined,
        driverName: vehicleForm.driverName || undefined,
      });
      setVehicleForm({ vehicleType: "TRACTOR", vehicleNumber: "", buggiCount: "", driverName: "" });
      setShowAddVehicle(false);
      await refresh();
    } finally {
      setSavingVehicle(false);
    }
  }

  async function toggleVehicleStatus(vehicle: StackingVehicle) {
    await api.stackingVehicles.update(vehicle._id, { status: vehicle.status === "ACTIVE" ? "INACTIVE" : "ACTIVE" });
    await refresh();
  }

  const backButton = (
    <button onClick={onBack} className="mb-3 flex items-center gap-1.5 text-sm text-ink-secondary hover:text-ink-primary">
      <ArrowLeft className="h-4 w-4" /> {t("stacking.backToBharai")}
    </button>
  );

  if (openOperatorId) {
    return <OperatorDetailPage operatorId={openOperatorId} onBack={() => setOpenOperatorId(null)} />;
  }

  if (!contractor) {
    return (
      <div>
        {backButton}
        <Card>
          <p className="py-8 text-center text-sm text-ink-muted">{t("common.loading")}</p>
        </Card>
      </div>
    );
  }

  const balance = entry?.balance ?? 0;

  return (
    <div>
      {backButton}

      <div className="mb-4 flex items-start justify-between">
        <div>
          <h3 className="text-lg font-semibold text-ink-primary">{contractor.name}</h3>
          <p className="text-sm text-ink-muted">
            {t("stacking.bharaiThekedarLabel")}
            {contractor.stackingStage ? ` · ${stageLabels[contractor.stackingStage]}` : ""}
          </p>
          {(entry?.totalDamaged ?? 0) > 0 && (
            <p className="mt-1 text-sm font-medium text-status-critical">
              {entry!.totalDamaged.toLocaleString("en-IN")} {t("stacking.bricksDamagedGangTotalWord")}
            </p>
          )}
        </div>
        <LedgerQuickActions person={contractor} onSaved={refresh} />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-muted">{t("stacking.contractorProfile")}</h4>
          <div className="grid grid-cols-2 gap-3">
            <Field label={t("common.phone")} value={contractor.phone} />
            <Field label={t("stacking.addressField")} value={contractor.address} />
            <Field label={t("stacking.aadharIdField")} value={contractor.idNumber} />
            <Field label={t("common.status")} value={contractor.status} />
          </div>
        </Card>

        <Card>
          <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-muted">{t("stacking.bharaiSalaryStage")}</h4>
          <form onSubmit={saveRate} className="flex flex-col gap-2">
            <div className="flex items-end gap-2">
              <div className="flex-1">
                <label className="mb-1 block text-sm text-ink-muted">{t("stacking.contractorOwnMonthlySalaryLabel")}</label>
                <input
                  type="number"
                  value={salaryInput}
                  onChange={(e) => setSalaryInput(e.target.value)}
                  placeholder={t("stacking.egSalary18000")}
                  className={inputClass}
                />
              </div>
              <Button type="submit" size="sm" disabled={savingRate}>
                {t("common.save")}
              </Button>
            </div>
            <select value={stageInput} onChange={(e) => setStageInput(e.target.value as "" | StackingStage)} className={inputClass}>
              <option value="">{t("stacking.stageNotSet")}</option>
              <option value="PHAD_TO_STOCK">{stageLabels.PHAD_TO_STOCK}</option>
              <option value="PHAD_TO_CHAMBER">{stageLabels.PHAD_TO_CHAMBER}</option>
              <option value="STOCK_TO_CHAMBER">{stageLabels.STOCK_TO_CHAMBER}</option>
            </select>
          </form>
          <p className="mt-2 text-sm text-ink-muted">
            {t("stacking.eachLaborerOwnSalaryHint")}
          </p>
        </Card>

        <Card className="lg:col-span-2">
          <h4 className="mb-3 text-xs font-semibold uppercase tracking-wide text-ink-muted">{t("stacking.gangSummary")}</h4>
          <div className="grid grid-cols-5 gap-2 text-center">
            <div>
              <p className="text-xl font-semibold tabular-nums text-ink-primary">{(entry?.totalBricksStacked ?? 0).toLocaleString("en-IN")}</p>
              <p className="text-sm text-ink-muted">{t("stacking.bricksStackedGangLabel")}</p>
            </div>
            <div>
              <p className={`text-xl font-semibold tabular-nums ${(entry?.totalDamaged ?? 0) > 0 ? "text-status-critical" : "text-ink-primary"}`}>
                {(entry?.totalDamaged ?? 0).toLocaleString("en-IN")}
              </p>
              <p className="text-sm text-ink-muted">{t("stacking.damagedGangLabel")}</p>
            </div>
            <div>
              <p className="text-xl font-semibold tabular-nums text-ink-primary">₹{formatINR((entry?.totalDue ?? 0))}</p>
              <p className="text-sm text-ink-muted">{t("stacking.totalDueLabel")}</p>
            </div>
            <div>
              <p className="text-xl font-semibold tabular-nums text-ink-primary">₹{formatINR((entry?.totalPaid ?? 0))}</p>
              <p className="text-sm text-ink-muted">{t("stacking.totalPaidAdvanceLabel")}</p>
            </div>
            <div>
              <p className={`text-xl font-semibold tabular-nums ${balance > 0 ? "text-status-critical" : balance < 0 ? "text-status-warning" : "text-status-good"}`}>
                ₹{formatINR(Math.abs(balance))}
              </p>
              <p className="text-sm text-ink-muted">{balance >= 0 ? t("stacking.remainingDueLabel") : t("stacking.advanceOutstandingLabel")}</p>
            </div>
          </div>
        </Card>

        <div className="lg:col-span-2">
          <ContractorNetBalanceCard contractorId={contractorId} />
        </div>

        <Card className="lg:col-span-2">
          <div className="mb-3 flex items-center justify-between">
            <h4 className="text-xs font-semibold uppercase tracking-wide text-ink-muted">
              {t("stacking.equipmentDriversDeployed")} ({vehicles.length})
            </h4>
            <Button size="sm" onClick={() => setShowAddVehicle((s) => !s)}>
              <Plus className="h-4 w-4" /> {t("stacking.addVehicle")}
            </Button>
          </div>

          {showAddVehicle && (
            <form onSubmit={handleAddVehicle} className="mb-3 grid grid-cols-2 gap-2 rounded-xl border border-border bg-ink-primary/5 p-3">
              <select
                value={vehicleForm.vehicleType}
                onChange={(e) => setVehicleForm((f) => ({ ...f, vehicleType: e.target.value as StackingVehicleType }))}
                className={inputClass}
              >
                <option value="TRACTOR">{t("stacking.tractorOption")}</option>
                <option value="BUGGI">{t("stacking.buggiOption")}</option>
              </select>
              <input
                placeholder={t("stacking.driverNamePlaceholder")}
                value={vehicleForm.driverName}
                onChange={(e) => setVehicleForm((f) => ({ ...f, driverName: e.target.value }))}
                className={inputClass}
              />
              {vehicleForm.vehicleType === "TRACTOR" ? (
                <VehicleNumberInput
                  placeholder={t("stacking.tractorNumberPlaceholder")}
                  value={vehicleForm.vehicleNumber}
                  onChange={(value) => setVehicleForm((f) => ({ ...f, vehicleNumber: value }))}
                  className={cn(inputClass, "col-span-2")}
                />
              ) : (
                <input
                  type="number"
                  placeholder={t("stacking.numberOfBuggisPlaceholder")}
                  value={vehicleForm.buggiCount}
                  onChange={(e) => setVehicleForm((f) => ({ ...f, buggiCount: e.target.value }))}
                  className={cn(inputClass, "col-span-2")}
                />
              )}
              <Button type="submit" disabled={savingVehicle} className="col-span-2">
                {t("stacking.saveVehicle")}
              </Button>
            </form>
          )}

          {vehicles.length === 0 ? (
            <p className="py-6 text-center text-sm text-ink-muted">{t("stacking.noTractorsBuggisDeployed")}</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px] text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-sm text-ink-muted">
                    <th className="pb-2 font-medium">{t("common.type")}</th>
                    <th className="pb-2 font-medium">{t("stacking.numberCountColumn")}</th>
                    <th className="pb-2 font-medium">{t("common.driver")}</th>
                    <th className="pb-2 font-medium">{t("common.status")}</th>
                    <th className="pb-2 font-medium text-right"></th>
                  </tr>
                </thead>
                <tbody>
                  {vehicles.map((v) => (
                    <tr key={v._id} className="border-b border-border/60 last:border-0">
                      <td className="py-3 text-ink-primary">{v.vehicleType === "TRACTOR" ? `🚜 ${t("stacking.tractorOption")}` : `🛒 ${t("stacking.buggiOption")}`}</td>
                      <td className="py-3 tabular-nums text-ink-secondary">
                        {v.vehicleType === "TRACTOR" ? v.vehicleNumber ?? "—" : `× ${v.buggiCount ?? "—"}`}
                      </td>
                      <td className="py-3 text-ink-secondary">{v.driverName ?? "—"}</td>
                      <td className="py-3 text-ink-secondary">{v.status === "ACTIVE" ? t("common.active") : t("common.inactive")}</td>
                      <td className="py-3 text-right">
                        <button
                          onClick={() => toggleVehicleStatus(v)}
                          className="text-xs font-medium text-series-1 hover:underline"
                        >
                          {v.status === "ACTIVE" ? t("stacking.markInactive") : t("stacking.markActive")}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>

        <Card className="lg:col-span-2">
          <div className="mb-3 flex items-center justify-between">
            <h4 className="text-xs font-semibold uppercase tracking-wide text-ink-muted">
              {t("stacking.laborUnderThekedar")} ({laborers.length})
            </h4>
            <Button size="sm" onClick={() => setShowAddLabor(true)}>
              <Plus className="h-4 w-4" /> {t("stacking.addLabor")}
            </Button>
          </div>
          {laborers.length === 0 ? (
            <p className="py-6 text-center text-sm text-ink-muted">{t("stacking.noLaborersAssignedBharai")}</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px] text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-sm text-ink-muted">
                    <th className="pb-2 font-medium">{t("common.name")}</th>
                    <th className="pb-2 font-medium">{t("common.phone")}</th>
                    <th className="pb-2 font-medium">{t("stacking.monthlySalaryColumn")}</th>
                    <th className="pb-2 font-medium">{t("stacking.bricksStackedLabel")}</th>
                    <th className="pb-2 font-medium">{t("stacking.damagedLabel")}</th>
                  </tr>
                </thead>
                <tbody>
                  {laborers.map((w) => {
                    const gangLaborer = entry?.laborers.find((gw) => gw.id === w._id);
                    return (
                      <tr
                        key={w._id}
                        onClick={() => setOpenOperatorId(w._id)}
                        className="cursor-pointer border-b border-border/60 last:border-0 hover:bg-ink-primary/5"
                      >
                        <td className="py-3 text-ink-primary hover:underline">{w.name}</td>
                        <td className="py-3 text-ink-secondary">{w.phone ?? "—"}</td>
                        <td className="py-3 tabular-nums text-ink-secondary">
                          {w.monthlySalary ? `₹${formatINR(w.monthlySalary)}` : "—"}
                        </td>
                        <td className="py-3 tabular-nums text-ink-secondary">{(gangLaborer?.bricksStacked ?? 0).toLocaleString("en-IN")}</td>
                        <td className="py-3 tabular-nums">
                          {gangLaborer?.damagedCount ? (
                            <span className="text-status-critical">{gangLaborer.damagedCount.toLocaleString("en-IN")}</span>
                          ) : (
                            <span className="text-ink-muted">—</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </Card>

        <Card className="lg:col-span-2">
          <h4 className="mb-3 text-xs font-semibold uppercase tracking-wide text-ink-muted">{t("stacking.dailyProductionHistory")}</h4>
          {productionHistory.length === 0 ? (
            <p className="py-6 text-center text-sm text-ink-muted">{t("stacking.noBharaiEntriesLoggedByGang")}</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px] text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-sm text-ink-muted">
                    <th className="pb-2 font-medium">{t("common.date")}</th>
                    <th className="pb-2 font-medium">{t("stacking.chamberColumn")}</th>
                    <th className="pb-2 font-medium">{t("stacking.loggedByColumn")}</th>
                    <th className="pb-2 font-medium">{t("stacking.stageColumn")}</th>
                    <th className="pb-2 font-medium">{t("stacking.modeColumn")}</th>
                    <th className="pb-2 font-medium">{t("stacking.bricksColumn")}</th>
                    <th className="pb-2 font-medium">{t("stacking.damagedLabel")}</th>
                    <th className="pb-2 font-medium text-right"></th>
                  </tr>
                </thead>
                <tbody>
                  {productionHistory.map((e) => (
                    <tr key={e._id} className="border-b border-border/60 last:border-0">
                      <td className="py-3 text-ink-secondary">{new Date(e.date).toLocaleDateString("en-IN")}</td>
                      <td className="py-3 text-ink-secondary">#{typeof e.gherId === "object" ? e.gherId.number : "—"}</td>
                      <td className="py-3 text-ink-primary">{typeof e.gangId === "object" ? e.gangId.name : "—"}</td>
                      <td className="py-3 text-ink-secondary">{e.stage ? stageLabels[e.stage] : "—"}</td>
                      <td className="py-3 text-ink-secondary">
                        {e.mode === "TRACTOR" ? `🚜 ${e.tractorNumber ?? "—"}` : e.mode === "BUGGI" ? `🛒 × ${e.buggiCount ?? "—"}` : "—"}
                      </td>
                      <td className="py-3 tabular-nums text-ink-secondary">{e.bricksCount.toLocaleString("en-IN")}</td>
                      <td className="py-3 tabular-nums">
                        {e.damageCount > 0 ? (
                          <span className="text-status-critical">{e.damageCount.toLocaleString("en-IN")}</span>
                        ) : (
                          <span className="text-ink-muted">—</span>
                        )}
                      </td>
                      <td className="py-3 text-right">
                        <button onClick={() => setEditingEntry(e)} className="text-xs font-medium text-series-1 hover:underline">
                          {t("common.edit")}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>

        <LedgerCategoryHistorySections entries={ledgerEntries} />
      </div>

      {showAddLabor && (
        <AddPersonModal
          defaultType="WORKER"
          defaultBharaiContractorId={contractorId}
          defaultStackingStage={contractor.stackingStage}
          onClose={() => setShowAddLabor(false)}
          onCreated={refresh}
        />
      )}
      {editingEntry && (
        <EditStackingEntryModal entry={editingEntry} onClose={() => setEditingEntry(null)} onSaved={refresh} />
      )}
    </div>
  );
}
