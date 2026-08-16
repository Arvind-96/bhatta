import { FormEvent, useEffect, useState } from "react";
import { Plus, Trash2, Pencil } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Pagination, usePagination } from "@/components/ui/pagination";
import { api } from "@/lib/api";
import { useKilnEvent } from "@/hooks/useKilnEvent";
import { useAuthStore } from "@/store/auth.store";
import { useTranslation } from "@/hooks/useTranslation";
import type { InventoryItem } from "@/types";

const inputClass =
  "h-10 rounded-xl border border-border bg-ink-primary/5 px-3 text-sm text-ink-primary outline-none focus:ring-2 focus:ring-series-1";

// The kiln's own supply catalog (buckets, mugs, tarpaulin/tripal, etc.) —
// admin manages the master list and stock quantity here; the People
// page's labour profiles pick from this same list when recording what
// was handed out, which deducts from the quantity shown here live.
export function Inventory() {
  const { t } = useTranslation();
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ name: "", quantity: "", unit: "pcs", notes: "" });
  const [loading, setLoading] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState({ name: "", quantity: "", unit: "", notes: "" });
  const [savingEdit, setSavingEdit] = useState(false);
  const activeKilnId = useAuthStore((s) => s.activeKilnId);

  async function refresh() {
    setItems(await api.inventory.list());
  }

  useEffect(() => {
    if (!activeKilnId) return;
    refresh().catch(console.error);
  }, [activeKilnId]);

  useKilnEvent("inventory:update", () => refresh());

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!form.name.trim()) return;
    setLoading(true);
    try {
      await api.inventory.create({
        name: form.name.trim(),
        quantity: form.quantity ? Number(form.quantity) : undefined,
        unit: form.unit || undefined,
        notes: form.notes || undefined,
      });
      setForm({ name: "", quantity: "", unit: "pcs", notes: "" });
      setShowForm(false);
      await refresh();
    } finally {
      setLoading(false);
    }
  }

  function startEdit(item: InventoryItem) {
    setEditingId(item._id);
    setEditForm({ name: item.name, quantity: String(item.quantity), unit: item.unit, notes: item.notes ?? "" });
  }

  async function saveEdit(e: FormEvent) {
    e.preventDefault();
    if (!editingId) return;
    setSavingEdit(true);
    try {
      await api.inventory.update(editingId, {
        name: editForm.name.trim(),
        quantity: editForm.quantity ? Number(editForm.quantity) : undefined,
        unit: editForm.unit || undefined,
        notes: editForm.notes || undefined,
      });
      setEditingId(null);
      await refresh();
    } finally {
      setSavingEdit(false);
    }
  }

  async function deleteItem(item: InventoryItem) {
    if (!confirm(t("inventory.confirmDelete", { name: item.name }))) return;
    await api.inventory.remove(item._id);
    await refresh();
  }

  const { page, setPage, pageCount, pageItems: pagedItems, total } = usePagination(items, 10);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-ink-primary">{t("inventory.headingWithCount", { count: items.length })}</h3>
        <Button size="sm" onClick={() => setShowForm((s) => !s)}>
          <Plus className="h-4 w-4" /> {t("inventory.addItem")}
        </Button>
      </div>

      {showForm && (
        <Card>
          <form onSubmit={handleSubmit} className="grid grid-cols-2 gap-2">
            <input
              required
              placeholder={t("inventory.itemNamePlaceholder")}
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              className="col-span-2 h-10 rounded-xl border border-border bg-ink-primary/5 px-3 text-sm text-ink-primary outline-none focus:ring-2 focus:ring-series-1"
            />
            <input
              type="number"
              min={0}
              placeholder={t("inventory.quantityInStock")}
              value={form.quantity}
              onChange={(e) => setForm((f) => ({ ...f, quantity: e.target.value }))}
              className={inputClass}
            />
            <input
              placeholder={t("inventory.unitPlaceholder")}
              value={form.unit}
              onChange={(e) => setForm((f) => ({ ...f, unit: e.target.value }))}
              className={inputClass}
            />
            <input
              placeholder={t("common.notesOptional")}
              value={form.notes}
              onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
              className="col-span-2 h-10 rounded-xl border border-border bg-ink-primary/5 px-3 text-sm text-ink-primary outline-none focus:ring-2 focus:ring-series-1"
            />
            <Button type="submit" disabled={loading} className="col-span-2">
              {t("inventory.saveItem")}
            </Button>
          </form>
        </Card>
      )}

      <Card>
        {items.length === 0 ? (
          <p className="py-8 text-center text-sm text-ink-muted">{t("inventory.noItemsYet")}</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-sm">
              <thead>
                <tr className="border-b border-border text-left text-sm text-ink-muted">
                  <th className="pb-2 font-medium">{t("inventory.itemColumn")}</th>
                  <th className="pb-2 font-medium">{t("inventory.remainingQuantity")}</th>
                  <th className="pb-2 font-medium">{t("inventory.usedQuantity")}</th>
                  <th className="pb-2 font-medium">{t("inventory.unit")}</th>
                  <th className="pb-2 font-medium">{t("common.notes")}</th>
                  <th className="pb-2 font-medium text-right">{t("common.actions")}</th>
                </tr>
              </thead>
              <tbody>
                {pagedItems.map((item) =>
                  editingId === item._id ? (
                    <tr key={item._id} className="border-b border-border/60 last:border-0">
                      <td className="py-2 pr-2" colSpan={6}>
                        <form onSubmit={saveEdit} className="grid grid-cols-5 items-center gap-2">
                          <input
                            required
                            value={editForm.name}
                            onChange={(e) => setEditForm((f) => ({ ...f, name: e.target.value }))}
                            className={inputClass}
                          />
                          <input
                            type="number"
                            min={0}
                            value={editForm.quantity}
                            onChange={(e) => setEditForm((f) => ({ ...f, quantity: e.target.value }))}
                            className={inputClass}
                          />
                          <input
                            value={editForm.unit}
                            onChange={(e) => setEditForm((f) => ({ ...f, unit: e.target.value }))}
                            className={inputClass}
                          />
                          <input
                            value={editForm.notes}
                            onChange={(e) => setEditForm((f) => ({ ...f, notes: e.target.value }))}
                            className={inputClass}
                          />
                          <div className="flex gap-1.5">
                            <Button type="submit" size="sm" disabled={savingEdit}>
                              {t("common.save")}
                            </Button>
                            <button
                              type="button"
                              onClick={() => setEditingId(null)}
                              className="rounded-lg border border-border bg-ink-primary/5 px-3 py-1.5 text-xs font-medium text-ink-secondary hover:bg-ink-primary/10"
                            >
                              {t("common.cancel")}
                            </button>
                          </div>
                        </form>
                      </td>
                    </tr>
                  ) : (
                    <tr key={item._id} className="border-b border-border/60 last:border-0">
                      <td className="py-3 text-ink-primary">{item.name}</td>
                      <td className={`py-3 tabular-nums ${item.quantity <= 0 ? "text-status-critical" : "text-ink-secondary"}`}>
                        {item.quantity.toLocaleString("en-IN")}
                      </td>
                      <td className="py-3 tabular-nums text-ink-secondary">{item.usedQuantity.toLocaleString("en-IN")}</td>
                      <td className="py-3 text-ink-secondary">{item.unit}</td>
                      <td className="py-3 text-ink-muted">{item.notes ?? "—"}</td>
                      <td className="py-3">
                        <div className="flex justify-end gap-3">
                          <button
                            onClick={() => startEdit(item)}
                            className="flex items-center gap-1 text-xs font-medium text-series-1 hover:underline"
                          >
                            <Pencil className="h-3.5 w-3.5" /> {t("common.edit")}
                          </button>
                          <button
                            onClick={() => deleteItem(item)}
                            className="flex items-center gap-1 text-xs font-medium text-status-critical hover:underline"
                          >
                            <Trash2 className="h-3.5 w-3.5" /> {t("common.delete")}
                          </button>
                        </div>
                      </td>
                    </tr>
                  )
                )}
              </tbody>
            </table>
            <Pagination page={page} pageCount={pageCount} onChange={setPage} total={total} pageSize={10} />
          </div>
        )}
      </Card>
    </div>
  );
}
