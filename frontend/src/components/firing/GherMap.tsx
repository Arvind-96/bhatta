import type { Gher, GherStatus } from "@/types";
import { cn } from "@/lib/utils";
import { useTranslation } from "@/hooks/useTranslation";

export const STATUS_COLOR: Record<GherStatus, string> = {
  EMPTY: "var(--ink-muted)",
  STACKING: "var(--status-warning)",
  FIRING: "var(--status-serious)",
  READY: "var(--status-good)",
  UNLOADING: "var(--series-3)",
};

interface GherMapProps {
  ghers: Gher[];
  selectedId: string;
  onSelect: (gher: Gher) => void;
}

// A responsive grid of chamber tiles — one per kiln chamber, colored by
// status. Previously this rendered as fixed-radius circles placed at equal
// angle steps around a fixed-size oval, which mathematically overlapped
// even at the default 24-chamber setup (fixed-size circles + a
// fixed-size ellipse fight any chamber count beyond a handful) and got
// dramatically worse up to the supported max of 200. A CSS grid has no
// such ceiling — it simply wraps to more rows as the chamber count grows,
// so it stays legible from a handful of chambers up to 200.
// Clicking a tile SELECTS it (shows its detail panel below, where the
// admin can see its status and choose to advance it, log activity against
// it, etc.) rather than silently advancing its status on a stray click.
export function GherMap({ ghers, selectedId, onSelect }: GherMapProps) {
  const { t } = useTranslation();

  if (ghers.length === 0) {
    return (
      <p className="py-8 text-center text-sm text-ink-muted">
        {t("stacking.noChambersConfigured")}
      </p>
    );
  }

  // A fixed white label (below) reads reliably against every one of the 5
  // status colors in both light and dark theme — the near-black this used
  // to be had poor contrast against the new palette's darker, more
  // saturated light-mode status colors (e.g. status-good's #2f6b45).
  return (
    <div className="grid w-full grid-cols-[repeat(auto-fill,minmax(3rem,1fr))] gap-2">
      {ghers.map((gher) => (
        <button
          key={gher._id}
          type="button"
          onClick={() => onSelect(gher)}
          title={t("firing.gherNumberStatus", { number: gher.number, status: gher.status })}
          className={cn(
            "flex aspect-square items-center justify-center rounded-lg text-xs font-semibold transition-all hover:-translate-y-0.5",
            selectedId === gher._id ? "ring-2 ring-series-1 ring-offset-2 ring-offset-surface" : ""
          )}
          style={{ background: STATUS_COLOR[gher.status], color: "#fff" }}
        >
          {gher.number}
        </button>
      ))}
    </div>
  );
}
