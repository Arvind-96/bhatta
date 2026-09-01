import { FormEvent, useState } from "react";
import { ArrowLeft, Pencil, Printer, Trash2, X } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { DateInput } from "@/components/ui/date-input";
import { api } from "@/lib/api";
import { useAuthStore } from "@/store/auth.store";
import { useTranslation } from "@/hooks/useTranslation";
import { cn, formatINR } from "@/lib/utils";
import { ProfileViewField } from "@/components/people/ProfileViewField";
import { isPaymentSplitMismatched, PaymentSplitFields } from "@/components/shared/PaymentSplitFields";
import { printDoctorVisit } from "@/lib/printDocument";
import type { Doctor as DoctorRecord, DoctorVisit, LaborPaymentMode, Person } from "@/types";

const inputClass =
  "h-10 rounded-xl border border-border bg-ink-primary/5 px-3 text-sm text-ink-primary outline-none focus:ring-2 focus:ring-series-1";

interface DoctorVisitDetailPageProps {
  visit: DoctorVisit;
  doctors: DoctorRecord[];
  people: Person[];
  onBack: () => void;
  onDeleted: () => void;
}

// A single visit's own profile-style page — reachable both from the Doctor
// page's main Visit Log table and from within a doctor's own detail page
// (DoctorDetailPage). Same edit/delete/print pattern as every other
// profile page in the app; a visit has no running ledger of its own (its
// cost auto-logs as one Expense, see doctorVisit.service.ts), so this is a
// single-record view rather than a ledger-bearing profile.
export function DoctorVisitDetailPage({ visit, doctors, people, onBack, onDeleted }: DoctorVisitDetailPageProps) {
  const { t } = useTranslation();
  const kilns = useAuthStore((s) => s.kilns);
  const activeKilnId = useAuthStore((s) => s.activeKilnId);
  const activeKiln = kilns.find((k) => k.kilnId === activeKilnId);
  const kilnInfo = { name: activeKiln?.name ?? "Bhatta Cloud", location: activeKiln?.location, phone: activeKiln?.phone };

  const [isEditing, setIsEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [formError, setFormError] = useState("");

  const initialDoctorId = typeof visit.doctorId === "object" ? visit.doctorId._id : visit.doctorId;
  const initialPersonId = typeof visit.personId === "object" ? visit.personId._id : visit.personId;

  const [doctorId, setDoctorId] = useState(initialDoctorId);
  const [personId, setPersonId] = useState(initialPersonId);
  const [ailment, setAilment] = useState(visit.ailment ?? "");
  const [medicineCost, setMedicineCost] = useState(visit.medicineCost ? String(visit.medicineCost) : "");
  const [consultationFee, setConsultationFee] = useState(visit.consultationFee ? String(visit.consultationFee) : "");
  const [date, setDate] = useState(visit.date ? visit.date.slice(0, 10) : "");
  const [paymentMode, setPaymentMode] = useState<LaborPaymentMode>(visit.paymentMode ?? "CASH");
  const [cashAmount, setCashAmount] = useState(visit.cashAmount != null ? String(visit.cashAmount) : "");
  const [onlineAmount, setOnlineAmount] = useState(visit.onlineAmount != null ? String(visit.onlineAmount) : "");
  const [notes, setNotes] = useState(visit.notes ?? "");

  function cancelEditing() {
    setDoctorId(initialDoctorId);
    setPersonId(initialPersonId);
    setAilment(visit.ailment ?? "");
    setMedicineCost(visit.medicineCost ? String(visit.medicineCost) : "");
    setConsultationFee(visit.consultationFee ? String(visit.consultationFee) : "");
    setDate(visit.date ? visit.date.slice(0, 10) : "");
    setPaymentMode(visit.paymentMode ?? "CASH");
    setCashAmount(visit.cashAmount != null ? String(visit.cashAmount) : "");
    setOnlineAmount(visit.onlineAmount != null ? String(visit.onlineAmount) : "");
    setNotes(visit.notes ?? "");
    setFormError("");
    setIsEditing(false);
  }

  async function saveVisit(e: FormEvent) {
    e.preventDefault();
    if (!doctorId || !personId) return;
    const medicine = Number(medicineCost) || 0;
    const consultation = Number(consultationFee) || 0;
    const total = medicine + consultation;
    if (total > 0 && isPaymentSplitMismatched(paymentMode, total, cashAmount, onlineAmount)) {
      setFormError(t("payment.splitMismatch", { total: total.toLocaleString("en-IN") }));
      return;
    }
    setFormError("");
    setSaving(true);
    try {
      await api.doctorVisits.update(visit._id, {
        doctorId,
        personId,
        ailment: ailment || undefined,
        medicineCost: medicine || undefined,
        consultationFee: consultation || undefined,
        date: date || undefined,
        paymentMode: total > 0 ? paymentMode : undefined,
        cashAmount: total > 0 && paymentMode === "CASH_AND_ONLINE" ? Number(cashAmount) : undefined,
        onlineAmount: total > 0 && paymentMode === "CASH_AND_ONLINE" ? Number(onlineAmount) : undefined,
        notes: notes || undefined,
      });
      setIsEditing(false);
    } finally {
      setSaving(false);
    }
  }

  async function deleteVisit() {
    if (!confirm(t("doctor.confirmRemoveVisit"))) return;
    setDeleting(true);
    try {
      await api.doctorVisits.remove(visit._id);
      onDeleted();
    } finally {
      setDeleting(false);
    }
  }

  const doctorName = typeof visit.doctorId === "object" ? visit.doctorId.name : doctors.find((d) => d._id === visit.doctorId)?.name ?? "—";
  const personName = typeof visit.personId === "object" ? visit.personId.name : people.find((p) => p._id === visit.personId)?.name ?? "—";

  function handlePrint() {
    printDoctorVisit(visit, doctorName, personName, kilnInfo);
  }

  return (
    <div>
      <button onClick={onBack} className="mb-3 flex items-center gap-1.5 text-sm text-ink-secondary hover:text-ink-primary">
        <ArrowLeft className="h-4 w-4" /> {t("doctor.backToVisitLog")}
      </button>

      <Card className="mb-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h3 className="text-lg font-semibold text-ink-primary">{personName}</h3>
            <p className="text-sm text-ink-muted">
              {new Date(visit.date).toLocaleDateString("en-IN")} · {doctorName}
            </p>
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
              onClick={deleteVisit}
              disabled={deleting}
              className="flex items-center gap-1 rounded-lg border border-status-critical/30 bg-status-critical/5 px-3 py-1.5 text-xs font-medium text-status-critical hover:bg-status-critical/10"
            >
              <Trash2 className="h-3.5 w-3.5" /> {t("common.delete")}
            </button>
          </div>
        </div>
      </Card>

      <Card>
        <div className="mb-2 flex items-center justify-between">
          <h4 className="text-xs font-semibold uppercase tracking-wide text-ink-muted">{t("doctor.visitDetailsSection")}</h4>
          {isEditing && (
            <button onClick={cancelEditing} className="flex items-center gap-1 text-xs font-medium text-ink-muted hover:text-ink-primary">
              <X className="h-3.5 w-3.5" /> {t("common.cancel")}
            </button>
          )}
        </div>

        {isEditing ? (
          <form onSubmit={saveVisit} className="grid grid-cols-2 gap-2">
            <select required value={doctorId} onChange={(e) => setDoctorId(e.target.value)} className={inputClass}>
              <option value="">{t("doctor.selectDoctorPlaceholder")}</option>
              {doctors.map((d) => (
                <option key={d._id} value={d._id}>
                  {d.name}
                </option>
              ))}
            </select>
            <select required value={personId} onChange={(e) => setPersonId(e.target.value)} className={inputClass}>
              <option value="">{t("doctor.selectTreatedPersonPlaceholder")}</option>
              {people.map((p) => (
                <option key={p._id} value={p._id}>
                  {p.name}
                </option>
              ))}
            </select>
            <input
              placeholder={t("doctor.ailmentPlaceholder")}
              value={ailment}
              onChange={(e) => setAilment(e.target.value)}
              className={cn(inputClass, "col-span-2")}
            />
            <label className="flex flex-col gap-1">
              <span className="text-xs text-ink-muted">{t("common.date")}</span>
              <DateInput value={date} onChange={(e) => setDate(e.target.value)} className={inputClass} />
            </label>
            <input
              type="number"
              min={0}
              placeholder={t("doctor.medicineCostPlaceholder")}
              value={medicineCost}
              onChange={(e) => setMedicineCost(e.target.value)}
              className={inputClass}
            />
            <input
              type="number"
              min={0}
              placeholder={t("doctor.consultationFeePlaceholder")}
              value={consultationFee}
              onChange={(e) => setConsultationFee(e.target.value)}
              className={cn(inputClass, "col-span-2")}
            />

            {(Number(medicineCost) || 0) + (Number(consultationFee) || 0) > 0 && (
              <div className="col-span-2 flex flex-col gap-2">
                <select value={paymentMode} onChange={(e) => setPaymentMode(e.target.value as LaborPaymentMode)} className={inputClass}>
                  <option value="CASH">{t("dispatch.paymentCash")}</option>
                  <option value="BANK">{t("dispatch.paymentBankTransfer")}</option>
                  <option value="UPI">{t("dispatch.paymentUpi")}</option>
                  <option value="CASH_AND_ONLINE">{t("common.paymentModeCashAndOnline")}</option>
                </select>
                {paymentMode === "CASH_AND_ONLINE" && (
                  <PaymentSplitFields
                    totalAmount={(Number(medicineCost) || 0) + (Number(consultationFee) || 0)}
                    cashAmount={cashAmount}
                    onlineAmount={onlineAmount}
                    onCashAmountChange={setCashAmount}
                    onOnlineAmountChange={setOnlineAmount}
                    inputClassName={inputClass}
                  />
                )}
              </div>
            )}

            <input
              placeholder={t("common.notesOptional")}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className={cn(inputClass, "col-span-2")}
            />
            {formError && <p className="col-span-2 text-sm text-status-critical">{formError}</p>}
            <Button type="submit" size="sm" disabled={saving} className="col-span-2">
              {t("common.saveChanges")}
            </Button>
          </form>
        ) : (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <ProfileViewField label={t("doctor.doctorColumn")} value={doctorName} />
            <ProfileViewField label={t("doctor.treatedPersonColumn")} value={personName} />
            <ProfileViewField label={t("doctor.ailmentColumn")} value={visit.ailment} />
            <ProfileViewField label={t("common.date")} value={new Date(visit.date).toLocaleDateString("en-IN")} />
            <ProfileViewField label={t("doctor.medicineCostPlaceholder")} value={`₹${formatINR(visit.medicineCost)}`} />
            <ProfileViewField label={t("doctor.consultationFeePlaceholder")} value={`₹${formatINR(visit.consultationFee)}`} />
            <ProfileViewField label={t("doctor.totalCostColumn")} value={`₹${formatINR(visit.medicineCost + visit.consultationFee)}`} />
            {visit.paymentMode && (
              <ProfileViewField
                label={t("common.howWasThisPaid")}
                value={
                  visit.paymentMode === "CASH_AND_ONLINE"
                    ? `Cash ₹${formatINR(visit.cashAmount ?? 0)} + Online ₹${formatINR(visit.onlineAmount ?? 0)}`
                    : visit.paymentMode
                }
              />
            )}
            <ProfileViewField label={t("common.notes")} value={visit.notes} />
          </div>
        )}
      </Card>
    </div>
  );
}
