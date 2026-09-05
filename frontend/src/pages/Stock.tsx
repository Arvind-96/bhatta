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
import { buildReportWorkbookBlob, downloadExcelFile } from "@/lib/exportExcel";
import type { BrickCategory, BrickProductionEntry, StockLoadingEntry } from "@/types";
import type { ReportColumn } from "@/types/reports";

const STOCK_EXCEL_COLUMNS: ReportColumn[] = [
  { key: "category", labelKey: "reports.col.category", format: "text" },
  { key: "grade", labelKey: "stock.grade", format: "text" },
  { key: "quantity", labelKey: "reports.col.quantity", format: "number" },
  { key: "pricePerBrick", labelKey: "stock.pricePerBrick", format: "currency" },
  { key: "stockValue", labelKey: "stock.stockValue", format: "currency" },
];

const inputClass =
  "h-10 rounded-xl border border-border bg-ink-primary/5 px-3 text-sm text-ink-primary outline-none focus:ring-2 focus:ring-series-1";

function categoryLabel(categories: BrickCategory[], ref: { _id: string; category: string; grade?: string } | string) {
  if (typeof ref === "object") return ref.grade ? `${ref.category} (${ref.grade})` : ref.category;
  const found = categories.find((c) => c._id === ref);
  if (!found) return "—";
  return found.grade ? `${found.category} (${found.grade})` : found.category;
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

  const [categoryError, setCategoryError] = useState("");
  const [showAddCategory, setShowAddCategory] = useState(false);
  const [newCategory, setNewCategory] = useState("");
  const [newGrade, setNewGrade] = useState("");
  const [newPrice, setNewPrice] = useState("");
  const [savingCategory, setSavingCategory] = useState(false);

  const [editingCategoryId, setEditingCategoryId] = useState<string | null>(null);
  const [editCategoryName, setEditCategoryName] = useState("");
  const [editGrade, setEditGrade] = useState("");
  const [editQuantity, setEditQuantity] = useState("");
  const [editPrice, setEditPrice] = useState("");
  const [savingQuantity, setSavingQuantity] = useState(false);
  const [editError, setEditError] = useState("");

  const [productionForm, setProductionForm] = useState({ categoryId: "", bricksCount: "", notes: "" });
  const [savingProduction, setSavingProduction] = useState(false);
  const [productionError, setProductionError] = useState("");

  const [loadingForm, setLoadingForm] = useState({ categoryId: "", bricksCount: "", notes: "" });
  const [savingLoading, setSavingLoading] = useState(false);
  const [loadingError, setLoadingError] = useState("");

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

  const productionPg = usePagination(productionHistory, 10);
  const loadingPg = usePagination(loadingHistory, 10);

  async function addCategory(e: FormEvent) {
    e.preventDefault();
    if (!newCategory.trim()) return;
    setCategoryError("");
    setSavingCategory(true);
    try {
      await api.brickCategories.create(newCategory.trim(), newPrice ? Number(newPrice) : undefined, newGrade.trim() || undefined);
      setNewCategory("");
      setNewGrade("");
      setNewPrice("");
      setShowAddCategory(false);
      await refresh();
    } catch (err) {
      // Bug fix: this used to have no catch at all — the backend's own
      // friendly duplicate-category-name rejection was silently swallowed,
      // the form just sat there with no indication anything went wrong.
      setCategoryError(err instanceof Error ? err.message : t("common.somethingWentWrong"));
    } finally {
      setSavingCategory(false);
    }
  }

  async function deleteCategory(category: BrickCategory) {
    if (!confirm(t("stock.confirmRemoveCategory", { name: category.category }))) return;
    setCategoryError("");
    try {
      await api.brickCategories.remove(category._id);
      await refresh();
    } catch (err) {
      setCategoryError(err instanceof Error ? err.message : t("common.somethingWentWrong"));
    }
  }

  function startEditQuantity(category: BrickCategory) {
    setEditingCategoryId(category._id);
    setEditCategoryName(category.category);
    setEditGrade(category.grade ?? "");
    setEditQuantity(String(category.quantity));
    setEditPrice(String(category.pricePerBrick ?? 0));
    setEditError("");
  }

  async function saveQuantity(e: FormEvent) {
    e.preventDefault();
    if (!editingCategoryId || !editCategoryName.trim()) return;
    setSavingQuantity(true);
    setEditError("");
    try {
      await api.brickCategories.update(editingCategoryId, {
        category: editCategoryName.trim(),
        grade: editGrade.trim() || null,
        quantity: Number(editQuantity),
        pricePerBrick: Number(editPrice),
      });
      setEditingCategoryId(null);
      await refresh();
    } catch (err) {
      setEditError(err instanceof Error ? err.message : t("common.somethingWentWrong"));
    } finally {
      setSavingQuantity(false);
    }
  }

  async function logProduction(e: FormEvent) {
    e.preventDefault();
    if (!productionForm.categoryId || !productionForm.bricksCount) return;
    setProductionError("");
    setSavingProduction(true);
    try {
      await api.brickCategories.logProduction({
        categoryId: productionForm.categoryId,
        bricksCount: Number(productionForm.bricksCount),
        notes: productionForm.notes || undefined,
      });
      setProductionForm({ categoryId: "", bricksCount: "", notes: "" });
      await refresh();
    } catch (err) {
      setProductionError(err instanceof Error ? err.message : t("common.somethingWentWrong"));
    } finally {
      setSavingProduction(false);
    }
  }

  async function removeProductionEntry(id: string) {
    try {
      await api.brickCategories.removeProduction(id);
      await refresh();
    } catch (err) {
      setProductionError(err instanceof Error ? err.message : t("common.somethingWentWrong"));
    }
  }

  async function logLoading(e: FormEvent) {
    e.preventDefault();
    if (!loadingForm.categoryId || !loadingForm.bricksCount) return;
    setLoadingError("");
    setSavingLoading(true);
    try {
      await api.brickCategories.logLoading({
        categoryId: loadingForm.categoryId,
        bricksCount: Number(loadingForm.bricksCount),
        notes: loadingForm.notes || undefined,
      });
      setLoadingForm({ categoryId: "", bricksCount: "", notes: "" });
      await refresh();
    } catch (err) {
      setLoadingError(err instanceof Error ? err.message : t("common.somethingWentWrong"));
    } finally {
      setSavingLoading(false);
    }
  }

  async function removeLoadingEntry(id: string) {
    try {
      await api.brickCategories.removeLoading(id);
      await refresh();
    } catch (err) {
      setLoadingError(err instanceof Error ? err.message : t("common.somethingWentWrong"));
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold text-ink-primary">{t("stock.brickCategoriesHeading")}</h3>
          <p className="text-sm text-ink-muted">{t("stock.categoriesSubtitle")}</p>
        </div>
        <div className="flex items-center gap-2">
          {categories.length > 0 && (
            <button
              type="button"
              onClick={() => {
                const rows = categories.map((c) => ({
                  category: c.category,
                  grade: c.grade ?? "",
                  quantity: c.quantity,
                  pricePerBrick: c.pricePerBrick ?? 0,
                  stockValue: Math.round(c.quantity * (c.pricePerBrick ?? 0) * 100) / 100,
                }));
                const labels = Object.fromEntries(STOCK_EXCEL_COLUMNS.map((c) => [c.key, t(c.labelKey)]));
                const blob = buildReportWorkbookBlob(STOCK_EXCEL_COLUMNS, rows, undefined, labels, t("nav.stock"));
                downloadExcelFile(blob, "stock.xlsx");
              }}
              className="rounded-lg border border-border px-3 py-1.5 text-xs font-semibold text-ink-secondary hover:bg-ink-primary/5"
            >
              {t("reports.action.downloadExcel")}
            </button>
          )}
          <Button size="sm" onClick={() => setShowAddCategory((s) => !s)}>
            <Plus className="h-4 w-4" /> {t("stock.addCategory")}
          </Button>
        </div>
      </div>

      {showAddCategory && (
        <Card>
          <form onSubmit={addCategory} className="flex flex-wrap items-end gap-2">
            <div className="flex-1 min-w-[10rem]">
              <label className="mb-1 block text-sm text-ink-muted">{t("stock.category")}</label>
              <input
                required
                placeholder={t("stock.categoryNamePlaceholder")}
                value={newCategory}
                onChange={(e) => setNewCategory(e.target.value)}
                className={inputClass}
              />
            </div>
            <div className="w-36">
              <label className="mb-1 block text-sm text-ink-muted">{t("stock.grade")}</label>
              <input
                placeholder={t("stock.gradePlaceholder")}
                value={newGrade}
                onChange={(e) => setNewGrade(e.target.value)}
                className={inputClass}
              />
            </div>
            <div className="w-36">
              <label className="mb-1 block text-sm text-ink-muted">{t("stock.pricePerBrick")}</label>
              <input
                type="number"
                min={0}
                step="0.01"
                placeholder="₹"
                value={newPrice}
                onChange={(e) => setNewPrice(e.target.value)}
                className={inputClass}
              />
            </div>
            <Button type="submit" disabled={savingCategory}>
              {t("common.add")}
            </Button>
          </form>
        </Card>
      )}

      {categoryError && <p className="text-sm text-status-critical">{categoryError}</p>}

      {categories.length === 0 ? (
        <Card>
          <p className="py-8 text-center text-sm text-ink-muted">{t("stock.noCategoriesYet")}</p>
        </Card>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {categories.map((c) => (
            <Card key={c._id}>
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="text-sm font-semibold text-ink-primary">{c.category}</p>
                  {c.grade && <p className="text-sm text-ink-muted">{t("stock.grade")}: {c.grade}</p>}
                </div>
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
                <form onSubmit={saveQuantity} className="mt-2 flex flex-col gap-2">
                  <div>
                    <label className="mb-1 block text-sm text-ink-muted">{t("stock.categoryNamePlaceholder")}</label>
                    <input
                      autoFocus
                      required
                      value={editCategoryName}
                      onChange={(e) => setEditCategoryName(e.target.value)}
                      className={inputClass}
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-sm text-ink-muted">{t("stock.grade")}</label>
                    <input
                      placeholder={t("stock.gradePlaceholder")}
                      value={editGrade}
                      onChange={(e) => setEditGrade(e.target.value)}
                      className={inputClass}
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-sm text-ink-muted">{t("stock.bricksInStock")}</label>
                    <input
                      type="number"
                      value={editQuantity}
                      onChange={(e) => setEditQuantity(e.target.value)}
                      className={inputClass}
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-sm text-ink-muted">{t("stock.pricePerBrick")}</label>
                    <input
                      type="number"
                      min={0}
                      step="0.01"
                      value={editPrice}
                      onChange={(e) => setEditPrice(e.target.value)}
                      className={inputClass}
                    />
                  </div>
                  {editError && <p className="text-sm text-status-critical">{editError}</p>}
                  <div className="flex gap-2">
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
                  </div>
                </form>
              ) : (
                <>
                  <p className={`mt-2 text-2xl font-semibold tabular-nums ${c.quantity < 0 ? "text-status-critical" : "text-ink-primary"}`}>
                    {c.quantity.toLocaleString("en-IN")}
                  </p>
                  <p className="text-sm text-ink-muted">{t("stock.bricksInStock")}</p>
                  <p className="mt-1 text-sm text-ink-secondary">
                    {t("stock.pricePerBrick")}: ₹{(c.pricePerBrick ?? 0).toLocaleString("en-IN")}
                  </p>
                </>
              )}
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
                    {c.grade ? `${c.category} (${c.grade})` : c.category}
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
              {productionError && <p className="text-sm text-status-critical">{productionError}</p>}
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
                    {c.grade ? `${c.category} (${c.grade})` : c.category}
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
              {loadingError && <p className="text-sm text-status-critical">{loadingError}</p>}
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
