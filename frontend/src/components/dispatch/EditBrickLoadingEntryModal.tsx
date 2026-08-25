import { FormEvent, useEffect, useState } from "react";
import { X } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { DateInput } from "@/components/ui/date-input";
import { api } from "@/lib/api";
import { useTranslation } from "@/hooks/useTranslation";
import { cn, formatINR, formatVehicleNumber } from "@/lib/utils";
import { BrickLineItemsEditor, isValidLineItemRow, lineItemRowsFrom, type LineItemRow } from "@/components/dispatch/BrickLineItemsEditor";
import { AmountPaymentModeFields } from "@/components/shared/AmountPaymentModeFields";
import { isPaymentSplitMismatched } from "@/components/shared/PaymentSplitFields";
import { VehicleNumberInput } from "@/components/shared/VehicleNumberInput";
import { VehicleTypeRadioCards } from "@/components/shared/VehicleTypeRadioCards";
import type { BrickCategory, BrickLoadingEntry, BrickVehicleType, LaborPaymentMode } from "@/types";

const inputClass =
  "h-10 rounded-xl border border-border bg-ink-primary/5 px-3 text-sm text-ink-primary outline-none focus:ring-2 focus:ring-series-1";

interface EditBrickLoadingEntryModalProps {
  entry: BrickLoadingEntry;
  onClose: () => void;
  onSaved: () => void;
}

// Full admin edit — mirrors every field on the Log Trip form (see
// BrickLoading.tsx) so a trip can be corrected the same way it was
// entered, including which categories/quantities/prices make up the
// trip — editing this re-diffs and corrects `brickCategories.quantity`
// per category server-side (see updateBrickLoadingEntry). Changing
// tipAmount (Driver Reward) never silently rewrites what was already
// posted to a driver's ledger for legacy entries that still carry a
// driverId — the backend posts a correction entry for the difference
// instead. Editing the payment-mode/split fields below also carries
// through to the already-logged Expense row for that cost (see
// updateLinkedExpensePaymentInfo) — the amount itself is never rewritten,
// only how it was paid.
export function EditBrickLoadingEntryModal({ entry, onClose, onSaved }: EditBrickLoadingEntryModalProps) {
  const [customerName, setCustomerName] = useState(entry.customerName ?? "");
  const [customerPhone, setCustomerPhone] = useState(entry.customerPhone ?? "");
  const [customerAddress, setCustomerAddress] = useState(entry.customerAddress ?? "");
  const [driverName, setDriverName] = useState(entry.driverName ?? "");
  const [driverPhone, setDriverPhone] = useState(entry.driverPhone ?? "");
  const [tipAmount, setTipAmount] = useState(String(entry.tipAmount ?? 0));
  const [tipPaymentMode, setTipPaymentMode] = useState<LaborPaymentMode | "">(entry.tipPaymentMode ?? "");
  const [tipCashAmount, setTipCashAmount] = useState(entry.tipCashAmount != null ? String(entry.tipCashAmount) : "");
  const [tipOnlineAmount, setTipOnlineAmount] = useState(entry.tipOnlineAmount != null ? String(entry.tipOnlineAmount) : "");
  const [vehicleNumber, setVehicleNumber] = useState(formatVehicleNumber(entry.vehicleNumber));
  const [vehicleType, setVehicleType] = useState<BrickVehicleType>(entry.vehicleType ?? "TRUCK");
  const [items, setItems] = useState<LineItemRow[]>(lineItemRowsFrom(entry));
  const [categories, setCategories] = useState<BrickCategory[]>([]);
  const [unloadedBricksCount, setUnloadedBricksCount] = useState(entry.unloadedBricksCount ? String(entry.unloadedBricksCount) : "");
  const [loadingRatePerThousand, setLoadingRatePerThousand] = useState(entry.loadingRatePerThousand ? String(entry.loadingRatePerThousand) : "");
  const [loadingPaymentMode, setLoadingPaymentMode] = useState<LaborPaymentMode | "">(entry.loadingPaymentMode ?? "");
  const [loadingCashAmount, setLoadingCashAmount] = useState(entry.loadingCashAmount != null ? String(entry.loadingCashAmount) : "");
  const [loadingOnlineAmount, setLoadingOnlineAmount] = useState(entry.loadingOnlineAmount != null ? String(entry.loadingOnlineAmount) : "");
  const [unloadingRatePerThousand, setUnloadingRatePerThousand] = useState(
    entry.unloadingRatePerThousand ? String(entry.unloadingRatePerThousand) : ""
  );
  const [unloadingPaymentMode, setUnloadingPaymentMode] = useState<LaborPaymentMode | "">(entry.unloadingPaymentMode ?? "");
  const [unloadingCashAmount, setUnloadingCashAmount] = useState(entry.unloadingCashAmount != null ? String(entry.unloadingCashAmount) : "");
  const [unloadingOnlineAmount, setUnloadingOnlineAmount] = useState(entry.unloadingOnlineAmount != null ? String(entry.unloadingOnlineAmount) : "");
  const [date, setDate] = useState(entry.date.slice(0, 10));
  const [unloadingDate, setUnloadingDate] = useState(entry.unloadingDate ? entry.unloadingDate.slice(0, 10) : "");
  const [placeOfSupply, setPlaceOfSupply] = useState(entry.placeOfSupply ?? "");
  const [notes, setNotes] = useState(entry.notes ?? "");
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState("");
  const { t } = useTranslation();

  useEffect(() => {
    api.brickCategories.list().then(setCategories).catch(console.error);
  }, []);

  // Same formulas as BrickLoading.tsx's create form, live against whatever
  // the admin has currently typed here — so the Cash/Online split below
  // always validates against the up-to-date charge, not the stale value
  // this trip was originally saved with.
  const totalBricksAcrossItems = items.reduce((sum, row) => sum + (Number(row.bricksCount) || 0), 0);
  const totalLoadingCharge = totalBricksAcrossItems && loadingRatePerThousand ? (totalBricksAcrossItems / 1000) * Number(loadingRatePerThousand) : 0;
  const totalUnloadingCharge =
    unloadedBricksCount && unloadingRatePerThousand ? (Number(unloadedBricksCount) / 1000) * Number(unloadingRatePerThousand) : 0;

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const validItems = items.filter(isValidLineItemRow);
    if (validItems.length === 0) return;
    if (isPaymentSplitMismatched(tipPaymentMode, Number(tipAmount) || 0, tipCashAmount, tipOnlineAmount)) {
      setFormError(t("payment.splitMismatch", { total: (Number(tipAmount) || 0).toLocaleString("en-IN") }));
      return;
    }
    if (isPaymentSplitMismatched(loadingPaymentMode, totalLoadingCharge, loadingCashAmount, loadingOnlineAmount)) {
      setFormError(t("payment.splitMismatch", { total: totalLoadingCharge.toLocaleString("en-IN") }));
      return;
    }
    if (isPaymentSplitMismatched(unloadingPaymentMode, totalUnloadingCharge, unloadingCashAmount, unloadingOnlineAmount)) {
      setFormError(t("payment.splitMismatch", { total: totalUnloadingCharge.toLocaleString("en-IN") }));
      return;
    }
    setFormError("");
    setSaving(true);
    try {
      await api.brickLoading.update(entry._id, {
        customerName: customerName || undefined,
        customerPhone: customerPhone || undefined,
        customerAddress: customerAddress || undefined,
        driverName: driverName || undefined,
        driverPhone: driverPhone || undefined,
        vehicleNumber,
        vehicleType,
        items: validItems.map((row) => ({
          categoryId: row.categoryId,
          bricksCount: Number(row.bricksCount),
          pricePerBrick: row.pricePerBrick ? Number(row.pricePerBrick) : undefined,
        })),
        unloadedBricksCount: unloadedBricksCount ? Number(unloadedBricksCount) : undefined,
        loadingRatePerThousand: loadingRatePerThousand ? Number(loadingRatePerThousand) : undefined,
        loadingPaymentMode: loadingPaymentMode || undefined,
        loadingCashAmount: loadingPaymentMode === "CASH_AND_ONLINE" ? Number(loadingCashAmount) : undefined,
        loadingOnlineAmount: loadingPaymentMode === "CASH_AND_ONLINE" ? Number(loadingOnlineAmount) : undefined,
        unloadingRatePerThousand: unloadingRatePerThousand ? Number(unloadingRatePerThousand) : undefined,
        unloadingPaymentMode: unloadingPaymentMode || undefined,
        unloadingCashAmount: unloadingPaymentMode === "CASH_AND_ONLINE" ? Number(unloadingCashAmount) : undefined,
        unloadingOnlineAmount: unloadingPaymentMode === "CASH_AND_ONLINE" ? Number(unloadingOnlineAmount) : undefined,
        tipAmount: tipAmount ? Number(tipAmount) : 0,
        tipPaymentMode: tipPaymentMode || undefined,
        tipCashAmount: tipPaymentMode === "CASH_AND_ONLINE" ? Number(tipCashAmount) : undefined,
        tipOnlineAmount: tipPaymentMode === "CASH_AND_ONLINE" ? Number(tipOnlineAmount) : undefined,
        date: date || undefined,
        unloadingDate: unloadingDate || undefined,
        placeOfSupply: placeOfSupply || undefined,
        notes: notes || undefined,
      });
      onSaved();
      onClose();
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <Card className="w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-ink-primary">
            {t("brickLoading.editEntryTitle")}
            {entry.tripNumber && <span className="ml-1.5 font-normal text-ink-muted">#{entry.tripNumber}</span>}
          </h3>
          <button onClick={onClose} className="text-ink-muted hover:text-ink-primary">
            <X className="h-4 w-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-muted">{t("brickLoading.customerPartySection")}</p>
            <div className="grid grid-cols-2 gap-2">
              <input
                placeholder={t("brickLoading.customerNamePlaceholder")}
                value={customerName}
                onChange={(e) => setCustomerName(e.target.value)}
                className={inputClass}
              />
              <input
                placeholder={t("brickLoading.customerPhonePlaceholder")}
                value={customerPhone}
                onChange={(e) => setCustomerPhone(e.target.value)}
                className={inputClass}
              />
              <input
                placeholder={t("brickLoading.customerAddressPlaceholder")}
                value={customerAddress}
                onChange={(e) => setCustomerAddress(e.target.value)}
                className="col-span-2 h-10 rounded-xl border border-border bg-ink-primary/5 px-3 text-sm text-ink-primary outline-none focus:ring-2 focus:ring-series-1"
              />
              <input
                placeholder={t("dispatchDocs.placeOfSupplyPlaceholder")}
                value={placeOfSupply}
                onChange={(e) => setPlaceOfSupply(e.target.value)}
                className="col-span-2 h-10 rounded-xl border border-border bg-ink-primary/5 px-3 text-sm text-ink-primary outline-none focus:ring-2 focus:ring-series-1"
              />
            </div>
          </div>

          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-muted">{t("brickLoading.driverSection")}</p>
            <div className="grid grid-cols-2 gap-2">
              <input
                placeholder={t("brickLoading.driverNamePlaceholder")}
                value={driverName}
                onChange={(e) => setDriverName(e.target.value)}
                className={inputClass}
              />
              <input
                placeholder={t("brickLoading.driverPhonePlaceholder")}
                value={driverPhone}
                onChange={(e) => setDriverPhone(e.target.value)}
                className={inputClass}
              />
              <input
                type="number"
                placeholder={t("brickLoading.driverRewardPlaceholder")}
                value={tipAmount}
                onChange={(e) => setTipAmount(e.target.value)}
                className={inputClass}
              />
              {Number(tipAmount) > 0 && (
                <AmountPaymentModeFields
                  amount={Number(tipAmount)}
                  paymentMode={tipPaymentMode}
                  cashAmount={tipCashAmount}
                  onlineAmount={tipOnlineAmount}
                  onPaymentModeChange={setTipPaymentMode}
                  onCashAmountChange={setTipCashAmount}
                  onOnlineAmountChange={setTipOnlineAmount}
                  inputClassName={inputClass}
                />
              )}
            </div>
          </div>

          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-muted">{t("brickLoading.loadingSection")}</p>
            <div className="mb-2 grid grid-cols-2 gap-2">
              <VehicleNumberInput
                required
                placeholder={t("brickLoading.vehicleNumber")}
                value={vehicleNumber}
                onChange={setVehicleNumber}
                className={cn(inputClass, "col-span-2")}
              />
              <VehicleTypeRadioCards value={vehicleType} onChange={setVehicleType} className="col-span-2" />
              <input
                type="number"
                placeholder={t("brickLoading.loadingRatePlaceholder")}
                value={loadingRatePerThousand}
                onChange={(e) => setLoadingRatePerThousand(e.target.value)}
                className={inputClass}
              />
              <label className="col-span-2 flex flex-col gap-1">
                <span className="text-xs text-ink-muted">{t("brickLoading.loadingDateLabel")}</span>
                <DateInput required value={date} onChange={(e) => setDate(e.target.value)} className={inputClass} />
              </label>
            </div>
            <BrickLineItemsEditor items={items} onChange={setItems} categories={categories} />
            {entry.amount != null && (
              <p className="mt-2 text-sm text-ink-muted">
                {t("brickLoading.totalAmountLabel")}: <span className="font-semibold text-ink-primary">₹{formatINR(entry.amount)}</span>
              </p>
            )}
            {totalLoadingCharge > 0 && (
              <div className="mt-2 grid grid-cols-2 gap-2">
                <div className="col-span-2 rounded-xl border border-border bg-ink-primary/5 px-3 py-2">
                  <p className="text-xs text-ink-muted">{t("brickLoading.totalLoadingChargeLabel")}</p>
                  <p className="text-sm font-semibold tabular-nums text-ink-primary">₹{formatINR(totalLoadingCharge)}</p>
                </div>
                <AmountPaymentModeFields
                  amount={totalLoadingCharge}
                  paymentMode={loadingPaymentMode}
                  cashAmount={loadingCashAmount}
                  onlineAmount={loadingOnlineAmount}
                  onPaymentModeChange={setLoadingPaymentMode}
                  onCashAmountChange={setLoadingCashAmount}
                  onOnlineAmountChange={setLoadingOnlineAmount}
                  inputClassName={inputClass}
                />
              </div>
            )}
          </div>

          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-muted">{t("brickLoading.unloadingSection")}</p>
            <div className="grid grid-cols-2 gap-2">
              <input
                type="number"
                placeholder={t("brickLoading.bricksUnloadedPlaceholder")}
                value={unloadedBricksCount}
                onChange={(e) => setUnloadedBricksCount(e.target.value)}
                className={inputClass}
              />
              <input
                type="number"
                placeholder={t("brickLoading.unloadingRatePlaceholder")}
                value={unloadingRatePerThousand}
                onChange={(e) => setUnloadingRatePerThousand(e.target.value)}
                className={inputClass}
              />
              <label className="flex flex-col gap-1">
                <span className="text-xs text-ink-muted">{t("brickLoading.unloadingDateLabel")}</span>
                <DateInput value={unloadingDate} onChange={(e) => setUnloadingDate(e.target.value)} className={inputClass} />
              </label>
            </div>
            {totalUnloadingCharge > 0 && (
              <div className="mt-2 grid grid-cols-2 gap-2">
                <div className="col-span-2 rounded-xl border border-border bg-ink-primary/5 px-3 py-2">
                  <p className="text-xs text-ink-muted">{t("brickLoading.totalUnloadingChargeLabel")}</p>
                  <p className="text-sm font-semibold tabular-nums text-ink-primary">₹{formatINR(totalUnloadingCharge)}</p>
                </div>
                <AmountPaymentModeFields
                  amount={totalUnloadingCharge}
                  paymentMode={unloadingPaymentMode}
                  cashAmount={unloadingCashAmount}
                  onlineAmount={unloadingOnlineAmount}
                  onPaymentModeChange={setUnloadingPaymentMode}
                  onCashAmountChange={setUnloadingCashAmount}
                  onOnlineAmountChange={setUnloadingOnlineAmount}
                  inputClassName={inputClass}
                />
              </div>
            )}
          </div>

          <input
            placeholder={t("common.notes")}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            className={inputClass}
          />

          {formError && <p className="text-sm text-status-critical">{formError}</p>}
          <Button type="submit" disabled={saving}>
            {t("common.saveChanges")}
          </Button>
        </form>
      </Card>
    </div>
  );
}
