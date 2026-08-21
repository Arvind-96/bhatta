import { useEffect, useState } from "react";
import { DateInput } from "@/components/ui/date-input";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { useTranslation } from "@/hooks/useTranslation";
import { usePersonTypeMeta, PERSON_TYPES } from "@/components/people/personTypes";
import { cn } from "@/lib/utils";
import type { ReportDefinitionMeta, ReportGroupBy, ReportRunParams } from "@/types/reports";
import type { Customer, ExpenseType, KilnVehicle, Person } from "@/types";

const selectClass =
  "h-10 rounded-xl border border-border bg-ink-primary/5 px-3 text-sm text-ink-primary outline-none focus:ring-2 focus:ring-series-1";

type Preset = "today" | "thisWeek" | "thisMonth" | "thisQuarter" | "thisYear" | "custom";

function pad(n: number) {
  return String(n).padStart(2, "0");
}
function toLocalISODate(d: Date) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function presetRange(preset: Exclude<Preset, "custom">): { from: string; to: string } {
  const now = new Date();
  const to = toLocalISODate(now);
  if (preset === "today") return { from: to, to };
  if (preset === "thisWeek") {
    const day = now.getDay() || 7;
    const monday = new Date(now);
    monday.setDate(now.getDate() - day + 1);
    return { from: toLocalISODate(monday), to };
  }
  if (preset === "thisMonth") {
    const first = new Date(now.getFullYear(), now.getMonth(), 1);
    return { from: toLocalISODate(first), to };
  }
  if (preset === "thisQuarter") {
    const q = Math.floor(now.getMonth() / 3);
    const first = new Date(now.getFullYear(), q * 3, 1);
    return { from: toLocalISODate(first), to };
  }
  const first = new Date(now.getFullYear(), 0, 1);
  return { from: toLocalISODate(first), to };
}

const GROUP_BY_OPTIONS: ReportGroupBy[] = ["none", "day", "week", "month", "quarter", "year"];

interface ReportFilterBarProps {
  definition: ReportDefinitionMeta;
  params: ReportRunParams;
  onChange: (params: ReportRunParams) => void;
  onGenerate: () => void;
  loading: boolean;
  people: Person[];
  customers: Customer[];
  vehicles: KilnVehicle[];
  expenseTypes: ExpenseType[];
}

// Renders exactly the filter widgets a report needs: date range + preset
// chips + groupBy are available to every report; the rest are a small
// closed set of shared widgets (person/personType/customer/vehicle/driver/
// expenseCategory) switched on by definition.filters.
export function ReportFilterBar({ definition, params, onChange, onGenerate, loading, people, customers, vehicles, expenseTypes }: ReportFilterBarProps) {
  const { t } = useTranslation();
  const personTypeMeta = usePersonTypeMeta();
  const [preset, setPreset] = useState<Preset>("thisMonth");

  // Pre-fill a sensible default range as soon as a report is selected, so
  // "Generate" works immediately without the admin having to touch a date
  // field first.
  useEffect(() => {
    onChange({ ...params, ...presetRange("thisMonth") });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function applyPreset(p: Preset) {
    setPreset(p);
    if (p !== "custom") onChange({ ...params, ...presetRange(p) });
  }

  const drivers = people.filter((p) => p.type === "DRIVER");

  return (
    <div className="space-y-3 rounded-2xl border border-border bg-ink-primary/[0.02] p-4">
      <div className="flex flex-wrap gap-1.5">
        {(["today", "thisWeek", "thisMonth", "thisQuarter", "thisYear", "custom"] as Preset[]).map((p) => (
          <button
            key={p}
            type="button"
            onClick={() => applyPreset(p)}
            className={cn(
              "rounded-full px-3 py-1 text-xs font-semibold transition-colors",
              preset === p ? "gradient-brand text-white" : "border border-border text-ink-secondary hover:bg-ink-primary/5"
            )}
          >
            {t(`reports.preset.${p}`)}
          </button>
        ))}
      </div>

      <div className="flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1">
          <span className="text-xs text-ink-muted">{t("reports.filter.dateFrom")}</span>
          <DateInput
            value={params.from ?? ""}
            onChange={(e) => {
              setPreset("custom");
              onChange({ ...params, from: e.target.value });
            }}
            className={selectClass}
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-xs text-ink-muted">{t("reports.filter.dateTo")}</span>
          <DateInput
            value={params.to ?? ""}
            onChange={(e) => {
              setPreset("custom");
              onChange({ ...params, to: e.target.value });
            }}
            className={selectClass}
          />
        </label>

        <label className="flex flex-col gap-1">
          <span className="text-xs text-ink-muted">{t("reports.filter.groupBy")}</span>
          <select
            value={params.groupBy ?? "none"}
            onChange={(e) => onChange({ ...params, groupBy: e.target.value as ReportGroupBy })}
            className={selectClass}
          >
            {GROUP_BY_OPTIONS.map((g) => (
              <option key={g} value={g}>
                {t(`reports.groupBy.${g}`)}
              </option>
            ))}
          </select>
        </label>

        {definition.filters.includes("personType") && (
          <label className="flex flex-col gap-1">
            <span className="text-xs text-ink-muted">{t("reports.filter.personType")}</span>
            <select
              value={params.personType ?? ""}
              onChange={(e) => onChange({ ...params, personType: e.target.value || undefined })}
              className={selectClass}
            >
              <option value="">{t("reports.filter.all")}</option>
              {PERSON_TYPES.map((pt) => (
                <option key={pt} value={pt}>
                  {personTypeMeta[pt].label}
                </option>
              ))}
            </select>
          </label>
        )}

        {definition.filters.includes("person") && (
          <label className="flex min-w-[220px] flex-col gap-1">
            <span className="text-xs text-ink-muted">{t("reports.filter.person")}</span>
            <SearchableSelect
              value={params.personId ?? ""}
              onChange={(v) => onChange({ ...params, personId: v || undefined })}
              options={people.map((p) => ({ value: p._id, label: p.name, sublabel: personTypeMeta[p.type]?.label }))}
              placeholder={t("reports.filter.all")}
            />
          </label>
        )}

        {definition.filters.includes("customer") && (
          <label className="flex min-w-[220px] flex-col gap-1">
            <span className="text-xs text-ink-muted">{t("reports.filter.customer")}</span>
            <SearchableSelect
              value={params.customerId ?? ""}
              onChange={(v) => onChange({ ...params, customerId: v || undefined })}
              options={customers.map((c) => ({ value: c._id, label: c.name }))}
              placeholder={t("reports.filter.all")}
            />
          </label>
        )}

        {definition.filters.includes("vehicle") && (
          <label className="flex min-w-[200px] flex-col gap-1">
            <span className="text-xs text-ink-muted">{t("reports.filter.vehicle")}</span>
            <SearchableSelect
              value={params.vehicleId ?? ""}
              onChange={(v) => onChange({ ...params, vehicleId: v || undefined })}
              options={vehicles.map((v) => ({ value: v._id, label: v.name, sublabel: v.type }))}
              placeholder={t("reports.filter.all")}
            />
          </label>
        )}

        {definition.filters.includes("driver") && (
          <label className="flex min-w-[200px] flex-col gap-1">
            <span className="text-xs text-ink-muted">{t("reports.filter.driver")}</span>
            <SearchableSelect
              value={params.driverId ?? ""}
              onChange={(v) => onChange({ ...params, driverId: v || undefined })}
              options={drivers.map((p) => ({ value: p._id, label: p.name, sublabel: p.phone ?? undefined }))}
              placeholder={t("reports.filter.all")}
            />
          </label>
        )}

        {definition.filters.includes("expenseCategory") && (
          <label className="flex min-w-[200px] flex-col gap-1">
            <span className="text-xs text-ink-muted">{t("reports.filter.expenseCategory")}</span>
            <SearchableSelect
              value={params.category ?? ""}
              onChange={(v) => onChange({ ...params, category: v || undefined })}
              options={expenseTypes.map((et) => ({ value: et._id, label: et.name }))}
              placeholder={t("reports.filter.all")}
            />
          </label>
        )}

        <button
          type="button"
          onClick={onGenerate}
          disabled={loading}
          className="ml-auto h-10 rounded-xl bg-gradient-to-r from-series-1 to-series-2 px-5 text-sm font-semibold text-white shadow-glow-1 transition-opacity disabled:opacity-60"
        >
          {t("reports.action.generate")}
        </button>
      </div>
    </div>
  );
}
