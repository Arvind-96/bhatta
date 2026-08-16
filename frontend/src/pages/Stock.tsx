import { FormEvent, useEffect, useState } from "react";
import { Plus, Trash2, Pencil, PackageMinus } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { SegmentedTabs } from "@/components/ui/segmented-tabs";
import { Pagination, usePagination } from "@/components/ui/pagination";
import { cn } from "@/lib/utils";
import { api } from "@/lib/api";
import { useKilnEvent } from "@/hooks/useKilnEvent";
import { useAuthStore } from "@/store/auth.store";
import { useTranslation } from "@/hooks/useTranslation";
import { DieselSection } from "@/components/stock/DieselSection";
import { BRICK_CATEGORIES, BRICK_CATEGORY_LABELS } from "@/types";
import type { BrickCategory, BrickCategoryName, BrickProductionEntry, StockLoadingEntry } from "@/types";

const inputClass =
  "h-10 rounded-xl border border-border bg-ink-primary/5 px-3 text-sm text-ink-primary outline-none focus:ring-2 focus:ring-series-1";

function categoryLabel(categories: BrickCategory[], ref: { _id: string; category: BrickCategoryName } | string) {
  if (typeof ref === "object") return BRICK_CATEGORY_LABELS[ref.category];
  const found = categories.find((c) => c._id === ref);
  return found ? BRICK_CATEGORY_LABELS[found.category] : "—";
}

// The Stock menu — an admin-managed brick-category ledger, independent of
// ChamberGrading's own A-1/Jhama/Pela/Roda breakdown. Admin opts categories
// in/out of tracking, logs today's production (adds to stock) and loading
// out (deducts from stock), and can always directly correct a category's
// stock figure by hand — same "manual override always available" rule as
// the Inventory page.
function BrickStockSection() {
  const { t } = useTranslation();
  const [categories, setCategories] = useState<BrickCategory[]>([]);
  const [productionHistory, setProductionHistory] = useState<BrickProductionEntry[]>([]);
  const [loadingHistory, setLoadingHistory] = useState<StockLoadingEntry[]>([]);

  const [showAddCategory, setShowAddCategory] = useState(false);
  const [newCategory, setNewCategory] = useState<"" | BrickCategoryName>("");
  const [savingCategory, setSavingCategory] = useState(false);

  const [editingCategoryId, setEditingCategoryId] = useState<string | null>(null);
  const [editQuantity, setEditQuantity] = useState("");
  const [savingQuantity, setSavingQuantity] = useState(false);

  const [productionForm, setProductionForm] = useState({ categoryId: "", bricksCount: "", notes: "" });
  const [savingProduction, setSavingProduction] = useState(false);

  const [loadingForm, setLoadingForm] = useState({ categoryId: "", bricksCount: "", notes: "" });
  const [savingLoading, setSavingLoading] = useState(false);

  const activeKilnId = useAuthStore((s) => s.activeKilnId);

  async function refresh() {
    const [categoriesData, production, loading] = await Promise.all([
      api.brickCategories.list(),
      api.brickCategories.listProduction(),
      api.brickCategories.listLoading(),
    ]);
    setCategories(categoriesData);
    setProductionHistory(production);
    setLoadingHistory(loading);
  }

  useEffect(() => {
    if (!activeKilnId) return;
    refresh().catch(console.error);
  }, [activeKilnId]);

  useKilnEvent("brickCategory:update", () => refresh());
  useKilnEvent("brickProduction:update", () => refresh());
  useKilnEvent("stockLoading:update", () => refresh());

  const availableCategories = BRICK_CATEGORIES.filter((c) => !categories.some((bc) => bc.category === c));
  const productionPg = usePagination(productionHistory, 10);
  const loadingPg = usePagination(loadingHistory, 10);

  async function addCategory(e: FormEvent) {
    e.preventDefault();
    if (!newCategory) return;
    setSavingCategory(true);
    try {
      await api.brickCategories.create(newCategory);
      setNewCategory("");
      setShowAddCategory(false);
      await refresh();
    } finally {
      setSavingCategory(false);
    }
  }

  async function deleteCategory(category: BrickCategory) {
    if (!confirm(t("stock.confirmRemoveCategory", { name: BRICK_CATEGORY_LABELS[category.category] })))
      return;
    await api.brickCategories.remove(category._id);
    await refresh();
  }

  function startEditQuantity(category: BrickCategory) {
    setEditingCategoryId(category._id);
    setEditQuantity(String(category.quantity));
  }

  async function saveQuantity(e: FormEvent) {
    e.preventDefault();
    if (!editingCategoryId) return;
    setSavingQuantity(true);
    try {
      await api.brickCategories.updateQuantity(editingCategoryId, Number(editQuantity));
      setEditingCategoryId(null);
      await refresh();
    } finally {
      setSavingQuantity(false);
    }
  }

  async function logProduction(e: FormEvent) {
    e.preventDefault();
    if (!productionForm.categoryId || !productionForm.bricksCount) return;
    setSavingProduction(true);
    try {
      await api.brickCategories.logProduction({
        categoryId: productionForm.categoryId,
        bricksCount: Number(productionForm.bricksCount),
        notes: productionForm.notes || undefined,
      });
      setProductionForm({ categoryId: "", bricksCount: "", notes: "" });
      await refresh();
    } finally {
      setSavingProduction(false);
    }
  }

  async function removeProductionEntry(id: string) {
    await api.brickCategories.removeProduction(id);
    await refresh();
  }

  async function logLoading(e: FormEvent) {
    e.preventDefault();
    if (!loadingForm.categoryId || !loadingForm.bricksCount) return;
    setSavingLoading(true);
    try {
      await api.brickCategories.logLoading({
        categoryId: loadingForm.categoryId,
        bricksCount: Number(loadingForm.bricksCount),
        notes: loadingForm.notes || undefined,
      });
      setLoadingForm({ categoryId: "", bricksCount: "", notes: "" });
      await refresh();
    } finally {
      setSavingLoading(false);
    }
  }

  async function removeLoadingEntry(id: string) {
    await api.brickCategories.removeLoading(id);
    await refresh();
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold text-ink-primary">{t("stock.brickCategoriesHeading")}</h3>
          <p className="text-sm text-ink-muted">{t("stock.categoriesSubtitle")}</p>
        </div>
        {availableCategories.length > 0 ? (
          <Button size="sm" onClick={() => setShowAddCategory((s) => !s)}>
            <Plus className="h-4 w-4" /> {t("stock.addCategory")}
          </Button>
        ) : (
          <span className="rounded-full bg-ink-primary/5 px-2.5 py-1 text-sm text-ink-muted">{t("stock.allCategoriesAdded")}</span>
        )}
      </div>

      {showAddCategory && (
        <Card>
          <form onSubmit={addCategory} className="flex items-end gap-2">
            <div className="flex-1">
              <label className="mb-1 block text-sm text-ink-muted">{t("stock.category")}</label>
              <select
                required
                value={newCategory}
                onChange={(e) => setNewCategory(e.target.value as "" | BrickCategoryName)}
                className={inputClass}
              >
                <option value="">{t("stock.selectCategoryPlaceholder")}</option>
                {availableCategories.map((c) => (
                  <option key={c} value={c}>
                    {BRICK_CATEGORY_LABELS[c]}
                  </option>
                ))}
              </select>
            </div>
            <Button type="submit" disabled={savingCategory}>
              {t("common.add")}
            </Button>
          </form>
        </Card>
      )}

      {categories.length === 0 ? (
        <Card>
          <p className="py-8 text-center text-sm text-ink-muted">{t("stock.noCategoriesYet")}</p>
        </Card>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {categories.map((c) => (
            <Card key={c._id}>
              <div className="flex items-start justify-between gap-2">
                <p className="text-sm font-semibold text-ink-primary">{BRICK_CATEGORY_LABELS[c.category]}</p>
                <div className="flex shrink-0 gap-2">
                  <button onClick={() => startEditQuantity(c)} className="text-ink-muted hover:text-series-1">
                    <Pencil className="h-3.5 w-3.5" />
                  </button>
                  <button onClick={() => deleteCategory(c)} className="text-ink-muted hover:text-status-critical">
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>

              {editingCategoryId === c._id ? (
                <form onSubmit={saveQuantity} className="mt-2 flex items-center gap-2">
                  <input
                    autoFocus
                    type="number"
                    value={editQuantity}
                    onChange={(e) => setEditQuantity(e.target.value)}
                    className={inputClass}
                  />
                  <Button type="submit" size="sm" disabled={savingQuantity}>
                    {t("common.save")}
                  </Button>
                  <button
                    type="button"
                    onClick={() => setEditingCategoryId(null)}
                    className="rounded-lg border border-border bg-ink-primary/5 px-3 py-1.5 text-xs font-medium text-ink-secondary hover:bg-ink-primary/10"
                  >
                    {t("common.cancel")}
                  </button>
                </form>
              ) : (
                <p className={`mt-2 text-2xl font-semibold tabular-nums ${c.quantity < 0 ? "text-status-critical" : "text-ink-primary"}`}>
                  {c.quantity.toLocaleString("en-IN")}
                </p>
              )}
              <p className="text-sm text-ink-muted">{t("stock.bricksInStock")}</p>
            </Card>
          ))}
        </div>
      )}

      {categories.length > 0 && (
        <div className="grid gap-4 lg:grid-cols-2">
          <Card>
            <h4 className="mb-3 text-xs font-semibold uppercase tracking-wide text-ink-muted">{t("stock.logTodaysProduction")}</h4>
            <form onSubmit={logProduction} className="flex flex-col gap-2">
              <select
                required
                value={productionForm.categoryId}
                onChange={(e) => setProductionForm((f) => ({ ...f, categoryId: e.target.value }))}
                className={inputClass}
              >
                <option value="">{t("stock.categoryPlaceholder")}</option>
                {categories.map((c) => (
                  <option key={c._id} value={c._id}>
                    {BRICK_CATEGORY_LABELS[c.category]}
                  </option>
                ))}
              </select>
              <input
                required
                type="number"
                min={1}
                placeholder={t("stock.bricksMadeToday")}
                value={productionForm.bricksCount}
                onChange={(e) => setProductionForm((f) => ({ ...f, bricksCount: e.target.value }))}
                className={inputClass}
              />
              <input
                placeholder={t("common.notesOptional")}
                value={productionForm.notes}
                onChange={(e) => setProductionForm((f) => ({ ...f, notes: e.target.value }))}
                className={inputClass}
              />
              <Button type="submit" disabled={savingProduction}>
                {t("stock.addToStock")}
              </Button>
            </form>
          </Card>

          <Card>
            <h4 className="mb-3 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-ink-muted">
              <PackageMinus className="h-3.5 w-3.5" /> {t("stock.logLoadingOutOfStock")}
            </h4>
            <form onSubmit={logLoading} className="flex flex-col gap-2">
              <select
                required
                value={loadingForm.categoryId}
                onChange={(e) => setLoadingForm((f) => ({ ...f, categoryId: e.target.value }))}
                className={inputClass}
              >
                <option value="">{t("stock.categoryPlaceholder")}</option>
                {categories.map((c) => (
                  <option key={c._id} value={c._id}>
                    {BRICK_CATEGORY_LABELS[c.category]}
                  </option>
                ))}
              </select>
              <input
                required
                type="number"
                min={1}
                placeholder={t("stock.bricksLoaded")}
                value={loadingForm.bricksCount}
                onChange={(e) => setLoadingForm((f) => ({ ...f, bricksCount: e.target.value }))}
                className={inputClass}
              />
              <input
                placeholder={t("common.notesOptional")}
                value={loadingForm.notes}
                onChange={(e) => setLoadingForm((f) => ({ ...f, notes: e.target.value }))}
                className={inputClass}
              />
              <Button type="submit" disabled={savingLoading}>
                {t("stock.deductFromStock")}
              </Button>
            </form>
          </Card>
        </div>
      )}

      {productionHistory.length > 0 && (
        <Card>
          <h4 className="mb-3 text-xs font-semibold uppercase tracking-wide text-ink-muted">{t("stock.productionHistory")}</h4>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-sm">
              <thead>
                <tr className="border-b border-border text-left text-sm text-ink-muted">
                  <th className="pb-2 font-medium">{t("common.date")}</th>
                  <th className="pb-2 font-medium">{t("stock.category")}</th>
                  <th className="pb-2 font-medium">{t("stock.bricks")}</th>
                  <th className="pb-2 font-medium">{t("common.notes")}</th>
                  <th className="pb-2 font-medium text-right"></th>
                </tr>
              </thead>
              <tbody>
                {productionPg.pageItems.map((entry) => (
                  <tr key={entry._id} className="border-b border-border/60 last:border-0">
                    <td className="py-3 text-ink-secondary">{new Date(entry.date).toLocaleDateString("en-IN")}</td>
                    <td className="py-3 text-ink-primary">{categoryLabel(categories, entry.categoryId)}</td>
                    <td className="py-3 tabular-nums text-ink-secondary">{entry.bricksCount.toLocaleString("en-IN")}</td>
                    <td className="py-3 text-ink-secondary">{entry.notes ?? "—"}</td>
                    <td className="py-3 text-right">
                      <button
                        onClick={() => removeProductionEntry(entry._id)}
                        className="text-xs font-medium text-status-critical hover:underline"
                      >
                        {t("common.delete")}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <Pagination page={productionPg.page} pageCount={productionPg.pageCount} onChange={productionPg.setPage} total={productionPg.total} pageSize={10} />
          </div>
        </Card>
      )}

      <Card>
        <h4 className="mb-3 text-xs font-semibold uppercase tracking-wide text-ink-muted">{t("stock.loadingHistory")}</h4>
        {loadingHistory.length === 0 ? (
          <p className="py-8 text-center text-sm text-ink-muted">{t("stock.noLoadingEntriesYet")}</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-sm">
              <thead>
                <tr className="border-b border-border text-left text-sm text-ink-muted">
                  <th className="pb-2 font-medium">{t("common.date")}</th>
                  <th className="pb-2 font-medium">{t("stock.category")}</th>
                  <th className="pb-2 font-medium">{t("stock.bricksLoaded")}</th>
                  <th className="pb-2 font-medium">{t("common.notes")}</th>
                  <th className="pb-2 font-medium text-right"></th>
                </tr>
              </thead>
              <tbody>
                {loadingPg.pageItems.map((entry) => (
                  <tr key={entry._id} className="border-b border-border/60 last:border-0">
                    <td className="py-3 text-ink-secondary">{new Date(entry.date).toLocaleDateString("en-IN")}</td>
                    <td className="py-3 text-ink-primary">{categoryLabel(categories, entry.categoryId)}</td>
                    <td className="py-3 tabular-nums text-ink-secondary">{entry.bricksCount.toLocaleString("en-IN")}</td>
                    <td className="py-3 text-ink-secondary">{entry.notes ?? "—"}</td>
                    <td className="py-3 text-right">
                      <button
                        onClick={() => removeLoadingEntry(entry._id)}
                        className="text-xs font-medium text-status-critical hover:underline"
                      >
                        {t("common.delete")}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <Pagination page={loadingPg.page} pageCount={loadingPg.pageCount} onChange={loadingPg.setPage} total={loadingPg.total} pageSize={10} />
          </div>
        )}
      </Card>
    </div>
  );
}

export function Stock() {
  const { t } = useTranslation();
  const [tab, setTab] = useState<"bricks" | "diesel">("bricks");

  return (
    <div className="space-y-4">
      <SegmentedTabs
        options={[
          { value: "bricks" as const, label: t("stock.bricks") },
          { value: "diesel" as const, label: t("stock.diesel") },
        ]}
        value={tab}
        onChange={setTab}
      />

      {tab === "bricks" && <BrickStockSection />}
      {tab === "diesel" && <DieselSection />}
    </div>
  );
}
