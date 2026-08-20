import { FormEvent, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api";
import { useTranslation } from "@/hooks/useTranslation";
import type { KilnVehicle, Person, VehicleDieselEntry } from "@/types";

const inputClass =
  "h-10 rounded-xl border border-border bg-ink-primary/5 px-3 text-sm text-ink-primary outline-none focus:ring-2 focus:ring-series-1";

interface LogDieselFillupFormProps {
  vehicles: KilnVehicle[];
  drivers: Person[];
  entries: VehicleDieselEntry[];
  existing?: VehicleDieselEntry | null;
  onSaved: () => void;
  onCancel?: () => void;
}

function vehicleIdOf(entry: VehicleDieselEntry) {
  return typeof entry.vehicleId === "object" ? entry.vehicleId._id : entry.vehicleId;
}
function driverIdOf(entry: VehicleDieselEntry) {
  return typeof entry.driverId === "object" ? entry.driverId?._id : entry.driverId;
}

// Handles both logging a new fill-up (item 2 of the request) and editing an
// existing one (item 3) — same dual-mode pattern as AddExpenseForm. "Vehicle
// Type" narrows the Vehicle picker to make a large roster easier to search;
// "Today's Vehicle Last Meter Reading" is never typed by the admin — it's a
// live preview of that vehicle's most recent prior reading (or its
// baseline, for a brand-new vehicle), the same figure the server
// independently re-derives and stores at save time (see
// kilnVehicle.service.ts's lastKnownMeterReading).
export function LogDieselFillupForm({ vehicles, drivers, entries, existing, onSaved, onCancel }: LogDieselFillupFormProps) {
  const { t } = useTranslation();
  const existingVehicleId = existing ? vehicleIdOf(existing) : "";
  const existingVehicle = vehicles.find((v) => v._id === existingVehicleId);

  const [vehicleType, setVehicleType] = useState(existingVehicle?.type ?? "");
  const [vehicleId, setVehicleId] = useState(existingVehicleId || vehicles[0]?._id || "");
  const [quantityLiters, setQuantityLiters] = useState(existing ? String(existing.quantityLiters) : "");
  const [initialMeterReading, setInitialMeterReading] = useState(existing?.initialMeterReading != null ? String(existing.initialMeterReading) : "");
  const [driverId, setDriverId] = useState(existing ? driverIdOf(existing) ?? "" : "");
  const [notes, setNotes] = useState(existing?.notes ?? "");
  const [saving, setSaving] = useState(false);

  const vehicleTypes = Array.from(new Set(vehicles.map((v) => v.type)));
  const filteredVehicles = vehicleType ? vehicles.filter((v) => v.type === vehicleType) : vehicles;

  function selectVehicleType(newType: string) {
    setVehicleType(newType);
    const stillValid = vehicles.find((v) => v._id === vehicleId && (!newType || v.type === newType));
    if (!stillValid) {
      const firstOfType = vehicles.find((v) => !newType || v.type === newType);
      setVehicleId(firstOfType?._id ?? "");
    }
  }

  // The vehicle's last known reading BEFORE this fill — most recent prior
  // entry for this vehicle (excluding the entry being edited), falling
  // back to the vehicle's own baseline reading from Add Vehicle.
  const priorEntries = entries
    .filter((e) => vehicleIdOf(e) === vehicleId && e._id !== existing?._id)
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime() || new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  const selectedVehicle = vehicles.find((v) => v._id === vehicleId);
  const lastMeterReading = priorEntries[0]?.initialMeterReading ?? selectedVehicle?.initialMeterReading;

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!vehicleId || !quantityLiters) return;
    setSaving(true);
    try {
      const payload = {
        vehicleId,
        quantityLiters: Number(quantityLiters),
        initialMeterReading: initialMeterReading ? Number(initialMeterReading) : undefined,
        driverId: driverId || undefined,
        notes: notes || undefined,
      };
      if (existing) {
        await api.kilnVehicles.updateDiesel(existing._id, payload);
      } else {
        await api.kilnVehicles.logDiesel(payload);
      }
      onSaved();
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card>
      <form onSubmit={handleSubmit} className="grid grid-cols-2 gap-2">
        <select value={vehicleType} onChange={(e) => selectVehicleType(e.target.value)} className={inputClass}>
          <option value="">{t("stock.vehicleTypeFilterPlaceholder")}</option>
          {vehicleTypes.map((ty) => (
            <option key={ty} value={ty}>
              {ty}
            </option>
          ))}
        </select>
        <select value={vehicleId} onChange={(e) => setVehicleId(e.target.value)} className={inputClass}>
          <option value="">{t("stock.vehiclePlaceholder")}</option>
          {filteredVehicles.map((v) => (
            <option key={v._id} value={v._id}>
              {v.name} ({v.type})
            </option>
          ))}
        </select>

        <input
          required
          type="number"
          min={0}
          placeholder={t("stock.quantityLiters")}
          value={quantityLiters}
          onChange={(e) => setQuantityLiters(e.target.value)}
          className={inputClass}
        />
        <input
          type="number"
          min={0}
          placeholder={t("stock.todaysInitialMeterReadingPlaceholder")}
          value={initialMeterReading}
          onChange={(e) => setInitialMeterReading(e.target.value)}
          className={inputClass}
        />

        <div className="col-span-2 rounded-xl border border-border bg-ink-primary/5 px-3 py-2">
          <p className="text-xs text-ink-muted">{t("stock.todaysLastMeterReadingLabel")}</p>
          <p className="text-sm font-semibold tabular-nums text-ink-primary">
            {lastMeterReading != null ? lastMeterReading.toLocaleString("en-IN") : "—"}
          </p>
          <p className="text-xs text-ink-muted">{t("stock.todaysLastMeterReadingHint")}</p>
        </div>

        <select value={driverId} onChange={(e) => setDriverId(e.target.value)} className={`${inputClass} col-span-2`}>
          <option value="">{t("stock.driverNamePlaceholder")}</option>
          {drivers.map((d) => (
            <option key={d._id} value={d._id}>
              {d.name}
            </option>
          ))}
        </select>

        <input
          placeholder={t("common.notesOptional")}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          className={`${inputClass} col-span-2`}
        />

        <div className="col-span-2 flex gap-2">
          <Button type="submit" disabled={saving} className="flex-1">
            {t("common.save")}
          </Button>
          {onCancel && (
            <Button type="button" variant="outline" onClick={onCancel}>
              {t("common.cancel")}
            </Button>
          )}
        </div>
      </form>
    </Card>
  );
}
