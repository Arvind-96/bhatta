import { ReactNode } from "react";
import { TrendingDown, TrendingUp } from "lucide-react";
import { cn } from "@/lib/utils";

// The "Bhatta Ledger" redesign's instrument-cluster stat treatment —
// several related figures shown as one joined gauge strip (label above,
// big mono number below, a hairline rule between each) instead of a row
// of separate boxed cards. Deliberately a NEW component rather than a
// restyle of StatCard/PeriodStatCard: those two are also used by
// Molding.tsx/Nikasi.tsx, which the redesign wasn't asked to restructure
// — this only touches the three flagship pages (Overview, Financial
// Overview, Reports) that were.
export function GaugeStrip({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn("grid grid-cols-2 divide-y divide-border sm:grid-cols-2 sm:divide-y-0 sm:divide-x lg:grid-cols-4", className)}>{children}</div>;
}

export function Gauge({
  label,
  value,
  unit,
  subtitle,
  delta,
  deltaDirection,
  tone,
}: {
  label: string;
  value: string;
  unit?: string;
  subtitle?: string;
  delta?: string;
  deltaDirection?: "up" | "down" | "flat";
  tone?: "critical" | "warning" | "good";
}) {
  return (
    <div className="flex flex-col gap-1.5 px-4 py-3 first:pl-0">
      <span className="font-display text-[11px] font-semibold uppercase tracking-wider text-ink-muted">{label}</span>
      <span className="flex items-baseline gap-2">
        <span
          className={cn(
            "font-mono text-2xl font-semibold tabular-nums",
            tone === "critical" ? "text-status-critical" : tone === "warning" ? "text-status-warning" : tone === "good" ? "text-status-good" : "text-ink-primary"
          )}
        >
          {value}
          {unit && <span className="ml-1 text-sm font-normal text-ink-muted">{unit}</span>}
        </span>
        {delta && (
          <span
            className={cn(
              "inline-flex items-center gap-0.5 text-xs font-semibold",
              deltaDirection === "up" && "text-status-good",
              deltaDirection === "down" && "text-status-critical",
              (!deltaDirection || deltaDirection === "flat") && "text-ink-muted"
            )}
          >
            {deltaDirection === "up" && <TrendingUp className="h-3 w-3" />}
            {deltaDirection === "down" && <TrendingDown className="h-3 w-3" />}
            {delta}
          </span>
        )}
      </span>
      {subtitle && <span className="text-xs text-ink-muted">{subtitle}</span>}
    </div>
  );
}
