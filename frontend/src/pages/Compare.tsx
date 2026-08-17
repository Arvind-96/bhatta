import { useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { SegmentedTabs } from "@/components/ui/segmented-tabs";
import { api } from "@/lib/api";
import { useAuthStore } from "@/store/auth.store";
import { useTranslation } from "@/hooks/useTranslation";
import { cn, formatINR } from "@/lib/utils";
import type { CompareModule, SeasonYearResult } from "@/types";

const inputClass =
  "h-10 w-28 rounded-xl border border-border bg-ink-primary/5 px-3 text-sm text-ink-primary outline-none focus:ring-2 focus:ring-series-1";

const MODULES: CompareModule[] = [
  "financial", "bricks", "molding", "stacking", "nikasi", "firing", "brickLoading",
  "dispatch", "soil", "diesel", "fuel", "expense", "stock", "attendance", "salary", "labor",
];

// Metric keys whose values are rupee amounts (formatted with ₹ + Indian
// grouping) rather than plain counts (formatted with just the grouping).
const CURRENCY_KEYS = new Set([
  "moneyReceived", "moneySpent", "netCashFlow", "fuelExpense", "dieselExpense",
  "dispatchRevenue", "amount", "totalCost", "totalTips", "totalBonusAmount",
  "totalAmount", "totalGrossSalary", "totalDeductions", "totalNetSalary",
  "totalWagesDue", "totalPaidOut", "netOutstandingChange",
]);

function formatMetricValue(key: string, value: number) {
  return CURRENCY_KEYS.has(key) ? `₹${formatINR(value)}` : value.toLocaleString("en-IN");
}

// The kiln's business season runs Aug 1 (by default, configurable in
// Settings) – Jul 31 the next year. Mirrors
// backend/src/utils/season.ts:currentSeasonYear — which season-year
// "today" falls in, used only to default the two pickers below.
function currentSeasonYear(seasonStartMonth: number, seasonStartDay: number, reference = new Date()) {
  const thisYearStart = new Date(reference.getFullYear(), seasonStartMonth - 1, seasonStartDay);
  return reference >= thisYearStart ? reference.getFullYear() : reference.getFullYear() - 1;
}

// Compares kiln data across season-years, one module at a time — every
// module the app tracks, per the client's explicit ask, not a curated
// subset. Each module's headline metrics come from
// backend/src/services/compare.service.ts, which resolves the same
// Aug1–Jul31 season boundary this page computes for its own year pickers.
export function Compare() {
  const { t } = useTranslation();
  const kilns = useAuthStore((s) => s.kilns);
  const activeKilnId = useAuthStore((s) => s.activeKilnId);
  const activeKiln = kilns.find((k) => k.kilnId === activeKilnId);
  const seasonStartMonth = activeKiln?.seasonStartMonth ?? 8;
  const seasonStartDay = activeKiln?.seasonStartDay ?? 1;
  const thisSeasonYear = currentSeasonYear(seasonStartMonth, seasonStartDay);

  const [module, setModule] = useState<CompareModule>("financial");
  const [seasonYearA, setSeasonYearA] = useState(thisSeasonYear - 1);
  const [seasonYearB, setSeasonYearB] = useState(thisSeasonYear);
  const [results, setResults] = useState<SeasonYearResult[] | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!activeKilnId || !seasonYearA || !seasonYearB) return;
    setLoading(true);
    api.compare
      .get(module, [seasonYearA, seasonYearB])
      .then(setResults)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [activeKilnId, module, seasonYearA, seasonYearB]);

  const moduleOptions = MODULES.map((m) => ({ value: m, label: t(`compare.module.${m}`) }));

  // Row order = the first season-year's own metric key order, restricted
  // to plain numbers — a nested breakdown (e.g. expense.byCategory) isn't
  // a single comparable headline figure, so it's left out of this table.
  const metricKeys = results?.[0] ? Object.keys(results[0].metrics).filter((k) => typeof results[0].metrics[k] === "number") : [];

  function seasonLabel(year: number) {
    return t("compare.seasonLabel", { year: String(year), nextYear: String(year + 1) });
  }

  return (
    <div className="space-y-4">
      <Card>
        <h4 className="mb-1 text-xs font-semibold uppercase tracking-wide text-ink-muted">{t("compare.heading")}</h4>
        <p className="mb-4 text-sm text-ink-muted">{t("compare.description")}</p>
        <div className="mb-4 overflow-x-auto pb-1">
          <SegmentedTabs options={moduleOptions} value={module} onChange={setModule} />
        </div>
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <label className="mb-1 block text-sm text-ink-muted">{t("compare.seasonYearA")}</label>
            <input
              type="number"
              value={seasonYearA}
              onChange={(e) => setSeasonYearA(Number(e.target.value))}
              className={inputClass}
            />
          </div>
          <div>
            <label className="mb-1 block text-sm text-ink-muted">{t("compare.seasonYearB")}</label>
            <input
              type="number"
              value={seasonYearB}
              onChange={(e) => setSeasonYearB(Number(e.target.value))}
              className={inputClass}
            />
          </div>
        </div>
      </Card>

      <Card>
        {loading ? (
          <p className="py-8 text-center text-sm text-ink-muted">{t("compare.loading")}</p>
        ) : !results || metricKeys.length === 0 ? (
          <p className="py-8 text-center text-sm text-ink-muted">{t("compare.noData")}</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[520px] text-sm">
              <thead>
                <tr className="border-b border-border text-left text-sm text-ink-muted">
                  <th className="pb-2 font-medium">{t("compare.metric")}</th>
                  {results.map((r) => (
                    <th key={r.seasonYear} className="pb-2 font-medium text-right">
                      <div className="flex flex-col items-end gap-1">
                        <span>{seasonLabel(r.seasonYear)}</span>
                        {r.inProgress && <Badge variant="warning">{t("compare.inProgress")}</Badge>}
                      </div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {metricKeys.map((key) => (
                  <tr key={key} className="border-b border-border/60 last:border-0">
                    <td className="py-2.5 text-ink-secondary">{t(`compare.metric.${key}`)}</td>
                    {results.map((r) => {
                      const value = r.metrics[key] as number;
                      const isNegative = value < 0;
                      return (
                        <td
                          key={r.seasonYear}
                          className={cn("py-2.5 text-right font-semibold tabular-nums text-ink-primary", isNegative && "text-status-critical")}
                        >
                          {formatMetricValue(key, value)}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
