import { useEffect, useState } from "react";
import { Printer } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Pagination, usePagination } from "@/components/ui/pagination";
import { api } from "@/lib/api";
import { useKilnEvent } from "@/hooks/useKilnEvent";
import { useAuthStore } from "@/store/auth.store";
import { useTranslation } from "@/hooks/useTranslation";
import { printGatePass } from "@/lib/printDocument";
import type { Dispatch as DispatchEntry } from "@/types";

// Every truck/tractor that's loaded and dispatched already gets a slip
// number (GP-…) the moment it's recorded on the Dispatch page — this
// screen is purely the issuing/printing counter for that same record, so
// the gate pass a driver walks out with can never disagree with what
// Dispatch has on file.
export function GatePass() {
  const [dispatches, setDispatches] = useState<DispatchEntry[]>([]);
  const kilns = useAuthStore((s) => s.kilns);
  const activeKilnId = useAuthStore((s) => s.activeKilnId);
  const kilnName = kilns.find((k) => k.kilnId === activeKilnId)?.name ?? "Bhatta Cloud";
  const { t } = useTranslation();
  const { page, setPage, pageCount, pageItems: pagedDispatches, total } = usePagination(dispatches, 10);
  const GRADE_LABELS: Record<string, string> = {
    A1: t("gatePass.gradeA1"),
    JHAMA: t("gatePass.gradeJhama"),
    PELA: t("gatePass.gradePela"),
  };

  async function refresh() {
    setDispatches(await api.dispatch.list(60));
  }

  useEffect(() => {
    if (!activeKilnId) return;
    refresh().catch(console.error);
  }, [activeKilnId]);

  useKilnEvent("dispatch:update", () => refresh());

  return (
    <div className="space-y-4">
      <Card>
        <h4 className="mb-1 text-xs font-semibold uppercase tracking-wide text-ink-muted">{t("gatePass.heading")}</h4>
        <p className="text-sm text-ink-muted">{t("gatePass.description")}</p>
      </Card>

      <Card>
        {dispatches.length === 0 ? (
          <p className="py-8 text-center text-sm text-ink-muted">{t("gatePass.noDispatches60Days")}</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-sm">
              <thead>
                <tr className="border-b border-border text-left text-sm text-ink-muted">
                  <th className="pb-2 font-medium">{t("gatePass.slipHeader")}</th>
                  <th className="pb-2 font-medium">{t("common.date")}</th>
                  <th className="pb-2 font-medium">{t("gatePass.vehicleOwnerCustomerHeader")}</th>
                  <th className="pb-2 font-medium">{t("common.driver")}</th>
                  <th className="pb-2 font-medium">{t("gatePass.gradeHeader")}</th>
                  <th className="pb-2 font-medium">{t("gatePass.bricksHeader")}</th>
                  <th className="pb-2 font-medium" />
                </tr>
              </thead>
              <tbody>
                {pagedDispatches.map((d) => (
                  <tr key={d._id} className="border-b border-border/60 last:border-0 hover:bg-ink-primary/5">
                    <td className="py-3 text-ink-primary">{d.slipNumber}</td>
                    <td className="py-3 text-ink-secondary">{new Date(d.dispatchedOn).toLocaleDateString("en-IN")}</td>
                    <td className="py-3 text-ink-secondary">{d.customerName}</td>
                    <td className="py-3 text-ink-secondary">{typeof d.driverId === "object" ? d.driverId?.name ?? "—" : "—"}</td>
                    <td className="py-3">
                      <Badge variant="neutral">{GRADE_LABELS[d.grade] ?? d.grade}</Badge>
                    </td>
                    <td className="py-3 tabular-nums text-ink-secondary">{d.bricksCount.toLocaleString("en-IN")}</td>
                    <td className="py-3 text-right">
                      <button
                        onClick={() => printGatePass(d, kilnName)}
                        className="flex items-center gap-1 text-xs font-medium text-series-1 hover:underline"
                      >
                        <Printer className="h-3.5 w-3.5" /> {t("common.print")}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <Pagination page={page} pageCount={pageCount} onChange={setPage} total={total} pageSize={10} />
          </div>
        )}
      </Card>
    </div>
  );
}
