import { FormEvent, useState } from "react";
import { X } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api";
import { useTranslation } from "@/hooks/useTranslation";
import type { BrickLoadingEntry, BrickVehicleType } from "@/types";

const inputClass =
  "h-10 rounded-xl border border-border bg-ink-primary/5 px-3 text-sm text-ink-primary outline-none focus:ring-2 focus:ring-series-1";

interface EditBrickLoadingEntryModalProps {
  entry: BrickLoadingEntry;
  onClose: () => void;
  onSaved: () => void;
}

// Full admin edit — changing tipAmount never silently rewrites what was
// already posted to the driver's ledger; the backend posts a correction
// entry for the difference instead (see brickLoading.service.ts). The Tip
// field only shows for entries that already have a driver — new trips
// (created after Driver/Tip were removed from the Log Trip form) have
// none. Category can't be changed here (that would also need to move
// stock between categories) — bricksCount/discount/loading/unloading edits
// recompute the stored `amount` against the entry's existing category.
export function EditBrickLoadingEntryModal({ entry, onClose, onSaved }: EditBrickLoadingEntryModalProps) {
  const [vehicleType, setVehicleType] = useState<BrickVehicleType>(entry.vehicleType);
  const [vehicleNumber, setVehicleNumber] = useState(entry.vehicleNumber);
  const [bricksCount, setBricksCount] = useState(String(entry.bricksCount));
  const [discountAmount, setDiscountAmount] = useState(String(entry.discountAmount ?? 0));
  const [loadingCharge, setLoadingCharge] = useState(String(entry.loadingCharge ?? 0));
  const [unloadingCharge, setUnloadingCharge] = useState(String(entry.unloadingCharge ?? 0));
  const [tipAmount, setTipAmount] = useState(String(entry.tipAmount ?? 0));
  const [notes, setNotes] = useState(entry.notes ?? "");
  const [saving, setSaving] = useState(false);
  const { t } = useTranslation();
  const hasDriver = !!entry.driverId;

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      await api.brickLoading.update(entry._id, {
        vehicleType,
        vehicleNumber,
        bricksCount: Number(bricksCount),
        discountAmount: discountAmount ? Number(discountAmount) : 0,
        loadingCharge: loadingCharge ? Number(loadingCharge) : 0,
        unloadingCharge: unloadingCharge ? Number(unloadingCharge) : 0,
        ...(hasDriver ? { tipAmount: tipAmount ? Number(tipAmount) : 0 } : {}),
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
      <Card className="w-full max-w-md">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-ink-primary">
            {t("brickLoading.editEntryTitle")}
            {entry.tripNumber && <span className="ml-1.5 font-normal text-ink-muted">#{entry.tripNumber}</span>}
          </h3>
          <button onClick={onClose} className="text-ink-muted hover:text-ink-primary">
            <X className="h-4 w-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="grid grid-cols-2 gap-2">
          <select value={vehicleType} onChange={(e) => setVehicleType(e.target.value as BrickVehicleType)} className={inputClass}>
            <option value="TRUCK">{t("brickLoading.truck")}</option>
            <option value="TRACTOR">{t("brickLoading.tractor")}</option>
          </select>
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
            placeholder={t("brickLoading.discountPlaceholder")}
            value={discountAmount}
            onChange={(e) => setDiscountAmount(e.target.value)}
            className={inputClass}
          />
          <input
            type="number"
            placeholder={t("brickLoading.loadingChargePlaceholder")}
            value={loadingCharge}
            onChange={(e) => setLoadingCharge(e.target.value)}
            className={inputClass}
          />
          <input
            type="number"
            placeholder={t("brickLoading.unloadingChargePlaceholder")}
            value={unloadingCharge}
            onChange={(e) => setUnloadingCharge(e.target.value)}
            className={inputClass}
          />
          {hasDriver && (
            <input
              type="number"
              placeholder={t("brickLoading.tipPlaceholderShort")}
              value={tipAmount}
              onChange={(e) => setTipAmount(e.target.value)}
              className={inputClass}
            />
          )}
          <input
            placeholder={t("common.notes")}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            className="col-span-2 h-10 rounded-xl border border-border bg-ink-primary/5 px-3 text-sm text-ink-primary outline-none focus:ring-2 focus:ring-series-1"
          />
          <Button type="submit" disabled={saving} className="col-span-2">
            {t("common.saveChanges")}
          </Button>
        </form>
      </Card>
    </div>
  );
}
