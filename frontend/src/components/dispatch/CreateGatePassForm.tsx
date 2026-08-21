import { FormEvent, useEffect, useState } from "react";
import { X } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { DateInput } from "@/components/ui/date-input";
import { api } from "@/lib/api";
import { useAuthStore } from "@/store/auth.store";
import { useTranslation } from "@/hooks/useTranslation";
import { printGatePassRecord } from "@/lib/printDocument";
import { resolvePaymentInfo } from "@/lib/paymentStatus";
import { BrickLineItemsEditor, isValidLineItemRow, lineItemRowsFrom, type LineItemRow } from "@/components/dispatch/BrickLineItemsEditor";
import type { BrickCategory, Dispatch as DispatchEntry, GatePassRecord } from "@/types";

const inputClass =
  "h-10 rounded-xl border border-border bg-ink-primary/5 px-3 text-sm text-ink-primary outline-none focus:ring-2 focus:ring-series-1";

interface CreateGatePassFormProps {
  // Null when opened from the standalone Gate Pass detail page to edit an
  // already-created record with no Dispatch loaded.
  dispatch: DispatchEntry | null;
  categories: BrickCategory[];
  existing?: GatePassRecord | null;
  onClose: () => void;
  onSaved: () => void;
}

// The vehicle exit-authorization slip, its own saved record (see
// CreateChallanForm.tsx's doc comment for why this is a separate row
// instead of a live view of the dispatch).
export function CreateGatePassForm({ dispatch, categories, existing, onClose, onSaved }: CreateGatePassFormProps) {
  const { t } = useTranslation();
  const kilns = useAuthStore((s) => s.kilns);
  const activeKilnId = useAuthStore((s) => s.activeKilnId);
  const activeKiln = kilns.find((k) => k.kilnId === activeKilnId);
  const kilnInfo = { name: activeKiln?.name ?? "Bhatta Cloud", location: activeKiln?.location, phone: activeKiln?.phone, gstNumber: activeKiln?.gstNumber };

  const [sequenceNumber, setSequenceNumber] = useState("");
  const [vehicleNumber, setVehicleNumber] = useState(existing?.vehicleNumber ?? dispatch?.vehicleNumber ?? "");
  const [vehicleType, setVehicleType] = useState(existing?.vehicleType ?? dispatch?.vehicleType ?? "");
  const [driverName, setDriverName] = useState(existing?.driverName ?? dispatch?.driverName ?? "");
  const [driverPhone, setDriverPhone] = useState(existing?.driverPhone ?? dispatch?.driverPhone ?? "");
  const [customerName, setCustomerName] = useState(existing?.customerName ?? dispatch?.customerName ?? "");
  const [items, setItems] = useState<LineItemRow[]>(lineItemRowsFrom(existing ?? dispatch ?? { bricksCount: 0 }));
  const [placeOfSupply, setPlaceOfSupply] = useState(existing?.placeOfSupply ?? dispatch?.placeOfSupply ?? "");
  const [gatePassDate, setGatePassDate] = useState((existing?.gatePassDate ?? dispatch?.dispatchedOn ?? new Date().toISOString()).slice(0, 10));
  const [notes, setNotes] = useState(existing?.notes ?? "");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (existing) return;
    api.gatePasses.nextSequenceNumber().then((r) => setSequenceNumber(String(r.nextSequenceNumber)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const validItems = items.filter(isValidLineItemRow);
    if (validItems.length === 0) return;
    setSaving(true);
    try {
      const lineItems = validItems.map((row) => ({ categoryId: row.categoryId, bricksCount: Number(row.bricksCount) }));
      const payload = {
        sequenceNumber: sequenceNumber ? Number(sequenceNumber) : undefined,
        vehicleNumber: vehicleNumber || undefined,
        vehicleType: vehicleType || undefined,
        driverName: driverName || undefined,
        driverPhone: driverPhone || undefined,
        customerName,
        categoryId: lineItems[0].categoryId || undefined,
        bricksCount: lineItems.reduce((sum, i) => sum + i.bricksCount, 0),
        items: lineItems,
        placeOfSupply: placeOfSupply || undefined,
        gatePassDate,
        notes: notes || undefined,
      };
      const row = existing ? await api.gatePasses.update(existing._id, payload) : await api.gatePasses.create({ dispatchId: dispatch!._id, ...payload });
      const { stamp } = await resolvePaymentInfo({ customerName, remainingOnThisDoc: 0 });
      printGatePassRecord(row, kilnInfo, categories, stamp);
      onSaved();
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card className="border-status-warning/30">
      <div className="mb-3 flex items-center justify-between">
        <h4 className="text-sm font-semibold text-ink-primary">{t("dispatchDocs.createGatePassTitle")}</h4>
        <button onClick={onClose} className="text-ink-muted hover:text-ink-primary">
          <X className="h-4 w-4" />
        </button>
      </div>
      <form onSubmit={handleSubmit} className="grid grid-cols-2 gap-2">
        {!existing && (
          <label className="col-span-2 flex flex-col gap-1">
            <span className="text-xs text-ink-muted">{t("dispatchDocs.serialNumberLabel")}</span>
            <input
              type="number"
              value={sequenceNumber}
              onChange={(e) => setSequenceNumber(e.target.value)}
              className={inputClass}
            />
            <span className="text-xs text-ink-muted">{t("dispatchDocs.serialNumberHint")}</span>
          </label>
        )}
        <input required placeholder={t("brickLoading.customerNamePlaceholder")} value={customerName} onChange={(e) => setCustomerName(e.target.value)} className={inputClass} />
        <input placeholder={t("brickLoading.driverNamePlaceholder")} value={driverName} onChange={(e) => setDriverName(e.target.value)} className={inputClass} />
        <input placeholder={t("brickLoading.driverPhonePlaceholder")} value={driverPhone} onChange={(e) => setDriverPhone(e.target.value)} className={inputClass} />
        <input placeholder={t("dispatch.vehicleNumberPlaceholder")} value={vehicleNumber} onChange={(e) => setVehicleNumber(e.target.value)} className={inputClass} />
        <select value={vehicleType} onChange={(e) => setVehicleType(e.target.value)} className={inputClass}>
          <option value="">{t("dispatch.vehicleTypePlaceholder")}</option>
          <option value="TRUCK">{t("brickLoading.truck")}</option>
          <option value="TRACTOR">{t("brickLoading.tractor")}</option>
        </select>
        <div className="col-span-2">
          <BrickLineItemsEditor items={items} onChange={setItems} categories={categories} pricingEnabled={false} />
        </div>
        <input placeholder={t("dispatchDocs.placeOfSupplyPlaceholder")} value={placeOfSupply} onChange={(e) => setPlaceOfSupply(e.target.value)} className={inputClass} />
        <label className="flex flex-col gap-1">
          <span className="text-xs text-ink-muted">{t("common.transactionDate")}</span>
          <DateInput required value={gatePassDate} onChange={(e) => setGatePassDate(e.target.value)} className={inputClass} />
        </label>
        <input placeholder={t("common.notes")} value={notes} onChange={(e) => setNotes(e.target.value)} className="col-span-2 h-10 rounded-xl border border-border bg-ink-primary/5 px-3 text-sm text-ink-primary outline-none focus:ring-2 focus:ring-series-1" />
        <Button type="submit" disabled={saving} className="col-span-2">
          {existing ? t("dispatchDocs.saveAndReprintGatePass") : t("dispatchDocs.generateGatePass")}
        </Button>
      </form>
    </Card>
  );
}
