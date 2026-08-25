import { Gauge } from "lucide-react";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { useTranslation } from "@/hooks/useTranslation";
import { formatINR } from "@/lib/utils";
import type { FinancialOverview } from "@/types";

const RADIUS = 54;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

// Net margin for the current month = net cash flow / money received —
// the same two numbers already shown as separate rows in the "Every
// rupee, by period" table, expressed as a single at-a-glance percentage.
// Clamped to 0-100 for the ring itself; the real (possibly negative or
// >100%) number is still shown as text underneath.
export function NetMarginGauge({ overview }: { overview: FinancialOverview }) {
  const { t } = useTranslation();
  const { moneyReceived, netCashFlow } = overview.month;
  const rawPercent = moneyReceived > 0 ? (netCashFlow / moneyReceived) * 100 : 0;
  const displayPercent = Math.max(0, Math.min(100, rawPercent));
  const offset = CIRCUMFERENCE - (displayPercent / 100) * CIRCUMFERENCE;

  return (
    <Card className="flex flex-col items-center text-center">
      <CardHeader className="w-full">
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-series-5/10">
            <Gauge className="h-4 w-4 text-series-5" />
          </div>
          <CardTitle>{t("financialOverview.netMarginTitle")}</CardTitle>
        </div>
      </CardHeader>
      <div className="relative h-[132px] w-[132px]">
        <svg width="132" height="132" viewBox="0 0 132 132" className="-rotate-90">
          <circle cx="66" cy="66" r={RADIUS} fill="none" stroke="var(--gridline)" strokeWidth="13" />
          <circle
            cx="66"
            cy="66"
            r={RADIUS}
            fill="none"
            stroke={rawPercent >= 0 ? "var(--status-good)" : "var(--status-critical)"}
            strokeWidth="13"
            strokeLinecap="round"
            strokeDasharray={CIRCUMFERENCE}
            strokeDashoffset={offset}
            style={{ transition: "stroke-dashoffset 1s cubic-bezier(.2,.8,.2,1)" }}
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className={`text-2xl font-bold tabular-nums ${rawPercent >= 0 ? "text-status-good" : "text-status-critical"}`}>
            {Math.round(rawPercent)}%
          </span>
          <span className="text-[10px] font-semibold uppercase tracking-wide text-ink-muted">{t("financialOverview.netMarginLabel")}</span>
        </div>
      </div>
      <p className="mt-2 text-xs text-ink-muted">
        {t("financialOverview.netMarginDetail", { net: formatINR(netCashFlow), received: formatINR(moneyReceived) })}
      </p>
    </Card>
  );
}
