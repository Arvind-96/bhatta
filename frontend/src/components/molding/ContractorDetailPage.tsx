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
import type { LedgerEntry, LedgerPaymentMode, MoldingContractorEntry, Person } from "@/types";
import { formatINR } from "@/lib/utils";
import { isPaymentSplitMismatched, PaymentSplitFields } from "@/components/shared/PaymentSplitFields";

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
  const [fareMode, setFareMode] = useState<LedgerPaymentMode>("CASH");
  const [fareCashAmount, setFareCashAmount] = useState("");
  const [fareOnlineAmount, setFareOnlineAmount] = useState("");
  const [payingFare, setPayingFare] = useState(false);
  const [fareError, setFareError] = useState("");
  const [perLaborAdvanceAmount, setPerLaborAdvanceAmount] = useState("");
  const [advanceMode, setAdvanceMode] = useState<LedgerPaymentMode>("CASH");
  const [advanceCashAmount, setAdvanceCashAmount] = useState("");
  const [advanceOnlineAmount, setAdvanceOnlineAmount] = useState("");
  const [givingAdvance, setGivingAdvance] = useState(false);
  const [advanceError, setAdvanceError] = useState("");

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

  const totalFare = (Number(laborerCount) || 0) * (Number(perLaborFareAmount) || 0);
  const totalAdvance = (Number(laborerCount) || 0) * (Number(perLaborAdvanceAmount) || 0);

  // Bhada (labor fare) — a one-off payment the kiln hands the contractor
  // once per session to cover the gang's travel. Just a plain PAID ledger
  // entry against the contractor; unlike the advance below, nothing draws
  // down against it afterward.
  async function payFare(e: FormEvent) {
    e.preventDefault();
    if (!laborerCount || !perLaborFareAmount) return;
    if (isPaymentSplitMismatched(fareMode, totalFare, fareCashAmount, fareOnlineAmount)) {
      setFareError(t("payment.splitMismatch", { total: totalFare.toLocaleString("en-IN") }));
      return;
    }
    setFareError("");
    setPayingFare(true);
    try {
      await api.people.addLedger(contractorId, {
        direction: "PAID",
        amount: totalFare,
        reason: t("molding.fareReason", { count: laborerCount, rate: perLaborFareAmount }),
        category: "FARE",
        paymentMode: fareMode,
        cashAmount: fareMode === "CASH_AND_ONLINE" ? Number(fareCashAmount) : undefined,
        onlineAmount: fareMode === "CASH_AND_ONLINE" ? Number(fareOnlineAmount) : undefined,
      });
      setPerLaborFareAmount("");
      setFareCashAmount("");
      setFareOnlineAmount("");
      await refresh();
    } finally {
      setPayingFare(false);
    }
  }

  // The fixed advance pool — money handed to the contractor to redistribute
  // to their own gang. Posted as a PAID/ADVANCE entry against the
  // contractor; moldingContractorSummary then continuously nets this
  // against every Kharchi/Advance/Medical/Festival payment the contractor's
  // workers receive, so "remaining pool" always reflects what's actually
  // left without any manual reset between sessions.
  async function giveAdvance(e: FormEvent) {
    e.preventDefault();
    if (!laborerCount || !perLaborAdvanceAmount) return;
    if (isPaymentSplitMismatched(advanceMode, totalAdvance, advanceCashAmount, advanceOnlineAmount)) {
      setAdvanceError(t("payment.splitMismatch", { total: totalAdvance.toLocaleString("en-IN") }));
      return;
    }
    setAdvanceError("");
    setGivingAdvance(true);
    try {
      await api.people.addLedger(contractorId, {
        direction: "PAID",
        amount: totalAdvance,
        reason: t("molding.advanceReason", { count: laborerCount, rate: perLaborAdvanceAmount }),
        category: "ADVANCE",
        paymentMode: advanceMode,
        cashAmount: advanceMode === "CASH_AND_ONLINE" ? Number(advanceCashAmount) : undefined,
        onlineAmount: advanceMode === "CASH_AND_ONLINE" ? Number(advanceOnlineAmount) : undefined,
      });
      setPerLaborAdvanceAmount("");
      setAdvanceCashAmount("");
      setAdvanceOnlineAmount("");
      await refresh();
    } finally {
      setGivingAdvance(false);
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

  const balance = entry?.balance ?? 0;
  // Live preview, not just the posted history: Total Labor Fare is a
  // guaranteed payment ("the client will definitely pay it") so it's added
  // to the pool as soon as it's calculated, before "Pay fare" is even
  // clicked; Total Fixed Advance is provisioned back out the moment it's
  // calculated too, since that money is already earmarked to flow on to
  // the gang. Once either is actually submitted, its calculator field
  // resets to 0 and the posted amount lands in advanceGivenToContractor
  // instead, so the number doesn't jump — it's the same pool, just backed
  // by a real ledger entry instead of a pending calculation.
  const remainingPool = (entry?.advanceGivenToContractor ?? 0) - (entry?.advanceDeductedForWorkers ?? 0) - totalAdvance + totalFare;

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
              <p className="text-xl font-semibold tabular-nums text-ink-primary">₹{formatINR((entry?.totalDue ?? 0))}</p>
              <p className="text-sm text-ink-muted">{t("molding.totalDueLabel")}</p>
            </div>
            <div>
              <p className="text-xl font-semibold tabular-nums text-ink-primary">₹{formatINR((entry?.totalPaid ?? 0))}</p>
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

          <div className="grid gap-3 md:grid-cols-2">
            <form onSubmit={payFare} className="flex flex-col gap-2 rounded-xl border border-border p-3">
              <p className="text-sm font-medium text-ink-primary">{t("molding.laborFareBhada")}</p>
              <input
                type="number"
                min={0}
                placeholder={t("molding.perLaborFareAmount")}
                value={perLaborFareAmount}
                onChange={(e) => setPerLaborFareAmount(e.target.value)}
                className={inputClass}
              />
              <select value={fareMode} onChange={(e) => setFareMode(e.target.value as LedgerPaymentMode)} className={inputClass}>
                <option value="CASH">{t("dispatch.paymentCash")}</option>
                <option value="BANK">{t("dispatch.paymentBankTransfer")}</option>
                <option value="UPI">{t("dispatch.paymentUpi")}</option>
                <option value="CASH_AND_ONLINE">{t("common.paymentModeCashAndOnline")}</option>
              </select>
              {fareMode === "CASH_AND_ONLINE" && (
                <PaymentSplitFields
                  totalAmount={totalFare}
                  cashAmount={fareCashAmount}
                  onlineAmount={fareOnlineAmount}
                  onCashAmountChange={setFareCashAmount}
                  onOnlineAmountChange={setFareOnlineAmount}
                  inputClassName={inputClass}
                />
              )}
              <div className="flex items-center justify-between rounded-lg bg-ink-primary/5 px-3 py-2">
                <span className="text-sm text-ink-muted">{t("molding.totalFareLabel")}</span>
                <span className="text-sm font-semibold tabular-nums text-ink-primary">₹{formatINR(totalFare)}</span>
              </div>
              {fareError && <p className="text-sm text-status-critical">{fareError}</p>}
              <Button type="submit" size="sm" disabled={payingFare || !laborerCount || !perLaborFareAmount}>
                {t("molding.payFareButton")}
              </Button>
            </form>

            <form onSubmit={giveAdvance} className="flex flex-col gap-2 rounded-xl border border-border p-3">
              <p className="text-sm font-medium text-ink-primary">{t("molding.fixedAdvance")}</p>
              <input
                type="number"
                min={0}
                placeholder={t("molding.perLaborAdvanceAmount")}
                value={perLaborAdvanceAmount}
                onChange={(e) => setPerLaborAdvanceAmount(e.target.value)}
                className={inputClass}
              />
              <select value={advanceMode} onChange={(e) => setAdvanceMode(e.target.value as LedgerPaymentMode)} className={inputClass}>
                <option value="CASH">{t("dispatch.paymentCash")}</option>
                <option value="BANK">{t("dispatch.paymentBankTransfer")}</option>
                <option value="UPI">{t("dispatch.paymentUpi")}</option>
                <option value="CASH_AND_ONLINE">{t("common.paymentModeCashAndOnline")}</option>
              </select>
              {advanceMode === "CASH_AND_ONLINE" && (
                <PaymentSplitFields
                  totalAmount={totalAdvance}
                  cashAmount={advanceCashAmount}
                  onlineAmount={advanceOnlineAmount}
                  onCashAmountChange={setAdvanceCashAmount}
                  onOnlineAmountChange={setAdvanceOnlineAmount}
                  inputClassName={inputClass}
                />
              )}
              <div className="flex items-center justify-between rounded-lg bg-ink-primary/5 px-3 py-2">
                <span className="text-sm text-ink-muted">{t("molding.totalAdvanceLabel")}</span>
                <span className="text-sm font-semibold tabular-nums text-ink-primary">₹{formatINR(totalAdvance)}</span>
              </div>
              {advanceError && <p className="text-sm text-status-critical">{advanceError}</p>}
              <Button type="submit" size="sm" disabled={givingAdvance || !laborerCount || !perLaborAdvanceAmount}>
                {t("molding.giveAdvanceButton")}
              </Button>
            </form>
          </div>

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
              <p className="text-lg font-semibold tabular-nums text-status-warning">₹{formatINR(entry?.advanceDeductedForWorkers ?? 0)}</p>
              <p className="text-sm text-ink-muted">{t("molding.advanceDeductedLabel")}</p>
            </div>
            <div className="rounded-xl border border-border bg-ink-primary/5 p-3 text-center">
              <p className="text-lg font-semibold tabular-nums text-ink-primary">₹{formatINR(entry?.advanceGivenToContractor ?? 0)}</p>
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
