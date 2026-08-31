import { FormEvent, useEffect, useState } from "react";
import { ArrowLeft, Plus } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api";
import { useTranslation } from "@/hooks/useTranslation";
import { useKilnEvent } from "@/hooks/useKilnEvent";
import { LedgerQuickActions } from "@/components/people/LedgerQuickActions";
import { LedgerCategoryHistorySections } from "@/components/people/LedgerCategoryHistorySections";
import { AddPersonModal } from "@/components/people/AddPersonModal";
import { ContractorNetBalanceCard } from "@/components/people/ContractorNetBalanceCard";
import { NikasiOperatorDetailPage } from "./NikasiOperatorDetailPage";
import { EditNikasiEntryModal } from "./EditNikasiEntryModal";
import type { LedgerEntry, NikasiContractorEntry, NikasiEntry, Person } from "@/types";
import { formatINR } from "@/lib/utils";

const inputClass =
  "h-10 rounded-xl border border-border bg-ink-primary/5 px-3 text-sm text-ink-primary outline-none focus:ring-2 focus:ring-series-1";

interface NikasiContractorDetailPageProps {
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

// The nikasi "Thekedar profile" — mirrors stacking/StackingContractorDetailPage.tsx
// minus the vehicle roster (nikasi has no equipment-tracking requirement):
// monthly salary, combined gang ledger, every laborer mapped under this
// contractor for unloading, and full output/production history.
export function NikasiContractorDetailPage({ contractorId, onBack }: NikasiContractorDetailPageProps) {
  const { t } = useTranslation();
  const [contractor, setContractor] = useState<Person | null>(null);
  const [entry, setEntry] = useState<NikasiContractorEntry | null>(null);
  const [laborers, setLaborers] = useState<Person[]>([]);
  const [productionHistory, setProductionHistory] = useState<NikasiEntry[]>([]);
  const [salaryInput, setSalaryInput] = useState("");
  const [savingSalary, setSavingSalary] = useState(false);
  const [ledgerEntries, setLedgerEntries] = useState<LedgerEntry[]>([]);
  const [showAddLabor, setShowAddLabor] = useState(false);
  const [openOperatorId, setOpenOperatorId] = useState<string | null>(null);
  const [editingEntry, setEditingEntry] = useState<NikasiEntry | null>(null);

  async function refresh() {
    const [personDetail, summary, allLaborers, allEntries, ledger] = await Promise.all([
      api.people.get(contractorId),
      api.nikasi.contractorSummary(),
      api.people.list("WORKER"),
      api.nikasi.list(),
      api.people.listLedger(contractorId),
    ]);
    setContractor(personDetail.person);
    setSalaryInput(personDetail.person.monthlySalary ? String(personDetail.person.monthlySalary) : "");
    const found = summary.contractors.find((c) => c.contractor.id === contractorId) ?? null;
    setEntry(found);
    setLaborers(allLaborers.filter((w) => w.nikasiContractorId === contractorId));
    const laborerIds = new Set(allLaborers.filter((w) => w.nikasiContractorId === contractorId).map((w) => w._id));
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

  useKilnEvent("nikasi:update", () => refresh());
  useKilnEvent("ledger:update", () => refresh());
  useKilnEvent("person:update", () => refresh());

  async function saveSalary(e: FormEvent) {
    e.preventDefault();
    setSavingSalary(true);
    try {
      await api.people.update(contractorId, { monthlySalary: salaryInput ? Number(salaryInput) : undefined });
      await refresh();
    } finally {
      setSavingSalary(false);
    }
  }

  const backButton = (
    <button onClick={onBack} className="mb-3 flex items-center gap-1.5 text-sm text-ink-secondary hover:text-ink-primary">
      <ArrowLeft className="h-4 w-4" /> {t("nikasi.backToNikasi")}
    </button>
  );

  if (openOperatorId) {
    return <NikasiOperatorDetailPage operatorId={openOperatorId} onBack={() => setOpenOperatorId(null)} />;
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
          <p className="text-sm text-ink-muted">{t("nikasi.thekedarRoleLabel")}</p>
          {(entry?.totalDamaged ?? 0) > 0 && (
            <p className="mt-1 text-sm font-medium text-status-critical">
              {t("nikasi.bricksDamagedGangTotal", { count: entry!.totalDamaged.toLocaleString("en-IN") })}
            </p>
          )}
        </div>
        <LedgerQuickActions person={contractor} onSaved={refresh} />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-muted">{t("nikasi.contractorProfile")}</h4>
          <div className="grid grid-cols-2 gap-3">
            <Field label={t("common.phone")} value={contractor.phone} />
            <Field label={t("nikasi.address")} value={contractor.address} />
            <Field label={t("nikasi.aadharId")} value={contractor.idNumber} />
            <Field label={t("common.status")} value={contractor.status} />
          </div>
        </Card>

        <Card>
          <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-muted">{t("nikasi.monthlySalary")}</h4>
          <form onSubmit={saveSalary} className="flex items-end gap-2">
            <div className="flex-1">
              <label className="mb-1 block text-sm text-ink-muted">{t("nikasi.contractorOwnSalaryLabel")}</label>
              <input
                type="number"
                value={salaryInput}
                onChange={(e) => setSalaryInput(e.target.value)}
                placeholder={t("nikasi.eg17000")}
                className={inputClass}
              />
            </div>
            <Button type="submit" size="sm" disabled={savingSalary}>
              {t("common.save")}
            </Button>
          </form>
          <p className="mt-2 text-sm text-ink-muted">
            {t("nikasi.laborerSalaryNote")}
          </p>
        </Card>

        <Card className="lg:col-span-2">
          <h4 className="mb-3 text-xs font-semibold uppercase tracking-wide text-ink-muted">{t("nikasi.gangSummary")}</h4>
          <div className="grid grid-cols-5 gap-2 text-center">
            <div>
              <p className="text-xl font-semibold tabular-nums text-ink-primary">{(entry?.totalBricksUnloaded ?? 0).toLocaleString("en-IN")}</p>
              <p className="text-sm text-ink-muted">{t("nikasi.bricksUnloadedLabel")}</p>
            </div>
            <div>
              <p className={`text-xl font-semibold tabular-nums ${(entry?.totalDamaged ?? 0) > 0 ? "text-status-critical" : "text-ink-primary"}`}>
                {(entry?.totalDamaged ?? 0).toLocaleString("en-IN")}
              </p>
              <p className="text-sm text-ink-muted">{t("nikasi.damagedLabel")}</p>
            </div>
            <div>
              <p className="text-xl font-semibold tabular-nums text-ink-primary">₹{formatINR((entry?.totalDue ?? 0))}</p>
              <p className="text-sm text-ink-muted">{t("nikasi.totalDueLabel")}</p>
            </div>
            <div>
              <p className="text-xl font-semibold tabular-nums text-ink-primary">₹{formatINR((entry?.totalPaid ?? 0))}</p>
              <p className="text-sm text-ink-muted">{t("nikasi.totalPaidAdvance")}</p>
            </div>
            <div>
              <p className={`text-xl font-semibold tabular-nums ${balance > 0 ? "text-status-critical" : balance < 0 ? "text-status-warning" : "text-status-good"}`}>
                ₹{formatINR(Math.abs(balance))}
              </p>
              <p className="text-sm text-ink-muted">{balance >= 0 ? t("nikasi.remainingDue") : t("nikasi.advanceOutstanding")}</p>
            </div>
          </div>
        </Card>

        <div className="lg:col-span-2">
          <ContractorNetBalanceCard contractorId={contractorId} />
        </div>

        <Card className="lg:col-span-2">
          <div className="mb-3 flex items-center justify-between">
            <h4 className="text-xs font-semibold uppercase tracking-wide text-ink-muted">
              {t("nikasi.laborUnderThekedar", { count: laborers.length })}
            </h4>
            <Button size="sm" onClick={() => setShowAddLabor(true)}>
              <Plus className="h-4 w-4" /> {t("nikasi.addLabor")}
            </Button>
          </div>
          {laborers.length === 0 ? (
            <p className="py-6 text-center text-sm text-ink-muted">{t("nikasi.noLaborersAssignedYet")}</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px] text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-sm text-ink-muted">
                    <th className="pb-2 font-medium">{t("common.name")}</th>
                    <th className="pb-2 font-medium">{t("common.phone")}</th>
                    <th className="pb-2 font-medium">{t("nikasi.monthlySalary")}</th>
                    <th className="pb-2 font-medium">{t("nikasi.bricksUnloaded")}</th>
                    <th className="pb-2 font-medium">{t("nikasi.damagedHeader")}</th>
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
                        <td className="py-3 tabular-nums text-ink-secondary">{(gangLaborer?.bricksUnloaded ?? 0).toLocaleString("en-IN")}</td>
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
          <h4 className="mb-3 text-xs font-semibold uppercase tracking-wide text-ink-muted">{t("nikasi.unloadingOutputHistory")}</h4>
          {productionHistory.length === 0 ? (
            <p className="py-6 text-center text-sm text-ink-muted">{t("nikasi.noEntriesLoggedByGangYet")}</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px] text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-sm text-ink-muted">
                    <th className="pb-2 font-medium">{t("common.date")}</th>
                    <th className="pb-2 font-medium">{t("nikasi.chamberHeader")}</th>
                    <th className="pb-2 font-medium">{t("nikasi.loggedByHeader")}</th>
                    <th className="pb-2 font-medium">{t("nikasi.bricksHeader")}</th>
                    <th className="pb-2 font-medium">{t("nikasi.damagedHeader")}</th>
                    <th className="pb-2 font-medium text-right"></th>
                  </tr>
                </thead>
                <tbody>
                  {productionHistory.map((e) => (
                    <tr key={e._id} className="border-b border-border/60 last:border-0">
                      <td className="py-3 text-ink-secondary">{new Date(e.date).toLocaleDateString("en-IN")}</td>
                      <td className="py-3 text-ink-secondary">#{typeof e.gherId === "object" ? e.gherId.number : "—"}</td>
                      <td className="py-3 text-ink-primary">{typeof e.gangId === "object" ? e.gangId.name : "—"}</td>
                      <td className="py-3 tabular-nums text-ink-secondary">{e.bricksCount.toLocaleString("en-IN")}</td>
                      <td className="py-3 tabular-nums">
                        {e.damagedCount ? (
                          <span className="text-status-critical">{e.damagedCount.toLocaleString("en-IN")}</span>
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
          defaultNikasiContractorId={contractorId}
          onClose={() => setShowAddLabor(false)}
          onCreated={refresh}
        />
      )}
      {editingEntry && (
        <EditNikasiEntryModal entry={editingEntry} onClose={() => setEditingEntry(null)} onSaved={refresh} />
      )}
    </div>
  );
}
