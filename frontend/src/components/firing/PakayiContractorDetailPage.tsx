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
import { AddWorkEntryModal } from "@/components/people/AddWorkEntryModal";
import { EditWorkEntryModal } from "@/components/people/EditWorkEntryModal";
import { PakayiOperatorDetailPage } from "./PakayiOperatorDetailPage";
import type { LedgerEntry, PakayiContractorEntry, Person, WorkEntry } from "@/types";
import { formatINR } from "@/lib/utils";

const inputClass =
  "h-10 rounded-xl border border-border bg-ink-primary/5 px-3 text-sm text-ink-primary outline-none focus:ring-2 focus:ring-series-1";

interface PakayiContractorDetailPageProps {
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

// The Pakayi "Thekedar profile" — mirrors nikasi/NikasiContractorDetailPage.tsx
// exactly, but built on the shared work_entries table (filtered to
// workType PAKAYI) instead of a dedicated entries table, since Pakayi never
// got one of its own: monthly salary, combined gang ledger, every worker
// mapped under this contractor via pakayiContractorId, and full production
// history.
export function PakayiContractorDetailPage({ contractorId, onBack }: PakayiContractorDetailPageProps) {
  const { t } = useTranslation();
  const [contractor, setContractor] = useState<Person | null>(null);
  const [entry, setEntry] = useState<PakayiContractorEntry | null>(null);
  const [workers, setWorkers] = useState<Person[]>([]);
  const [productionHistory, setProductionHistory] = useState<WorkEntry[]>([]);
  const [salaryInput, setSalaryInput] = useState("");
  const [savingSalary, setSavingSalary] = useState(false);
  const [ledgerEntries, setLedgerEntries] = useState<LedgerEntry[]>([]);
  const [showAddLabor, setShowAddLabor] = useState(false);
  const [showAddEntry, setShowAddEntry] = useState(false);
  const [openWorkerId, setOpenWorkerId] = useState<string | null>(null);
  const [editingEntry, setEditingEntry] = useState<WorkEntry | null>(null);

  async function refresh() {
    const [personDetail, summary, allWorkers, allEntries, ledger] = await Promise.all([
      api.people.get(contractorId),
      api.workEntries.pakayiContractorSummary(),
      api.people.list("WORKER"),
      api.workEntries.list({ workType: "PAKAYI" }),
      api.people.listLedger(contractorId),
    ]);
    setContractor(personDetail.person);
    setSalaryInput(personDetail.person.monthlySalary ? String(personDetail.person.monthlySalary) : "");
    setEntry(summary.contractors.find((c) => c.contractor.id === contractorId) ?? null);
    const gangWorkers = allWorkers.filter((w) => w.pakayiContractorId === contractorId);
    setWorkers(gangWorkers);
    const workerIds = new Set(gangWorkers.map((w) => w._id));
    setProductionHistory(
      allEntries.filter((e) => {
        const personId = typeof e.personId === "object" ? e.personId._id : e.personId;
        return personId === contractorId || workerIds.has(personId);
      })
    );
    setLedgerEntries(ledger);
  }

  useEffect(() => {
    refresh().catch(console.error);
  }, [contractorId]);

  useKilnEvent("workEntry:update", () => refresh());
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
      <ArrowLeft className="h-4 w-4" /> {t("firing.backToFiring")}
    </button>
  );

  if (openWorkerId) {
    return <PakayiOperatorDetailPage operatorId={openWorkerId} onBack={() => setOpenWorkerId(null)} />;
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
          <p className="text-sm text-ink-muted">{t("firing.pakayiThekedarRoleLabel")}</p>
        </div>
        <LedgerQuickActions person={contractor} onSaved={refresh} />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-muted">{t("firing.contractorProfile")}</h4>
          <div className="grid grid-cols-2 gap-3">
            <Field label={t("common.phone")} value={contractor.phone} />
            <Field label={t("firing.address")} value={contractor.address} />
            <Field label={t("firing.aadharId")} value={contractor.idNumber} />
            <Field label={t("common.status")} value={contractor.status} />
          </div>
        </Card>

        <Card>
          <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-muted">{t("firing.monthlySalary")}</h4>
          <form onSubmit={saveSalary} className="flex items-end gap-2">
            <div className="flex-1">
              <label className="mb-1 block text-sm text-ink-muted">{t("firing.contractorOwnSalaryLabel")}</label>
              <input
                type="number"
                value={salaryInput}
                onChange={(e) => setSalaryInput(e.target.value)}
                placeholder={t("firing.eg17000")}
                className={inputClass}
              />
            </div>
            <Button type="submit" size="sm" disabled={savingSalary}>
              {t("common.save")}
            </Button>
          </form>
        </Card>

        <Card className="lg:col-span-2">
          <h4 className="mb-3 text-xs font-semibold uppercase tracking-wide text-ink-muted">{t("firing.gangSummary")}</h4>
          <div className="grid grid-cols-4 gap-2 text-center">
            <div>
              <p className="text-xl font-semibold tabular-nums text-ink-primary">{(entry?.totalQuantity ?? 0).toLocaleString("en-IN")}</p>
              <p className="text-sm text-ink-muted">{t("firing.quantityLabel")}</p>
            </div>
            <div>
              <p className="text-xl font-semibold tabular-nums text-ink-primary">₹{formatINR(entry?.totalDue ?? 0)}</p>
              <p className="text-sm text-ink-muted">{t("firing.totalDueLabel")}</p>
            </div>
            <div>
              <p className="text-xl font-semibold tabular-nums text-ink-primary">₹{formatINR(entry?.totalPaid ?? 0)}</p>
              <p className="text-sm text-ink-muted">{t("firing.totalPaidLabel")}</p>
            </div>
            <div>
              <p className={`text-xl font-semibold tabular-nums ${balance > 0 ? "text-status-critical" : balance < 0 ? "text-status-warning" : "text-status-good"}`}>
                ₹{formatINR(Math.abs(balance))}
              </p>
              <p className="text-sm text-ink-muted">{balance >= 0 ? t("firing.remainingDueLabel") : t("firing.advanceOutstandingLabel")}</p>
            </div>
          </div>
        </Card>

        <Card className="lg:col-span-2">
          <div className="mb-3 flex items-center justify-between">
            <h4 className="text-xs font-semibold uppercase tracking-wide text-ink-muted">
              {t("firing.laborUnderThekedar", { count: workers.length })}
            </h4>
            <Button size="sm" onClick={() => setShowAddLabor(true)}>
              <Plus className="h-4 w-4" /> {t("firing.addLabor")}
            </Button>
          </div>
          {workers.length === 0 ? (
            <p className="py-6 text-center text-sm text-ink-muted">{t("firing.noLaborAssignedYet")}</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px] text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-sm text-ink-muted">
                    <th className="pb-2 font-medium">{t("common.name")}</th>
                    <th className="pb-2 font-medium">{t("common.phone")}</th>
                    <th className="pb-2 font-medium">{t("firing.monthlySalary")}</th>
                    <th className="pb-2 font-medium">{t("firing.quantityLabel")}</th>
                  </tr>
                </thead>
                <tbody>
                  {workers.map((w) => {
                    const gangWorker = entry?.workers.find((gw) => gw.id === w._id);
                    return (
                      <tr
                        key={w._id}
                        onClick={() => setOpenWorkerId(w._id)}
                        className="cursor-pointer border-b border-border/60 last:border-0 hover:bg-ink-primary/5"
                      >
                        <td className="py-3 text-ink-primary hover:underline">{w.name}</td>
                        <td className="py-3 text-ink-secondary">{w.phone ?? "—"}</td>
                        <td className="py-3 tabular-nums text-ink-secondary">{w.monthlySalary ? `₹${formatINR(w.monthlySalary)}` : "—"}</td>
                        <td className="py-3 tabular-nums text-ink-secondary">{(gangWorker?.quantity ?? 0).toLocaleString("en-IN")}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </Card>

        <Card className="lg:col-span-2">
          <div className="mb-3 flex items-center justify-between">
            <h4 className="text-xs font-semibold uppercase tracking-wide text-ink-muted">{t("firing.productionHistory")}</h4>
            <Button size="sm" onClick={() => setShowAddEntry(true)}>
              <Plus className="h-4 w-4" /> {t("firing.logEntry")}
            </Button>
          </div>
          {productionHistory.length === 0 ? (
            <p className="py-6 text-center text-sm text-ink-muted">{t("firing.noEntriesLoggedByGangYet")}</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px] text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-sm text-ink-muted">
                    <th className="pb-2 font-medium">{t("common.date")}</th>
                    <th className="pb-2 font-medium">{t("firing.loggedByHeader")}</th>
                    <th className="pb-2 font-medium">{t("firing.quantityLabel")}</th>
                    <th className="pb-2 font-medium text-right"></th>
                  </tr>
                </thead>
                <tbody>
                  {productionHistory.map((e) => (
                    <tr key={e._id} className="border-b border-border/60 last:border-0">
                      <td className="py-3 text-ink-secondary">{new Date(e.date).toLocaleDateString("en-IN")}</td>
                      <td className="py-3 text-ink-primary">{typeof e.personId === "object" ? e.personId.name : "—"}</td>
                      <td className="py-3 tabular-nums text-ink-secondary">{e.quantity.toLocaleString("en-IN")}</td>
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
          defaultPakayiContractorId={contractorId}
          defaultWorkType="PAKAYI"
          onClose={() => setShowAddLabor(false)}
          onCreated={refresh}
        />
      )}
      {showAddEntry && (
        <AddWorkEntryModal
          labourers={[contractor, ...workers]}
          defaultWorkType="PAKAYI"
          onClose={() => setShowAddEntry(false)}
          onCreated={refresh}
        />
      )}
      {editingEntry && <EditWorkEntryModal entry={editingEntry} onClose={() => setEditingEntry(null)} onSaved={refresh} />}
    </div>
  );
}
