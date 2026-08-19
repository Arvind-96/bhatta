import { FormEvent, useEffect, useState } from "react";
import { ArrowLeft, Plus } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api";
import { useKilnEvent } from "@/hooks/useKilnEvent";
import { useTranslation } from "@/hooks/useTranslation";
import { LedgerQuickActions } from "@/components/people/LedgerQuickActions";
import { LedgerCategoryHistorySections } from "@/components/people/LedgerCategoryHistorySections";
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
  const [laborerCount, setLaborerCount] = useState("");
  const [laborerCountTouched, setLaborerCountTouched] = useState(false);
  const [perLaborFareAmount, setPerLaborFareAmount] = useState("");
  const [perLaborAdvanceAmount, setPerLaborAdvanceAmount] = useState("");
  // Purely client-side running totals for this page view -- "Add to
  // Remaining Pool" never touches the backend ledger (see addToPool
  // below), so these intentionally do NOT come from `entry` and reset on
  // reload. The admin fills these in and tracks them manually; the only
  // thing that ever posts a real ADVANCE ledger entry (and moves Advance
  // Given / the Advance history below) is the dedicated Advance quick
  // action at the top of the page.
  const [clientTotalFare, setClientTotalFare] = useState(0);
  const [clientTotalAdvance, setClientTotalAdvance] = useState(0);

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
    // Defaults to the gang's current headcount so the admin doesn't have to
    // retype a number already visible in the table below — only until they
    // type their own value for this session (e.g. fewer laborers turned up
    // today than are on file).
    if (!laborerCountTouched) setLaborerCount(gangWorkers.length ? String(gangWorkers.length) : "");
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

  // What THIS submission would post — laborer count × rate. Shown directly
  // as Total Fare/Total Advance (0 until the admin enters something) and
  // used as the ledger entry amount; resets to 0 once actually submitted.
  const pendingFare = (Number(laborerCount) || 0) * (Number(perLaborFareAmount) || 0);
  const pendingAdvance = (Number(laborerCount) || 0) * (Number(perLaborAdvanceAmount) || 0);

  // Purely arithmetic — no ledger entry, no backend call, no refresh.
  // "Add to Remaining Pool" only ever updates the client-side running
  // totals above; it must never post an ADVANCE entry (that's the
  // dedicated Advance quick action's job) or a FARE entry either, so
  // clicking it can never move Advance Given, the Advance history below,
  // or any other backend-derived figure on this page.
  function addToPool(e: FormEvent) {
    e.preventDefault();
    if (!laborerCount || (!perLaborFareAmount && !perLaborAdvanceAmount)) return;
    setClientTotalFare((prev) => prev + pendingFare);
    setClientTotalAdvance((prev) => prev + pendingAdvance);
    setPerLaborFareAmount("");
    setPerLaborAdvanceAmount("");
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

  // Per explicit admin request: Gang Summary's money figures and Deducted
  // stay at 0 -- the admin fills those in manually themselves. Advance
  // Given is real (entry.advanceGivenToContractor), changed only by the
  // dedicated Advance quick action above, never by Add to Remaining Pool.
  // Total Fare/Total Advance are the client-side running totals from
  // addToPool; Remaining Pool applies the formula live on every click:
  // Remaining Pool = (Total Fare + Total Advance) - (Deducted + Advance Given).
  // Bricks Produced/Damaged (production data, not money) are unaffected and
  // still come from `entry` live below.
  const advanceGiven = entry?.advanceGivenToContractor ?? 0;
  const balance = 0;
  const totalDue = 0;
  const totalPaid = 0;
  const advanceDeducted = 0;
  const totalFare = clientTotalFare;
  const totalAdvance = clientTotalAdvance;
  const remainingPool = totalFare + totalAdvance - (advanceDeducted + advanceGiven);

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

        <Card className="lg:col-span-2">
          <h4 className="mb-1 text-xs font-semibold uppercase tracking-wide text-ink-muted">{t("molding.fareAdvanceTitle")}</h4>
          <p className="mb-3 text-sm text-ink-muted">{t("molding.fareAdvanceHint")}</p>

          <label className="mb-3 flex max-w-xs flex-col gap-1">
            <span className="text-sm text-ink-muted">{t("molding.numberOfLaborers")}</span>
            <input
              type="number"
              min={0}
              value={laborerCount}
              onChange={(e) => {
                setLaborerCount(e.target.value);
                setLaborerCountTouched(true);
              }}
              className={inputClass}
            />
          </label>

          <form onSubmit={addToPool}>
            <div className="grid gap-3 md:grid-cols-2">
              <div className="flex flex-col gap-2 rounded-xl border border-border p-3">
                <p className="text-sm font-medium text-ink-primary">{t("molding.laborFareBhada")}</p>
                <input
                  type="number"
                  min={0}
                  placeholder={t("molding.perLaborFareAmount")}
                  value={perLaborFareAmount}
                  onChange={(e) => setPerLaborFareAmount(e.target.value)}
                  className={inputClass}
                />
                <div className="flex items-center justify-between rounded-lg bg-ink-primary/5 px-3 py-2">
                  <span className="text-sm text-ink-muted">{t("molding.thisPaymentAmountLabel")}</span>
                  <span className="text-sm font-semibold tabular-nums text-ink-primary">₹{formatINR(pendingFare)}</span>
                </div>
              </div>

              <div className="flex flex-col gap-2 rounded-xl border border-border p-3">
                <p className="text-sm font-medium text-ink-primary">{t("molding.fixedAdvance")}</p>
                <input
                  type="number"
                  min={0}
                  placeholder={t("molding.perLaborAdvanceAmount")}
                  value={perLaborAdvanceAmount}
                  onChange={(e) => setPerLaborAdvanceAmount(e.target.value)}
                  className={inputClass}
                />
                <div className="flex items-center justify-between rounded-lg bg-ink-primary/5 px-3 py-2">
                  <span className="text-sm text-ink-muted">{t("molding.thisPaymentAmountLabel")}</span>
                  <span className="text-sm font-semibold tabular-nums text-ink-primary">₹{formatINR(pendingAdvance)}</span>
                </div>
              </div>
            </div>

            <Button type="submit" size="sm" className="mt-3 w-full md:w-auto" disabled={!laborerCount || (!perLaborFareAmount && !perLaborAdvanceAmount)}>
              {t("molding.addToRemainingPoolButton")}
            </Button>
          </form>

          <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-5">
            <div className="rounded-xl border border-border bg-ink-primary/5 p-3 text-center">
              <p className="text-lg font-semibold tabular-nums text-ink-primary">₹{formatINR(totalFare)}</p>
              <p className="text-sm text-ink-muted">{t("molding.totalFareLabel")}</p>
            </div>
            <div className="rounded-xl border border-border bg-ink-primary/5 p-3 text-center">
              <p className="text-lg font-semibold tabular-nums text-ink-primary">₹{formatINR(totalAdvance)}</p>
              <p className="text-sm text-ink-muted">{t("molding.totalAdvanceLabel")}</p>
            </div>
            <div className="rounded-xl bg-series-1 p-3 text-center">
              <p className="text-lg font-semibold tabular-nums text-white">₹{formatINR(remainingPool)}</p>
              <p className="text-sm text-white/80">{t("molding.advanceRemainingLabel")}</p>
            </div>
            <div className="rounded-xl border border-border bg-ink-primary/5 p-3 text-center">
              <p className="text-lg font-semibold tabular-nums text-status-warning">₹{formatINR(advanceDeducted)}</p>
              <p className="text-sm text-ink-muted">{t("molding.advanceDeductedLabel")}</p>
            </div>
            <div className="rounded-xl border border-border bg-ink-primary/5 p-3 text-center">
              <p className="text-lg font-semibold tabular-nums text-ink-primary">₹{formatINR(advanceGiven)}</p>
              <p className="text-sm text-ink-muted">{t("molding.advanceGivenLabel")}</p>
            </div>
          </div>
        </Card>

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
