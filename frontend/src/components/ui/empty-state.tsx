import { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

interface EmptyStateProps {
  icon: LucideIcon;
  title: string;
  className?: string;
}

// A plain centered line of gray text reads as unfinished, not "nothing here
// yet" — this pairs the message with a tinted icon chip so an empty list
// still looks like a considered part of the page instead of a placeholder.
export function EmptyState({ icon: Icon, title, className }: EmptyStateProps) {
  return (
    <div className={cn("flex flex-col items-center gap-3 py-12 text-center", className)}>
      <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-series-1/10 text-series-1">
        <Icon className="h-6 w-6" />
      </span>
      <p className="text-sm font-medium text-ink-secondary">{title}</p>
    </div>
  );
}
