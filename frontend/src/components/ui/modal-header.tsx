import { X } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

// The richer "data-entry dialog" header from the design reference: a
// gradient banner bleeding to the card's own edge, a floating icon avatar
// overlapping it, then title/subtitle below — replacing the older plain
// icon-badge-and-title row every Add*Modal used to open with. Purely a
// visual header swap: every field, every piece of form state, and every
// submit/upload flow underneath stays exactly as it was. `accent` picks
// which of the app's two gradients paints the banner/avatar — "brand" for
// routine data entry, "accent2" for the rare highest-stakes create action.
export function ModalHeader({
  icon: Icon,
  title,
  subtitle,
  onClose,
  accent = "brand",
}: {
  icon: LucideIcon;
  title: string;
  subtitle: string;
  onClose: () => void;
  accent?: "brand" | "accent2";
}) {
  const gradientClass = accent === "accent2" ? "gradient-accent2" : "gradient-brand";
  return (
    <div className="-mx-6 -mt-6 mb-5">
      <div className={cn("relative h-14 animate-gradient-flow overflow-hidden bg-[length:200%_100%]", gradientClass)}>
        <svg className="absolute inset-0 h-full w-full opacity-15" viewBox="0 0 200 56" preserveAspectRatio="none" aria-hidden>
          <circle cx="20" cy="46" r="26" fill="#fff" />
          <circle cx="176" cy="8" r="34" fill="#fff" />
        </svg>
        <button
          type="button"
          onClick={onClose}
          className="absolute right-3 top-3 flex h-7 w-7 items-center justify-center rounded-lg bg-white/20 text-white backdrop-blur-sm transition-transform hover:rotate-90 hover:bg-white/30"
          aria-label="Close"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
      <div className="-mt-7 flex items-end gap-3 px-5">
        <span
          className={cn(
            "flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl border-[3px] border-surface text-white shadow-glow-1 bg-[length:200%_100%]",
            gradientClass
          )}
        >
          <Icon className="h-6 w-6" />
        </span>
      </div>
      <div className="px-5 pb-1 pt-2">
        <h3 className="text-sm font-semibold text-ink-primary">{title}</h3>
        <p className="text-sm text-ink-muted">{subtitle}</p>
      </div>
    </div>
  );
}
