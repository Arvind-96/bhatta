import { FormEvent, useEffect, useState } from "react";
import { ArrowLeft, Plus } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { api } from "@/lib/api";
import { cn, formatINR } from "@/lib/utils";
import { useKilnEvent } from "@/hooks/useKilnEvent";
import { LedgerQuickActions } from "@/components/people/LedgerQuickActions";
import { LedgerCategoryHistorySections } from "@/components/people/LedgerCategoryHistorySections";
import type { LedgerEntry, MoldingEntry, Person } from "@/types";
import { useTranslation } from "@/hooks/useTranslation";

const inputClass =
  "h-10 rounded-xl border border-border bg-ink-primary/5 px-3 text-sm text-ink-primary outline-none focus:ring-2 focus:ring-series-1";

interface LaborDetailPageProps {
  workerId: string;
  onBack: () => void;
}

function Field({ label, value }: { label: string; value?: string | number | null }) {
  if (value === undefined || value === null || value === "") return null;
  return (
    <div>
      <p className="text-sm text-ink-muted">{label}</p>
      <p className="text-sm text-ink-primary">{value}</p>
    </div>
  );
}

// The individual laborer's profile — reached by clicking any pathaiwal
// under a contractor (or from the top-level Pathai contractor summary).
// Shows their details, active status, editable rate, a daily-production
// entry form scoped to them, their full work history, and an earnings vs.
// advances breakdown computed from the same ledger entries LedgerModal
// already writes (categorized since the last update, so this doesn't need
// its own separate tracking).
export function LaborDetailPage({ workerId, onBack }: LaborDetailPageProps) {
  const { t } = useTranslation();
  const [worker, setWorker] = useState<Person | null>(null);
  const [balance, setBalance] = useState(0);
  const [ledgerEntries, setLedgerEntries] = useState<LedgerEntry[]>([]);
  const [workHistory, setWorkHistory] = useState<MoldingEntry[]>([]);
  const [contractor, setContractor] = useState<Person | null>(null);
  const [rateInput, setRateInput] = useState("");
  const [savingRate, setSavingRate] = useState(false);
  const [showLogForm, setShowLogForm] = useState(false);
  const [logForm, setLogForm] = useState({ bricksCount: "", ratePerThousand: "", damagedCount: "", washedOut: false });
  const [loggingProduction, setLoggingProduction] = useState(false);

  async function refresh() {
    const [detail, ledger, history] = await Promise.all([
      api.people.get(workerId),
      api.people.listLedger(workerId),
      api.molding.list({ workerId }),
    ]);
    setWorker(detail.person);
    setBalance(detail.balance);
    setLedgerEntries(ledger);
    setWorkHistory(history);
    setRateInput(detail.person.ratePerThousand ? String(detail.person.ratePerThousand) : "");

    if (detail.person.contractorId) {
      const contractors = await api.people.list("LABOUR_CONTRACTOR");
      setContractor(contractors.find((c) => c._id === detail.person.contractorId) ?? null);
    } else {
      setContractor(null);
    }
  }

  useEffect(() => {
    refresh().catch(console.error);
  }, [workerId]);

  useKilnEvent("molding:update", () => refresh());
  useKilnEvent("ledger:update", () => refresh());
  useKilnEvent("person:update", () => refresh());

  useEffect(() => {
    const effectiveRate = worker?.ratePerThousand ?? contractor?.defaultRatePerThousand;
    setLogForm((f) => ({ ...f, ratePerThousand: effectiveRate ? String(effectiveRate) : f.ratePerThousand }));
  }, [worker, contractor]);

  async function saveRate(e: FormEvent) {
    e.preventDefault();
    setSavingRate(true);
    try {
      await api.people.update(workerId, { ratePerThousand: rateInput ? Number(rateInput) : undefined });
      await refresh();
    } finally {
      setSavingRate(false);
    }
  }

  async function toggleAbsconded() {
    if (!worker) return;
    await api.people.update(workerId, { status: worker.status === "ABSCONDED" ? "ACTIVE" : "ABSCONDED" });
    await refresh();
  }

  async function handleLogProduction(e: FormEvent) {
    e.preventDefault();
    if (!logForm.bricksCount || !logForm.ratePerThousand) return;
    setLoggingProduction(true);
    try {
      await api.molding.create({
        workerId,
        bricksCount: Number(logForm.bricksCount),
        ratePerThousand: Number(logForm.ratePerThousand),
        damagedCount: logForm.damagedCount ? Number(logForm.damagedCount) : undefined,
        washedOut: logForm.washedOut,
      });
      setLogForm((f) => ({ ...f, bricksCount: "", damagedCount: "", washedOut: false }));
      setShowLogForm(false);
      await refresh();
    } finally {
      setLoggingProduction(false);
    }
  }

  const backButton = (
    <button onClick={onBack} className="mb-3 flex items-center gap-1.5 text-sm text-ink-secondary hover:text-ink-primary">
      <ArrowLeft className="h-4 w-4" /> {t("common.back")}
    </button>
  );

  if (!worker) {
    return (
      <div>
        {backButton}
        <Card>
          <p className="py-8 text-center text-sm text-ink-muted">{t("common.loading")}</p>
        </Card>
      </div>
    );
  }

  const totalEarnings = ledgerEntries
    .filter((e) => e.direction === "DUE" && (e.category === "WAGE" || !e.category))
    .reduce((sum, e) => sum + e.amount, 0);

  const totalMade = workHistory.filter((e) => !e.washedOut).reduce((sum, e) => sum + e.bricksCount, 0);
  const totalDamaged = workHistory.reduce((sum, e) => sum + (e.damagedCount ?? 0), 0);

  const advancesByCategory = new Map<string, number>();
  for (const e of ledgerEntries) {
    if (e.direction !== "PAID") continue;
    const key = e.category ?? "OTHER";
    advancesByCategory.set(key, (advancesByCategory.get(key) ?? 0) + e.amount);
  }
  const totalAdvancesGiven = Array.from(advancesByCategory.values()).reduce((sum, v) => sum + v, 0);

  return (
    <div>
      {backButton}

      <div className="mb-4 flex items-start justify-between">
        <div>
          <h3 className="text-lg font-semibold text-ink-primary">{worker.name}</h3>
          <p className="text-sm text-ink-muted">
            {t("molding.pathaiwalLabel")}{" "}
            {contractor ? t("molding.underContractorName", { name: contractor.name }) : t("molding.noThekedarAssigned")}
          </p>
          {totalDamaged > 0 && (
            <p className="mt-1 text-sm font-medium text-status-critical">
              {totalDamaged.toLocaleString("en-IN")} {t("molding.bricksDamagedWord")}
            </p>
          )}
        </div>
        <div className="flex flex-col items-end gap-2">
          <button onClick={toggleAbsconded}>
            <Badge variant={worker.status === "ABSCONDED" ? "critical" : "good"}>
              {worker.status === "ABSCONDED" ? t("molding.abscondedBadge") : t("common.active")}
            </Badge>
          </button>
          <LedgerQuickActions person={worker} onSaved={refresh} />
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-muted">{t("molding.laborProfile")}</h4>
          <div className="grid grid-cols-2 gap-3">
            <Field label={t("common.phone")} value={worker.phone} />
            <Field label={t("molding.addressField")} value={worker.address} />
            <Field label={t("molding.aadharIdField")} value={worker.idNumber} />
            <Field label={t("molding.thekedarFieldLabel")} value={contractor?.name} />
          </div>
        </Card>

        <Card>
          <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-muted">{t("molding.rateControl")}</h4>
          <form onSubmit={saveRate} className="flex items-end gap-2">
            <div className="flex-1">
              <label className="mb-1 block text-sm text-ink-muted">{t("molding.ratePer1000BricksLabel")}</label>
              <input
                type="number"
                value={rateInput}
                onChange={(e) => setRateInput(e.target.value)}
                placeholder={
                  contractor?.defaultRatePerThousand
                    ? t("molding.defaultRatePlaceholder", { amount: contractor.defaultRatePerThousand })
                    : t("molding.egRate380")
                }
                className={inputClass}
              />
            </div>
            <Button type="submit" size="sm" disabled={savingRate}>
              {t("common.save")}
            </Button>
          </form>
          {!worker.ratePerThousand && contractor?.defaultRatePerThousand && (
            <p className="mt-2 text-sm text-ink-muted">
              {t("molding.noIndividualRateSet", { amount: contractor.defaultRatePerThousand })}
            </p>
          )}
        </Card>

        <Card className="lg:col-span-2">
          <h4 className="mb-3 text-xs font-semibold uppercase tracking-wide text-ink-muted">{t("molding.dueBalanceLedger")}</h4>
          <div className="grid grid-cols-3 gap-2 text-center">
            <div>
              <p className="text-xl font-semibold tabular-nums text-ink-primary">₹{formatINR(totalEarnings)}</p>
              <p className="text-sm text-ink-muted">{t("molding.totalEarningsLabel")}</p>
            </div>
            <div>
              <p className="text-xl font-semibold tabular-nums text-ink-primary">₹{formatINR(totalAdvancesGiven)}</p>
              <p className="text-sm text-ink-muted">{t("molding.advancesKharchiExpensesLabel")}</p>
            </div>
            <div>
              <p className={`text-xl font-semibold tabular-nums ${balance > 0 ? "text-status-critical" : balance < 0 ? "text-status-warning" : "text-status-good"}`}>
                ₹{formatINR(Math.abs(balance))}
              </p>
              <p className="text-sm text-ink-muted">{balance >= 0 ? t("molding.netDueLabel") : t("molding.advanceOutstandingLabel")}</p>
            </div>
          </div>
        </Card>

        <Card className="lg:col-span-2">
          <div className="mb-3 flex items-center justify-between">
            <h4 className="text-xs font-semibold uppercase tracking-wide text-ink-muted">{t("molding.dailyProductionLog")}</h4>
            <Button size="sm" onClick={() => setShowLogForm((s) => !s)}>
              <Plus className="h-4 w-4" /> {t("molding.logTodaysBricks")}
            </Button>
          </div>

          <div className="mb-4 grid grid-cols-2 gap-2 text-center">
            <div>
              <p className="text-xl font-semibold tabular-nums text-ink-primary">{totalMade.toLocaleString("en-IN")}</p>
              <p className="text-sm text-ink-muted">{t("molding.totalMadeLabel")}</p>
            </div>
            <div>
              <p className={`text-xl font-semibold tabular-nums ${totalDamaged > 0 ? "text-status-critical" : "text-ink-primary"}`}>
                {totalDamaged.toLocaleString("en-IN")}
              </p>
              <p className="text-sm text-ink-muted">{t("molding.totalDamagedLabel")}</p>
            </div>
          </div>

          {showLogForm && (
            <form onSubmit={handleLogProduction} className="mb-4 grid grid-cols-2 gap-2 border-b border-border pb-4">
              <input
                required
                type="number"
                placeholder={t("molding.bricksMoldedPlaceholder")}
                value={logForm.bricksCount}
                onChange={(e) => setLogForm((f) => ({ ...f, bricksCount: e.target.value }))}
                className={inputClass}
              />
              <input
                required
                type="number"
                placeholder={t("molding.ratePerThousandPlaceholder")}
                value={logForm.ratePerThousand}
                onChange={(e) => setLogForm((f) => ({ ...f, ratePerThousand: e.target.value }))}
                className={inputClass}
              />
              <input
                type="number"
                min={0}
                placeholder={t("molding.damagedBricksOptionalPlaceholder")}
                value={logForm.damagedCount}
                onChange={(e) => setLogForm((f) => ({ ...f, damagedCount: e.target.value }))}
                className={cn(inputClass, "col-span-2")}
              />
              <label className="col-span-2 flex items-center gap-2 text-sm text-ink-secondary">
                <input
                  type="checkbox"
                  checked={logForm.washedOut}
                  onChange={(e) => setLogForm((f) => ({ ...f, washedOut: e.target.checked }))}
                />
                {t("molding.washedOutByRain")}
              </label>
              <Button type="submit" disabled={loggingProduction} className="col-span-2">
                {t("molding.saveEntry")}
              </Button>
            </form>
          )}

          {workHistory.length === 0 ? (
            <p className="py-6 text-center text-sm text-ink-muted">{t("molding.noProductionLoggedYet")}</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px] text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-sm text-ink-muted">
                    <th className="pb-2 font-medium">{t("common.date")}</th>
                    <th className="pb-2 font-medium">{t("molding.bricksColumn")}</th>
                    <th className="pb-2 font-medium">{t("stacking.damagedLabel")}</th>
                    <th className="pb-2 font-medium">{t("molding.rateColumn")}</th>
                    <th className="pb-2 font-medium">{t("molding.wageColumn")}</th>
                    <th className="pb-2 font-medium">{t("common.status")}</th>
                  </tr>
                </thead>
                <tbody>
                  {workHistory.map((entry) => (
                    <tr key={entry._id} className="border-b border-border/60 last:border-0">
                      <td className="py-3 text-ink-secondary">{new Date(entry.date).toLocaleDateString("en-IN")}</td>
                      <td className="py-3 tabular-nums text-ink-secondary">{entry.bricksCount.toLocaleString("en-IN")}</td>
                      <td className="py-3 tabular-nums">
                        {entry.damagedCount ? (
                          <span className="text-status-critical">{entry.damagedCount.toLocaleString("en-IN")}</span>
                        ) : (
                          <span className="text-ink-muted">—</span>
                        )}
                      </td>
                      <td className="py-3 tabular-nums text-ink-secondary">₹{entry.ratePerThousand}</td>
                      <td className="py-3 tabular-nums text-ink-primary">
                        {entry.washedOut ? "—" : `₹${formatINR((entry.bricksCount / 1000) * entry.ratePerThousand)}`}
                      </td>
                      <td className="py-3">
                        {entry.washedOut ? (
                          <Badge variant="critical">{t("molding.washedOutBadge")}</Badge>
                        ) : (
                          <Badge variant="good">{t("molding.paidEntryBadge")}</Badge>
                        )}
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
    </div>
  );
}
