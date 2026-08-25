import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { BarChart3 } from "lucide-react";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { useTranslation } from "@/hooks/useTranslation";
import { formatINR } from "@/lib/utils";
import type { FinancialOverview } from "@/types";

function ChartTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="glass-panel rounded-xl px-3 py-2 text-xs shadow-glass">
      <div className="mb-1 font-semibold text-ink-primary">{label}</div>
      {payload.map((row: any) => (
        <div key={row.dataKey} className="flex items-center gap-1.5 tabular-nums" style={{ color: row.color }}>
          <span className="h-2 w-2 rounded-full" style={{ background: row.color }} />
          ₹{formatINR(row.value)}
        </div>
      ))}
    </div>
  );
}

// The exact same numbers already shown in the "Every rupee, by period"
// table below this chart on FinancialOverview — charted, not recomputed,
// so the two never drift out of sync with each other.
export function MoneyInOutChart({ overview }: { overview: FinancialOverview }) {
  const { t } = useTranslation();
  const data = [
    { label: t("financialOverview.today"), in: overview.today.moneyReceived, out: overview.today.moneySpent },
    { label: t("financialOverview.thisWeek"), in: overview.week.moneyReceived, out: overview.week.moneySpent },
    { label: t("financialOverview.thisMonth"), in: overview.month.moneyReceived, out: overview.month.moneySpent },
    { label: t("financialOverview.thisYear"), in: overview.year.moneyReceived, out: overview.year.moneySpent },
  ];

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-status-good/10">
            <BarChart3 className="h-4 w-4 text-status-good" />
          </div>
          <div>
            <CardTitle>{t("financialOverview.moneyInOutChart")}</CardTitle>
            <span className="text-sm text-ink-muted">{t("financialOverview.moneyInOutChartSubtitle")}</span>
          </div>
        </div>
      </CardHeader>
      <div className="h-72">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
            <CartesianGrid vertical={false} stroke="var(--gridline)" />
            <XAxis dataKey="label" tick={{ fill: "var(--ink-muted)", fontSize: 12 }} axisLine={{ stroke: "var(--baseline)" }} tickLine={false} />
            <YAxis tick={{ fill: "var(--ink-muted)", fontSize: 12 }} axisLine={false} tickLine={false} width={56} tickFormatter={(v) => formatINR(v)} />
            <Tooltip content={<ChartTooltip />} cursor={{ fill: "var(--gridline)" }} />
            <Legend
              formatter={(value) => (value === "in" ? t("financialOverview.moneyReceived") : t("financialOverview.moneySpent"))}
              wrapperStyle={{ fontSize: 12, color: "var(--ink-secondary)" }}
            />
            <Bar dataKey="in" name="in" fill="var(--status-good)" radius={[4, 4, 0, 0]} barSize={22} />
            <Bar dataKey="out" name="out" fill="var(--status-critical)" radius={[4, 4, 0, 0]} barSize={22} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </Card>
  );
}
