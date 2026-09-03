import { useEffect, useState } from "react";
import { PieChart, RefreshCw, Search, Wallet } from "lucide-react";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Gauge, GaugeStrip } from "@/components/dashboard/GaugeStrip";
import { MatchedStamp } from "@/components/dashboard/MatchedStamp";
import { MoneyInOutChart } from "@/components/dashboard/MoneyInOutChart";
import { PaymentMixDonut } from "@/components/dashboard/PaymentMixDonut";
import { SpendingByCategoryBar } from "@/components/dashboard/SpendingByCategoryBar";
import { NetMarginGauge } from "@/components/dashboard/NetMarginGauge";
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
    <Card>
      <GaugeStrip className="lg:grid-cols-3">
        <Gauge
          label={t("financialOverview.moneyReceived")}
          value={`₹${formatINR(flow.moneyReceived)}`}
          subtitle={t("financialOverview.moneyReceivedSubtitle")}
        />
        <Gauge
          label={t("financialOverview.moneySpent")}
          value={`₹${formatINR(flow.moneySpent)}`}
          subtitle={t("financialOverview.moneySpentSubtitle")}
          tone={flow.moneySpent > flow.moneyReceived ? "critical" : undefined}
        />
        <Gauge
          label={t("financialOverview.netCashFlow")}
          value={`₹${formatINR(flow.netCashFlow)}`}
          subtitle={flow.netCashFlow >= 0 ? t("financialOverview.surplus") : t("financialOverview.deficit")}
          tone={flow.netCashFlow < 0 ? "critical" : "good"}
        />
        <Gauge label={t("financialOverview.bricksSold")} value={flow.bricksSold.toLocaleString("en-IN")} subtitle={t("financialOverview.bricksSoldSubtitle")} />
        <Gauge label={t("financialOverview.fuelExpense")} value={`₹${formatINR(flow.fuelExpense)}`} subtitle={t("financialOverview.fuelExpenseSubtitle")} />
        <Gauge label={t("financialOverview.dieselExpense")} value={`₹${formatINR(flow.dieselExpense)}`} subtitle={t("financialOverview.dieselExpenseSubtitle")} />
      </GaugeStrip>
    </Card>
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
  const [refreshing, setRefreshing] = useState(false);
  const activeKilnId = useAuthStore((s) => s.activeKilnId);

  async function refresh() {
    setOverview(await api.financialOverview.get());
  }

  async function manualRefresh() {
    setRefreshing(true);
    try {
      await refresh();
    } finally {
      setRefreshing(false);
    }
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
  useKilnEvent("invoice:update", () => refresh());

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
      <div className="flex justify-end">
        <Button variant="outline" size="sm" onClick={manualRefresh} disabled={refreshing}>
          <RefreshCw className={cn("h-3.5 w-3.5", refreshing && "animate-spin")} /> {t("common.refresh")}
        </Button>
      </div>

      <Card>
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3 border-b border-border pb-4">
          <div className="flex items-center gap-2">
            <Wallet className="h-4 w-4 text-series-1" />
            <p className="text-sm font-medium text-ink-primary">{t("financialOverview.moneyInHeadline")}</p>
          </div>
          <MatchedStamp />
        </div>
        <div className="mb-4">
          <span className="font-display text-[11px] font-semibold uppercase tracking-wider text-ink-muted">{t("financialOverview.thisYear")}</span>
          <p className="font-mono text-4xl font-semibold tabular-nums text-series-1">₹{formatINR(overview.year.moneyReceived)}</p>
          <p className="mt-1 text-xs text-ink-muted">{t("financialOverview.moneyInHeadlineHint")}</p>
        </div>
        <GaugeStrip className="border-t border-border sm:grid-cols-2 lg:grid-cols-2">
          <Gauge
            label={t("financialOverview.currentDues")}
            value={`₹${formatINR(overview.totalDues)}`}
            subtitle={t("financialOverview.currentDuesSubtitle")}
            tone={overview.totalDues > 0 ? "critical" : undefined}
          />
          <Gauge
            label={t("financialOverview.outstandingFromClients")}
            value={`₹${formatINR(overview.totalOutstandingFromClients)}`}
            subtitle={t("financialOverview.outstandingFromClientsSubtitle")}
            tone={overview.totalOutstandingFromClients > 0 ? "critical" : undefined}
          />
        </GaugeStrip>
      </Card>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <MoneyInOutChart overview={overview} />
        <PaymentMixDonut overview={overview} />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_auto]">
        <SpendingByCategoryBar overview={overview} />
        <NetMarginGauge overview={overview} />
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
              <tr className="border-b-2 border-border text-left">
                <th className="pb-2 font-display text-[11px] font-semibold uppercase tracking-wider text-ink-muted">{t("financialOverview.metric")}</th>
                {PERIOD_COLUMNS.map((c) => (
                  <th key={c.key} className="pb-2 text-right font-display text-[11px] font-semibold uppercase tracking-wider text-ink-muted">
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
                          "py-2.5 text-right font-mono font-semibold tabular-nums",
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
              <tr className="border-b-2 border-border text-left">
                <th className="pb-2 font-display text-[11px] font-semibold uppercase tracking-wider text-ink-muted">{t("financialOverview.metric")}</th>
                {PERIOD_COLUMNS.map((c) => (
                  <th key={c.key} className="pb-2 text-right font-display text-[11px] font-semibold uppercase tracking-wider text-ink-muted">
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
                  { flowKey: "moneyIn", splitKey: "unspecified", label: t("financialOverview.moneyInUnspecified"), tone: "text-ink-muted" },
                  { flowKey: "moneyIn", splitKey: "total", label: t("financialOverview.moneyInTotal"), tone: "text-status-good" },
                  { flowKey: "moneyOut", splitKey: "cash", label: t("financialOverview.moneyOutCash"), tone: "text-status-critical" },
                  { flowKey: "moneyOut", splitKey: "online", label: t("financialOverview.moneyOutOnline"), tone: "text-status-critical" },
                  { flowKey: "moneyOut", splitKey: "unspecified", label: t("financialOverview.moneyOutUnspecified"), tone: "text-ink-muted" },
                  { flowKey: "moneyOut", splitKey: "total", label: t("financialOverview.moneyOutTotal"), tone: "text-status-critical" },
                ] as const
              ).map((row) => (
                <tr
                  key={`${row.flowKey}-${row.splitKey}`}
                  className={cn("border-b border-border/60 last:border-0", row.splitKey === "total" && "border-t-2 border-t-border")}
                >
                  <td className={cn("py-2.5", row.splitKey === "total" ? "font-semibold text-ink-primary" : "text-ink-secondary")}>{row.label}</td>
                  {PERIOD_COLUMNS.map((c) => (
                    <td
                      key={c.key}
                      className={cn(
                        "py-2.5 text-right font-mono tabular-nums",
                        row.splitKey === "total" ? cn("font-bold", row.tone) : "font-semibold text-ink-primary"
                      )}
                    >
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
