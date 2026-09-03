import { Check } from "lucide-react";
import { useTranslation } from "@/hooks/useTranslation";

// A deliberate trust device, not decoration: this app's whole engagement
// history has been about revenue figures that didn't reconcile across
// pages. Placed next to a headline total on Overview/Financial Overview/
// Reports as a quiet signal that THIS figure was computed with the
// verified formula (cash + online + due always sums to the bill) rather
// than a separate, possibly-drifting calculation — not a claim that the
// number is numerically identical to what another page shows, since
// Overview's own summary window (90 days) and Financial Overview's
// Today/Week/Month/Year columns are legitimately different periods by
// design. Only ever placed next to a figure that's actually been traced
// through this session's own reconciliation work — see each page's call
// site.
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
