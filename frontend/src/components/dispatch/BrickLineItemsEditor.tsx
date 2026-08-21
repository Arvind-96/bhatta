import { useTranslation } from "@/hooks/useTranslation";
import { cn, formatINR } from "@/lib/utils";
import type { ResolvedLineItem } from "@/lib/printDocument";
import type { BrickCategory, BrickLineItem } from "@/types";

const inputClass =
  "h-10 rounded-xl border border-border bg-ink-primary/5 px-3 text-sm text-ink-primary outline-none focus:ring-2 focus:ring-series-1";

// The form-state shape for one line item row — kept as strings, like every
// other numeric input on these forms, so a half-typed value doesn't get
// coerced mid-edit. Converted to numbers only at submit time.
export interface LineItemRow {
  categoryId: string;
  bricksCount: string;
  pricePerBrick: string;
}

export function emptyLineItemRow(): LineItemRow {
  return { categoryId: "", bricksCount: "", pricePerBrick: "" };
}

// Seeds row state from any record carrying the new `items` array — falling
// back to the pre-existing single categoryId/bricksCount/pricePerBrick
// scalars for a record created before this feature. Shared by every form
// that reads a Brick Loading trip, Dispatch, or existing document (Edit
// Trip modal, Dispatch page, Create Challan/Gate Pass/Invoice forms) so the
// same backward-compatibility rule isn't reimplemented per form.
export function lineItemRowsFrom(source: {
  items?: BrickLineItem[];
  categoryId?: { _id: string } | string;
  bricksCount: number;
  pricePerBrick?: number;
}): LineItemRow[] {
  if (source.items && source.items.length > 0) {
    return source.items.map((i) => ({
      categoryId: typeof i.categoryId === "object" ? i.categoryId?._id ?? "" : i.categoryId ?? "",
      bricksCount: String(i.bricksCount),
      pricePerBrick: i.pricePerBrick != null ? String(i.pricePerBrick) : "",
    }));
  }
  const categoryId = typeof source.categoryId === "object" ? source.categoryId?._id ?? "" : source.categoryId ?? "";
  if (!categoryId && !source.bricksCount) return [emptyLineItemRow()];
  return [{ categoryId, bricksCount: String(source.bricksCount), pricePerBrick: source.pricePerBrick != null ? String(source.pricePerBrick) : "" }];
}

interface BrickLineItemsEditorProps {
  items: LineItemRow[];
  onChange: (items: LineItemRow[]) => void;
  categories: BrickCategory[];
  // Challan/Gate Pass carry no pricing (matching their existing
  // bricksCount-only design) — Brick Loading/Dispatch/Invoice show price +
  // computed amount per row and a grand total.
  pricingEnabled?: boolean;
  // Used for a trip-linked Dispatch, where the line items come from the
  // Brick Loading trip and can't be edited from here.
  readOnly?: boolean;
}

export function BrickLineItemsEditor({ items, onChange, categories, pricingEnabled = true, readOnly = false }: BrickLineItemsEditorProps) {
  const { t } = useTranslation();

  function update(index: number, field: keyof LineItemRow, value: string) {
    onChange(items.map((row, i) => (i === index ? { ...row, [field]: value } : row)));
  }
  function addRow() {
    onChange([...items, emptyLineItemRow()]);
  }
  function removeRow(index: number) {
    onChange(items.filter((_, i) => i !== index));
  }

  function categoryLabel(id: string) {
    const category = categories.find((c) => c._id === id);
    if (!category) return "—";
    return category.grade ? `${category.category} (${category.grade})` : category.category;
  }

  const totalBricks = items.reduce((sum, row) => sum + (Number(row.bricksCount) || 0), 0);
  const totalAmount = items.reduce((sum, row) => sum + (Number(row.bricksCount) || 0) * (Number(row.pricePerBrick) || 0), 0);

  if (readOnly) {
    return (
      <div className="flex flex-col gap-2">
        {items.map((row, index) => (
          <div key={index} className="flex items-center justify-between rounded-xl border border-border bg-ink-primary/5 px-3 py-2 text-sm">
            <span className="text-ink-primary">{categoryLabel(row.categoryId)}</span>
            <span className="tabular-nums text-ink-secondary">
              {(Number(row.bricksCount) || 0).toLocaleString("en-IN")} {t("brickLoading.bricksUnit")}
              {pricingEnabled && row.pricePerBrick ? ` · ₹${formatINR(Number(row.pricePerBrick))}` : ""}
            </span>
          </div>
        ))}
        {items.length > 1 && (
          <div className="flex items-center justify-between rounded-xl border border-series-1/30 bg-series-1/5 px-3 py-2">
            <span className="text-xs text-ink-muted">{t("dispatchDocs.lineItemsTotalLabel")}</span>
            <span className="text-sm font-semibold tabular-nums text-ink-primary">
              {totalBricks.toLocaleString("en-IN")} {t("brickLoading.bricksUnit")}
              {pricingEnabled ? ` · ₹${formatINR(totalAmount)}` : ""}
            </span>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      {items.map((row, index) => (
        <div key={index} className="flex flex-col gap-2 rounded-xl border border-border bg-ink-primary/5 p-3">
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold uppercase tracking-wide text-ink-muted">
              {t("dispatchDocs.categoryEntryLabel", { index: index + 1 })}
            </p>
            {items.length > 1 && (
              <button type="button" onClick={() => removeRow(index)} className="text-xs font-medium text-status-critical hover:underline">
                {t("common.remove")}
              </button>
            )}
          </div>
          <div className={cn("grid gap-2", pricingEnabled ? "grid-cols-3" : "grid-cols-2")}>
            <select required value={row.categoryId} onChange={(e) => update(index, "categoryId", e.target.value)} className={inputClass}>
              <option value="">{t("brickLoading.categoryPlaceholder")}</option>
              {categories.map((c) => (
                <option key={c._id} value={c._id}>
                  {c.grade ? `${c.category} (${c.grade})` : c.category}
                </option>
              ))}
            </select>
            <input
              required
              type="number"
              min={0}
              placeholder={t("brickLoading.bricksLoadedPlaceholder")}
              value={row.bricksCount}
              onChange={(e) => update(index, "bricksCount", e.target.value)}
              className={inputClass}
            />
            {pricingEnabled && (
              <div className="flex flex-col gap-1">
                <input
                  type="number"
                  min={0}
                  step="0.01"
                  placeholder={t("brickLoading.pricePerBrickPlaceholder")}
                  value={row.pricePerBrick}
                  onChange={(e) => update(index, "pricePerBrick", e.target.value)}
                  className={inputClass}
                />
                {row.categoryId && categories.find((c) => c._id === row.categoryId) && (
                  <span className="text-xs text-ink-muted">
                    {t("brickLoading.categoryDefaultPriceHint", { amount: formatINR(categories.find((c) => c._id === row.categoryId)!.pricePerBrick) })}
                  </span>
                )}
              </div>
            )}
          </div>
          {pricingEnabled && row.bricksCount && row.pricePerBrick && (
            <p className="text-xs text-ink-muted">
              {t("common.amount")}: ₹{formatINR(Number(row.bricksCount) * Number(row.pricePerBrick))}
            </p>
          )}
        </div>
      ))}
      <button type="button" onClick={addRow} className="self-start text-xs font-medium text-series-1 hover:underline">
        {t("dispatchDocs.addAnotherCategory")}
      </button>
      {items.length > 1 && (
        <div className="mt-1 flex items-center justify-between rounded-xl border border-series-1/30 bg-series-1/5 px-3 py-2">
          <span className="text-xs text-ink-muted">{t("dispatchDocs.lineItemsTotalLabel")}</span>
          <span className="text-sm font-semibold tabular-nums text-ink-primary">
            {totalBricks.toLocaleString("en-IN")} {t("brickLoading.bricksUnit")}
            {pricingEnabled ? ` · ₹${formatINR(totalAmount)}` : ""}
          </span>
        </div>
      )}
    </div>
  );
}

// A read-only itemized table for a document's detail page — used only
// when a record actually has more than one category (see each detail
// page's own call site); a single-category record keeps its existing
// plain Field row instead, so nothing changes visually for records
// created before this feature.
export function LineItemsDetailTable({ rows, pricingEnabled = false }: { rows: ResolvedLineItem[]; pricingEnabled?: boolean }) {
  const { t } = useTranslation();
  return (
    <div className="overflow-x-auto rounded-xl border border-border">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border bg-ink-primary/5 text-left text-xs text-ink-muted">
            <th className="px-3 py-2 font-medium">{t("brickLoading.categoryHeader")}</th>
            <th className="px-3 py-2 text-right font-medium">{t("brickLoading.bricksHeader")}</th>
            {pricingEnabled && <th className="px-3 py-2 text-right font-medium">{t("dispatchDocs.rateHeader")}</th>}
            {pricingEnabled && <th className="px-3 py-2 text-right font-medium">{t("common.amount")}</th>}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} className="border-b border-border/60 last:border-0">
              <td className="px-3 py-2 text-ink-primary">{r.label}</td>
              <td className="px-3 py-2 text-right tabular-nums text-ink-secondary">{r.bricksCount.toLocaleString("en-IN")}</td>
              {pricingEnabled && (
                <td className="px-3 py-2 text-right tabular-nums text-ink-secondary">{r.pricePerBrick != null ? `₹${formatINR(r.pricePerBrick)}` : "—"}</td>
              )}
              {pricingEnabled && (
                <td className="px-3 py-2 text-right tabular-nums text-ink-secondary">{r.amount != null ? `₹${formatINR(r.amount)}` : "—"}</td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
