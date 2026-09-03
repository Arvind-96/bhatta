import { useEffect, useState } from "react";
import { Search } from "lucide-react";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { Pagination, usePagination } from "@/components/ui/pagination";
import { api } from "@/lib/api";
import { useKilnEvent } from "@/hooks/useKilnEvent";
import { useAuthStore } from "@/store/auth.store";
import { useTranslation } from "@/hooks/useTranslation";
import { cn } from "@/lib/utils";
import { GatePassDetailPage } from "@/components/dispatch/GatePassDetailPage";
import { resolveItemRows } from "@/lib/printDocument";
import type { BrickCategory, GatePassRecord } from "@/types";

const inputClass =
  "h-10 rounded-xl border border-border bg-ink-primary/5 px-3 text-sm text-ink-primary outline-none focus:ring-2 focus:ring-series-1";

// Every Gate Pass ever generated from a Dispatch's detail page (see
// CreateGatePassForm.tsx) — its own list now, independent of the Dispatch
// table itself. Sorted most-recent-first by the backend
// (listGatePasses orders desc(createdAt)). Live-synced via the same
// gatePass:update socket event DispatchDetailPage/GatePassDetailPage
// listen for, so an edit or delete from anywhere reflects here too.
export function GatePass() {
  const [entries, setEntries] = useState<GatePassRecord[]>([]);
  const [categories, setCategories] = useState<BrickCategory[]>([]);
  const [search, setSearch] = useState("");
  const [openId, setOpenId] = useState<string | null>(null);
  const activeKilnId = useAuthStore((s) => s.activeKilnId);
  const { t } = useTranslation();

  async function refresh() {
    const [entriesData, categoryData] = await Promise.all([api.gatePasses.list(), api.brickCategories.list()]);
    setEntries(entriesData);
    setCategories(categoryData);
  }

  useEffect(() => {
    if (!activeKilnId) return;
    refresh().catch(console.error);
  }, [activeKilnId]);

  useKilnEvent("gatePass:update", () => refresh());

  const filteredEntries = entries.filter((e) => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return (
      (e.sequenceNumber != null && String(e.sequenceNumber).includes(q)) ||
      e.customerName.toLowerCase().includes(q) ||
      (e.vehicleNumber ?? "").toLowerCase().includes(q) ||
      (e.driverName ?? "").toLowerCase().includes(q)
    );
  });
  const { page, setPage, pageCount, pageItems: pagedEntries, total } = usePagination(filteredEntries, 10);
  const openEntry = entries.find((e) => e._id === openId) ?? null;

  if (openEntry) {
    return <GatePassDetailPage gatePass={openEntry} categories={categories} onBack={() => setOpenId(null)} onDeleted={() => setOpenId(null)} />;
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("nav.gatePass")}</CardTitle>
      </CardHeader>
      <div className="relative mb-3">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-muted" />
        <input
          placeholder={t("dispatchDocs.searchGatePassesPlaceholder")}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className={cn(inputClass, "w-full max-w-sm pl-9")}
        />
      </div>
      {entries.length === 0 ? (
        <p className="py-8 text-center text-sm text-ink-muted">{t("dispatchDocs.noGatePassesYet")}</p>
      ) : filteredEntries.length === 0 ? (
        <p className="py-8 text-center text-sm text-ink-muted">{t("dispatchDocs.noMatchSearch")}</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-sm">
            <thead>
              <tr className="border-b border-border text-left text-sm text-ink-muted">
                <th className="pb-2 font-medium">{t("dispatchDocs.numberHeader")}</th>
                <th className="pb-2 font-medium">{t("common.date")}</th>
                <th className="pb-2 font-medium">{t("dispatch.customerHeader")}</th>
                <th className="pb-2 font-medium">{t("common.vehicle")}</th>
                <th className="pb-2 font-medium">{t("brickLoading.categoryHeader")}</th>
                <th className="pb-2 font-medium">{t("brickLoading.bricksHeader")}</th>
              </tr>
            </thead>
            <tbody>
              {pagedEntries.map((e) => {
                const itemRows = resolveItemRows(e.items, categories, { categoryId: e.categoryId, bricksCount: e.bricksCount });
                return (
                <tr key={e._id} onClick={() => setOpenId(e._id)} className="cursor-pointer border-b border-border/60 last:border-0 hover:bg-ink-primary/5">
                  <td className="py-3 text-ink-primary hover:underline">
                    <span className="flex items-center gap-2">
                      GP-{e.sequenceNumber ?? "—"}
                      {e.cancelled && (
                        <span className="rounded-full bg-ink-primary/10 px-2 py-0.5 text-xs font-semibold text-ink-muted">
                          {t("common.cancelledBadge")}
                        </span>
                      )}
                    </span>
                  </td>
                  <td className="py-3 text-ink-secondary">{e.gatePassDate ? new Date(e.gatePassDate).toLocaleDateString("en-IN") : "—"}</td>
                  <td className="py-3 text-ink-primary">{e.customerName}</td>
                  <td className="py-3 text-ink-secondary">{e.vehicleNumber ?? "—"}</td>
                  <td className="py-3 text-ink-secondary">
                    {itemRows.length > 1 ? t("brickLoading.multipleCategoriesLabel", { count: itemRows.length }) : itemRows[0]?.label ?? "—"}
                  </td>
                  <td className="py-3 tabular-nums text-ink-secondary">{e.bricksCount.toLocaleString("en-IN")}</td>
                </tr>
                );
              })}
            </tbody>
          </table>
          <Pagination page={page} pageCount={pageCount} onChange={setPage} total={total} pageSize={10} />
        </div>
      )}
    </Card>
  );
}
