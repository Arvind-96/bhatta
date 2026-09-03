import { Check } from "lucide-react";
import { useTranslation } from "@/hooks/useTranslation";

// A deliberate trust device, not decoration: this app's whole engagement
// history has been about the same rupee figure showing differently on
// Overview, Financial Overview, and Reports. Placed next to a headline
// total on all three pages as a quiet, consistent signal that this
// specific number is the one already cross-checked to match everywhere
// else it appears — never shown next to a figure that hasn't actually
// been verified against the others (see each page's own call site).
export function MatchedStamp() {
  const { t } = useTranslation();
  return (
    <span
      className="inline-flex -rotate-2 items-center gap-1.5 rounded border-[1.5px] border-status-good px-2.5 py-1 font-display text-[11px] font-extrabold uppercase tracking-wider text-status-good"
      title={t("overview.matchedStampTooltip")}
    >
      <Check className="h-3 w-3" strokeWidth={3} />
      {t("overview.matchedStamp")}
    </span>
  );
}
