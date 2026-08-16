import { cn } from "@/lib/utils";

export interface FilterChipOption<T extends string> {
  value: T;
  label: string;
}

interface FilterChipsProps<T extends string> {
  label?: string;
  options: FilterChipOption<T>[];
  value: T;
  onChange: (value: T) => void;
  className?: string;
}

// The one standalone filter-pill row used across Soil/People — as opposed
// to the segmented tab-track pattern (bg-surface p-1 container), these
// chips sit directly on the page/card background, so each one carries its
// own border + shadow to read as a distinct clickable pill rather than
// blending into the surface behind it. An optional `label` prefixes the
// group with a small caption so two filter facets sitting side by side
// (e.g. Soil's status + rate-type filters) don't visually run together.
export function FilterChips<T extends string>({ label, options, value, onChange, className }: FilterChipsProps<T>) {
  return (
    <div className={cn("flex flex-wrap items-center gap-1.5", className)}>
      {label && <span className="mr-0.5 text-[11px] font-semibold uppercase tracking-wide text-ink-muted">{label}</span>}
      {options.map((opt) => (
        <button
          key={opt.value}
          type="button"
          onClick={() => onChange(opt.value)}
          className={cn(
            "rounded-full border px-3 py-1.5 text-xs font-semibold transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-series-1 focus-visible:ring-offset-2 focus-visible:ring-offset-surface",
            value === opt.value
              ? "gradient-brand border-transparent text-white shadow-glow-1"
              : "border-ink-primary/15 bg-surface text-ink-secondary shadow-sm hover:border-ink-primary/30 hover:bg-ink-primary/5 hover:text-ink-primary hover:shadow"
          )}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}

// Visual separator between two independent filter groups sitting on the
// same row (e.g. "Status" vs "Rate" in Soil's Contracts tab) — bg-border
// alone is too faint (~14% opacity) to read as a divider on this app's
// light background, so this uses a stronger ink tint instead.
export function FilterDivider() {
  return <div className="hidden h-5 w-px shrink-0 bg-ink-primary/15 sm:block" aria-hidden />;
}
