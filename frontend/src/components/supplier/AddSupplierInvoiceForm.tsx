import { FormEvent, useEffect, useState } from "react";
import { Plus, X } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { DateInput } from "@/components/ui/date-input";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { AmountPaymentModeFields } from "@/components/shared/AmountPaymentModeFields";
import { isPaymentSplitMismatched } from "@/components/shared/PaymentSplitFields";
import { api } from "@/lib/api";
import { useTranslation } from "@/hooks/useTranslation";
import { formatINR } from "@/lib/utils";
import type { LaborPaymentMode, Supplier, SupplierInvoice, SupplierInvoiceItem, SupplyUnit } from "@/types";

const inputClass =
  "h-10 rounded-xl border border-border bg-ink-primary/5 px-3 text-sm text-ink-primary outline-none focus:ring-2 focus:ring-series-1";

const UNITS: SupplyUnit[] = ["KG", "PIECE", "METER"];

interface AddSupplierInvoiceFormProps {
  suppliers: Supplier[];
  existing?: SupplierInvoice | null;
  defaultSupplierId?: string;
  onClose: () => void;
  onSaved: (invoice: SupplierInvoice) => void;
}

// Shared by both the Supplier page's "Record Supplies Received" and
// "Create Invoice/Receipt" actions -- the fields the spec calls for under
// each are identical (who, what was received, the bill, what's been
// paid), so both feed the same record instead of two parallel logs that
// could drift apart. What's created here also becomes the printable
// receipt (see printSupplierInvoiceRecord) and shows up in the
// supplier's own profile automatically, since it's the same row either
// way.
export function AddSupplierInvoiceForm({ suppliers, existing, defaultSupplierId, onClose, onSaved }: AddSupplierInvoiceFormProps) {
  const { t } = useTranslation();
  const [supplierId, setSupplierId] = useState(existing?.supplierId ?? defaultSupplierId ?? "");
  const [date, setDate] = useState(existing?.date ? existing.date.slice(0, 10) : new Date().toISOString().slice(0, 10));
  const [items, setItems] = useState<SupplierInvoiceItem[]>(existing?.itemsReceived?.length ? existing.itemsReceived : [{ itemName: "", unit: "KG", quantity: 0 }]);
  const [totalBillAmount, setTotalBillAmount] = useState(existing ? String(existing.totalBillAmount) : "");
  // Once the admin edits the amount directly (or this is an existing
  // invoice being reopened), stop overwriting it as items change — the
  // auto-fill is a starting suggestion, not a value that should silently
  // clobber a deliberate override.
  const [amountTouched, setAmountTouched] = useState(!!existing);
  const [amountPaid, setAmountPaid] = useState(existing ? String(existing.amountPaid) : "");
  const [paymentMode, setPaymentMode] = useState<LaborPaymentMode | "">(existing?.paymentMode ?? "");
  const [cashAmount, setCashAmount] = useState(existing?.cashAmount != null ? String(existing.cashAmount) : "");
  const [onlineAmount, setOnlineAmount] = useState(existing?.onlineAmount != null ? String(existing.onlineAmount) : "");
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState("");

  const supplierOptions = suppliers.map((s) => ({ value: s._id, label: s.name, sublabel: s.phone }));
  const selectedSupplier = suppliers.find((s) => s._id === supplierId);
  const dueAmount = Math.max(0, (Number(totalBillAmount) || 0) - (Number(amountPaid) || 0));

  // Sums quantity × the supplier's on-file rate for each item that
  // matches their suppliesList (by name+unit) — items with no matching
  // catalog rate (a custom item, or the supplier never set one) simply
  // don't contribute, since there's nothing to guess from.
  useEffect(() => {
    if (amountTouched || !selectedSupplier) return;
    const rateByKey = new Map(selectedSupplier.suppliesList.map((i) => [`${i.itemName.trim().toLowerCase()}__${i.unit}`, i.rate]));
    const computed = items.reduce((sum, item) => {
      const rate = rateByKey.get(`${item.itemName.trim().toLowerCase()}__${item.unit}`);
      return rate != null && item.quantity > 0 ? sum + rate * item.quantity : sum;
    }, 0);
    setTotalBillAmount(computed > 0 ? String(computed) : "");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items, selectedSupplier, amountTouched]);

  function unitLabel(unit: SupplyUnit) {
    return unit === "KG" ? t("supplier.unitKg") : unit === "PIECE" ? t("supplier.unitPiece") : t("supplier.unitMeter");
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (isPaymentSplitMismatched(paymentMode, Number(amountPaid) || 0, cashAmount, onlineAmount)) {
      setFormError(t("payment.splitMismatch", { total: (Number(amountPaid) || 0).toLocaleString("en-IN") }));
      return;
    }
    setFormError("");
    setSaving(true);
    try {
      const payload = {
        supplierId,
        date,
        itemsReceived: items.filter((i) => i.itemName.trim()),
        totalBillAmount: Number(totalBillAmount) || 0,
        amountPaid: Number(amountPaid) || 0,
        paymentMode: paymentMode || undefined,
        cashAmount: paymentMode === "CASH_AND_ONLINE" ? Number(cashAmount) : undefined,
        onlineAmount: paymentMode === "CASH_AND_ONLINE" ? Number(onlineAmount) : undefined,
      };
      const saved = existing ? await api.supplierInvoices.update(existing._id, payload) : await api.supplierInvoices.create(payload);
      onSaved(saved);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card>
      <div className="mb-4 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-ink-primary">
          {existing ? t("supplier.editInvoiceTitle") : t("supplier.newInvoiceTitle")}
        </h3>
        <button onClick={onClose} className="text-ink-muted hover:text-ink-primary">
          <X className="h-4 w-4" />
        </button>
      </div>

      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <div className="grid grid-cols-2 gap-2">
          <label className="flex flex-col gap-1">
            <span className="text-xs text-ink-muted">{t("supplier.supplierNamePlaceholder")}</span>
            <SearchableSelect
              required
              options={supplierOptions}
              value={supplierId}
              onChange={setSupplierId}
              placeholder={t("supplier.searchSuppliersPlaceholder")}
              emptyMessage={t("supplier.noSuppliersYet")}
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs text-ink-muted">{t("supplier.dateAddedLabel")}</span>
            <DateInput required value={date} onChange={(e) => setDate(e.target.value)} className={inputClass} />
          </label>
        </div>

        <div>
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-muted">{t("supplier.itemsReceivedSection")}</p>

          {selectedSupplier && selectedSupplier.suppliesList.length > 0 && (
            <div className="mb-2 flex flex-wrap gap-1.5">
              {selectedSupplier.suppliesList.map((catalogItem) => {
                const added = items.some((i) => i.itemName.toLowerCase() === catalogItem.itemName.toLowerCase());
                return (
                  <button
                    key={catalogItem.itemName}
                    type="button"
                    disabled={added}
                    onClick={() =>
                      setItems((list) => {
                        const blankIdx = list.findIndex((i) => !i.itemName.trim());
                        const entry = { itemName: catalogItem.itemName, unit: catalogItem.unit, quantity: 0 };
                        if (blankIdx >= 0) return list.map((v, j) => (j === blankIdx ? entry : v));
                        return [...list, entry];
                      })
                    }
                    className="rounded-full border border-border bg-surface px-3 py-1.5 text-xs font-semibold text-ink-secondary transition-all hover:border-series-1/50 hover:text-series-1 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    {added ? "✓ " : "+ "}
                    {catalogItem.itemName} ({unitLabel(catalogItem.unit)})
                  </button>
                );
              })}
            </div>
          )}

          <div className="flex flex-col gap-2">
            {items.map((item, i) => (
              <div key={i} className="grid grid-cols-[1fr_auto_auto_auto] gap-2">
                <input
                  placeholder={t("supplier.itemNamePlaceholder")}
                  value={item.itemName}
                  onChange={(e) => setItems((list) => list.map((v, j) => (j === i ? { ...v, itemName: e.target.value } : v)))}
                  className={inputClass}
                />
                <input
                  type="number"
                  min={0}
                  placeholder={t("supplier.quantityPlaceholder")}
                  value={item.quantity || ""}
                  onChange={(e) => setItems((list) => list.map((v, j) => (j === i ? { ...v, quantity: Number(e.target.value) } : v)))}
                  className={inputClass + " w-24"}
                />
                <select
                  value={item.unit}
                  onChange={(e) => setItems((list) => list.map((v, j) => (j === i ? { ...v, unit: e.target.value as SupplyUnit } : v)))}
                  className={inputClass}
                >
                  {UNITS.map((u) => (
                    <option key={u} value={u}>
                      {unitLabel(u)}
                    </option>
                  ))}
                </select>
                <button type="button" onClick={() => setItems((list) => list.filter((_, j) => j !== i))} className="text-ink-muted hover:text-status-critical">
                  <X className="h-4 w-4" />
                </button>
              </div>
            ))}
          </div>
          <button
            type="button"
            onClick={() => setItems((list) => [...list, { itemName: "", unit: "KG", quantity: 0 }])}
            className="mt-2 flex items-center gap-1 text-xs font-medium text-series-1 hover:underline"
          >
            <Plus className="h-3.5 w-3.5" /> {t("supplier.addCustomItem")}
          </button>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <label className="flex flex-col gap-1">
            <span className="text-xs text-ink-muted">{t("supplier.totalBillAmountLabel")}</span>
            <input
              required
              type="number"
              min={0}
              placeholder="₹"
              value={totalBillAmount}
              onChange={(e) => {
                setTotalBillAmount(e.target.value);
                setAmountTouched(true);
              }}
              className={inputClass}
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs text-ink-muted">{t("supplier.amountPaidLabel")}</span>
            <input type="number" min={0} placeholder="₹" value={amountPaid} onChange={(e) => setAmountPaid(e.target.value)} className={inputClass} />
          </label>
        </div>

        {Number(amountPaid) > 0 && (
          <AmountPaymentModeFields
            amount={Number(amountPaid)}
            paymentMode={paymentMode}
            cashAmount={cashAmount}
            onlineAmount={onlineAmount}
            onPaymentModeChange={setPaymentMode}
            onCashAmountChange={setCashAmount}
            onOnlineAmountChange={setOnlineAmount}
            inputClassName={inputClass}
          />
        )}

        <div className="rounded-xl border border-status-critical/30 bg-status-critical/5 px-3 py-2.5">
          <p className="text-xs text-ink-muted">{t("supplier.dueAmountLabel")}</p>
          <p className="text-lg font-semibold tabular-nums text-status-critical">₹{formatINR(dueAmount)}</p>
        </div>

        {formError && <p className="text-sm text-status-critical">{formError}</p>}
        <Button type="submit" disabled={saving || !supplierId}>
          {existing ? t("common.saveChanges") : t("supplier.saveInvoice")}
        </Button>
      </form>
    </Card>
  );
}
