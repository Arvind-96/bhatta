import { FormEvent, useState } from "react";
import { Plus, X } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { DateInput } from "@/components/ui/date-input";
import { api } from "@/lib/api";
import { useTranslation } from "@/hooks/useTranslation";
import type { Supplier, SupplyListItem, SupplyUnit } from "@/types";

const inputClass =
  "h-10 rounded-xl border border-border bg-ink-primary/5 px-3 text-sm text-ink-primary outline-none focus:ring-2 focus:ring-series-1";

// The exact common items called out in the spec — tapping one adds it to
// the Supplies List below (defaulting to KG, still editable) instead of
// the admin having to type it out; "Add custom item" covers anything not
// on this shortlist.
const COMMON_ITEMS = ["Coal", "Gas", "Husk/Chaff (Tudi)", "Wood", "Salt"];
const UNITS: SupplyUnit[] = ["KG", "PIECE", "METER"];

interface AddSupplierFormProps {
  existing?: Supplier | null;
  onClose: () => void;
  onSaved: (supplier: Supplier) => void;
}

export function AddSupplierForm({ existing, onClose, onSaved }: AddSupplierFormProps) {
  const { t } = useTranslation();
  const [name, setName] = useState(existing?.name ?? "");
  const [phone, setPhone] = useState(existing?.phone ?? "");
  const [address, setAddress] = useState(existing?.address ?? "");
  const [suppliesList, setSuppliesList] = useState<SupplyListItem[]>(existing?.suppliesList ?? []);
  const [dateAdded, setDateAdded] = useState(existing?.dateAdded ? existing.dateAdded.slice(0, 10) : new Date().toISOString().slice(0, 10));
  const [saving, setSaving] = useState(false);

  function addItem(itemName: string) {
    if (suppliesList.some((i) => i.itemName.toLowerCase() === itemName.toLowerCase())) return;
    setSuppliesList((list) => [...list, { itemName, unit: "KG" }]);
  }

  function unitLabel(unit: SupplyUnit) {
    return unit === "KG" ? t("supplier.unitKg") : unit === "PIECE" ? t("supplier.unitPiece") : t("supplier.unitMeter");
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      const payload = {
        name,
        phone: phone.trim() || undefined,
        address: address.trim() || undefined,
        suppliesList: suppliesList.filter((i) => i.itemName.trim()),
        dateAdded: dateAdded || undefined,
      };
      const saved = existing ? await api.suppliers.update(existing._id, payload) : await api.suppliers.create(payload);
      onSaved(saved);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card>
      <div className="mb-4 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-ink-primary">{existing ? t("supplier.editSupplierTitle") : t("supplier.addSupplierTitle")}</h3>
        <button onClick={onClose} className="text-ink-muted hover:text-ink-primary">
          <X className="h-4 w-4" />
        </button>
      </div>

      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <input
          required
          placeholder={t("supplier.supplierNamePlaceholder")}
          value={name}
          onChange={(e) => setName(e.target.value)}
          className={inputClass}
        />
        <div className="grid grid-cols-2 gap-2">
          <input placeholder={t("supplier.phonePlaceholder")} value={phone} onChange={(e) => setPhone(e.target.value)} className={inputClass} />
          <input placeholder={t("supplier.addressPlaceholder")} value={address} onChange={(e) => setAddress(e.target.value)} className={inputClass} />
        </div>
        <label className="flex flex-col gap-1">
          <span className="text-xs text-ink-muted">{t("supplier.dateAddedLabel")}</span>
          <DateInput value={dateAdded} onChange={(e) => setDateAdded(e.target.value)} className={inputClass} />
        </label>

        <div>
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-muted">{t("supplier.suppliesListSection")}</p>
          <p className="mb-2 text-xs text-ink-muted">{t("supplier.suppliesListHint")}</p>

          <div className="mb-3 flex flex-wrap gap-1.5">
            {COMMON_ITEMS.map((item) => {
              const added = suppliesList.some((i) => i.itemName.toLowerCase() === item.toLowerCase());
              return (
                <button
                  key={item}
                  type="button"
                  disabled={added}
                  onClick={() => addItem(item)}
                  className="rounded-full border border-border bg-surface px-3 py-1.5 text-xs font-semibold text-ink-secondary transition-all hover:border-series-1/50 hover:text-series-1 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  {added ? "✓ " : "+ "}
                  {item}
                </button>
              );
            })}
          </div>

          {suppliesList.length === 0 ? (
            <p className="rounded-xl border border-dashed border-border px-3 py-3 text-xs text-ink-muted">{t("supplier.noItemsAddedYet")}</p>
          ) : (
            <div className="flex flex-col gap-2">
              {suppliesList.map((item, i) => (
                <div key={i} className="flex gap-2">
                  <input
                    placeholder={t("supplier.itemNamePlaceholder")}
                    value={item.itemName}
                    onChange={(e) => setSuppliesList((list) => list.map((v, j) => (j === i ? { ...v, itemName: e.target.value } : v)))}
                    className={inputClass + " flex-1"}
                  />
                  <select
                    value={item.unit}
                    onChange={(e) => setSuppliesList((list) => list.map((v, j) => (j === i ? { ...v, unit: e.target.value as SupplyUnit } : v)))}
                    className={inputClass}
                  >
                    {UNITS.map((u) => (
                      <option key={u} value={u}>
                        {unitLabel(u)}
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    onClick={() => setSuppliesList((list) => list.filter((_, j) => j !== i))}
                    className="text-ink-muted hover:text-status-critical"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              ))}
            </div>
          )}

          <button
            type="button"
            onClick={() => setSuppliesList((list) => [...list, { itemName: "", unit: "KG" }])}
            className="mt-2 flex items-center gap-1 text-xs font-medium text-series-1 hover:underline"
          >
            <Plus className="h-3.5 w-3.5" /> {t("supplier.addCustomItem")}
          </button>
        </div>

        <Button type="submit" disabled={saving}>
          {existing ? t("common.saveChanges") : t("supplier.saveSupplier")}
        </Button>
      </form>
    </Card>
  );
}
