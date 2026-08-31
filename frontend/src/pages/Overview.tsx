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
  Trash2,
  TrendingUp,
  Truck,
  Wallet,
  Zap,
} from "lucide-react";
import { StatCard } from "@/components/dashboard/StatCard";
import { PeriodStatCard } from "@/components/dashboard/PeriodStatCard";
import { ProductionChart } from "@/components/dashboard/ProductionChart";
import { StockOverview } from "@/components/dashboard/StockOverview";
import { StockCompositionDonut } from "@/components/dashboard/StockCompositionDonut";
import { LiveFeed } from "@/components/dashboard/LiveFeed";
import { LedgerModal } from "@/components/people/LedgerModal";
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
  useKilnEvent("invoice:update", () => refresh());

  if (!summary) return null;

  return (
    <Card>
      <div className="mb-3 flex items-center gap-2">
        <IndianRupee className="h-4 w-4 text-series-1" />
        <p className="text-sm font-medium text-ink-primary">{t("overview.financialSummary", { days: summary.days })}</p>
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
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
        <div>
          <p className="text-sm text-ink-muted">{t("overview.costPerBrick")}</p>
          <p className="text-lg font-semibold tabular-nums text-ink-primary">{summary.costPerBrick != null ? `₹${summary.costPerBrick}` : "—"}</p>
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
  const [ledgerFor, setLedgerFor] = useState<Person | null>(null);
  const activeKilnId = useAuthStore((s) => s.activeKilnId);
  const { t } = useTranslation();
  const personTypeMeta = usePersonTypeMeta();

  // "Delete" on a due row doesn't erase a single record — amountDue is a
  // live-computed balance across however many ledger entries make it up
  // (exactly the kind of stale/incorrect entry that needed cleaning up for
  // Pradeep@Pappu). So it opens that person's own ledger, where each entry
  // can be individually edited or deleted, same as everywhere else in the
  // app — never silently hides a real due amount without resolving it.
  async function openLedgerFor(personId: string) {
    const detail = await api.people.get(personId);
    setLedgerFor(detail.person);
  }

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
                  <div className="flex shrink-0 items-center gap-2">
                    <span className="font-semibold tabular-nums text-status-critical">
                      ₹{formatINR(d.amountDue)}
                    </span>
                    <button
                      type="button"
                      onClick={() => openLedgerFor(d.person.id)}
                      className="text-ink-muted hover:text-status-critical"
                      aria-label={t("overview.resolveDue", { name: d.person.name })}
                      title={t("overview.resolveDue", { name: d.person.name })}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
          {paymentsDue.length > 8 && (
            <p className="mt-2 text-[11px] text-ink-muted">{t("overview.moreCount", { count: paymentsDue.length - 8 })}</p>
          )}
        </Card>
      </div>

      {ledgerFor && <LedgerModal person={ledgerFor} onClose={() => setLedgerFor(null)} />}
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

// A brand banner at the top of the dashboard — the page used to drop
// straight into a grid of stat cards with no sense of place. Purely a
// visual/atmosphere element (the illustration is decorative); the two
// live numbers it shows (kiln name, today's bricks) are the exact same
// real values the stat-card grid below also renders, never invented.
function OverviewHero({ kilnName, dateLabel, todayBricks }: { kilnName: string; dateLabel: string; todayBricks: number }) {
  const { t } = useTranslation();
  return (
    <Card className="overflow-hidden">
      <div className="grid grid-cols-1 items-center gap-6 lg:grid-cols-[1.1fr_0.9fr]">
        <div>
          <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-ink-muted">{dateLabel}</p>
          <h2 className="h-gradient font-display text-2xl font-bold sm:text-3xl">{kilnName}</h2>
          <p className="mt-2 max-w-md text-sm text-ink-secondary">{t("overview.heroTagline")}</p>
          <div className="mt-4 flex items-center gap-2">
            <span className="flex h-2 w-2 rounded-full bg-[var(--neon)] shadow-[0_0_8px_var(--neon-glow)]" style={{ animation: "pulse-neon-soft 1.6s ease-in-out infinite" }} />
            <span className="text-xs font-semibold uppercase tracking-wide text-[var(--neon)]">{t("overview.heroLive")}</span>
            <span className="text-xs text-ink-muted">·</span>
            <span className="text-xs font-medium text-ink-secondary">
              {t("overview.heroBricksToday", { count: todayBricks.toLocaleString("en-IN") })}
            </span>
          </div>
        </div>

        <div className="relative mx-auto aspect-[16/10] w-full max-w-sm overflow-hidden rounded-2xl">
          <svg viewBox="0 0 420 280" width="100%" height="100%" preserveAspectRatio="xMidYMax slice" role="img" aria-hidden="true">
            <defs>
              <linearGradient id="ovSkyGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0" stopColor="var(--series-1)" stopOpacity=".16" />
                <stop offset="1" stopColor="var(--series-2)" stopOpacity=".04" />
              </linearGradient>
              <linearGradient id="ovGroundGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0" stopColor="var(--series-2)" stopOpacity=".14" />
                <stop offset="1" stopColor="var(--neon)" stopOpacity=".16" />
              </linearGradient>
              <linearGradient id="ovChimneyGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0" stopColor="var(--series-1)" />
                <stop offset="1" stopColor="#2a4d8f" />
              </linearGradient>
            </defs>
            <rect width="420" height="280" fill="url(#ovSkyGrad)" />
            <circle className="hero-glow" cx="352" cy="50" r="30" fill="var(--neon)" />
            <circle cx="352" cy="50" r="15" fill="var(--neon)" opacity=".55" />
            <path d="M0,196 Q120,168 210,190 T420,182 V280 H0 Z" fill="url(#ovGroundGrad)" />
            <g className="hero-smoke"><circle cx="118" cy="82" r="8" fill="var(--ink-muted)" opacity=".5" /></g>
            <g className="hero-smoke"><circle cx="122" cy="76" r="6" fill="var(--ink-muted)" opacity=".5" /></g>
            <g className="hero-smoke"><circle cx="114" cy="88" r="7" fill="var(--ink-muted)" opacity=".5" /></g>
            <g className="hero-smoke"><circle cx="120" cy="84" r="5" fill="var(--ink-muted)" opacity=".5" /></g>
            <rect x="104" y="90" width="28" height="88" rx="3" fill="url(#ovChimneyGrad)" />
            <rect x="98" y="174" width="40" height="14" rx="2" fill="#213a72" />
            <g opacity=".92">
              <rect x="150" y="208" width="34" height="16" rx="2" fill="var(--series-6)" />
              <rect x="150" y="190" width="34" height="16" rx="2" fill="var(--series-3)" />
              <rect x="188" y="208" width="34" height="16" rx="2" fill="var(--series-3)" />
              <rect x="188" y="190" width="34" height="16" rx="2" fill="var(--series-6)" />
              <rect x="226" y="208" width="34" height="16" rx="2" fill="var(--series-6)" />
            </g>
            <g className="hero-truck">
              <rect x="34" y="186" width="46" height="26" rx="3" fill="var(--series-2)" />
              <rect x="80" y="196" width="22" height="16" rx="2" fill="var(--neon)" />
              <rect x="84" y="199" width="14" height="8" rx="1" fill="#eaf9ff" />
              <circle cx="48" cy="216" r="6" fill="var(--ink-primary)" />
              <circle cx="90" cy="216" r="6" fill="var(--ink-primary)" />
            </g>
            <rect x="0" y="222" width="420" height="3" fill="var(--ink-primary)" opacity=".08" />
          </svg>
        </div>
      </div>
    </Card>
  );
}

export function Overview() {
  const todayBricks = useDashboardStore((s) => s.todayBricks);
  const stock = useDashboardStore((s) => s.stock);
  const productionSeries = useDashboardStore((s) => s.productionSeries);
  const { t } = useTranslation();
  const [dispatchTotals, setDispatchTotals] = useState<DispatchTotals | null>(null);
  const activeKilnId = useAuthStore((s) => s.activeKilnId);
  const kilns = useAuthStore((s) => s.kilns);
  const kiln = kilns.find((k) => k.kilnId === activeKilnId);

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
      <OverviewHero kilnName={kiln?.name ?? "Bhatta Cloud"} dateLabel={today} todayBricks={todayBricks} />

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
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <ProductionChart />
          <StockCompositionDonut />
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
