import { useEffect, useState } from "react";
import { Search } from "lucide-react";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { Pagination, usePagination } from "@/components/ui/pagination";
import { api } from "@/lib/api";
import { useKilnEvent } from "@/hooks/useKilnEvent";
import { useAuthStore } from "@/store/auth.store";
import { useTranslation } from "@/hooks/useTranslation";
import { cn } from "@/lib/utils";
import { ChallanDetailPage } from "@/components/dispatch/ChallanDetailPage";
import type { BrickCategory, Challan as ChallanEntry } from "@/types";

const inputClass =
  "h-10 rounded-xl border border-border bg-ink-primary/5 px-3 text-sm text-ink-primary outline-none focus:ring-2 focus:ring-series-1";

function categoryLabelFor(categoryId: string | undefined, categories: BrickCategory[]) {
  if (!categoryId) return "—";
  const c = categories.find((cat) => cat._id === categoryId);
  if (!c) return "—";
  return c.grade ? `${c.category} (${c.grade})` : c.category;
}

// Every Challan (delivery note, no pricing) ever generated from a
// Dispatch's detail page — its own list, live-synced via the same
// challan:update socket event DispatchDetailPage/ChallanDetailPage
// listen for. See GatePass.tsx for the identical page shape this mirrors.
export function Challan() {
  const [entries, setEntries] = useState<ChallanEntry[]>([]);
  const [categories, setCategories] = useState<BrickCategory[]>([]);
  const [search, setSearch] = useState("");
  const [openId, setOpenId] = useState<string | null>(null);
  const activeKilnId = useAuthStore((s) => s.activeKilnId);
  const { t } = useTranslation();

  async function refresh() {
    const [entriesData, categoryData] = await Promise.all([api.challans.list(), api.brickCategories.list()]);
    setEntries(entriesData);
    setCategories(categoryData);
  }

  useEffect(() => {
    if (!activeKilnId) return;
    refresh().catch(console.error);
  }, [activeKilnId]);

  useKilnEvent("challan:update", () => refresh());

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
    return <ChallanDetailPage challan={openEntry} categories={categories} onBack={() => setOpenId(null)} onDeleted={() => setOpenId(null)} />;
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("nav.challan")}</CardTitle>
      </CardHeader>
      <div className="relative mb-3">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-muted" />
        <input
          placeholder={t("dispatchDocs.searchChallansPlaceholder")}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className={cn(inputClass, "w-full max-w-sm pl-9")}
        />
      </div>
      {entries.length === 0 ? (
        <p className="py-8 text-center text-sm text-ink-muted">{t("dispatchDocs.noChallansYet")}</p>
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
              {pagedEntries.map((e) => (
                <tr key={e._id} onClick={() => setOpenId(e._id)} className="cursor-pointer border-b border-border/60 last:border-0 hover:bg-ink-primary/5">
                  <td className="py-3 text-ink-primary hover:underline">CH-{e.sequenceNumber ?? "—"}</td>
                  <td className="py-3 text-ink-secondary">{e.challanDate ? new Date(e.challanDate).toLocaleDateString("en-IN") : "—"}</td>
                  <td className="py-3 text-ink-primary">{e.customerName}</td>
                  <td className="py-3 text-ink-secondary">{e.vehicleNumber ?? "—"}</td>
                  <td className="py-3 text-ink-secondary">{categoryLabelFor(e.categoryId, categories)}</td>
                  <td className="py-3 tabular-nums text-ink-secondary">{e.bricksCount.toLocaleString("en-IN")}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <Pagination page={page} pageCount={pageCount} onChange={setPage} total={total} pageSize={10} />
        </div>
      )}
    </Card>
  );
}
