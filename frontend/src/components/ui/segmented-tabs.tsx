import { cn } from "@/lib/utils";

export interface SegmentedTabOption<T extends string> {
  value: T;
  label: string;
}

interface SegmentedTabsProps<T extends string> {
  options: SegmentedTabOption<T>[];
  value: T;
  onChange: (value: T) => void;
  className?: string;
}

// The page-level "tab track" pattern used everywhere a page splits into a
// few top-level views (Labour/Thekedar/Staff/Other, Arrivals/Contracts,
// Dispatches/Loading, ...) — one shared component instead of the same
// markup hand-duplicated per page, so a design tweak here (like the focus
// ring below) lands everywhere at once instead of needing an eight-file
// sweep. It sets its own focus-visible ring rather than relying on the
// browser's default outline, which doesn't follow rounded-full corners and
// shows up as a squared-off box against a pill shape.
export function SegmentedTabs<T extends string>({ options, value, onChange, className }: SegmentedTabsProps<T>) {
  return (
    <div className={cn("inline-flex flex-wrap gap-1 rounded-full border border-border bg-surface p-1.5 shadow-sm", className)}>
      {options.map((opt) => (
        <button
          key={opt.value}
          type="button"
          onClick={() => onChange(opt.value)}
          className={cn(
            "rounded-full px-4 py-1.5 text-sm font-semibold transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-series-1 focus-visible:ring-offset-2 focus-visible:ring-offset-surface",
            value === opt.value
              ? "gradient-brand text-white shadow-glow-1"
              : "text-ink-secondary hover:bg-ink-primary/8 hover:text-ink-primary"
          )}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}
