import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Boxes } from "lucide-react";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { useDashboardStore } from "@/store/dashboard.store";
import { useTranslation } from "@/hooks/useTranslation";

function ChartTooltip({ active, payload }: any) {
  if (!active || !payload?.length) return null;
  const point = payload[0].payload;
  return (
    <div className="glass-panel rounded-xl px-3 py-2 text-xs shadow-glass">
      <div className="text-ink-muted">{point.itemName}</div>
      <div className="mt-1 font-semibold tabular-nums text-ink-primary">
        {point.quantity.toLocaleString("en-IN")} units
      </div>
    </div>
  );
}

export function StockOverview() {
  const stock = useDashboardStore((s) => s.stock);
  const { t } = useTranslation();

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("overview.stockLevels")}</CardTitle>
        <span className="text-sm text-ink-muted">{t("overview.rawMaterialFinishedGoods")}</span>
      </CardHeader>
      <div className="h-72">
        {stock.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-2">
            <Boxes className="h-6 w-6 text-ink-muted/50" />
            <p className="text-sm text-ink-muted">No stock recorded yet.</p>
          </div>
        ) : (
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={stock} layout="vertical" margin={{ left: 0, right: 16 }}>
            <CartesianGrid horizontal={false} stroke="var(--gridline)" />
            <XAxis type="number" tick={{ fill: "var(--ink-muted)", fontSize: 12 }} axisLine={false} tickLine={false} />
            <YAxis
              dataKey="itemName"
              type="category"
              tick={{ fill: "var(--ink-secondary)", fontSize: 12 }}
              axisLine={false}
              tickLine={false}
              width={110}
            />
            <Tooltip content={<ChartTooltip />} cursor={{ fill: "var(--gridline)" }} />
            <Bar dataKey="quantity" fill="var(--series-1)" radius={[0, 4, 4, 0]} barSize={16} />
          </BarChart>
        </ResponsiveContainer>
        )}
      </div>
    </Card>
  );
}
