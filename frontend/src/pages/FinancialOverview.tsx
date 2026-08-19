import { useEffect, useState } from "react";
import { ArrowDownCircle, ArrowUpCircle, Boxes, Fuel, IndianRupee, PieChart, Search, Wallet } from "lucide-react";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { PeriodStatCard } from "@/components/dashboard/PeriodStatCard";
import { DateInput } from "@/components/ui/date-input";
import { api } from "@/lib/api";
import { useAuthStore } from "@/store/auth.store";
import { useKilnEvent } from "@/hooks/useKilnEvent";
import { useTranslation } from "@/hooks/useTranslation";
import { cn, formatINR } from "@/lib/utils";
import type { FinancialFlow, FinancialOverview as FinancialOverviewData } from "@/types";

const inputClass =
  "h-10 rounded-xl border border-border bg-ink-primary/5 px-3 text-sm text-ink-primary outline-none focus:ring-2 focus:ring-series-1";

function usePeriodColumns(): { key: keyof Pick<FinancialOverviewData, "today" | "week" | "month" | "year">; label: string }[] {
  const { t } = useTranslation();
  return [
    { key: "today", label: t("financialOverview.today") },
    { key: "week", label: t("financialOverview.thisWeek") },
    { key: "month", label: t("financialOverview.thisMonth") },
    { key: "year", label: t("financialOverview.thisYear") },
  ];
}

type FlowNumberKey = Exclude<keyof FinancialFlow, "breakdown" | "moneyIn" | "moneyOut">;

function useFlowRows(): { key: FlowNumberKey; label: string; unit?: string; tone?: string }[] {
  const { t } = useTranslation();
  return [
    { key: "moneyReceived", label: t("financialOverview.moneyReceived"), tone: "text-status-good" },
    { key: "moneySpent", label: t("financialOverview.moneySpent"), tone: "text-status-critical" },
    { key: "netCashFlow", label: t("financialOverview.netCashFlow") },
    { key: "bricksSold", label: t("financialOverview.bricksSold"), unit: "" },
    { key: "fuelExpense", label: t("financialOverview.fuelExpense") },
    { key: "dieselExpense", label: t("financialOverview.dieselExpense") },
  ];
}

function formatCell(key: FlowNumberKey, value: number) {
  if (key === "bricksSold") return value.toLocaleString("en-IN");
  return `₹${formatINR(value)}`;
}

function FlowStatGrid({ flow }: { flow: FinancialFlow }) {
  const { t } = useTranslation();
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
      <PeriodStatCard
        label={t("financialOverview.moneyReceived")}
        value={flow.moneyReceived}
        subtitle={t("financialOverview.moneyReceivedSubtitle")}
        icon={ArrowDownCircle}
        tone="text-series-3"
      />
      <PeriodStatCard
        label={t("financialOverview.moneySpent")}
        value={flow.moneySpent}
        subtitle={t("financialOverview.moneySpentSubtitle")}
        icon={ArrowUpCircle}
        tone="text-series-2"
        critical={flow.moneySpent > flow.moneyReceived}
      />
      <PeriodStatCard
        label={t("financialOverview.netCashFlow")}
        value={flow.netCashFlow}
        subtitle={flow.netCashFlow >= 0 ? t("financialOverview.surplus") : t("financialOverview.deficit")}
        icon={IndianRupee}
        tone="text-series-1"
        critical={flow.netCashFlow < 0}
      />
      <PeriodStatCard
        label={t("financialOverview.bricksSold")}
        value={flow.bricksSold}
        subtitle={t("financialOverview.bricksSoldSubtitle")}
        icon={Boxes}
        tone="text-series-6"
      />
      <PeriodStatCard
        label={t("financialOverview.fuelExpense")}
        value={flow.fuelExpense}
        subtitle={t("financialOverview.fuelExpenseSubtitle")}
        icon={Fuel}
        tone="text-series-4"
      />
      <PeriodStatCard
        label={t("financialOverview.dieselExpense")}
        value={flow.dieselExpense}
        subtitle={t("financialOverview.dieselExpenseSubtitle")}
        icon={Fuel}
        tone="text-series-5"
      />
    </div>
  );
}

export function FinancialOverview() {
  const { t } = useTranslation();
  const PERIOD_COLUMNS = usePeriodColumns();
  const FLOW_ROWS = useFlowRows();
  const [overview, setOverview] = useState<FinancialOverviewData | null>(null);
  const [range, setRange] = useState({ from: "", to: "" });
  const [customFlow, setCustomFlow] = useState<FinancialFlow | null>(null);
  const [customLoading, setCustomLoading] = useState(false);
  const activeKilnId = useAuthStore((s) => s.activeKilnId);

  async function refresh() {
    setOverview(await api.financialOverview.get());
  }

  useEffect(() => {
    if (!activeKilnId) return;
    refresh().catch(console.error);
  }, [activeKilnId]);

  useKilnEvent("dispatch:update", () => refresh());
  useKilnEvent("expense:update", () => refresh());
  useKilnEvent("ledger:update", () => refresh());
  useKilnEvent("fuelPurchase:update", () => refresh());
  useKilnEvent("vehicleDiesel:update", () => refresh());

  async function viewCustomRange() {
    if (!range.from || !range.to) return;
    setCustomLoading(true);
    try {
      setCustomFlow(await api.financialOverview.customRange(range.from, range.to));
    } finally {
      setCustomLoading(false);
    }
  }

  if (!overview) return null;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <PeriodStatCard
          label={t("financialOverview.currentDues")}
          value={overview.totalDues}
          subtitle={t("financialOverview.currentDuesSubtitle")}
          icon={Wallet}
          tone="text-series-2"
          critical={overview.totalDues > 0}
        />
        <PeriodStatCard
          label={t("financialOverview.outstandingFromClients")}
          value={overview.totalOutstandingFromClients}
          subtitle={t("financialOverview.outstandingFromClientsSubtitle")}
          icon={Wallet}
          tone="text-series-5"
          critical={overview.totalOutstandingFromClients > 0}
        />
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-series-1/10">
              <PieChart className="h-4 w-4 text-series-1" />
            </div>
            <CardTitle>{t("financialOverview.everyRupeeByPeriod")}</CardTitle>
          </div>
        </CardHeader>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-sm">
            <thead>
              <tr className="border-b border-border text-left text-sm text-ink-muted">
                <th className="pb-2 font-medium">{t("financialOverview.metric")}</th>
                {PERIOD_COLUMNS.map((c) => (
                  <th key={c.key} className="pb-2 font-medium text-right">
                    {c.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {FLOW_ROWS.map((row) => (
                <tr key={row.key} className="border-b border-border/60 last:border-0">
                  <td className="py-2.5 text-ink-secondary">{row.label}</td>
                  {PERIOD_COLUMNS.map((c) => {
                    const value = overview[c.key][row.key];
                    const isNegative = (row.key === "netCashFlow" || row.key === "moneySpent") && value < 0;
                    return (
                      <td
                        key={c.key}
                        className={cn(
                          "py-2.5 text-right font-semibold tabular-nums",
                          row.tone ?? "text-ink-primary",
                          isNegative && "text-status-critical"
                        )}
                      >
                        {formatCell(row.key, value)}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-series-3/10">
              <Wallet className="h-4 w-4 text-series-3" />
            </div>
            <CardTitle>{t("financialOverview.paymentMethodBreakdown")}</CardTitle>
          </div>
        </CardHeader>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-sm">
            <thead>
              <tr className="border-b border-border text-left text-sm text-ink-muted">
                <th className="pb-2 font-medium">{t("financialOverview.metric")}</th>
                {PERIOD_COLUMNS.map((c) => (
                  <th key={c.key} className="pb-2 font-medium text-right">
                    {c.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {(
                [
                  { flowKey: "moneyIn", splitKey: "cash", label: t("financialOverview.moneyInCash"), tone: "text-status-good" },
                  { flowKey: "moneyIn", splitKey: "online", label: t("financialOverview.moneyInOnline"), tone: "text-status-good" },
                  { flowKey: "moneyIn", splitKey: "total", label: t("financialOverview.moneyInTotal"), tone: "text-status-good" },
                  { flowKey: "moneyOut", splitKey: "cash", label: t("financialOverview.moneyOutCash"), tone: "text-status-critical" },
                  { flowKey: "moneyOut", splitKey: "online", label: t("financialOverview.moneyOutOnline"), tone: "text-status-critical" },
                  { flowKey: "moneyOut", splitKey: "total", label: t("financialOverview.moneyOutTotal"), tone: "text-status-critical" },
                ] as const
              ).map((row) => (
                <tr key={`${row.flowKey}-${row.splitKey}`} className="border-b border-border/60 last:border-0">
                  <td className="py-2.5 text-ink-secondary">{row.label}</td>
                  {PERIOD_COLUMNS.map((c) => (
                    <td key={c.key} className={cn("py-2.5 text-right font-semibold tabular-nums", row.splitKey === "total" ? row.tone : "text-ink-primary")}>
                      ₹{formatINR(overview[c.key][row.flowKey]?.[row.splitKey] ?? 0)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t("financialOverview.customDateRange")}</CardTitle>
        </CardHeader>
        <div className="flex flex-wrap items-end gap-2">
          <div>
            <label className="mb-1 block text-sm text-ink-muted">{t("financialOverview.from")}</label>
            <DateInput
              value={range.from}
              onChange={(e) => setRange((r) => ({ ...r, from: e.target.value }))}
              className={inputClass}
            />
          </div>
          <div>
            <label className="mb-1 block text-sm text-ink-muted">{t("financialOverview.to")}</label>
            <DateInput
              value={range.to}
              onChange={(e) => setRange((r) => ({ ...r, to: e.target.value }))}
              className={inputClass}
            />
          </div>
          <Button size="sm" onClick={viewCustomRange} disabled={!range.from || !range.to || customLoading}>
            <Search className="h-4 w-4" /> {t("financialOverview.viewReport")}
          </Button>
        </div>

        {customFlow && (
          <div className="mt-4">
            <FlowStatGrid flow={customFlow} />
          </div>
        )}
      </Card>
    </div>
  );
}
