import { useState } from "react";
import { ArrowLeft, Pencil, Printer, Trash2 } from "lucide-react";
import { Card } from "@/components/ui/card";
import { api } from "@/lib/api";
import { useTranslation } from "@/hooks/useTranslation";
import { useAuthStore } from "@/store/auth.store";
import { printDieselEntry } from "@/lib/printDocument";
import { LogDieselFillupForm } from "./LogDieselFillupForm";
import type { KilnVehicle, Person, VehicleDieselEntry } from "@/types";

function Field({ label, value }: { label: string; value?: string | number | null }) {
  if (value === undefined || value === null || value === "") return null;
  return (
    <div>
      <p className="text-sm text-ink-muted">{label}</p>
      <p className="text-sm text-ink-primary">{value}</p>
    </div>
  );
}

interface DieselEntryDetailPageProps {
  entry: VehicleDieselEntry;
  vehicles: KilnVehicle[];
  drivers: Person[];
  entries: VehicleDieselEntry[];
  onBack: () => void;
  onDeleted: () => void;
  onSaved: () => void;
}

// The profile-style page for a single diesel fill-up entry (item 3 of the
// request — open/view/edit/delete/print), reused both from the Stock
// page's Diesel section and (inline, via DriverDieselHistory) a driver's
// own Staff profile.
export function DieselEntryDetailPage({ entry, vehicles, drivers, entries, onBack, onDeleted, onSaved }: DieselEntryDetailPageProps) {
  const { t } = useTranslation();
  const kilns = useAuthStore((s) => s.kilns);
  const activeKilnId = useAuthStore((s) => s.activeKilnId);
  const activeKiln = kilns.find((k) => k.kilnId === activeKilnId);
  const kilnInfo = { name: activeKiln?.name ?? "Bhatta Cloud", location: activeKiln?.location, phone: activeKiln?.phone };
  const [editing, setEditing] = useState(false);

  const vehicleName = typeof entry.vehicleId === "object" ? entry.vehicleId.name : "—";
  const driverName = typeof entry.driverId === "object" ? entry.driverId?.name : undefined;
  const distanceSinceLastFill =
    entry.initialMeterReading != null && entry.lastMeterReading != null
      ? Math.max(0, Math.round((entry.initialMeterReading - entry.lastMeterReading) * 100) / 100)
      : undefined;

  async function handleDelete() {
    if (!confirm(t("stock.confirmDeleteDieselEntry"))) return;
    await api.kilnVehicles.removeDiesel(entry._id);
    onDeleted();
  }

  function handlePrint() {
    printDieselEntry(entry, vehicleName, driverName, kilnInfo);
  }

  if (editing) {
    return (
      <LogDieselFillupForm
        vehicles={vehicles}
        drivers={drivers}
        entries={entries}
        existing={entry}
        onSaved={() => {
          setEditing(false);
          onSaved();
        }}
        onCancel={() => setEditing(false)}
      />
    );
  }

  return (
    <div>
      <button onClick={onBack} className="mb-3 flex items-center gap-1.5 text-sm text-ink-secondary hover:text-ink-primary">
        <ArrowLeft className="h-4 w-4" /> {t("stock.backToDiesel")}
      </button>

      <Card className="mb-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h3 className="text-lg font-semibold text-ink-primary">
              {vehicleName} {entry.vehicleType && <span className="font-normal text-ink-muted">({entry.vehicleType})</span>}
            </h3>
            <p className="text-sm text-ink-muted">{new Date(entry.date).toLocaleDateString("en-IN")}</p>
          </div>
          <div className="flex gap-2">
            <button
              onClick={handlePrint}
              className="flex items-center gap-1 rounded-lg border border-border bg-ink-primary/5 px-3 py-1.5 text-xs font-medium text-ink-secondary hover:bg-ink-primary/10"
            >
              <Printer className="h-3.5 w-3.5" /> {t("common.print")}
            </button>
            <button
              onClick={() => setEditing(true)}
              className="flex items-center gap-1 rounded-lg border border-border bg-ink-primary/5 px-3 py-1.5 text-xs font-medium text-ink-secondary hover:bg-ink-primary/10"
            >
              <Pencil className="h-3.5 w-3.5" /> {t("common.edit")}
            </button>
            <button
              onClick={handleDelete}
              className="flex items-center gap-1 rounded-lg border border-status-critical/30 bg-status-critical/5 px-3 py-1.5 text-xs font-medium text-status-critical hover:bg-status-critical/10"
            >
              <Trash2 className="h-3.5 w-3.5" /> {t("common.delete")}
            </button>
          </div>
        </div>
      </Card>

      <Card>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <Field label={t("common.quantity")} value={`${entry.quantityLiters.toLocaleString("en-IN")} L`} />
          <Field label={t("stock.driverNamePlaceholder")} value={driverName} />
          <Field label={t("stock.todaysInitialMeterReadingPlaceholder")} value={entry.initialMeterReading} />
          <Field label={t("stock.todaysLastMeterReadingLabel")} value={entry.lastMeterReading} />
          <Field label={t("stock.distanceSinceLastFillLabel")} value={distanceSinceLastFill} />
          <Field label={t("stock.cost")} value={entry.costAmount} />
          <Field label={t("common.paymentMode")} value={entry.paymentMode} />
        </div>
        {entry.notes && (
          <div className="mt-4">
            <p className="text-sm text-ink-muted">{t("common.notes")}</p>
            <p className="text-sm text-ink-primary">{entry.notes}</p>
          </div>
        )}
      </Card>
    </div>
  );
}
