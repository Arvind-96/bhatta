import { useEffect, useState } from "react";
import { PieChart, Search, TrendingDown, TrendingUp } from "lucide-react";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { DateInput } from "@/components/ui/date-input";
import { api } from "@/lib/api";
import { useAuthStore } from "@/store/auth.store";
import { useKilnEvent } from "@/hooks/useKilnEvent";
import { useTranslation } from "@/hooks/useTranslation";
import { cn, formatINR } from "@/lib/utils";
import type { ProfitLossStatement } from "@/types";

const inputClass =
  "h-10 rounded-xl border border-border bg-ink-primary/5 px-3 text-sm text-ink-primary outline-none focus:ring-2 focus:ring-series-1";

function StatTile({ label, value, tone }: { label: string; value: number; tone?: "good" | "critical" }) {
  return (
    <Card className="p-4">
      <p className="text-sm text-ink-muted">{label}</p>
      <p
        className={cn(
          "mt-1 text-xl font-semibold tabular-nums",
          tone === "good" ? "text-status-good" : tone === "critical" ? "text-status-critical" : "text-ink-primary"
        )}
      >
        ₹{formatINR(value)}
      </p>
    </Card>
  );
}

// Bug fix: `.toISOString().slice(0, 10)` reads the UTC calendar date, not
// IST — during the ~5.5h window where it's already tomorrow in IST but
// still today in UTC, the default range's own endpoints landed a day
// early. istDateOnlyString mirrors the backend's istDateOnly/
// istDateKeyString convention (utils/istTime.ts) on the frontend side.
function istDateOnlyString(date: Date) {
  const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;
  const ist = new Date(date.getTime() + IST_OFFSET_MS);
  return ist.toISOString().slice(0, 10);
}

function defaultRange() {
  const to = new Date();
  const from = new Date(to.getTime() - 30 * 24 * 60 * 60 * 1000);
  return { from: istDateOnlyString(from), to: istDateOnlyString(to) };
}

// The Profit & Loss page — a dedicated cash-basis P&L for an admin-picked
// date range: total sales, total expenses, advances given/received, and
// the cash/online split of money in and out, all built on
// financialOverview.service.ts's own flowForRange (the same accounting
// Financial Overview already uses, so this page's totals never disagree
// with that one). Overall profit/loss is exactly money-in minus
// money-out — every other figure here is a breakdown of that one number,
// not an extra addition to it. Each Partner's profitSharePercent (set on
// their own People profile) is applied against that same profit/loss
// figure for the exact rupee share owed to them this period.
export function ProfitLoss() {
  const { t } = useTranslation();
  const [range, setRange] = useState(defaultRange);
  const [statement, setStatement] = useState<ProfitLossStatement | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const activeKilnId = useAuthStore((s) => s.activeKilnId);

  async function refresh() {
    // Bug fix: a reversed range (from after to) used to silently produce
    // an empty/zero statement instead of an error.
    if (range.from > range.to) {
      setError(t("financialOverview.invalidRange"));
      return;
    }
    setLoading(true);
    setError("");
    try {
      setStatement(await api.profitLoss.get(range));
    } catch (err) {
      setError(err instanceof Error ? err.message : t("common.somethingWentWrong"));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!activeKilnId) return;
    refresh().catch(console.error);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeKilnId]);

  useKilnEvent("dispatch:update", () => refresh());
  useKilnEvent("expense:update", () => refresh());
  useKilnEvent("ledger:update", () => refresh());
  useKilnEvent("invoice:update", () => refresh());
  useKilnEvent("person:update", () => refresh());

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>{t("profitLoss.dateRangeHeading")}</CardTitle>
        </CardHeader>
        <div className="flex flex-wrap items-end gap-2">
          <div>
            <label className="mb-1 block text-sm text-ink-muted">{t("financialOverview.from")}</label>
            <DateInput value={range.from} onChange={(e) => setRange((r) => ({ ...r, from: e.target.value }))} className={inputClass} />
          </div>
          <div>
            <label className="mb-1 block text-sm text-ink-muted">{t("financialOverview.to")}</label>
            <DateInput value={range.to} onChange={(e) => setRange((r) => ({ ...r, to: e.target.value }))} className={inputClass} />
          </div>
          <Button size="sm" onClick={refresh} disabled={!range.from || !range.to || loading}>
            <Search className="h-4 w-4" /> {t("financialOverview.viewReport")}
          </Button>
        </div>
        {error && <p className="mt-2 text-sm text-status-critical">{error}</p>}
      </Card>

      {statement && (
        <>
          <Card className={cn("border-2", statement.netProfit >= 0 ? "border-status-good/40" : "border-status-critical/40")}>
            <div className="flex items-center gap-3">
              <div className={cn("flex h-12 w-12 items-center justify-center rounded-xl", statement.netProfit >= 0 ? "bg-status-good/10" : "bg-status-critical/10")}>
                {statement.netProfit >= 0 ? (
                  <TrendingUp className="h-6 w-6 text-status-good" />
                ) : (
                  <TrendingDown className="h-6 w-6 text-status-critical" />
                )}
              </div>
              <div>
                <p className="text-sm text-ink-muted">{statement.netProfit >= 0 ? t("profitLoss.overallProfit") : t("profitLoss.overallLoss")}</p>
                <p className={cn("text-3xl font-bold tabular-nums", statement.netProfit >= 0 ? "text-status-good" : "text-status-critical")}>
                  ₹{formatINR(Math.abs(statement.netProfit))}
                </p>
              </div>
            </div>
          </Card>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <StatTile label={t("profitLoss.totalSales")} value={statement.totalSales} tone="good" />
            <StatTile label={t("profitLoss.totalExpenses")} value={statement.totalExpenses} tone="critical" />
            <StatTile label={t("profitLoss.totalAdvancesGiven")} value={statement.totalAdvancesGiven} tone="critical" />
            <StatTile label={t("profitLoss.cashReceived")} value={statement.cashReceived} tone="good" />
            <StatTile label={t("profitLoss.cashGiven")} value={statement.cashGiven} tone="critical" />
            <StatTile label={t("profitLoss.onlinePaymentsReceived")} value={statement.onlinePaymentsReceived} tone="good" />
            <StatTile label={t("profitLoss.onlinePaymentsMade")} value={statement.onlinePaymentsMade} tone="critical" />
            {(statement.moneyInUnspecified !== 0 || statement.moneyOutUnspecified !== 0) && (
              <>
                <StatTile label={t("profitLoss.moneyInUnspecified")} value={statement.moneyInUnspecified} />
                <StatTile label={t("profitLoss.moneyOutUnspecified")} value={statement.moneyOutUnspecified} />
              </>
            )}
          </div>
          {(statement.moneyInUnspecified !== 0 || statement.moneyOutUnspecified !== 0) && (
            <p className="text-xs text-ink-muted">{t("profitLoss.unspecifiedHint")}</p>
          )}

          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-series-1/10">
                  <PieChart className="h-4 w-4 text-series-1" />
                </div>
                <CardTitle>{t("profitLoss.partnerShareHeading")}</CardTitle>
              </div>
            </CardHeader>
            {statement.partnerShares.length === 0 ? (
              <p className="py-8 text-center text-sm text-ink-muted">{t("profitLoss.noPartnersYet")}</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[480px] text-sm">
                  <thead>
                    <tr className="border-b border-border text-left text-sm text-ink-muted">
                      <th className="pb-2 font-medium">{t("profitLoss.partnerColumn")}</th>
                      <th className="pb-2 font-medium text-right">{t("profitLoss.sharePercentColumn")}</th>
                      <th className="pb-2 font-medium text-right">{t("profitLoss.shareAmountColumn")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {statement.partnerShares.map((p) => (
                      <tr key={p.partnerId} className="border-b border-border/60 last:border-0">
                        <td className="py-2.5 text-ink-primary">{p.name}</td>
                        <td className="py-2.5 text-right tabular-nums text-ink-secondary">{p.sharePercent}%</td>
                        <td
                          className={cn(
                            "py-2.5 text-right font-semibold tabular-nums",
                            p.shareAmount >= 0 ? "text-status-good" : "text-status-critical"
                          )}
                        >
                          ₹{formatINR(Math.abs(p.shareAmount))}
                        </td>
                      </tr>
                    ))}
                    {statement.unallocatedPercent > 0 && (
                      <tr>
                        <td className="py-2.5 text-ink-muted">{t("profitLoss.unallocatedRow")}</td>
                        <td className="py-2.5 text-right tabular-nums text-ink-muted">{statement.unallocatedPercent}%</td>
                        <td className="py-2.5 text-right tabular-nums text-ink-muted">₹{formatINR(Math.abs(statement.unallocatedAmount))}</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            )}
            <p className="mt-3 text-[11px] text-ink-muted">{t("profitLoss.disclaimer")}</p>
          </Card>
        </>
      )}
    </div>
  );
}
