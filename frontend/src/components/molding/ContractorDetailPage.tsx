import { FormEvent, useEffect, useState } from "react";
import { ArrowLeft, Plus } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api";
import { useKilnEvent } from "@/hooks/useKilnEvent";
import { useTranslation } from "@/hooks/useTranslation";
import { LedgerQuickActions } from "@/components/people/LedgerQuickActions";
import { LedgerCategoryHistorySections } from "@/components/people/LedgerCategoryHistorySections";
import { LabourSessionSection } from "@/components/people/LabourSessionSection";
import { ContractorNetBalanceCard } from "@/components/people/ContractorNetBalanceCard";
import { AddPersonModal } from "@/components/people/AddPersonModal";
import { LaborDetailPage } from "./LaborDetailPage";
import type { LedgerEntry, MoldingContractorEntry, Person } from "@/types";
import { formatINR } from "@/lib/utils";

const inputClass =
  "h-10 rounded-xl border border-border bg-ink-primary/5 px-3 text-sm text-ink-primary outline-none focus:ring-2 focus:ring-series-1";

interface ContractorDetailPageProps {
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

// The "Thekedar profile" — rate/commission setup, the combined gang ledger,
// and every worker under this contractor with their own production and
// ledger, all in one page (reached from the contractor cards in Molding.tsx).
export function ContractorDetailPage({ contractorId, onBack }: ContractorDetailPageProps) {
  const { t } = useTranslation();
  const [contractor, setContractor] = useState<Person | null>(null);
  const [entry, setEntry] = useState<MoldingContractorEntry | null>(null);
  const [workers, setWorkers] = useState<Person[]>([]);
  const [commissionInput, setCommissionInput] = useState("");
  const [savingRate, setSavingRate] = useState(false);
  const [ledgerEntries, setLedgerEntries] = useState<LedgerEntry[]>([]);
  const [showAddLabor, setShowAddLabor] = useState(false);
  const [openWorkerId, setOpenWorkerId] = useState<string | null>(null);

  async function refresh() {
    const [personDetail, summary, allWorkers, ledger] = await Promise.all([
      api.people.get(contractorId),
      api.molding.contractorSummary(),
      api.people.list("WORKER"),
      api.people.listLedger(contractorId),
    ]);
    setContractor(personDetail.person);
    setCommissionInput(personDetail.person.commissionPerThousand ? String(personDetail.person.commissionPerThousand) : "");
    setEntry(summary.contractors.find((c) => c.contractor.id === contractorId) ?? null);
    const gangWorkers = allWorkers.filter((w) => w.contractorId === contractorId);
    setWorkers(gangWorkers);
    setLedgerEntries(ledger);
  }

  useEffect(() => {
    refresh().catch(console.error);
  }, [contractorId]);

  useKilnEvent("molding:update", () => refresh());
  useKilnEvent("ledger:update", () => refresh());
  useKilnEvent("person:update", () => refresh());

  async function saveRate(e: FormEvent) {
    e.preventDefault();
    setSavingRate(true);
    try {
      await api.people.update(contractorId, {
        commissionPerThousand: commissionInput ? Number(commissionInput) : undefined,
      });
      await refresh();
    } finally {
      setSavingRate(false);
    }
  }

  const backButton = (
    <button onClick={onBack} className="mb-3 flex items-center gap-1.5 text-sm text-ink-secondary hover:text-ink-primary">
      <ArrowLeft className="h-4 w-4" /> {t("molding.backToPathai")}
    </button>
  );

  if (openWorkerId) {
    return <LaborDetailPage workerId={openWorkerId} onBack={() => setOpenWorkerId(null)} />;
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

  // Per explicit admin request: Gang Summary's money figures stay at 0 --
  // the admin fills those in manually themselves. Bricks Produced/Damaged
  // (production data, not money) are unaffected and still come from
  // `entry` live below. The Bhada/advance session itself now lives in
  // LabourSessionSection (People page = editable, here = read-only).
  const balance = 0;
  const totalDue = 0;
  const totalPaid = 0;

  return (
    <div>
      {backButton}

      <div className="mb-4 flex items-start justify-between">
        <div>
          <h3 className="text-lg font-semibold text-ink-primary">{contractor.name}</h3>
          <p className="text-sm text-ink-muted">{t("molding.thekedarRoleLabel")}</p>
          {(entry?.totalDamaged ?? 0) > 0 && (
            <p className="mt-1 text-sm font-medium text-status-critical">
              {entry!.totalDamaged.toLocaleString("en-IN")} {t("molding.bricksDamagedGangTotalWord")}
            </p>
          )}
        </div>
        <LedgerQuickActions person={contractor} onSaved={refresh} />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-muted">{t("molding.contractorProfile")}</h4>
          <div className="grid grid-cols-2 gap-3">
            <Field label={t("common.phone")} value={contractor.phone} />
            <Field label={t("molding.addressField")} value={contractor.address} />
            <Field label={t("molding.aadharIdField")} value={contractor.idNumber} />
            <Field label={t("common.status")} value={contractor.status} />
          </div>
        </Card>

        <Card>
          <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-muted">{t("molding.rateCommissionSetup")}</h4>
          <form onSubmit={saveRate} className="flex items-end gap-2">
            <div className="flex-1">
              <label className="mb-1 block text-sm text-ink-muted">{t("molding.commissionPer1000Label")}</label>
              <input
                type="number"
                value={commissionInput}
                onChange={(e) => setCommissionInput(e.target.value)}
                placeholder={t("molding.egCommission25")}
                className={inputClass}
              />
            </div>
            <Button type="submit" size="sm" disabled={savingRate}>
              {t("common.save")}
            </Button>
          </form>
          <p className="mt-2 text-sm text-ink-muted">
            {t("molding.autoPostedLedgerHint")}
          </p>
        </Card>

        <Card className="lg:col-span-2">
          <h4 className="mb-3 text-xs font-semibold uppercase tracking-wide text-ink-muted">{t("molding.gangSummary")}</h4>
          <div className="grid grid-cols-5 gap-2 text-center">
            <div>
              <p className="text-xl font-semibold tabular-nums text-ink-primary">{(entry?.totalBricksProduced ?? 0).toLocaleString("en-IN")}</p>
              <p className="text-sm text-ink-muted">{t("molding.bricksProducedLabel")}</p>
            </div>
            <div>
              <p className={`text-xl font-semibold tabular-nums ${(entry?.totalDamaged ?? 0) > 0 ? "text-status-critical" : "text-ink-primary"}`}>
                {(entry?.totalDamaged ?? 0).toLocaleString("en-IN")}
              </p>
              <p className="text-sm text-ink-muted">{t("molding.damagedLabel")}</p>
            </div>
            <div>
              <p className="text-xl font-semibold tabular-nums text-ink-primary">₹{formatINR(totalDue)}</p>
              <p className="text-sm text-ink-muted">{t("molding.totalDueLabel")}</p>
            </div>
            <div>
              <p className="text-xl font-semibold tabular-nums text-ink-primary">₹{formatINR(totalPaid)}</p>
              <p className="text-sm text-ink-muted">{t("molding.totalPaidLabel")}</p>
            </div>
            <div>
              <p className={`text-xl font-semibold tabular-nums ${balance > 0 ? "text-status-critical" : balance < 0 ? "text-status-warning" : "text-status-good"}`}>
                ₹{formatINR(Math.abs(balance))}
              </p>
              <p className="text-sm text-ink-muted">{balance >= 0 ? t("molding.remainingDueLabel") : t("molding.advanceOutstandingLabel")}</p>
            </div>
          </div>
        </Card>

        <div className="lg:col-span-2">
          <ContractorNetBalanceCard contractorId={contractorId} />
        </div>

        <LabourSessionSection contractorId={contractorId} editable={false} />

        <Card className="lg:col-span-2">
          <div className="mb-3 flex items-center justify-between">
            <h4 className="text-xs font-semibold uppercase tracking-wide text-ink-muted">
              {t("molding.laborUnderThekedarCount", { count: workers.length })}
            </h4>
            <Button size="sm" onClick={() => setShowAddLabor(true)}>
              <Plus className="h-4 w-4" /> {t("molding.addLabor")}
            </Button>
          </div>
          {workers.length === 0 ? (
            <p className="py-6 text-center text-sm text-ink-muted">{t("molding.noLaborAssigned")}</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px] text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-sm text-ink-muted">
                    <th className="pb-2 font-medium">{t("common.name")}</th>
                    <th className="pb-2 font-medium">{t("common.phone")}</th>
                    <th className="pb-2 font-medium">{t("molding.rateColumn")}</th>
                    <th className="pb-2 font-medium">{t("molding.bricksProducedLabel")}</th>
                    <th className="pb-2 font-medium">{t("molding.damagedLabel")}</th>
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
                        <td className="py-3 tabular-nums text-ink-secondary">{w.ratePerThousand ? `₹${w.ratePerThousand}` : "—"}</td>
                        <td className="py-3 tabular-nums text-ink-secondary">{(gangWorker?.bricksProduced ?? 0).toLocaleString("en-IN")}</td>
                        <td className="py-3 tabular-nums">
                          {gangWorker?.damagedCount ? (
                            <span className="text-status-critical">{gangWorker.damagedCount.toLocaleString("en-IN")}</span>
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

        <LedgerCategoryHistorySections entries={ledgerEntries} />
      </div>

      {showAddLabor && (
        <AddPersonModal
          defaultType="WORKER"
          defaultContractorId={contractorId}
          onClose={() => setShowAddLabor(false)}
          onCreated={refresh}
        />
      )}
    </div>
  );
}
