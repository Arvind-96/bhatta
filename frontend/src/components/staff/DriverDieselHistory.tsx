import { useEffect, useState } from "react";
import { Pencil, Printer, Search, Trash2 } from "lucide-react";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { api } from "@/lib/api";
import { useKilnEvent } from "@/hooks/useKilnEvent";
import { useAuthStore } from "@/store/auth.store";
import { useTranslation } from "@/hooks/useTranslation";
import { cn } from "@/lib/utils";
import { printDieselEntry } from "@/lib/printDocument";
import { LogDieselFillupForm } from "@/components/stock/LogDieselFillupForm";
import type { KilnVehicle, Person, VehicleDieselEntry } from "@/types";

const inputClass =
  "h-10 rounded-xl border border-border bg-ink-primary/5 px-3 text-sm text-ink-primary outline-none focus:ring-2 focus:ring-series-1";

// The bottom-of-profile section (item 4 of the request) — every diesel
// fill-up logged with this driver selected, self-contained by personId
// exactly like AttendanceCalendar/SalarySlipHistory alongside it. Edit
// reuses the same LogDieselFillupForm the Stock page uses, inline rather
// than a separate page (this is embedded within StaffDetailPage, which has
// no sub-page routing of its own).
export function DriverDieselHistory({ personId }: { personId: string }) {
  const { t } = useTranslation();
  const kilns = useAuthStore((s) => s.kilns);
  const activeKilnId = useAuthStore((s) => s.activeKilnId);
  const activeKiln = kilns.find((k) => k.kilnId === activeKilnId);
  const kilnInfo = { name: activeKiln?.name ?? "Bhatta Cloud", location: activeKiln?.location, phone: activeKiln?.phone };

  const [entries, setEntries] = useState<VehicleDieselEntry[]>([]);
  const [vehicles, setVehicles] = useState<KilnVehicle[]>([]);
  const [drivers, setDrivers] = useState<Person[]>([]);
  const [search, setSearch] = useState("");
  const [editingEntry, setEditingEntry] = useState<VehicleDieselEntry | null>(null);

  async function refresh() {
    const [entryData, vehicleData, driverData] = await Promise.all([
      api.kilnVehicles.listDiesel({ driverId: personId }),
      api.kilnVehicles.list(),
      api.people.list("DRIVER"),
    ]);
    setEntries(entryData);
    setVehicles(vehicleData);
    setDrivers(driverData.filter((d) => d.isOfficeStaff));
  }

  useEffect(() => {
    refresh().catch(console.error);
  }, [personId]);

  useKilnEvent("vehicleDiesel:update", () => refresh());

  async function handleDelete(entry: VehicleDieselEntry) {
    if (!confirm(t("stock.confirmDeleteDieselEntry"))) return;
    await api.kilnVehicles.removeDiesel(entry._id);
    await refresh();
  }

  function handlePrint(entry: VehicleDieselEntry) {
    const vehicleName = typeof entry.vehicleId === "object" ? entry.vehicleId.name : "—";
    const driverName = typeof entry.driverId === "object" ? entry.driverId?.name : undefined;
    printDieselEntry(entry, vehicleName, driverName, kilnInfo);
  }

  const filtered = entries.filter((entry) => {
    if (!search.trim()) return true;
    const q = search.trim().toLowerCase();
    const vehicleName = typeof entry.vehicleId === "object" ? entry.vehicleId.name : "";
    return (
      vehicleName.toLowerCase().includes(q) ||
      (entry.vehicleType ?? "").toLowerCase().includes(q) ||
      new Date(entry.date).toLocaleDateString("en-IN").includes(q) ||
      (entry.notes ?? "").toLowerCase().includes(q)
    );
  });

  if (editingEntry) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>{t("stock.editDieselEntryTitle")}</CardTitle>
        </CardHeader>
        <LogDieselFillupForm
          vehicles={vehicles}
          drivers={drivers}
          entries={entries}
          existing={editingEntry}
          onSaved={() => {
            setEditingEntry(null);
            refresh();
          }}
          onCancel={() => setEditingEntry(null)}
        />
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("stock.driverDieselHistoryHeading")}</CardTitle>
      </CardHeader>
      <div className="relative mb-3">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-muted" />
        <input
          placeholder={t("stock.searchDieselEntriesPlaceholder")}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className={cn(inputClass, "w-full max-w-sm pl-9")}
        />
      </div>
      {entries.length === 0 ? (
        <p className="py-6 text-center text-sm text-ink-muted">{t("stock.noDieselEntriesForDriver")}</p>
      ) : filtered.length === 0 ? (
        <p className="py-6 text-center text-sm text-ink-muted">{t("stock.noDieselEntriesMatchSearch")}</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[560px] text-sm">
            <thead>
              <tr className="border-b border-border text-left text-sm text-ink-muted">
                <th className="pb-2 font-medium">{t("common.date")}</th>
                <th className="pb-2 font-medium">{t("common.vehicle")}</th>
                <th className="pb-2 font-medium">{t("common.quantity")}</th>
                <th className="pb-2 font-medium">{t("common.notes")}</th>
                <th className="pb-2 font-medium" />
              </tr>
            </thead>
            <tbody>
              {filtered.map((entry) => (
                <tr key={entry._id} className="border-b border-border/60 last:border-0">
                  <td className="py-3 text-ink-secondary">{new Date(entry.date).toLocaleDateString("en-IN")}</td>
                  <td className="py-3 text-ink-primary">
                    {typeof entry.vehicleId === "object" ? `${entry.vehicleId.name} (${entry.vehicleId.type})` : "—"}
                  </td>
                  <td className="py-3 tabular-nums text-ink-secondary">{entry.quantityLiters.toLocaleString("en-IN")} L</td>
                  <td className="py-3 text-ink-secondary">{entry.notes ?? "—"}</td>
                  <td className="py-3 pl-3 text-right">
                    <div className="flex items-center justify-end gap-2.5">
                      <button type="button" onClick={() => handlePrint(entry)} className="text-ink-muted hover:text-ink-primary" aria-label={t("common.print")}>
                        <Printer className="h-3.5 w-3.5" />
                      </button>
                      <button type="button" onClick={() => setEditingEntry(entry)} className="text-ink-muted hover:text-ink-primary" aria-label={t("common.edit")}>
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                      <button type="button" onClick={() => handleDelete(entry)} className="text-ink-muted hover:text-status-critical" aria-label={t("common.delete")}>
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}
