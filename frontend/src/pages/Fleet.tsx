import { FormEvent, useEffect, useState } from "react";
import { Plus } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { DateInput } from "@/components/ui/date-input";
import { Pagination, usePagination } from "@/components/ui/pagination";
import { cn, formatINR } from "@/lib/utils";
import { api } from "@/lib/api";
import { useKilnEvent } from "@/hooks/useKilnEvent";
import { useAuthStore } from "@/store/auth.store";
import { useTranslation } from "@/hooks/useTranslation";
import { MachineDetailPage } from "@/components/fleet/MachineDetailPage";
import { useMachineTypeLabels } from "@/components/fleet/machineTypes";
import type { Machine, MachineType } from "@/types";

const inputClass =
  "h-10 rounded-xl border border-border bg-ink-primary/5 px-3 text-sm text-ink-primary outline-none focus:ring-2 focus:ring-series-1";

function emptyForm() {
  return {
    name: "",
    type: "TRACTOR" as MachineType,
    identifier: "",
    purchaseDate: "",
    price: "",
    purchasedByName: "",
    purchasedByPhone: "",
    warrantyDetails: "",
    totalPaid: "",
    tenureMonths: "",
    notes: "",
  };
}

// The Machine & Vehicle directory — deliberately just add + list + a full
// profile page per machine (see MachineDetailPage.tsx) now, not a
// multi-tab fuel/maintenance-logging workstation. Fuel and maintenance
// logging (and their backend tables/data) still exist, just no longer
// have UI on this particular page.
export function Fleet() {
  const { t } = useTranslation();
  const machineTypeLabels = useMachineTypeLabels();
  const [machines, setMachines] = useState<Machine[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [loading, setLoading] = useState(false);
  const [openMachineId, setOpenMachineId] = useState<string | null>(null);
  const activeKilnId = useAuthStore((s) => s.activeKilnId);

  async function refresh() {
    setMachines(await api.machines.list());
  }

  useEffect(() => {
    if (!activeKilnId) return;
    refresh().catch(console.error);
  }, [activeKilnId]);

  useKilnEvent("machine:update", () => refresh());

  const { page, setPage, pageCount, pageItems: pagedMachines, total } = usePagination(machines, 12);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!form.name) return;
    setLoading(true);
    try {
      await api.machines.create({
        name: form.name,
        type: form.type,
        identifier: form.identifier || undefined,
        purchaseDate: form.purchaseDate || undefined,
        price: form.price ? Number(form.price) : undefined,
        purchasedByName: form.purchasedByName || undefined,
        purchasedByPhone: form.purchasedByPhone || undefined,
        warrantyDetails: form.warrantyDetails || undefined,
        totalPaid: form.totalPaid ? Number(form.totalPaid) : undefined,
        tenureMonths: form.tenureMonths ? Number(form.tenureMonths) : undefined,
        notes: form.notes || undefined,
      });
      setForm(emptyForm());
      setShowForm(false);
      await refresh();
    } finally {
      setLoading(false);
    }
  }

  if (openMachineId) {
    return <MachineDetailPage machineId={openMachineId} onBack={() => setOpenMachineId(null)} />;
  }

  return (
    <div className="space-y-3">
      <div className="flex justify-end">
        <Button size="sm" onClick={() => setShowForm((s) => !s)}>
          <Plus className="h-4 w-4" /> {t("fleet.addMachineVehicle")}
        </Button>
      </div>

      {showForm && (
        <Card>
          <form onSubmit={handleSubmit} className="grid grid-cols-2 gap-2">
            <input
              required
              placeholder={t("fleet.machineNamePlaceholder")}
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              className={inputClass}
            />
            <select
              value={form.type}
              onChange={(e) => setForm((f) => ({ ...f, type: e.target.value as MachineType }))}
              className={inputClass}
            >
              {Object.entries(machineTypeLabels).map(([v, l]) => (
                <option key={v} value={v}>
                  {l}
                </option>
              ))}
            </select>
            <input
              placeholder={t("fleet.registrationIdentifierOptional")}
              value={form.identifier}
              onChange={(e) => setForm((f) => ({ ...f, identifier: e.target.value }))}
              className={cn(inputClass, "col-span-2")}
            />
            <label className="flex flex-col gap-1">
              <span className="text-xs text-ink-muted">{t("fleet.purchaseDate")}</span>
              <DateInput value={form.purchaseDate} onChange={(e) => setForm((f) => ({ ...f, purchaseDate: e.target.value }))} className={inputClass} />
            </label>
            <input
              type="number"
              placeholder={t("fleet.price")}
              value={form.price}
              onChange={(e) => setForm((f) => ({ ...f, price: e.target.value }))}
              className={inputClass}
            />
            <input
              placeholder={t("fleet.purchasedByName")}
              value={form.purchasedByName}
              onChange={(e) => setForm((f) => ({ ...f, purchasedByName: e.target.value }))}
              className={inputClass}
            />
            <input
              placeholder={t("fleet.purchasedByPhone")}
              value={form.purchasedByPhone}
              onChange={(e) => setForm((f) => ({ ...f, purchasedByPhone: e.target.value }))}
              className={inputClass}
            />
            <input
              placeholder={t("fleet.warrantyDetails")}
              value={form.warrantyDetails}
              onChange={(e) => setForm((f) => ({ ...f, warrantyDetails: e.target.value }))}
              className={cn(inputClass, "col-span-2")}
            />
            <input
              type="number"
              placeholder={t("fleet.totalPaidAtPurchase")}
              value={form.totalPaid}
              onChange={(e) => setForm((f) => ({ ...f, totalPaid: e.target.value }))}
              className={inputClass}
            />
            <input
              type="number"
              placeholder={t("fleet.tenureMonths")}
              value={form.tenureMonths}
              onChange={(e) => setForm((f) => ({ ...f, tenureMonths: e.target.value }))}
              className={inputClass}
            />
            <input
              placeholder={t("fleet.notesOptional")}
              value={form.notes}
              onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
              className={cn(inputClass, "col-span-2")}
            />
            <Button type="submit" disabled={loading} className="col-span-2">
              {t("fleet.saveMachine")}
            </Button>
          </form>
        </Card>
      )}

      <Card>
        {machines.length === 0 ? (
          <p className="py-8 text-center text-sm text-ink-muted">{t("fleet.noMachinesYet")}</p>
        ) : (
          <>
            <div className="space-y-1">
              {pagedMachines.map((m) => (
                <button
                  key={m._id}
                  onClick={() => setOpenMachineId(m._id)}
                  className="flex w-full items-center justify-between rounded-lg border border-border px-3 py-2 text-left text-sm hover:bg-ink-primary/5"
                >
                  <div>
                    <p className="text-ink-primary">
                      {m.name} <Badge variant="neutral">{machineTypeLabels[m.type]}</Badge>
                    </p>
                    {(m.identifier || m.notes) && (
                      <p className="mt-0.5 text-sm text-ink-muted">
                        {m.identifier}
                        {m.identifier && m.notes ? " · " : ""}
                        {m.notes}
                      </p>
                    )}
                  </div>
                  {m.remainingDue ? (
                    <span className="text-sm font-medium text-status-critical">
                      {t("fleet.remainingDueLabel")}: ₹{formatINR(m.remainingDue)}
                    </span>
                  ) : null}
                </button>
              ))}
            </div>
            <Pagination page={page} pageCount={pageCount} onChange={setPage} total={total} pageSize={12} />
          </>
        )}
      </Card>
    </div>
  );
}
