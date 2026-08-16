import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { LineChart as LineChartIcon } from "lucide-react";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { useDashboardStore } from "@/store/dashboard.store";
import { useTranslation } from "@/hooks/useTranslation";

function formatDay(date: string) {
  return new Date(date).toLocaleDateString("en-IN", { day: "2-digit", month: "short" });
}

function ChartTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="glass-panel rounded-xl px-3 py-2 text-xs shadow-glass">
      <div className="text-ink-muted">{formatDay(label)}</div>
      <div className="mt-1 font-semibold tabular-nums text-ink-primary">
        {payload[0].value.toLocaleString("en-IN")} bricks
      </div>
    </div>
  );
}

export function ProductionChart() {
  const series = useDashboardStore((s) => s.productionSeries);
  const { t } = useTranslation();

  return (
    <Card className="col-span-2">
      <CardHeader>
        <CardTitle>{t("overview.dailyProduction")}</CardTitle>
        <span className="text-sm text-ink-muted">{t("overview.last14Days")}</span>
      </CardHeader>
      <div className="h-72">
        {series.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-2">
            <LineChartIcon className="h-6 w-6 text-ink-muted/50" />
            <p className="text-sm text-ink-muted">No production logged in the last 14 days yet.</p>
          </div>
        ) : (
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={series} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
            <defs>
              <linearGradient id="productionFill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="var(--series-1)" stopOpacity={0.35} />
                <stop offset="100%" stopColor="var(--series-1)" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid vertical={false} stroke="var(--gridline)" strokeDasharray="0" />
            <XAxis
              dataKey="date"
              tickFormatter={formatDay}
              tick={{ fill: "var(--ink-muted)", fontSize: 12 }}
              axisLine={{ stroke: "var(--baseline)" }}
              tickLine={false}
            />
            <YAxis
              tick={{ fill: "var(--ink-muted)", fontSize: 12 }}
              axisLine={false}
              tickLine={false}
              width={48}
            />
            <Tooltip content={<ChartTooltip />} cursor={{ stroke: "var(--baseline)" }} />
            <Area
              type="monotone"
              dataKey="bricks"
              stroke="var(--series-1)"
              strokeWidth={2}
              fill="url(#productionFill)"
              activeDot={{ r: 4 }}
            />
          </AreaChart>
        </ResponsiveContainer>
        )}
      </div>
    </Card>
  );
}
