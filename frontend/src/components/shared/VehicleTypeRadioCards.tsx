import { cn } from "@/lib/utils";
import { useTranslation } from "@/hooks/useTranslation";
import type { BrickVehicleType } from "@/types";

// Click-to-select cards replacing a plain <select> for the one choice
// that actually benefits from it (exactly two, mutually-exclusive,
// visually distinct options) — same controlled value/onChange contract
// as a native select, so it drops straight into existing form state.
export function VehicleTypeRadioCards({
  value,
  onChange,
  className,
}: {
  value: BrickVehicleType;
  onChange: (value: BrickVehicleType) => void;
  className?: string;
}) {
  const { t } = useTranslation();
  const options: { value: BrickVehicleType; emoji: string; label: string; hint: string }[] = [
    { value: "TRUCK", emoji: "🚚", label: t("brickLoading.truck"), hint: t("brickLoading.vehicleTypeTruckHint") },
    { value: "TRACTOR", emoji: "🚜", label: t("brickLoading.tractor"), hint: t("brickLoading.vehicleTypeTractorHint") },
  ];

  return (
    <div className={cn("grid grid-cols-2 gap-2", className)}>
      {options.map((opt) => {
        const selected = value === opt.value;
        return (
          <button
            key={opt.value}
            type="button"
            onClick={() => onChange(opt.value)}
            aria-pressed={selected}
            className={cn(
              "relative flex flex-col gap-1 rounded-xl border px-3 py-2.5 text-left transition-all",
              selected
                ? "border-series-1 bg-series-1/10 shadow-[0_0_0_3px_rgba(59,108,246,0.12)]"
                : "border-border bg-ink-primary/[0.03] hover:border-series-1/40"
            )}
          >
            <span
              className={cn(
                "absolute right-2.5 top-2.5 h-4 w-4 rounded-full border",
                selected ? "border-series-1 bg-series-1" : "border-border"
              )}
            >
              {selected && <span className="absolute inset-0 m-auto h-1.5 w-1.5 rounded-full bg-white" />}
            </span>
            <span className="text-lg leading-none">{opt.emoji}</span>
            <span className="text-sm font-semibold text-ink-primary">{opt.label}</span>
            <span className="text-xs text-ink-muted">{opt.hint}</span>
          </button>
        );
      })}
    </div>
  );
}
