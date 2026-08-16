import { LucideIcon, TrendingDown, TrendingUp } from "lucide-react";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

type SeriesTone = "text-series-1" | "text-series-2" | "text-series-3" | "text-series-4" | "text-series-5" | "text-series-6";

// Tailwind's JIT scanner needs each class spelled out literally somewhere
// in source, so the tone→chip-background mapping is an explicit table
// rather than a string transform of the tone prop.
const TONE_CHIP_BG: Record<SeriesTone, string> = {
  "text-series-1": "bg-series-1/15",
  "text-series-2": "bg-series-2/15",
  "text-series-3": "bg-series-3/15",
  "text-series-4": "bg-series-4/15",
  "text-series-5": "bg-series-5/15",
  "text-series-6": "bg-series-6/15",
};

interface StatCardProps {
  label: string;
  value: string;
  delta?: string;
  deltaDirection?: "up" | "down" | "flat";
  icon: LucideIcon;
  tone?: SeriesTone;
}

// tone defaults to series-1 for any lone/one-off stat card, but the
// dashboard's top row passes a distinct tone per card (same cycled-palette
// convention Sidebar.tsx uses) so the first thing anyone sees isn't four
// identical indigo chips in a row. The icon chip is tinted with that same
// tone (instead of flat gray) so the color-cycling actually reads as color,
// not just a monochrome icon on an otherwise identical card.
export function StatCard({ label, value, delta, deltaDirection = "flat", icon: Icon, tone = "text-series-1" }: StatCardProps) {
  return (
    <Card className="flex animate-rise flex-col gap-3">
      <div className="flex items-center justify-between">
        <span className="text-sm text-ink-secondary">{label}</span>
        <div className={cn("flex h-9 w-9 items-center justify-center rounded-xl", TONE_CHIP_BG[tone])}>
          <Icon className={cn("h-4 w-4", tone)} />
        </div>
      </div>
      <div className="flex items-baseline gap-2">
        <span className="text-3xl font-semibold tabular-nums text-ink-primary">{value}</span>
        {delta && (
          <span
            className={cn(
              "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold",
              deltaDirection === "up" && "bg-status-good/10 text-status-good",
              deltaDirection === "down" && "bg-status-critical/10 text-status-critical",
              deltaDirection === "flat" && "bg-ink-primary/5 text-ink-muted"
            )}
          >
            {deltaDirection === "up" && <TrendingUp className="h-3 w-3" />}
            {deltaDirection === "down" && <TrendingDown className="h-3 w-3" />}
            {delta}
          </span>
        )}
      </div>
    </Card>
  );
}
