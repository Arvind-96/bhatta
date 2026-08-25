import { useEffect, useMemo, useState } from "react";
import { Container, FileText, List, Pencil, Phone, Plus, Search, Trash2 } from "lucide-react";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Pagination, usePagination } from "@/components/ui/pagination";
import { EmptyState } from "@/components/ui/empty-state";
import { ConfirmDialog } from "@/components/shared/ConfirmDialog";
import { AddSupplierForm } from "@/components/supplier/AddSupplierForm";
import { AddSupplierInvoiceForm } from "@/components/supplier/AddSupplierInvoiceForm";
import { SupplierDetailPage } from "@/components/supplier/SupplierDetailPage";
import { api } from "@/lib/api";
import { useKilnEvent } from "@/hooks/useKilnEvent";
import { useAuthStore } from "@/store/auth.store";
import { useTranslation } from "@/hooks/useTranslation";
import { cn } from "@/lib/utils";
import type { Supplier, SupplyUnit } from "@/types";

const inputClass =
  "h-10 rounded-xl border border-border bg-ink-primary/5 px-3 text-sm text-ink-primary outline-none focus:ring-2 focus:ring-series-1";

function unitLabelFor(t: (key: string) => string, unit: SupplyUnit) {
  return unit === "KG" ? t("supplier.unitKg") : unit === "PIECE" ? t("supplier.unitPiece") : t("supplier.unitMeter");
}

// Section 2 of the spec ("list of all supply items") is deliberately not
// its own stored table — it's built here from every supplier's own
// suppliesList, so it can never drift out of sync with what the supplier
// records actually say. Grouped by item name + unit (the same item at two
// different units — rare, but real — gets two rows) with every supplier
// offering it attached.
function useSupplyItemsCatalog(suppliers: Supplier[]) {
  return useMemo(() => {
    const byKey = new Map<string, { itemName: string; unit: SupplyUnit; supplierNames: string[] }>();
    for (const supplier of suppliers) {
      for (const item of supplier.suppliesList) {
        const key = `${item.itemName.trim().toLowerCase()}__${item.unit}`;
        const entry = byKey.get(key) ?? { itemName: item.itemName, unit: item.unit, supplierNames: [] };
        if (!entry.supplierNames.includes(supplier.name)) entry.supplierNames.push(supplier.name);
        byKey.set(key, entry);
      }
    }
    return Array.from(byKey.values()).sort((a, b) => a.itemName.localeCompare(b.itemName));
  }, [suppliers]);
}

export function Suppliers() {
  const [mode, setMode] = useState<"list" | "add" | "items" | "invoice">("list");
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [search, setSearch] = useState("");
  const [editingSupplier, setEditingSupplier] = useState<Supplier | null>(null);
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [openSupplierId, setOpenSupplierId] = useState<string | null>(null);
  const activeKilnId = useAuthStore((s) => s.activeKilnId);
  const { t } = useTranslation();

  async function refresh() {
    setSuppliers(await api.suppliers.list());
  }

  useEffect(() => {
    if (!activeKilnId) return;
    refresh().catch(console.error);
  }, [activeKilnId]);

  useKilnEvent("supplier:update", () => refresh());

  const filtered = suppliers.filter((s) => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return (
      s.name.toLowerCase().includes(q) ||
      (s.phone ?? "").includes(q) ||
      s.suppliesList.some((i) => i.itemName.toLowerCase().includes(q))
    );
  });
  const { page, setPage, pageCount, pageItems: pagedSuppliers, total } = usePagination(filtered, 10);
  const catalog = useSupplyItemsCatalog(suppliers);
  const pendingDeleteSupplier = suppliers.find((s) => s._id === pendingDeleteId) ?? null;

  if (openSupplierId) {
    return (
      <SupplierDetailPage
        supplierId={openSupplierId}
        onBack={() => setOpenSupplierId(null)}
        onDeleted={() => setOpenSupplierId(null)}
      />
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap justify-end gap-2">
        <Button
          size="sm"
          variant={mode === "add" ? "primary" : "outline"}
          onClick={() => {
            setEditingSupplier(null);
            setMode("add");
          }}
        >
          <Plus className="h-4 w-4" /> {t("supplier.addSupplierButton")}
        </Button>
        <Button size="sm" variant={mode === "list" ? "primary" : "outline"} onClick={() => setMode("list")}>
          <List className="h-4 w-4" /> {t("supplier.supplierListButton")}
        </Button>
        <Button size="sm" variant={mode === "items" ? "primary" : "outline"} onClick={() => setMode("items")}>
          <Container className="h-4 w-4" /> {t("supplier.supplyItemsButton")}
        </Button>
        <Button size="sm" variant={mode === "invoice" ? "primary" : "outline"} onClick={() => setMode("invoice")}>
          <Plus className="h-4 w-4" /> {t("supplier.recordSuppliesButton")}
        </Button>
        <Button size="sm" variant={mode === "invoice" ? "accent" : "outline"} onClick={() => setMode("invoice")}>
          <FileText className="h-4 w-4" /> {t("supplier.createInvoiceButton")}
        </Button>
      </div>

      {mode === "invoice" ? (
        <AddSupplierInvoiceForm
          suppliers={suppliers}
          onClose={() => setMode("list")}
          onSaved={() => {
            setMode("list");
            refresh();
          }}
        />
      ) : mode === "add" ? (
        <AddSupplierForm
          existing={editingSupplier}
          onClose={() => {
            setEditingSupplier(null);
            setMode("list");
          }}
          onSaved={() => {
            setEditingSupplier(null);
            setMode("list");
            refresh();
          }}
        />
      ) : mode === "items" ? (
        <Card>
          <CardHeader>
            <CardTitle>{t("supplier.supplyItemsButton")}</CardTitle>
          </CardHeader>
          {catalog.length === 0 ? (
            <EmptyState icon={Container} title={t("supplier.noSupplyItemsYet")} />
          ) : (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {catalog.map((entry) => (
                <div key={`${entry.itemName}__${entry.unit}`} className="rounded-xl border border-border bg-ink-primary/[0.03] p-3">
                  <div className="flex items-center justify-between gap-2">
                    <p className="truncate text-sm font-semibold text-ink-primary">{entry.itemName}</p>
                    <Badge variant="neutral">{unitLabelFor(t, entry.unit)}</Badge>
                  </div>
                  <p className="mt-1.5 text-xs text-ink-muted">{t("supplier.suppliedByLabel")}</p>
                  <p className="truncate text-xs text-ink-secondary">{entry.supplierNames.join(", ")}</p>
                </div>
              ))}
            </div>
          )}
        </Card>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>{t("nav.suppliers")}</CardTitle>
          </CardHeader>
          <div className="relative mb-3">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-muted" />
            <input
              placeholder={t("supplier.searchSuppliersPlaceholder")}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className={cn(inputClass, "w-full max-w-sm pl-9")}
            />
          </div>
          {suppliers.length === 0 ? (
            <EmptyState icon={Container} title={t("supplier.noSuppliersYet")} />
          ) : filtered.length === 0 ? (
            <p className="py-8 text-center text-sm text-ink-muted">{t("dispatchDocs.noMatchSearch")}</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[560px] text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-sm text-ink-muted">
                    <th className="pb-2 font-medium">{t("supplier.supplierNamePlaceholder")}</th>
                    <th className="pb-2 font-medium">{t("supplier.phonePlaceholder")}</th>
                    <th className="pb-2 font-medium">{t("supplier.suppliesListSection")}</th>
                    <th className="pb-2 font-medium text-right">{t("common.actions")}</th>
                  </tr>
                </thead>
                <tbody>
                  {pagedSuppliers.map((s) => (
                    <tr key={s._id} onClick={() => setOpenSupplierId(s._id)} className="cursor-pointer border-b border-border/60 last:border-0 hover:bg-ink-primary/5">
                      <td className="py-3 text-ink-primary hover:underline">{s.name}</td>
                      <td className="py-3 text-ink-secondary">
                        {s.phone ? (
                          <a href={`tel:${s.phone}`} onClick={(e) => e.stopPropagation()} className="flex items-center gap-1.5 hover:text-series-1">
                            <Phone className="h-3.5 w-3.5" /> {s.phone}
                          </a>
                        ) : (
                          "—"
                        )}
                      </td>
                      <td className="py-3 text-ink-secondary">
                        {s.suppliesList.length > 0 ? t("supplier.suppliesCountLabel", { count: s.suppliesList.length }) : "—"}
                      </td>
                      <td className="py-3" onClick={(e) => e.stopPropagation()}>
                        <div className="flex justify-end gap-1.5">
                          <button
                            onClick={() => {
                              setEditingSupplier(s);
                              setMode("add");
                            }}
                            className="flex h-7 w-7 items-center justify-center rounded-lg border border-border text-ink-secondary hover:border-series-1/50 hover:text-series-1"
                            aria-label={t("common.edit")}
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </button>
                          <button
                            onClick={() => setPendingDeleteId(s._id)}
                            className="flex h-7 w-7 items-center justify-center rounded-lg border border-status-critical/30 text-status-critical hover:bg-status-critical/10"
                            aria-label={t("common.delete")}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <Pagination page={page} pageCount={pageCount} onChange={setPage} total={total} pageSize={10} />
            </div>
          )}
        </Card>
      )}

      {pendingDeleteSupplier && (
        <ConfirmDialog
          title={t("common.delete")}
          detail={t("supplier.confirmDeleteSupplier", { name: pendingDeleteSupplier.name })}
          confirmLabel={t("common.delete")}
          loading={deleting}
          onCancel={() => setPendingDeleteId(null)}
          onConfirm={async () => {
            setDeleting(true);
            try {
              await api.suppliers.remove(pendingDeleteSupplier._id);
              setPendingDeleteId(null);
            } finally {
              setDeleting(false);
            }
          }}
        />
      )}
    </div>
  );
}
