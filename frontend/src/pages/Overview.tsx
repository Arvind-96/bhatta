import { FormEvent, useEffect, useState } from "react";
import {
  AlertTriangle,
  Boxes,
  Flame,
  Fuel,
  IndianRupee,
  LineChart,
  type LucideIcon,
  Package,
  Plus,
  TrendingUp,
  Truck,
  Wallet,
  Zap,
} from "lucide-react";
import { StatCard } from "@/components/dashboard/StatCard";
import { PeriodStatCard } from "@/components/dashboard/PeriodStatCard";
import { ProductionChart } from "@/components/dashboard/ProductionChart";
import { StockOverview } from "@/components/dashboard/StockOverview";
import { LiveFeed } from "@/components/dashboard/LiveFeed";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { SegmentedTabs } from "@/components/ui/segmented-tabs";
import { useDashboardStore } from "@/store/dashboard.store";
import { useAuthStore } from "@/store/auth.store";
import { useTranslation } from "@/hooks/useTranslation";
import { useKilnEvent } from "@/hooks/useKilnEvent";
import { usePersonTypeMeta } from "@/components/people/personTypes";
import { api } from "@/lib/api";
import { cn, formatINR } from "@/lib/utils";
import { avatarToneClass, initialOf } from "@/lib/avatarTone";
import {
  type BrickCategory,
  type DashboardStockSummary,
  type DispatchTotals,
  type PaymentDue,
  type Person,
  type SeasonFinancialSummary,
} from "@/types";

const inputClass =
  "h-10 rounded-xl border border-border bg-ink-primary/5 px-3 text-sm text-ink-primary outline-none focus:ring-2 focus:ring-series-1";

function QuickEntry() {
  const [tab, setTab] = useState<"production" | "stock">("production");
  const [thekedars, setThekedars] = useState<Person[]>([]);
  const [prodForm, setProdForm] = useState({ batchNumber: "", bricksCount: "", qualityGrade: "A", thekedarId: "" });
  const [stockForm, setStockForm] = useState({ type: "FINISHED_GOODS" as "RAW_MATERIAL" | "FINISHED_GOODS", itemName: "", quantity: "" });
  const [loading, setLoading] = useState(false);
  const activeKilnId = useAuthStore((s) => s.activeKilnId);
  const { t } = useTranslation();

  useEffect(() => {
    if (!activeKilnId) return;
    api.people.list("THEKEDAR").then(setThekedars).catch(console.error);
  }, [activeKilnId]);

  async function submitProduction(e: FormEvent) {
    e.preventDefault();
    if (!prodForm.batchNumber || !prodForm.bricksCount) return;
    setLoading(true);
    try {
      await api.production.create({
        batchNumber: prodForm.batchNumber,
        bricksCount: Number(prodForm.bricksCount),
        qualityGrade: prodForm.qualityGrade,
        thekedarId: prodForm.thekedarId || undefined,
      });
      setProdForm({ batchNumber: "", bricksCount: "", qualityGrade: "A", thekedarId: "" });
    } finally {
      setLoading(false);
    }
  }

  async function submitStock(e: FormEvent) {
    e.preventDefault();
    if (!stockForm.itemName || !stockForm.quantity) return;
    setLoading(true);
    try {
      await api.stock.create({
        type: stockForm.type,
        itemName: stockForm.itemName,
        quantity: Number(stockForm.quantity),
      });
      setStockForm({ type: "FINISHED_GOODS", itemName: "", quantity: "" });
    } finally {
      setLoading(false);
    }
  }

  return (
    <Card>
      <SegmentedTabs
        className="mb-3"
        options={[
          { value: "production" as const, label: t("overview.logProduction") },
          { value: "stock" as const, label: t("overview.logStock") },
        ]}
        value={tab}
        onChange={setTab}
      />

      {tab === "production" ? (
        <form onSubmit={submitProduction} className="grid grid-cols-2 gap-2">
          <input
            required
            placeholder={t("overview.batchNumber")}
            value={prodForm.batchNumber}
            onChange={(e) => setProdForm((f) => ({ ...f, batchNumber: e.target.value }))}
            className={inputClass}
          />
          <input
            required
            type="number"
            placeholder={t("overview.bricksFired")}
            value={prodForm.bricksCount}
            onChange={(e) => setProdForm((f) => ({ ...f, bricksCount: e.target.value }))}
            className={inputClass}
          />
          <select
            value={prodForm.qualityGrade}
            onChange={(e) => setProdForm((f) => ({ ...f, qualityGrade: e.target.value }))}
            className={inputClass}
          >
            <option value="A">{t("overview.gradeA")}</option>
            <option value="B">{t("overview.gradeB")}</option>
          </select>
          <select
            value={prodForm.thekedarId}
            onChange={(e) => setProdForm((f) => ({ ...f, thekedarId: e.target.value }))}
            className={inputClass}
          >
            <option value="">{t("overview.noThekedarContract")}</option>
            {thekedars.map((t) => (
              <option key={t._id} value={t._id}>
                {t.name}
              </option>
            ))}
          </select>
          <Button type="submit" size="sm" disabled={loading} className="col-span-2">
            <Plus className="h-4 w-4" /> {t("overview.saveProduction")}
          </Button>
        </form>
      ) : (
        <form onSubmit={submitStock} className="grid grid-cols-2 gap-2">
          <select
            value={stockForm.type}
            onChange={(e) => setStockForm((f) => ({ ...f, type: e.target.value as typeof stockForm.type }))}
            className={cn(inputClass, "col-span-2")}
          >
            <option value="FINISHED_GOODS">{t("overview.finishedGoods")}</option>
            <option value="RAW_MATERIAL">{t("overview.rawMaterial")}</option>
          </select>
          <input
            required
            placeholder={t("overview.itemNamePlaceholder")}
            value={stockForm.itemName}
            onChange={(e) => setStockForm((f) => ({ ...f, itemName: e.target.value }))}
            className={inputClass}
          />
          <input
            required
            type="number"
            placeholder={t("overview.quantity")}
            value={stockForm.quantity}
            onChange={(e) => setStockForm((f) => ({ ...f, quantity: e.target.value }))}
            className={inputClass}
          />
          <Button type="submit" size="sm" disabled={loading} className="col-span-2">
            <Plus className="h-4 w-4" /> {t("overview.saveStockEntry")}
          </Button>
        </form>
      )}
    </Card>
  );
}

function SeasonSummaryCard() {
  const [summary, setSummary] = useState<SeasonFinancialSummary | null>(null);
  const activeKilnId = useAuthStore((s) => s.activeKilnId);
  const { t } = useTranslation();

  async function refresh() {
    setSummary(await api.financialReports.summary(90));
  }

  useEffect(() => {
    if (!activeKilnId) return;
    refresh().catch(console.error);
  }, [activeKilnId]);

  useKilnEvent("dispatch:update", () => refresh());
  useKilnEvent("expense:update", () => refresh());
  useKilnEvent("ledger:update", () => refresh());

  if (!summary) return null;

  return (
    <Card>
      <div className="mb-3 flex items-center gap-2">
        <IndianRupee className="h-4 w-4 text-series-1" />
        <p className="text-sm font-medium text-ink-primary">{t("overview.financialSummary", { days: summary.days })}</p>
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div>
          <p className="text-sm text-ink-muted">{t("overview.revenue")}</p>
          <p className="text-lg font-semibold tabular-nums text-ink-primary">₹{formatINR(summary.revenue)}</p>
        </div>
        <div>
          <p className="text-sm text-ink-muted">{t("overview.expenses")}</p>
          <p className="text-lg font-semibold tabular-nums text-ink-primary">₹{formatINR(summary.expenseCosts)}</p>
        </div>
        <div>
          <p className="text-sm text-ink-muted">{t("overview.labor")}</p>
          <p className="text-lg font-semibold tabular-nums text-ink-primary">₹{formatINR(summary.laborCosts)}</p>
        </div>
        <div>
          <p className="text-sm text-ink-muted">{t("overview.netProfit")}</p>
          <p className={cn("text-lg font-semibold tabular-nums", summary.netProfit >= 0 ? "text-status-good" : "text-status-critical")}>
            ₹{formatINR(summary.netProfit)}
          </p>
        </div>
      </div>
      <p className="mt-3 text-[11px] text-ink-muted">{t("overview.financialSummaryDisclaimer")}</p>
    </Card>
  );
}

function DashboardStockPanel() {
  const [stockSummary, setStockSummary] = useState<DashboardStockSummary | null>(null);
  const [brickCategories, setBrickCategories] = useState<BrickCategory[]>([]);
  const [fuelStock, setFuelStock] = useState<Record<string, number>>({});
  const [paymentsDue, setPaymentsDue] = useState<PaymentDue[]>([]);
  const activeKilnId = useAuthStore((s) => s.activeKilnId);
  const { t } = useTranslation();
  const personTypeMeta = usePersonTypeMeta();

  async function refresh() {
    const [summary, categories, fuel, dues] = await Promise.all([
      api.reconciliation.dashboardStock(),
      api.brickCategories.list(),
      api.fuelPurchases.stockBalance(),
      api.people.paymentsDue(),
    ]);
    setStockSummary(summary);
    setBrickCategories(categories);
    setFuelStock(fuel);
    setPaymentsDue(dues);
  }

  useEffect(() => {
    if (!activeKilnId) return;
    refresh().catch(console.error);
  }, [activeKilnId]);

  useKilnEvent("molding:update", () => refresh());
  useKilnEvent("stacking:update", () => refresh());
  useKilnEvent("nikasi:update", () => refresh());
  useKilnEvent("brickCategory:update", () => refresh());
  useKilnEvent("stockLoading:update", () => refresh());
  useKilnEvent("fuelPurchase:update", () => refresh());
  useKilnEvent("fuelLog:update", () => refresh());
  useKilnEvent("ledger:update", () => refresh());
  useKilnEvent("person:update", () => refresh());

  const firedBrickStock = brickCategories.reduce((sum, c) => sum + c.quantity, 0);
  const totalFuelStock = Object.values(fuelStock).reduce((sum, v) => sum + v, 0);
  const totalDuesAmount = paymentsDue.reduce((sum, d) => sum + d.amountDue, 0);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <PeriodStatCard
          label={t("overview.rawBrickStock")}
          value={stockSummary?.rawBrickStock ?? 0}
          subtitle={t("overview.moldedNotStacked")}
          icon={Package}
          tone="text-series-5"
        />
        <PeriodStatCard
          label={t("overview.firedStock")}
          value={firedBrickStock}
          subtitle={t("overview.acrossAllCategories")}
          icon={Boxes}
          tone="text-series-3"
        />
        <PeriodStatCard
          label={t("overview.totalDamage")}
          value={stockSummary?.totalDamage ?? 0}
          subtitle={t("overview.damageBreakdownSubtitle")}
          icon={AlertTriangle}
          critical={!!stockSummary && stockSummary.totalDamage > 0}
        />
        <PeriodStatCard
          label={t("overview.fuelStockAvailable")}
          value={Math.round(totalFuelStock)}
          subtitle={t("overview.fuelStockUnit")}
          icon={Fuel}
          tone="text-series-6"
        />
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-series-3/10">
                <Boxes className="h-4 w-4 text-series-3" />
              </div>
              <CardTitle>{t("overview.bricksByCategory")}</CardTitle>
            </div>
            <span className="text-sm font-semibold tabular-nums text-ink-primary">
              {firedBrickStock.toLocaleString("en-IN")}
            </span>
          </CardHeader>
          {brickCategories.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-8 text-center">
              <Boxes className="h-6 w-6 text-ink-muted/50" />
              <p className="text-sm text-ink-muted">{t("overview.noBrickCategoriesLogged")}</p>
            </div>
          ) : (
            <ul className="divide-y divide-border">
              {brickCategories.map((c) => (
                <li
                  key={c._id}
                  className="-mx-2 flex items-center justify-between rounded-lg px-2 py-2.5 text-sm transition-colors hover:bg-ink-primary/5"
                >
                  <span className="text-ink-secondary">{c.grade ? `${c.category} (${c.grade})` : c.category}</span>
                  <span className="font-semibold tabular-nums text-ink-primary">
                    {c.quantity.toLocaleString("en-IN")}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-status-critical/10">
                <Wallet className="h-4 w-4 text-status-critical" />
              </div>
              <CardTitle>{t("overview.whosePaymentDue")}</CardTitle>
            </div>
            <span className="text-sm font-semibold tabular-nums text-status-critical">
              ₹{formatINR(totalDuesAmount)}
            </span>
          </CardHeader>
          {paymentsDue.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-8 text-center">
              <Wallet className="h-6 w-6 text-ink-muted/50" />
              <p className="text-sm text-ink-muted">{t("overview.noPendingPayments")}</p>
            </div>
          ) : (
            <ul className="divide-y divide-border">
              {paymentsDue.slice(0, 8).map((d) => (
                <li
                  key={d.person.id}
                  className="-mx-2 flex items-center justify-between rounded-lg px-2 py-2.5 text-sm transition-colors hover:bg-ink-primary/5"
                >
                  <div className="flex items-center gap-2.5">
                    <span
                      className={cn(
                        "flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[11px] font-bold",
                        avatarToneClass(d.person.id)
                      )}
                    >
                      {initialOf(d.person.name)}
                    </span>
                    <span className="text-ink-secondary">{d.person.name}</span>
                    <span className="text-[11px] text-ink-muted">{personTypeMeta[d.person.type].label}</span>
                  </div>
                  <span className="font-semibold tabular-nums text-status-critical">
                    ₹{formatINR(d.amountDue)}
                  </span>
                </li>
              ))}
            </ul>
          )}
          {paymentsDue.length > 8 && (
            <p className="mt-2 text-[11px] text-ink-muted">{t("overview.moreCount", { count: paymentsDue.length - 8 })}</p>
          )}
        </Card>
      </div>
    </div>
  );
}

// A small uppercase caption above each dashboard section — the page is
// six-plus cards deep with no other visual grouping, so without these it
// reads as one long undifferentiated grid rather than "today's numbers,
// then stock, then trends, then quick actions."
function SectionHeading({ icon: Icon, title, trailing }: { icon: LucideIcon; title: string; trailing?: string }) {
  return (
    <div className="flex items-center justify-between px-0.5">
      <div className="flex items-center gap-2">
        <Icon className="h-3.5 w-3.5 text-series-1" />
        <h2 className="text-xs font-semibold uppercase tracking-wide text-ink-muted">{title}</h2>
      </div>
      {trailing && <span className="text-xs text-ink-muted">{trailing}</span>}
    </div>
  );
}

export function Overview() {
  const todayBricks = useDashboardStore((s) => s.todayBricks);
  const stock = useDashboardStore((s) => s.stock);
  const productionSeries = useDashboardStore((s) => s.productionSeries);
  const { t } = useTranslation();
  const [dispatchTotals, setDispatchTotals] = useState<DispatchTotals | null>(null);
  const activeKilnId = useAuthStore((s) => s.activeKilnId);

  useEffect(() => {
    if (!activeKilnId) return;
    api.dispatch.totals(7).then(setDispatchTotals).catch(console.error);
  }, [activeKilnId]);

  useKilnEvent("dispatch:update", () => {
    api.dispatch.totals(7).then(setDispatchTotals).catch(console.error);
  });

  const finishedGoods = stock.find((s) => s.itemName.toLowerCase().includes("brick"))?.quantity ?? 0;

  const avgDailyOutput =
    productionSeries.length > 0
      ? Math.round(productionSeries.reduce((sum, p) => sum + p.bricks, 0) / productionSeries.length)
      : 0;

  const yesterdayKey = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
  const yesterdayBricks = productionSeries.find((p) => p.date === yesterdayKey)?.bricks;
  const todayDelta =
    yesterdayBricks && yesterdayBricks > 0
      ? t("overview.vsYesterday", { percent: Math.round(((todayBricks - yesterdayBricks) / yesterdayBricks) * 100) })
      : undefined;

  const today = new Date().toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long" });

  return (
    <div className="space-y-7">
      <div className="space-y-3">
        <SectionHeading icon={Zap} title={t("overview.sectionTodayProduction")} trailing={today} />
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard
            label={t("overview.bricksToday")}
            value={todayBricks.toLocaleString("en-IN")}
            delta={todayDelta}
            deltaDirection={yesterdayBricks && todayBricks >= yesterdayBricks ? "up" : "down"}
            icon={Flame}
            tone="text-series-3"
          />
          <StatCard
            label={t("overview.finishedStock")}
            value={finishedGoods.toLocaleString("en-IN")}
            icon={Boxes}
            tone="text-series-6"
          />
          <StatCard
            label={t("overview.dispatched7d")}
            value={(dispatchTotals?.bricksCount ?? 0).toLocaleString("en-IN")}
            icon={Truck}
            tone="text-series-1"
          />
          <StatCard
            label={t("overview.avgDailyOutput")}
            value={avgDailyOutput.toLocaleString("en-IN")}
            icon={TrendingUp}
            tone="text-series-5"
          />
        </div>
      </div>

      <div className="space-y-3">
        <SectionHeading icon={Package} title={t("overview.sectionStockPayables")} trailing={t("overview.liveAllTimeTotals")} />
        <DashboardStockPanel />
      </div>

      <div className="space-y-3">
        <SectionHeading icon={LineChart} title={t("overview.sectionTrends")} />
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          <ProductionChart />
          <StockOverview />
        </div>
      </div>

      <SeasonSummaryCard />

      <div className="space-y-3">
        <SectionHeading icon={Plus} title={t("overview.sectionQuickActions")} />
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <QuickEntry />
          <LiveFeed />
        </div>
      </div>
    </div>
  );
}
