import { useTranslation } from "@/hooks/useTranslation";
import { cn } from "@/lib/utils";
import { REPORT_DEFINITIONS, REPORT_GROUP_LABEL_KEYS } from "@/lib/reportDefinitions";
import type { ReportGroup } from "@/types/reports";

interface ReportRailProps {
  selectedKey: string | null;
  onSelect: (key: string) => void;
}

const GROUP_ORDER: ReportGroup[] = ["production", "trade", "resources", "admin"];

// The left navigation for the report workspace — grouped exactly like the
// sidebar's own domain groups (Production / Trade & Billing / Resources /
// Admin), so 18 report types stay scannable instead of one flat list.
export function ReportRail({ selectedKey, onSelect }: ReportRailProps) {
  const { t } = useTranslation();

  return (
    <nav className="w-full space-y-4 lg:w-56 lg:flex-shrink-0">
      {GROUP_ORDER.map((group) => {
        const items = REPORT_DEFINITIONS.filter((d) => d.group === group);
        if (items.length === 0) return null;
        return (
          <div key={group}>
            <h5 className="mb-1.5 px-2 text-xs font-semibold uppercase tracking-wide text-ink-muted">{t(REPORT_GROUP_LABEL_KEYS[group])}</h5>
            <div className="space-y-0.5">
              {items.map((item) => (
                <button
                  key={item.key}
                  type="button"
                  onClick={() => onSelect(item.key)}
                  className={cn(
                    "block w-full rounded-lg px-2.5 py-1.5 text-left text-sm transition-colors",
                    selectedKey === item.key ? "bg-series-1/10 font-semibold text-series-1" : "text-ink-secondary hover:bg-ink-primary/5 hover:text-ink-primary"
                  )}
                >
                  {t(item.labelKey)}
                </button>
              ))}
            </div>
          </div>
        );
      })}
    </nav>
  );
}
