import { PieChart as StackIcon } from "lucide-react";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { useTranslation } from "@/hooks/useTranslation";
import { formatINR } from "@/lib/utils";
import type { FinancialOverview } from "@/types";

const SEGMENTS: { key: keyof FinancialOverview["month"]["breakdown"]; color: string; labelKey: string }[] = [
  { key: "expenses", color: "var(--series-2)", labelKey: "financialOverview.categoryExpenses" },
  { key: "fuel", color: "var(--series-3)", labelKey: "financialOverview.categoryFuel" },
  { key: "diesel", color: "var(--series-6)", labelKey: "financialOverview.categoryDiesel" },
  { key: "otherPayments", color: "var(--series-4)", labelKey: "financialOverview.categoryOther" },
];

// The same breakdown numbers already summed into "Money spent" for the
// month — split back out into a single segmented bar so the composition
// (not just the total) is visible at a glance.
export function SpendingByCategoryBar({ overview }: { overview: FinancialOverview }) {
  const { t } = useTranslation();
  const breakdown = overview.month.breakdown;
  const total = SEGMENTS.reduce((sum, seg) => sum + (breakdown[seg.key] ?? 0), 0);

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-series-2/10">
            <StackIcon className="h-4 w-4 text-series-2" />
          </div>
          <div>
            <CardTitle>{t("financialOverview.spendingByCategory")}</CardTitle>
            <span className="text-sm text-ink-muted">{t("financialOverview.spendingByCategorySubtitle")}</span>
          </div>
        </div>
      </CardHeader>

      {total <= 0 ? (
        <p className="py-6 text-center text-sm text-ink-muted">{t("financialOverview.noSpendingThisMonth")}</p>
      ) : (
        <>
          <div className="flex h-4 w-full overflow-hidden rounded-full">
            {SEGMENTS.map((seg) => {
              const value = breakdown[seg.key] ?? 0;
              if (value <= 0) return null;
              return <div key={seg.key} style={{ width: `${(value / total) * 100}%`, background: seg.color }} title={t(seg.labelKey)} />;
            })}
          </div>
          <div className="mt-4 grid grid-cols-2 gap-2.5 sm:grid-cols-4">
            {SEGMENTS.map((seg) => {
              const value = breakdown[seg.key] ?? 0;
              return (
                <div key={seg.key} className="flex items-center gap-2 text-sm">
                  <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: seg.color }} />
                  <div className="min-w-0">
                    <p className="truncate text-xs text-ink-muted">{t(seg.labelKey)}</p>
                    <p className="font-semibold tabular-nums text-ink-primary">₹{formatINR(value)}</p>
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}
    </Card>
  );
}
