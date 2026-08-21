import { useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { useTranslation } from "@/hooks/useTranslation";
import { formatINR, cn } from "@/lib/utils";
import type { ContractorRollupGroup } from "@/types/reports";

function Money({ value, tone }: { value: number; tone?: "critical" | "good" }) {
  const cls = tone === "critical" ? "text-status-critical" : tone === "good" ? "text-status-good" : "text-ink-primary";
  return <span className={cn("tabular-nums font-medium", cls)}>₹{formatINR(value)}</span>;
}

// The "master view of a thekedar and all their laborers underneath,
// collapsible" view — one card per contractor, click to expand the gang.
// No existing accordion component in this app's library, so this is a
// plain useState-per-row expand/collapse.
export function ContractorGroupedTable({ groups }: { groups: ContractorRollupGroup[] }) {
  const { t } = useTranslation();
  const [openId, setOpenId] = useState<string | null>(null);

  if (groups.length === 0) {
    return <p className="py-10 text-center text-sm text-ink-muted">{t("reports.workspace.noData")}</p>;
  }

  return (
    <div className="space-y-2">
      {groups.map((g) => {
        const open = openId === g.contractorId;
        return (
          <div key={g.contractorId} className="rounded-xl border border-border">
            <button
              type="button"
              onClick={() => setOpenId(open ? null : g.contractorId)}
              className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left"
            >
              <div className="flex items-center gap-2">
                {open ? <ChevronDown className="h-4 w-4 text-ink-muted" /> : <ChevronRight className="h-4 w-4 text-ink-muted" />}
                <div>
                  <p className="text-sm font-semibold text-ink-primary">{g.contractorName}</p>
                  <p className="text-xs text-ink-muted">
                    {g.laborerCount} {t("reports.col.person")} · {g.bricksCount.toLocaleString("en-IN")} {t("reports.col.bricksCount")}
                    {g.damagedCount > 0 ? ` · ${g.damagedCount.toLocaleString("en-IN")} ${t("reports.col.damagedCount")}` : ""}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-4 text-sm">
                <div className="text-right">
                  <p className="text-xs text-ink-muted">{t("reports.col.netAmount")}</p>
                  <Money value={g.netAmount} tone={g.netAmount > 0 ? "critical" : g.netAmount < 0 ? "good" : undefined} />
                </div>
              </div>
            </button>
            {open && (
              <div className="border-t border-border">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-ink-muted">
                      <th className="px-4 py-2 font-medium">{t("reports.col.person")}</th>
                      <th className="px-4 py-2 text-right font-medium">{t("reports.col.dueAmount")}</th>
                      <th className="px-4 py-2 text-right font-medium">{t("reports.col.paidAmount")}</th>
                      <th className="px-4 py-2 text-right font-medium">{t("reports.col.netAmount")}</th>
                      <th className="px-4 py-2 text-right font-medium">{t("reports.col.bricksCount")}</th>
                      <th className="px-4 py-2 text-right font-medium">{t("reports.col.damagedCount")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {g.laborers.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="px-4 py-3 text-center text-ink-muted">
                          {t("reports.workspace.noData")}
                        </td>
                      </tr>
                    ) : (
                      g.laborers.map((l) => (
                        <tr key={l.personId} className="border-t border-border/60">
                          <td className="px-4 py-2 text-ink-secondary">{l.name}</td>
                          <td className="px-4 py-2 text-right tabular-nums text-ink-secondary">₹{formatINR(l.totalDue)}</td>
                          <td className="px-4 py-2 text-right tabular-nums text-ink-secondary">₹{formatINR(l.totalPaid)}</td>
                          <td className="px-4 py-2 text-right">
                            <Money value={l.netAmount} tone={l.netAmount > 0 ? "critical" : l.netAmount < 0 ? "good" : undefined} />
                          </td>
                          <td className="px-4 py-2 text-right tabular-nums text-ink-secondary">{l.bricksCount.toLocaleString("en-IN")}</td>
                          <td className="px-4 py-2 text-right tabular-nums text-ink-secondary">{l.damagedCount || "—"}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
