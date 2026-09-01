import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import { PieChart as PieChartIcon } from "lucide-react";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { useTranslation } from "@/hooks/useTranslation";
import type { BrickCategory } from "@/types";

const SLICE_COLORS = ["var(--series-1)", "var(--series-5)", "var(--series-3)", "var(--series-2)", "var(--series-6)", "var(--series-4)"];

function ChartTooltip({ active, payload }: any) {
  if (!active || !payload?.length) return null;
  const point = payload[0];
  return (
    <div className="glass-panel rounded-xl px-3 py-2 text-xs shadow-glass">
      <div className="flex items-center gap-1.5 font-semibold tabular-nums text-ink-primary">
        <span className="h-2 w-2 rounded-full" style={{ background: point.payload.fill }} />
        {point.name}: {point.value.toLocaleString("en-IN")}
      </div>
    </div>
  );
}

interface StockCompositionDonutProps {
  categories: BrickCategory[];
}

// The exact same brickCategories array StockOverview's bar chart already
// plots — this is a different shape (share of total, not absolute
// quantity) of the same real numbers, not a second data source.
export function StockCompositionDonut({ categories }: StockCompositionDonutProps) {
  const { t } = useTranslation();
  const total = categories.reduce((sum, c) => sum + c.quantity, 0);
  const data = categories
    .filter((c) => c.quantity > 0)
    .map((c, i) => ({ name: c.category, value: c.quantity, fill: SLICE_COLORS[i % SLICE_COLORS.length] }));

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("overview.stockCompositionTitle")}</CardTitle>
        <span className="text-sm text-ink-muted">{t("overview.stockCompositionSubtitle")}</span>
      </CardHeader>
      {data.length === 0 ? (
        <div className="flex h-64 flex-col items-center justify-center gap-2">
          <PieChartIcon className="h-6 w-6 text-ink-muted/50" />
          <p className="text-sm text-ink-muted">{t("overview.noStockYet")}</p>
        </div>
      ) : (
        <div className="flex h-64 items-center gap-4">
          <ResponsiveContainer width="55%" height="100%">
            <PieChart>
              <Pie data={data} dataKey="value" nameKey="name" innerRadius={52} outerRadius={80} paddingAngle={2}>
                {data.map((slice) => (
                  <Cell key={slice.name} fill={slice.fill} stroke="var(--surface)" strokeWidth={2} />
                ))}
              </Pie>
              <Tooltip content={<ChartTooltip />} />
            </PieChart>
          </ResponsiveContainer>
          <div className="flex flex-1 flex-col gap-2 overflow-y-auto" style={{ maxHeight: "100%" }}>
            {data.map((slice) => (
              <div key={slice.name} className="flex items-center gap-2 text-sm">
                <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: slice.fill }} />
                <span className="min-w-0 flex-1 truncate text-ink-secondary">{slice.name}</span>
                <span className="shrink-0 font-semibold tabular-nums text-ink-primary">
                  {total > 0 ? Math.round((slice.value / total) * 100) : 0}%
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </Card>
  );
}
