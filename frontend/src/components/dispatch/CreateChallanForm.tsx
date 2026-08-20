import { FormEvent, useState } from "react";
import { X } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { DateInput } from "@/components/ui/date-input";
import { api } from "@/lib/api";
import { useAuthStore } from "@/store/auth.store";
import { useTranslation } from "@/hooks/useTranslation";
import { printChallanRecord } from "@/lib/printDocument";
import type { BrickCategory, Challan, Dispatch as DispatchEntry } from "@/types";

const inputClass =
  "h-10 rounded-xl border border-border bg-ink-primary/5 px-3 text-sm text-ink-primary outline-none focus:ring-2 focus:ring-series-1";

interface CreateChallanFormProps {
  dispatch: DispatchEntry;
  categories: BrickCategory[];
  existing?: Challan | null;
  onClose: () => void;
  onSaved: () => void;
}

function categoryLabelFor(categoryId: string, categories: BrickCategory[]) {
  const c = categories.find((cat) => cat._id === categoryId);
  if (!c) return "—";
  return c.grade ? `${c.category} (${c.grade})` : c.category;
}

// A pure delivery note (no pricing) editable independently of the
// Dispatch record it's created from -- pre-filled from the dispatch the
// first time, then its own saved fields on every re-open. Generating
// prints immediately (see printChallanRecord), matching the "Create
// Challan" action's intent -- the form stays open afterward so the admin
// can adjust and reprint without losing their place.
export function CreateChallanForm({ dispatch, categories, existing, onClose, onSaved }: CreateChallanFormProps) {
  const { t } = useTranslation();
  const kilns = useAuthStore((s) => s.kilns);
  const activeKilnId = useAuthStore((s) => s.activeKilnId);
  const activeKiln = kilns.find((k) => k.kilnId === activeKilnId);
  const kilnInfo = { name: activeKiln?.name ?? "Bhatta Cloud", location: activeKiln?.location, phone: activeKiln?.phone, gstNumber: activeKiln?.gstNumber };

  const dispatchCategoryId = typeof dispatch.categoryId === "object" ? dispatch.categoryId?._id ?? "" : dispatch.categoryId ?? "";
  const [vehicleNumber, setVehicleNumber] = useState(existing?.vehicleNumber ?? dispatch.vehicleNumber ?? "");
  const [vehicleType, setVehicleType] = useState(existing?.vehicleType ?? dispatch.vehicleType ?? "");
  const [driverName, setDriverName] = useState(existing?.driverName ?? dispatch.driverName ?? "");
  const [driverPhone, setDriverPhone] = useState(existing?.driverPhone ?? dispatch.driverPhone ?? "");
  const [customerName, setCustomerName] = useState(existing?.customerName ?? dispatch.customerName ?? "");
  const [customerAddress, setCustomerAddress] = useState(existing?.customerAddress ?? dispatch.customerAddress ?? "");
  const [customerPhone, setCustomerPhone] = useState(existing?.customerPhone ?? dispatch.customerPhone ?? "");
  const [categoryId, setCategoryId] = useState(existing?.categoryId ?? dispatchCategoryId);
  const [bricksCount, setBricksCount] = useState(String(existing?.bricksCount ?? dispatch.bricksCount ?? ""));
  const [challanDate, setChallanDate] = useState((existing?.challanDate ?? dispatch.dispatchedOn ?? new Date().toISOString()).slice(0, 10));
  const [notes, setNotes] = useState(existing?.notes ?? "");
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      const payload = {
        vehicleNumber: vehicleNumber || undefined,
        vehicleType: vehicleType || undefined,
        driverName: driverName || undefined,
        driverPhone: driverPhone || undefined,
        customerName,
        customerAddress: customerAddress || undefined,
        customerPhone: customerPhone || undefined,
        categoryId: categoryId || undefined,
        bricksCount: Number(bricksCount),
        challanDate: challanDate || undefined,
        notes: notes || undefined,
      };
      const row = existing ? await api.challans.update(existing._id, payload) : await api.challans.create({ dispatchId: dispatch._id, ...payload });
      printChallanRecord(row, kilnInfo, categoryLabelFor(categoryId, categories));
      onSaved();
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card className="border-status-critical/30">
      <div className="mb-3 flex items-center justify-between">
        <h4 className="text-sm font-semibold text-ink-primary">{t("dispatchDocs.createChallanTitle")}</h4>
        <button onClick={onClose} className="text-ink-muted hover:text-ink-primary">
          <X className="h-4 w-4" />
        </button>
      </div>
      <form onSubmit={handleSubmit} className="grid grid-cols-2 gap-2">
        <input required placeholder={t("brickLoading.customerNamePlaceholder")} value={customerName} onChange={(e) => setCustomerName(e.target.value)} className={inputClass} />
        <input placeholder={t("brickLoading.customerPhonePlaceholder")} value={customerPhone} onChange={(e) => setCustomerPhone(e.target.value)} className={inputClass} />
        <input placeholder={t("brickLoading.customerAddressPlaceholder")} value={customerAddress} onChange={(e) => setCustomerAddress(e.target.value)} className="col-span-2 h-10 rounded-xl border border-border bg-ink-primary/5 px-3 text-sm text-ink-primary outline-none focus:ring-2 focus:ring-series-1" />
        <input placeholder={t("brickLoading.driverNamePlaceholder")} value={driverName} onChange={(e) => setDriverName(e.target.value)} className={inputClass} />
        <input placeholder={t("brickLoading.driverPhonePlaceholder")} value={driverPhone} onChange={(e) => setDriverPhone(e.target.value)} className={inputClass} />
        <input placeholder={t("dispatch.vehicleNumberPlaceholder")} value={vehicleNumber} onChange={(e) => setVehicleNumber(e.target.value)} className={inputClass} />
        <select value={vehicleType} onChange={(e) => setVehicleType(e.target.value)} className={inputClass}>
          <option value="">{t("dispatch.vehicleTypePlaceholder")}</option>
          <option value="TRUCK">{t("brickLoading.truck")}</option>
          <option value="TRACTOR">{t("brickLoading.tractor")}</option>
        </select>
        <select value={categoryId} onChange={(e) => setCategoryId(e.target.value)} className={inputClass}>
          <option value="">{t("brickLoading.categoryPlaceholder")}</option>
          {categories.map((c) => (
            <option key={c._id} value={c._id}>
              {c.grade ? `${c.category} (${c.grade})` : c.category}
            </option>
          ))}
        </select>
        <input required type="number" placeholder={t("brickLoading.bricksLoadedPlaceholder")} value={bricksCount} onChange={(e) => setBricksCount(e.target.value)} className={inputClass} />
        <DateInput value={challanDate} onChange={(e) => setChallanDate(e.target.value)} className={inputClass} />
        <input placeholder={t("common.notes")} value={notes} onChange={(e) => setNotes(e.target.value)} className="col-span-2 h-10 rounded-xl border border-border bg-ink-primary/5 px-3 text-sm text-ink-primary outline-none focus:ring-2 focus:ring-series-1" />
        <Button type="submit" disabled={saving} className="col-span-2">
          {existing ? t("dispatchDocs.saveAndReprintChallan") : t("dispatchDocs.generateChallan")}
        </Button>
      </form>
    </Card>
  );
}
