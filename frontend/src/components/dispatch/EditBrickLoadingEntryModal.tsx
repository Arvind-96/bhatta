import { FormEvent, useState } from "react";
import { X } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { DateInput } from "@/components/ui/date-input";
import { api } from "@/lib/api";
import { useTranslation } from "@/hooks/useTranslation";
import { formatINR } from "@/lib/utils";
import type { BrickLoadingEntry } from "@/types";

const inputClass =
  "h-10 rounded-xl border border-border bg-ink-primary/5 px-3 text-sm text-ink-primary outline-none focus:ring-2 focus:ring-series-1";

interface EditBrickLoadingEntryModalProps {
  entry: BrickLoadingEntry;
  onClose: () => void;
  onSaved: () => void;
}

// Full admin edit — mirrors every field on the Log Trip form (see
// BrickLoading.tsx) so a trip can be corrected the same way it was
// entered. Category can't be changed here (that would also need to move
// stock between categories) — bricksCount/unloadedBricksCount/laborer
// count/rate edits recompute the stored Total Amount/Total Loading
// Charge/Total Unloading Charge server-side. Changing tipAmount (Driver
// Reward) never silently rewrites what was already posted to a driver's
// ledger for legacy entries that still carry a driverId — the backend
// posts a correction entry for the difference instead.
export function EditBrickLoadingEntryModal({ entry, onClose, onSaved }: EditBrickLoadingEntryModalProps) {
  const [customerName, setCustomerName] = useState(entry.customerName ?? "");
  const [customerPhone, setCustomerPhone] = useState(entry.customerPhone ?? "");
  const [customerAddress, setCustomerAddress] = useState(entry.customerAddress ?? "");
  const [driverName, setDriverName] = useState(entry.driverName ?? "");
  const [driverPhone, setDriverPhone] = useState(entry.driverPhone ?? "");
  const [tipAmount, setTipAmount] = useState(String(entry.tipAmount ?? 0));
  const [vehicleNumber, setVehicleNumber] = useState(entry.vehicleNumber);
  const [bricksCount, setBricksCount] = useState(String(entry.bricksCount));
  const [unloadedBricksCount, setUnloadedBricksCount] = useState(entry.unloadedBricksCount ? String(entry.unloadedBricksCount) : "");
  const [loadingLaborerCount, setLoadingLaborerCount] = useState(entry.loadingLaborerCount ? String(entry.loadingLaborerCount) : "");
  const [loadingRatePerThousand, setLoadingRatePerThousand] = useState(entry.loadingRatePerThousand ? String(entry.loadingRatePerThousand) : "");
  const [unloadingLaborerCount, setUnloadingLaborerCount] = useState(entry.unloadingLaborerCount ? String(entry.unloadingLaborerCount) : "");
  const [unloadingRatePerThousand, setUnloadingRatePerThousand] = useState(
    entry.unloadingRatePerThousand ? String(entry.unloadingRatePerThousand) : ""
  );
  const [date, setDate] = useState(entry.date.slice(0, 10));
  const [unloadingDate, setUnloadingDate] = useState(entry.unloadingDate ? entry.unloadingDate.slice(0, 10) : "");
  const [notes, setNotes] = useState(entry.notes ?? "");
  const [saving, setSaving] = useState(false);
  const { t } = useTranslation();
  const hasDriver = !!entry.driverId;

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      await api.brickLoading.update(entry._id, {
        customerName: customerName || undefined,
        customerPhone: customerPhone || undefined,
        customerAddress: customerAddress || undefined,
        driverName: driverName || undefined,
        driverPhone: driverPhone || undefined,
        vehicleNumber,
        bricksCount: Number(bricksCount),
        unloadedBricksCount: unloadedBricksCount ? Number(unloadedBricksCount) : undefined,
        loadingLaborerCount: loadingLaborerCount ? Number(loadingLaborerCount) : undefined,
        loadingRatePerThousand: loadingRatePerThousand ? Number(loadingRatePerThousand) : undefined,
        unloadingLaborerCount: unloadingLaborerCount ? Number(unloadingLaborerCount) : undefined,
        unloadingRatePerThousand: unloadingRatePerThousand ? Number(unloadingRatePerThousand) : undefined,
        ...(hasDriver ? { tipAmount: tipAmount ? Number(tipAmount) : 0 } : {}),
        date: date || undefined,
        unloadingDate: unloadingDate || undefined,
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
              {hasDriver && (
                <input
                  type="number"
                  placeholder={t("brickLoading.driverRewardPlaceholder")}
                  value={tipAmount}
                  onChange={(e) => setTipAmount(e.target.value)}
                  className={inputClass}
                />
              )}
            </div>
          </div>

          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-muted">{t("brickLoading.loadingSection")}</p>
            <div className="grid grid-cols-2 gap-2">
              <input
                required
                placeholder={t("brickLoading.vehicleNumber")}
                value={vehicleNumber}
                onChange={(e) => setVehicleNumber(e.target.value)}
                className={inputClass}
              />
              <input
                required
                type="number"
                placeholder={t("brickLoading.bricksLoadedPlaceholder")}
                value={bricksCount}
                onChange={(e) => setBricksCount(e.target.value)}
                className={inputClass}
              />
              <input
                type="number"
                placeholder={t("brickLoading.loadingLaborerCountPlaceholder")}
                value={loadingLaborerCount}
                onChange={(e) => setLoadingLaborerCount(e.target.value)}
                className={inputClass}
              />
              <input
                type="number"
                placeholder={t("brickLoading.loadingRatePlaceholder")}
                value={loadingRatePerThousand}
                onChange={(e) => setLoadingRatePerThousand(e.target.value)}
                className={inputClass}
              />
              <label className="flex flex-col gap-1">
                <span className="text-xs text-ink-muted">{t("brickLoading.loadingDateLabel")}</span>
                <DateInput value={date} onChange={(e) => setDate(e.target.value)} className={inputClass} />
              </label>
            </div>
            {entry.amount !== undefined && (
              <p className="mt-2 text-sm text-ink-muted">
                {t("brickLoading.totalAmountLabel")}: <span className="font-semibold text-ink-primary">₹{formatINR(entry.amount)}</span>
              </p>
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
                placeholder={t("brickLoading.unloadingLaborerCountPlaceholder")}
                value={unloadingLaborerCount}
                onChange={(e) => setUnloadingLaborerCount(e.target.value)}
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
          </div>

          <input
            placeholder={t("common.notes")}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            className={inputClass}
          />

          <Button type="submit" disabled={saving}>
            {t("common.saveChanges")}
          </Button>
        </form>
      </Card>
    </div>
  );
}
