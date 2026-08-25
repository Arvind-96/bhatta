import { useState } from "react";
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import { Wallet2 } from "lucide-react";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { SegmentedTabs } from "@/components/ui/segmented-tabs";
import { useTranslation } from "@/hooks/useTranslation";
import { formatINR } from "@/lib/utils";
import type { FinancialOverview } from "@/types";

type Period = "today" | "week" | "month" | "year";

function ChartTooltip({ active, payload }: any) {
  if (!active || !payload?.length) return null;
  const point = payload[0];
  return (
    <div className="glass-panel rounded-xl px-3 py-2 text-xs shadow-glass">
      <div className="flex items-center gap-1.5 font-semibold tabular-nums text-ink-primary">
        <span className="h-2 w-2 rounded-full" style={{ background: point.payload.fill }} />
        {point.name}: ₹{formatINR(point.value)}
      </div>
    </div>
  );
}

// Same real moneyIn.{cash,online,unspecified} split already shown as rows
// in the "Money In / Out by payment method" table — just for one period at
// a time, as a composition chart instead of a row of numbers.
export function PaymentMixDonut({ overview }: { overview: FinancialOverview }) {
  const { t } = useTranslation();
  const [period, setPeriod] = useState<Period>("month");
  const split = overview[period].moneyIn;

  const data = [
    { name: t("financialOverview.moneyInCash"), value: split.cash, fill: "var(--status-good)" },
    { name: t("financialOverview.moneyInOnline"), value: split.online, fill: "var(--series-1)" },
    { name: t("financialOverview.moneyInUnspecified"), value: split.unspecified, fill: "var(--ink-muted)" },
  ].filter((slice) => slice.value > 0);

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-series-1/10">
            <Wallet2 className="h-4 w-4 text-series-1" />
          </div>
          <div>
            <CardTitle>{t("financialOverview.paymentMixChart")}</CardTitle>
            <span className="text-sm text-ink-muted">{t("financialOverview.paymentMixChartSubtitle")}</span>
          </div>
        </div>
      </CardHeader>

      <SegmentedTabs
        className="mb-3"
        options={[
          { value: "today" as const, label: t("financialOverview.today") },
          { value: "week" as const, label: t("financialOverview.thisWeek") },
          { value: "month" as const, label: t("financialOverview.thisMonth") },
          { value: "year" as const, label: t("financialOverview.thisYear") },
        ]}
        value={period}
        onChange={setPeriod}
      />

      <div className="flex h-64 items-center gap-4">
        {data.length === 0 ? (
          <div className="flex h-full w-full flex-col items-center justify-center gap-2">
            <Wallet2 className="h-6 w-6 text-ink-muted/50" />
            <p className="text-sm text-ink-muted">No money received in this period yet.</p>
          </div>
        ) : (
          <>
            <ResponsiveContainer width="60%" height="100%">
              <PieChart>
                <Pie data={data} dataKey="value" nameKey="name" innerRadius={54} outerRadius={82} paddingAngle={2}>
                  {data.map((slice) => (
                    <Cell key={slice.name} fill={slice.fill} stroke="var(--surface)" strokeWidth={2} />
                  ))}
                </Pie>
                <Tooltip content={<ChartTooltip />} />
              </PieChart>
            </ResponsiveContainer>
            <div className="flex flex-1 flex-col gap-2.5">
              {data.map((slice) => (
                <div key={slice.name} className="flex items-center gap-2 text-sm">
                  <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: slice.fill }} />
                  <span className="min-w-0 flex-1 truncate text-ink-secondary">{slice.name}</span>
                  <span className="shrink-0 font-semibold tabular-nums text-ink-primary">₹{formatINR(slice.value)}</span>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </Card>
  );
}
