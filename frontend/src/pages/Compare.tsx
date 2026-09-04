import { useEffect, useRef, useState } from "react";
import {
  PieChart, Boxes, Hammer, Layers, ArrowDownToLine, Thermometer, PackagePlus, PackageCheck,
  Truck, Car, Fuel, Wallet, Warehouse, CalendarCheck, Banknote, Users, ArrowLeftRight, CalendarRange,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { DateInput } from "@/components/ui/date-input";
import { api } from "@/lib/api";
import { useAuthStore, type UserSeason } from "@/store/auth.store";
import { useTranslation } from "@/hooks/useTranslation";
import { cn, formatINR } from "@/lib/utils";
import type { CompareModule, SeasonYearResult } from "@/types";

const MODULES: CompareModule[] = [
  "financial", "bricks", "molding", "stacking", "nikasi", "firing", "brickLoading",
  "dispatch", "soil", "diesel", "fuel", "expense", "stock", "attendance", "salary", "labor",
];

// Same icon-per-concept choices used on the Sidebar (Molding=Hammer,
// Stacking=Layers, Firing=Thermometer, ...) so a module reads as the same
// "thing" wherever it shows up in the app. Tones cycle through the 6-color
// series palette purely for scannability across a 16-item chip grid — not
// tied to Sidebar's own per-item tone assignment.
const MODULE_ICON: Record<CompareModule, typeof PieChart> = {
  financial: PieChart, bricks: Boxes, molding: Hammer, stacking: Layers,
  nikasi: ArrowDownToLine, firing: Thermometer, brickLoading: PackagePlus,
  dispatch: PackageCheck, soil: Truck, diesel: Car, fuel: Fuel, expense: Wallet,
  stock: Warehouse, attendance: CalendarCheck, salary: Banknote, labor: Users,
};
type SeriesTone = "series-1" | "series-2" | "series-3" | "series-4" | "series-5" | "series-6";
const TONES: SeriesTone[] = ["series-1", "series-2", "series-3", "series-4", "series-5", "series-6"];
const CHIP_ACTIVE_BG: Record<SeriesTone, string> = {
  "series-1": "bg-series-1", "series-2": "bg-series-2", "series-3": "bg-series-3",
  "series-4": "bg-series-4", "series-5": "bg-series-5", "series-6": "bg-series-6",
};
const CHIP_ACTIVE_GLOW: Record<SeriesTone, string> = {
  "series-1": "shadow-glow-1", "series-2": "shadow-glow-2", "series-3": "shadow-glow-3",
  "series-4": "shadow-glow-4", "series-5": "shadow-glow-5", "series-6": "shadow-glow-6",
};
const CHIP_IDLE_TINT: Record<SeriesTone, string> = {
  "series-1": "bg-series-1/10 text-series-1", "series-2": "bg-series-2/10 text-series-2",
  "series-3": "bg-series-3/10 text-series-3", "series-4": "bg-series-4/10 text-series-4",
  "series-5": "bg-series-5/10 text-series-5", "series-6": "bg-series-6/10 text-series-6",
};

// Metric keys whose values are rupee amounts (formatted with ₹ + Indian
// grouping) rather than plain counts (formatted with just the grouping).
const CURRENCY_KEYS = new Set([
  "moneyReceived", "moneySpent", "netCashFlow", "fuelExpense", "dieselExpense",
  "dispatchRevenue", "amount", "totalCost", "totalTips", "totalBonusAmount",
  "totalAmount", "totalGrossSalary", "totalDeductions", "totalNetSalary",
  "totalWagesDue", "totalPaidOut", "netOutstandingChange",
]);

function formatMetricValue(key: string, value: number) {
  return CURRENCY_KEYS.has(key) ? `₹${formatINR(value)}` : value.toLocaleString("en-IN");
}

function pad2(n: number) {
  return String(n).padStart(2, "0");
}
// "YYYY-MM-DD" in LOCAL time — what <input type="date"> expects/emits.
// toISOString() would shift by the timezone offset and can land on the
// wrong calendar day.
function toDateInputValue(d: Date) {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

interface DateRangeValue {
  from: string; // YYYY-MM-DD
  to: string; // YYYY-MM-DD
}

// Default the two range pickers to "this Bhatta Season vs the one before
// it" — real admin-set season boundaries (Settings' season switcher), not
// a fixed Aug1-Jul31 calendar anchor. The admin can still pick any other
// pair of dates freely afterward.
function seasonDateRange(seasons: UserSeason[], season: UserSeason): DateRangeValue {
  // The end of a season is the day before whichever later season (by
  // startDate) began — or today, if nothing started after it yet (it's
  // still the open, current one).
  const later = seasons
    .filter((s) => new Date(s.startDate).getTime() > new Date(season.startDate).getTime())
    .sort((a, b) => new Date(a.startDate).getTime() - new Date(b.startDate).getTime())[0];
  const to = later ? new Date(new Date(later.startDate).getTime() - 24 * 60 * 60 * 1000) : new Date();
  return { from: toDateInputValue(new Date(season.startDate)), to: toDateInputValue(to) };
}

// Fewer than 2 real seasons exist yet (a brand new kiln, still on "Season
// 1") — fall back to two trailing 365-day windows back to back so the two
// pickers still default to something comparable instead of one empty range.
function trailingYearRanges(reference = new Date()): [DateRangeValue, DateRangeValue] {
  const oneYearAgo = new Date(reference);
  oneYearAgo.setDate(oneYearAgo.getDate() - 365);
  const twoYearsAgo = new Date(reference);
  twoYearsAgo.setDate(twoYearsAgo.getDate() - 730);
  const dayBeforeOneYearAgo = new Date(oneYearAgo);
  dayBeforeOneYearAgo.setDate(dayBeforeOneYearAgo.getDate() - 1);
  return [
    { from: toDateInputValue(twoYearsAgo), to: toDateInputValue(dayBeforeOneYearAgo) },
    { from: toDateInputValue(oneYearAgo), to: toDateInputValue(reference) },
  ];
}

function defaultRanges(seasons: UserSeason[]): [DateRangeValue, DateRangeValue] {
  const sorted = [...seasons].sort((a, b) => new Date(b.startDate).getTime() - new Date(a.startDate).getTime());
  const current = sorted.find((s) => s.isCurrent) ?? sorted[0];
  const previous = sorted.find((s) => s._id !== current?._id);
  if (!current || !previous) return trailingYearRanges();
  return [seasonDateRange(seasons, previous), seasonDateRange(seasons, current)];
}

function formatRangeLabel(fromIso: string, toIso: string) {
  const fmt = (s: string) => new Date(s).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
  return `${fmt(fromIso)} – ${fmt(toIso)}`;
}

// A labeled pair of native date inputs — clicking either opens the
// browser's own calendar picker. Replaces the earlier year-only stepper so
// the admin can compare any two arbitrary periods, not just fixed
// Aug1-Jul31 seasons.
function RangePicker({ label, value, onChange }: { label: string; value: DateRangeValue; onChange: (v: DateRangeValue) => void }) {
  const { t } = useTranslation();
  return (
    <div className="flex-1 min-w-[240px] rounded-xl border border-border bg-ink-primary/5 p-3">
      <div className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-ink-muted">
        <CalendarRange className="h-3.5 w-3.5" />
        {label}
      </div>
      <div className="flex items-center gap-2">
        <DateInput
          value={value.from}
          onChange={(e) => onChange({ ...value, from: e.target.value })}
          className="h-9 min-w-0 flex-1 rounded-lg border border-border bg-surface px-2 text-sm text-ink-primary outline-none focus:ring-2 focus:ring-series-1"
          aria-label={t("compare.from")}
        />
        <span className="shrink-0 text-xs text-ink-muted">{t("compare.to")}</span>
        <DateInput
          value={value.to}
          onChange={(e) => onChange({ ...value, to: e.target.value })}
          className="h-9 min-w-0 flex-1 rounded-lg border border-border bg-surface px-2 text-sm text-ink-primary outline-none focus:ring-2 focus:ring-series-1"
          aria-label={t("compare.to")}
        />
      </div>
    </div>
  );
}

// Compares kiln data across two admin-picked date ranges, one module at a
// time — every module the app tracks, per the client's explicit ask, not
// a curated subset. Each module's headline metrics come from
// backend/src/services/compare.service.ts. The two range pickers default
// to "this Bhatta Season vs the one before it" but accept any dates.
export function Compare() {
  const { t } = useTranslation();
  const activeKilnId = useAuthStore((s) => s.activeKilnId);
  const seasons = useAuthStore((s) => s.seasons);

  const [module, setModule] = useState<CompareModule>("financial");
  const [rangeA, setRangeA] = useState<DateRangeValue>(() => trailingYearRanges()[0]);
  const [rangeB, setRangeB] = useState<DateRangeValue>(() => trailingYearRanges()[1]);
  const [results, setResults] = useState<SeasonYearResult[] | null>(null);
  const [loading, setLoading] = useState(false);
  // Bug fix: a fetch failure used to fall through to the exact same "No
  // data" copy as a genuinely empty range — .catch(console.error) left no
  // visible trace, and a stale result from the last successful fetch could
  // stay on screen with nothing indicating it was now out of date.
  const [loadError, setLoadError] = useState("");
  const defaulted = useRef(false);

  // Seasons load asynchronously (Dashboard's own effect) after this page
  // has already mounted with the trailing-365-days fallback above — once
  // real season data actually arrives, re-seed the two pickers from it,
  // but only the very first time so a later re-render never clobbers
  // whatever ranges the admin has since picked themselves.
  useEffect(() => {
    if (defaulted.current || seasons.length === 0) return;
    defaulted.current = true;
    const [a, b] = defaultRanges(seasons);
    setRangeA(a);
    setRangeB(b);
  }, [seasons]);

  const validRange = !!rangeA.from && !!rangeA.to && !!rangeB.from && !!rangeB.to && rangeA.from <= rangeA.to && rangeB.from <= rangeB.to;

  useEffect(() => {
    if (!activeKilnId || !validRange) return;
    setLoading(true);
    setLoadError("");
    api.compare
      .get(module, rangeA, rangeB)
      .then((r) => {
        setResults(r);
        setLoadError("");
      })
      .catch((err) => {
        setResults(null);
        setLoadError(err instanceof Error ? err.message : t("common.somethingWentWrong"));
      })
      .finally(() => setLoading(false));
  }, [activeKilnId, module, rangeA.from, rangeA.to, rangeB.from, rangeB.to, validRange]);

  // Row order = the first range's own metric key order, restricted to
  // plain numbers — a nested breakdown (e.g. expense.byCategory) isn't a
  // single comparable headline figure, so it's left out of this table.
  const metricKeys = results?.[0] ? Object.keys(results[0].metrics).filter((k) => typeof results[0].metrics[k] === "number") : [];

  return (
    <div className="space-y-4">
      <Card>
        <h4 className="mb-1 text-xs font-semibold uppercase tracking-wide text-ink-muted">{t("compare.heading")}</h4>
        <p className="mb-4 text-sm text-ink-muted">{t("compare.description")}</p>

        <div className="mb-5 flex flex-wrap gap-2">
          {MODULES.map((m, i) => {
            const Icon = MODULE_ICON[m];
            const tone = TONES[i % TONES.length];
            const active = module === m;
            return (
              <button
                key={m}
                type="button"
                onClick={() => setModule(m)}
                className={cn(
                  "inline-flex items-center gap-2 rounded-xl border px-3 py-2 text-sm font-semibold transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-series-1 focus-visible:ring-offset-2 focus-visible:ring-offset-surface",
                  active
                    ? cn("border-transparent text-white", CHIP_ACTIVE_BG[tone], CHIP_ACTIVE_GLOW[tone])
                    : "border-border bg-surface text-ink-secondary hover:border-ink-primary/15 hover:text-ink-primary"
                )}
              >
                <span className={cn("flex h-5 w-5 shrink-0 items-center justify-center rounded-md", active ? "bg-white/20" : CHIP_IDLE_TINT[tone])}>
                  <Icon className={cn("h-3 w-3", active ? "text-white" : "")} />
                </span>
                {t(`compare.module.${m}`)}
              </button>
            );
          })}
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <RangePicker label={t("compare.seasonYearA")} value={rangeA} onChange={setRangeA} />
          <button
            type="button"
            onClick={() => {
              setRangeA(rangeB);
              setRangeB(rangeA);
            }}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-border bg-surface text-ink-muted transition-colors hover:border-series-1/40 hover:text-series-1"
            aria-label={t("compare.swapSeasons")}
            title={t("compare.swapSeasons")}
          >
            <ArrowLeftRight className="h-4 w-4" />
          </button>
          <RangePicker label={t("compare.seasonYearB")} value={rangeB} onChange={setRangeB} />
        </div>
        {!validRange && <p className="mt-2 text-sm text-status-critical">{t("compare.invalidRange")}</p>}
      </Card>

      <Card>
        {module === "salary" && (
          <p className="mb-3 rounded-lg bg-ink-primary/5 px-3 py-2 text-xs text-ink-muted">{t("compare.salaryAccrualHint")}</p>
        )}
        {loading ? (
          <p className="py-8 text-center text-sm text-ink-muted">{t("compare.loading")}</p>
        ) : loadError ? (
          <p className="py-8 text-center text-sm text-status-critical">{loadError}</p>
        ) : !results || metricKeys.length === 0 ? (
          <p className="py-8 text-center text-sm text-ink-muted">{t("compare.noData")}</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[560px] text-sm">
              <thead>
                <tr className="border-b border-border text-left text-sm text-ink-muted">
                  <th className="pb-2 font-medium">{t("compare.metric")}</th>
                  {results.map((r) => (
                    <th key={r.from} className="pb-2 font-medium text-right">
                      <div className="flex flex-col items-end gap-1">
                        <span>{formatRangeLabel(r.from, r.to)}</span>
                        {r.inProgress && <Badge variant="warning">{t("compare.inProgress")}</Badge>}
                      </div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {metricKeys.map((key) => (
                  <tr key={key} className="border-b border-border/60 last:border-0">
                    <td className="py-2.5 text-ink-secondary">{t(`compare.metric.${key}`)}</td>
                    {results.map((r) => {
                      const value = r.metrics[key] as number;
                      const isNegative = value < 0;
                      return (
                        <td
                          key={r.from}
                          className={cn("py-2.5 text-right font-semibold tabular-nums text-ink-primary", isNegative && "text-status-critical")}
                        >
                          {formatMetricValue(key, value)}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
