import { LucideIcon } from "lucide-react";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

type SeriesTone = "text-series-1" | "text-series-2" | "text-series-3" | "text-series-4" | "text-series-5" | "text-series-6";

// Tailwind's JIT scanner needs each class spelled out literally somewhere
// in source, so the tone→chip-background mapping is an explicit table
// rather than a string transform of the tone prop (see StatCard.tsx).
const TONE_CHIP_BG: Record<SeriesTone, string> = {
  "text-series-1": "bg-series-1/15",
  "text-series-2": "bg-series-2/15",
  "text-series-3": "bg-series-3/15",
  "text-series-4": "bg-series-4/15",
  "text-series-5": "bg-series-5/15",
  "text-series-6": "bg-series-6/15",
};

interface PeriodStatCardProps {
  label: string;
  value: number;
  subtitle: string;
  icon: LucideIcon;
  tone?: SeriesTone;
  critical?: boolean;
}

// The "Today/Weekly/Monthly X" and "damage" stat rows used across the
// module pages (Molding, Nikasi, ...) — same icon-chip treatment as the
// dashboard's StatCard, so these read as a coherent, colorful set instead
// of six identical black numbers on plain cards.
export function PeriodStatCard({ label, value, subtitle, icon: Icon, tone = "text-series-1", critical }: PeriodStatCardProps) {
  return (
    <Card className={cn("animate-rise", critical && "border-status-critical/30")}>
      <CardHeader>
        <CardTitle>{label}</CardTitle>
        <div className={cn("flex h-9 w-9 items-center justify-center rounded-xl", critical ? "bg-status-critical/10" : TONE_CHIP_BG[tone])}>
          <Icon className={cn("h-4 w-4", critical ? "text-status-critical" : tone)} />
        </div>
      </CardHeader>
      <p className={cn("text-3xl font-semibold tabular-nums", critical ? "text-status-critical" : "text-ink-primary")}>
        {value.toLocaleString("en-IN")}
      </p>
      <p className="text-sm text-ink-muted">{subtitle}</p>
    </Card>
  );
}
