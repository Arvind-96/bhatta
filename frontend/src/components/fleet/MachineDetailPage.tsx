import { FormEvent, useEffect, useState } from "react";
import { ArrowLeft, Pencil, Plus, Printer, Trash2, X } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { DateInput } from "@/components/ui/date-input";
import { api } from "@/lib/api";
import { useKilnEvent } from "@/hooks/useKilnEvent";
import { useAuthStore } from "@/store/auth.store";
import { useTranslation } from "@/hooks/useTranslation";
import { cn, formatINR } from "@/lib/utils";
import { ProfileViewField } from "@/components/people/ProfileViewField";
import { printMachineRecord } from "@/lib/printDocument";
import { useMachineTypeLabels } from "@/components/fleet/machineTypes";
import type { Machine, MachineInstallmentPayment, MachineType } from "@/types";

const inputClass =
  "h-10 rounded-xl border border-border bg-ink-primary/5 px-3 text-sm text-ink-primary outline-none focus:ring-2 focus:ring-series-1";

interface MachineDetailPageProps {
  machineId: string;
  onBack: () => void;
}

// The full profile for a single machine/vehicle — every field the Fleet
// page's add-form collects, plus purchase/installment payment tracking.
// Mirrors StaffDetailPage/LandownerDetailPage's shape (header with Edit/
// Delete/Print, an editable profile card, a payment-summary card) so it
// reads consistently with the rest of the People/Staff profile pages.
export function MachineDetailPage({ machineId, onBack }: MachineDetailPageProps) {
  const { t } = useTranslation();
  const machineTypeLabels = useMachineTypeLabels();
  const kilns = useAuthStore((s) => s.kilns);
  const activeKilnId = useAuthStore((s) => s.activeKilnId);
  const activeKiln = kilns.find((k) => k.kilnId === activeKilnId);
  const kilnInfo = { name: activeKiln?.name ?? "Bhatta Cloud", location: activeKiln?.location, phone: activeKiln?.phone };

  const [machine, setMachine] = useState<Machine | null>(null);
  const [installments, setInstallments] = useState<MachineInstallmentPayment[]>([]);
  const [isEditing, setIsEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [showAddInstallment, setShowAddInstallment] = useState(false);
  const [installmentAmount, setInstallmentAmount] = useState("");
  const [installmentDate, setInstallmentDate] = useState(new Date().toISOString().slice(0, 10));
  const [installmentNotes, setInstallmentNotes] = useState("");
  const [savingInstallment, setSavingInstallment] = useState(false);

  const [name, setName] = useState("");
  const [type, setType] = useState<MachineType>("TRACTOR");
  const [identifier, setIdentifier] = useState("");
  const [purchaseDate, setPurchaseDate] = useState("");
  const [price, setPrice] = useState("");
  const [purchasedByName, setPurchasedByName] = useState("");
  const [purchasedByPhone, setPurchasedByPhone] = useState("");
  const [warrantyDetails, setWarrantyDetails] = useState("");
  const [tenureMonths, setTenureMonths] = useState("");
  const [notes, setNotes] = useState("");

  function loadFieldsFrom(m: Machine) {
    setName(m.name);
    setType(m.type);
    setIdentifier(m.identifier ?? "");
    setPurchaseDate(m.purchaseDate ? m.purchaseDate.slice(0, 10) : "");
    setPrice(m.price != null ? String(m.price) : "");
    setPurchasedByName(m.purchasedByName ?? "");
    setPurchasedByPhone(m.purchasedByPhone ?? "");
    setWarrantyDetails(m.warrantyDetails ?? "");
    setTenureMonths(m.tenureMonths != null ? String(m.tenureMonths) : "");
    setNotes(m.notes ?? "");
  }

  async function refresh() {
    const [m, ins] = await Promise.all([api.machines.get(machineId), api.machines.installments.list(machineId)]);
    setMachine(m);
    setInstallments(ins);
    loadFieldsFrom(m);
  }

  useEffect(() => {
    refresh().catch(console.error);
  }, [machineId]);

  useKilnEvent("machine:update", () => refresh());
  useKilnEvent("machineInstallment:update", () => refresh());

  function cancelEditing() {
    if (machine) loadFieldsFrom(machine);
    setIsEditing(false);
  }

  async function saveProfile(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      await api.machines.update(machineId, {
        name: name.trim(),
        type,
        identifier: identifier || undefined,
        purchaseDate: purchaseDate || undefined,
        price: price ? Number(price) : undefined,
        purchasedByName: purchasedByName || undefined,
        purchasedByPhone: purchasedByPhone || undefined,
        warrantyDetails: warrantyDetails || undefined,
        tenureMonths: tenureMonths ? Number(tenureMonths) : undefined,
        notes: notes || undefined,
      });
      setIsEditing(false);
      await refresh();
    } finally {
      setSaving(false);
    }
  }

  // Permanent delete — refused by the backend if this machine has any
  // real history (installment payments, fuel logs, maintenance logs).
  async function deleteMachine() {
    if (!machine) return;
    if (!confirm(t("fleet.confirmDeleteMachine", { name: machine.name }))) return;
    try {
      await api.machines.remove(machineId);
      onBack();
    } catch (err) {
      alert(err instanceof Error ? err.message : t("common.somethingWentWrong"));
    }
  }

  function handlePrint() {
    if (!machine) return;
    printMachineRecord(machine, installments, kilnInfo, machineTypeLabels[machine.type]);
  }

  async function addInstallment(e: FormEvent) {
    e.preventDefault();
    if (!installmentAmount) return;
    setSavingInstallment(true);
    try {
      await api.machines.installments.create(machineId, {
        amount: Number(installmentAmount),
        date: installmentDate || undefined,
        notes: installmentNotes || undefined,
      });
      setInstallmentAmount("");
      setInstallmentNotes("");
      setShowAddInstallment(false);
      await refresh();
    } finally {
      setSavingInstallment(false);
    }
  }

  async function deleteInstallment(paymentId: string) {
    if (!confirm(t("fleet.confirmDeleteInstallment"))) return;
    try {
      await api.machines.installments.remove(machineId, paymentId);
      await refresh();
    } catch (err) {
      alert(err instanceof Error ? err.message : t("common.somethingWentWrong"));
    }
  }

  const backButton = (
    <button onClick={onBack} className="mb-3 flex items-center gap-1.5 text-sm text-ink-secondary hover:text-ink-primary">
      <ArrowLeft className="h-4 w-4" /> {t("fleet.backToMachines")}
    </button>
  );

  if (!machine) {
    return (
      <div>
        {backButton}
        <Card>
          <p className="py-8 text-center text-sm text-ink-muted">{t("common.loading")}</p>
        </Card>
      </div>
    );
  }

  const remainingDue = machine.remainingDue ?? 0;

  return (
    <div>
      {backButton}

      <Card className="mb-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h3 className="text-lg font-semibold text-ink-primary">{machine.name}</h3>
            <p className="text-sm text-ink-muted">{machineTypeLabels[machine.type]}</p>
          </div>
          <div className="flex gap-2">
            {!isEditing && (
              <button
                onClick={() => setIsEditing(true)}
                className="flex items-center gap-1 rounded-lg border border-border bg-ink-primary/5 px-3 py-1.5 text-xs font-medium text-ink-secondary hover:bg-ink-primary/10"
              >
                <Pencil className="h-3.5 w-3.5" /> {t("common.edit")}
              </button>
            )}
            <button
              onClick={handlePrint}
              className="flex items-center gap-1 rounded-lg border border-border bg-ink-primary/5 px-3 py-1.5 text-xs font-medium text-ink-secondary hover:bg-ink-primary/10"
            >
              <Printer className="h-3.5 w-3.5" /> {t("common.print")}
            </button>
            <button
              onClick={deleteMachine}
              className="flex items-center gap-1 rounded-lg border border-status-critical/30 bg-status-critical/5 px-3 py-1.5 text-xs font-medium text-status-critical hover:bg-status-critical/10"
            >
              <Trash2 className="h-3.5 w-3.5" /> {t("common.delete")}
            </button>
          </div>
        </div>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="lg:col-span-2">
          <div className="mb-2 flex items-center justify-between">
            <h4 className="text-xs font-semibold uppercase tracking-wide text-ink-muted">{t("fleet.purchaseDetailsSection")}</h4>
            {isEditing && (
              <button onClick={cancelEditing} className="flex items-center gap-1 text-xs font-medium text-ink-muted hover:text-ink-primary">
                <X className="h-3.5 w-3.5" /> {t("common.cancel")}
              </button>
            )}
          </div>
          {isEditing ? (
            <form onSubmit={saveProfile} className="grid grid-cols-2 gap-2">
              <input required placeholder={t("fleet.machineNamePlaceholder")} value={name} onChange={(e) => setName(e.target.value)} className={inputClass} />
              <select value={type} onChange={(e) => setType(e.target.value as MachineType)} className={inputClass}>
                {Object.entries(machineTypeLabels).map(([v, l]) => (
                  <option key={v} value={v}>
                    {l}
                  </option>
                ))}
              </select>
              <input
                placeholder={t("fleet.registrationIdentifierOptional")}
                value={identifier}
                onChange={(e) => setIdentifier(e.target.value)}
                className={cn(inputClass, "col-span-2")}
              />
              <label className="flex flex-col gap-1">
                <span className="text-xs text-ink-muted">{t("fleet.purchaseDate")}</span>
                <DateInput value={purchaseDate} onChange={(e) => setPurchaseDate(e.target.value)} className={inputClass} />
              </label>
              <input type="number" placeholder={t("fleet.price")} value={price} onChange={(e) => setPrice(e.target.value)} className={inputClass} />
              <input
                placeholder={t("fleet.purchasedByName")}
                value={purchasedByName}
                onChange={(e) => setPurchasedByName(e.target.value)}
                className={inputClass}
              />
              <input
                placeholder={t("fleet.purchasedByPhone")}
                value={purchasedByPhone}
                onChange={(e) => setPurchasedByPhone(e.target.value)}
                className={inputClass}
              />
              <input
                placeholder={t("fleet.warrantyDetails")}
                value={warrantyDetails}
                onChange={(e) => setWarrantyDetails(e.target.value)}
                className={cn(inputClass, "col-span-2")}
              />
              <input
                type="number"
                placeholder={t("fleet.tenureMonths")}
                value={tenureMonths}
                onChange={(e) => setTenureMonths(e.target.value)}
                className={inputClass}
              />
              <input placeholder={t("fleet.notesOptional")} value={notes} onChange={(e) => setNotes(e.target.value)} className={inputClass} />
              <Button type="submit" size="sm" disabled={saving} className="col-span-2">
                {t("common.saveChanges")}
              </Button>
            </form>
          ) : (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <ProfileViewField label={t("fleet.registrationIdentifierOptional")} value={machine.identifier} />
              <ProfileViewField label={t("fleet.purchaseDate")} value={machine.purchaseDate ? new Date(machine.purchaseDate).toLocaleDateString("en-IN") : undefined} />
              <ProfileViewField label={t("fleet.price")} value={machine.price != null ? `₹${formatINR(machine.price)}` : undefined} />
              <ProfileViewField label={t("fleet.purchasedByName")} value={machine.purchasedByName} />
              <ProfileViewField label={t("fleet.purchasedByPhone")} value={machine.purchasedByPhone} />
              <ProfileViewField label={t("fleet.warrantyDetails")} value={machine.warrantyDetails} />
              <ProfileViewField label={t("common.notes")} value={machine.notes} />
            </div>
          )}
        </Card>

        <Card className="lg:col-span-2">
          <div className="mb-3 flex items-center justify-between">
            <h4 className="text-xs font-semibold uppercase tracking-wide text-ink-muted">{t("fleet.paymentSummarySection")}</h4>
            {remainingDue > 0 && (
              <Button size="sm" onClick={() => setShowAddInstallment((s) => !s)}>
                <Plus className="h-4 w-4" /> {t("fleet.addInstallmentPayment")}
              </Button>
            )}
          </div>
          <div className="grid grid-cols-3 gap-2 text-center">
            <div>
              <p className="text-xl font-semibold tabular-nums text-status-good">₹{formatINR(machine.totalPaid ?? 0)}</p>
              <p className="text-sm text-ink-muted">{t("fleet.totalPaidLabel")}</p>
            </div>
            <div>
              <p className={`text-xl font-semibold tabular-nums ${remainingDue > 0 ? "text-status-critical" : "text-status-good"}`}>
                ₹{formatINR(remainingDue)}
              </p>
              <p className="text-sm text-ink-muted">{t("fleet.remainingDueLabel")}</p>
            </div>
            <div>
              <p className="text-xl font-semibold tabular-nums text-ink-primary">
                {machine.tenureMonths ? t("fleet.tenureMonthsSuffix", { months: machine.tenureMonths }) : "—"}
              </p>
              <p className="text-sm text-ink-muted">{t("fleet.tenureLabel")}</p>
            </div>
          </div>

          {showAddInstallment && (
            <form onSubmit={addInstallment} className="mt-4 grid grid-cols-2 gap-2 border-t border-border pt-4">
              <input
                required
                type="number"
                placeholder={t("fleet.installmentAmountPlaceholder")}
                value={installmentAmount}
                onChange={(e) => setInstallmentAmount(e.target.value)}
                className={inputClass}
              />
              <DateInput value={installmentDate} onChange={(e) => setInstallmentDate(e.target.value)} className={inputClass} />
              <input
                placeholder={t("fleet.notesOptional")}
                value={installmentNotes}
                onChange={(e) => setInstallmentNotes(e.target.value)}
                className={cn(inputClass, "col-span-2")}
              />
              <Button type="submit" disabled={savingInstallment} className="col-span-2">
                {t("fleet.saveInstallment")}
              </Button>
            </form>
          )}
        </Card>

        <Card className="lg:col-span-2">
          <h4 className="mb-3 text-xs font-semibold uppercase tracking-wide text-ink-muted">{t("fleet.installmentHistorySection")}</h4>
          {installments.length === 0 ? (
            <p className="py-6 text-center text-sm text-ink-muted">{t("fleet.noInstallmentsYet")}</p>
          ) : (
            <div className="space-y-1">
              {installments.map((i) => (
                <div key={i._id} className="flex items-center justify-between rounded-lg border border-border px-3 py-2 text-sm">
                  <div>
                    <p className="text-ink-primary">{new Date(i.date).toLocaleDateString("en-IN")}</p>
                    {i.notes && <p className="text-sm text-ink-muted">{i.notes}</p>}
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="tabular-nums font-medium text-ink-primary">₹{formatINR(i.amount)}</span>
                    <button onClick={() => deleteInstallment(i._id)} className="text-ink-muted hover:text-status-critical" aria-label={t("common.delete")}>
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
