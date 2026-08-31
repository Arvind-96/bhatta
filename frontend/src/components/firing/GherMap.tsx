import type { Gher, GherStatus } from "@/types";
import { cn } from "@/lib/utils";
import { useTranslation } from "@/hooks/useTranslation";

const STATUS_COLOR: Record<GherStatus, string> = {
  EMPTY: "var(--ink-muted)",
  STACKING: "var(--status-warning)",
  FIRING: "var(--status-serious)",
  READY: "var(--status-good)",
  UNLOADING: "var(--series-3)",
};

interface GherMapProps {
  ghers: Gher[];
  onAdvance: (gher: Gher) => void;
}

// A Bull's Trench Kiln is one big oval divided into chambers — this mirrors
// that shape directly instead of a generic grid/list, so an owner glancing
// at the dashboard sees the same layout they'd see walking the site.
export function GherMap({ ghers, onAdvance }: GherMapProps) {
  const { t } = useTranslation();
  const cx = 220;
  const cy = 130;
  const rx = 180;
  const ry = 95;
  const count = ghers.length;

  if (count === 0) {
    return (
      <p className="py-8 text-center text-sm text-ink-muted">
        {t("stacking.noChambersConfigured")}
      </p>
    );
  }

  return (
    <svg viewBox="0 0 440 260" className="w-full max-w-2xl">
      <ellipse cx={cx} cy={cy} rx={rx} ry={ry} fill="none" stroke="var(--gridline)" strokeWidth={2} />
      {ghers.map((gher, i) => {
        const angle = (i / count) * 2 * Math.PI - Math.PI / 2;
        const x = cx + rx * Math.cos(angle);
        const y = cy + ry * Math.sin(angle);
        return (
          <g
            key={gher._id}
            transform={`translate(${x}, ${y})`}
            className="cursor-pointer"
            onClick={() => onAdvance(gher)}
          >
            <circle r={15} fill={STATUS_COLOR[gher.status]} className={cn("transition-colors")} />
            <circle r={15} fill="none" stroke="var(--surface)" strokeWidth={2} />
            <text
              textAnchor="middle"
              dominantBaseline="central"
              fontSize={11}
              fontWeight={600}
              fill="#0b0b0b"
              style={{ pointerEvents: "none" }}
            >
              {gher.number}
            </text>
          </g>
        );
      })}
    </svg>
  );
}
