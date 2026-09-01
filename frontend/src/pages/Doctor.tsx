import { FormEvent, useEffect, useState } from "react";
import { Pencil, Plus, Trash2, Stethoscope } from "lucide-react";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { DateInput } from "@/components/ui/date-input";
import { Pagination, usePagination } from "@/components/ui/pagination";
import { cn, formatINR } from "@/lib/utils";
import { api } from "@/lib/api";
import { useKilnEvent } from "@/hooks/useKilnEvent";
import { useAuthStore } from "@/store/auth.store";
import { useTranslation } from "@/hooks/useTranslation";
import { isPaymentSplitMismatched } from "@/components/shared/PaymentSplitFields";
import { AmountPaymentModeFields } from "@/components/shared/AmountPaymentModeFields";
import type { Doctor as DoctorRecord, DoctorVisit, LaborPaymentMode, Person } from "@/types";

const inputClass =
  "h-10 rounded-xl border border-border bg-ink-primary/5 px-3 text-sm text-ink-primary outline-none focus:ring-2 focus:ring-series-1";

function emptyDoctorForm() {
  return { name: "", phone: "", qualification: "", clinicAddress: "", notes: "" };
}

function emptyVisitForm() {
  return {
    doctorId: "",
    personId: "",
    ailment: "",
    medicineCost: "",
    consultationFee: "",
    date: "",
    paymentMode: "CASH" as LaborPaymentMode,
    cashAmount: "",
    onlineAmount: "",
    notes: "",
  };
}

// The Doctor module — a roster of visiting doctors plus a date-wise log of
// who they treated, with each visit's medicine cost + consultation fee
// auto-logged as one Expense the moment it's saved (see
// doctorVisit.service.ts's createDoctorVisit). Deliberately not part of
// the `people` polymorphic table: a doctor has no running ledger balance
// with the kiln the way staff/contractors do, so it gets its own simple
// roster, same shape as Fleet's machines.
export function Doctor() {
  const { t } = useTranslation();
  const [doctors, setDoctors] = useState<DoctorRecord[]>([]);
  const [visits, setVisits] = useState<DoctorVisit[]>([]);
  const [people, setPeople] = useState<Person[]>([]);
  const [showDoctorForm, setShowDoctorForm] = useState(false);
  const [doctorForm, setDoctorForm] = useState(emptyDoctorForm);
  const [savingDoctor, setSavingDoctor] = useState(false);
  const [editingDoctorId, setEditingDoctorId] = useState<string | null>(null);
  const [showVisitForm, setShowVisitForm] = useState(false);
  const [visitForm, setVisitForm] = useState(emptyVisitForm);
  const [savingVisit, setSavingVisit] = useState(false);
  const [visitFormError, setVisitFormError] = useState("");
  const [editingVisitId, setEditingVisitId] = useState<string | null>(null);
  const activeKilnId = useAuthStore((s) => s.activeKilnId);

  async function refresh() {
    const [doctorsData, visitsData, peopleData] = await Promise.all([api.doctors.list(), api.doctorVisits.list(), api.people.list()]);
    setDoctors(doctorsData);
    setVisits(visitsData);
    setPeople(peopleData);
  }

  useEffect(() => {
    if (!activeKilnId) return;
    refresh().catch(console.error);
  }, [activeKilnId]);

  useKilnEvent("doctor:update", () => refresh());
  useKilnEvent("doctorVisit:update", () => refresh());

  const { page: doctorPage, setPage: setDoctorPage, pageCount: doctorPageCount, pageItems: pagedDoctors, total: doctorTotal } = usePagination(doctors, 9);
  const { page: visitPage, setPage: setVisitPage, pageCount: visitPageCount, pageItems: pagedVisits, total: visitTotal } = usePagination(visits, 10);

  async function handleAddDoctor(e: FormEvent) {
    e.preventDefault();
    if (!doctorForm.name.trim()) return;
    setSavingDoctor(true);
    try {
      const payload = {
        name: doctorForm.name.trim(),
        phone: doctorForm.phone || undefined,
        qualification: doctorForm.qualification || undefined,
        clinicAddress: doctorForm.clinicAddress || undefined,
        notes: doctorForm.notes || undefined,
      };
      if (editingDoctorId) {
        await api.doctors.update(editingDoctorId, payload);
      } else {
        await api.doctors.create(payload);
      }
      setDoctorForm(emptyDoctorForm());
      setEditingDoctorId(null);
      setShowDoctorForm(false);
      await refresh();
    } finally {
      setSavingDoctor(false);
    }
  }

  function startEditDoctor(doctor: DoctorRecord) {
    setEditingDoctorId(doctor._id);
    setDoctorForm({
      name: doctor.name,
      phone: doctor.phone ?? "",
      qualification: doctor.qualification ?? "",
      clinicAddress: doctor.clinicAddress ?? "",
      notes: doctor.notes ?? "",
    });
    setShowDoctorForm(true);
  }

  function cancelDoctorForm() {
    setDoctorForm(emptyDoctorForm());
    setEditingDoctorId(null);
    setShowDoctorForm(false);
  }

  async function deleteDoctor(doctor: DoctorRecord) {
    if (!confirm(t("doctor.confirmRemoveDoctor", { name: doctor.name }))) return;
    await api.doctors.remove(doctor._id);
    await refresh();
  }

  async function handleAddVisit(e: FormEvent) {
    e.preventDefault();
    if (!visitForm.doctorId || !visitForm.personId) return;
    const medicineCost = Number(visitForm.medicineCost) || 0;
    const consultationFee = Number(visitForm.consultationFee) || 0;
    const total = medicineCost + consultationFee;
    if (total > 0 && isPaymentSplitMismatched(visitForm.paymentMode, total, visitForm.cashAmount, visitForm.onlineAmount)) {
      setVisitFormError(t("payment.splitMismatch", { total: total.toLocaleString("en-IN") }));
      return;
    }
    setVisitFormError("");
    setSavingVisit(true);
    try {
      const payload = {
        doctorId: visitForm.doctorId,
        personId: visitForm.personId,
        ailment: visitForm.ailment || undefined,
        medicineCost: medicineCost || undefined,
        consultationFee: consultationFee || undefined,
        date: visitForm.date || undefined,
        paymentMode: total > 0 ? visitForm.paymentMode : undefined,
        cashAmount: total > 0 && visitForm.paymentMode === "CASH_AND_ONLINE" ? Number(visitForm.cashAmount) : undefined,
        onlineAmount: total > 0 && visitForm.paymentMode === "CASH_AND_ONLINE" ? Number(visitForm.onlineAmount) : undefined,
        notes: visitForm.notes || undefined,
      };
      if (editingVisitId) {
        await api.doctorVisits.update(editingVisitId, payload);
      } else {
        await api.doctorVisits.create(payload);
      }
      setVisitForm(emptyVisitForm());
      setEditingVisitId(null);
      setShowVisitForm(false);
      await refresh();
    } finally {
      setSavingVisit(false);
    }
  }

  function startEditVisit(visit: DoctorVisit) {
    setEditingVisitId(visit._id);
    setVisitForm({
      doctorId: typeof visit.doctorId === "object" ? visit.doctorId._id : visit.doctorId,
      personId: typeof visit.personId === "object" ? visit.personId._id : visit.personId,
      ailment: visit.ailment ?? "",
      medicineCost: visit.medicineCost ? String(visit.medicineCost) : "",
      consultationFee: visit.consultationFee ? String(visit.consultationFee) : "",
      date: visit.date ? visit.date.slice(0, 10) : "",
      paymentMode: visit.paymentMode ?? "CASH",
      cashAmount: visit.cashAmount != null ? String(visit.cashAmount) : "",
      onlineAmount: visit.onlineAmount != null ? String(visit.onlineAmount) : "",
      notes: visit.notes ?? "",
    });
    setShowVisitForm(true);
  }

  function cancelVisitForm() {
    setVisitForm(emptyVisitForm());
    setEditingVisitId(null);
    setVisitFormError("");
    setShowVisitForm(false);
  }

  async function deleteVisit(visit: DoctorVisit) {
    if (!confirm(t("doctor.confirmRemoveVisit"))) return;
    await api.doctorVisits.remove(visit._id);
    await refresh();
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>{t("doctor.rosterHeading")}</CardTitle>
          <Button
            size="sm"
            onClick={() => {
              if (editingDoctorId) cancelDoctorForm();
              else setShowDoctorForm((s) => !s);
            }}
          >
            <Plus className="h-4 w-4" /> {t("doctor.addDoctor")}
          </Button>
        </CardHeader>

        {showDoctorForm && (
          <form onSubmit={handleAddDoctor} className="mb-4 grid grid-cols-2 gap-2 rounded-xl border border-border p-3">
            <input required placeholder={t("common.name")} value={doctorForm.name} onChange={(e) => setDoctorForm((f) => ({ ...f, name: e.target.value }))} className={inputClass} />
            <input placeholder={t("people.mobileNumber")} value={doctorForm.phone} onChange={(e) => setDoctorForm((f) => ({ ...f, phone: e.target.value }))} className={inputClass} />
            <input placeholder={t("doctor.qualificationPlaceholder")} value={doctorForm.qualification} onChange={(e) => setDoctorForm((f) => ({ ...f, qualification: e.target.value }))} className={inputClass} />
            <input placeholder={t("doctor.clinicAddressPlaceholder")} value={doctorForm.clinicAddress} onChange={(e) => setDoctorForm((f) => ({ ...f, clinicAddress: e.target.value }))} className={inputClass} />
            <input placeholder={t("common.notesOptional")} value={doctorForm.notes} onChange={(e) => setDoctorForm((f) => ({ ...f, notes: e.target.value }))} className={cn(inputClass, "col-span-2")} />
            <div className="col-span-2 flex gap-2">
              {editingDoctorId && (
                <button type="button" onClick={cancelDoctorForm} className="h-10 shrink-0 rounded-xl border border-border px-4 text-sm font-medium text-ink-secondary hover:bg-ink-primary/5">
                  {t("common.cancel")}
                </button>
              )}
              <Button type="submit" disabled={savingDoctor} className="flex-1">
                {editingDoctorId ? t("common.saveChanges") : t("common.add")}
              </Button>
            </div>
          </form>
        )}

        {doctors.length === 0 ? (
          <p className="py-8 text-center text-sm text-ink-muted">{t("doctor.noDoctorsYet")}</p>
        ) : (
          <>
            <div className="grid gap-3 md:grid-cols-3">
              {pagedDoctors.map((d) => (
                <Card key={d._id}>
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="flex items-center gap-1.5 truncate text-sm font-semibold text-ink-primary">
                        <Stethoscope className="h-3.5 w-3.5 shrink-0 text-series-1" /> {d.name}
                      </p>
                      {d.qualification && <p className="truncate text-sm text-ink-muted">{d.qualification}</p>}
                      {d.phone && <p className="truncate text-sm text-ink-muted">{d.phone}</p>}
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      <button onClick={() => startEditDoctor(d)} className="text-ink-muted hover:text-ink-primary" aria-label={t("common.edit")}>
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                      <button onClick={() => deleteDoctor(d)} className="text-ink-muted hover:text-status-critical" aria-label={t("common.delete")}>
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                </Card>
              ))}
            </div>
            <Pagination page={doctorPage} pageCount={doctorPageCount} onChange={setDoctorPage} total={doctorTotal} pageSize={9} />
          </>
        )}
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t("doctor.visitLogHeading")}</CardTitle>
          <Button
            size="sm"
            onClick={() => {
              if (editingVisitId) cancelVisitForm();
              else setShowVisitForm((s) => !s);
            }}
            disabled={doctors.length === 0}
          >
            <Plus className="h-4 w-4" /> {t("doctor.logVisit")}
          </Button>
        </CardHeader>

        {doctors.length === 0 && <p className="mb-3 text-sm text-ink-muted">{t("doctor.addDoctorFirstHint")}</p>}

        {showVisitForm && (
          <form onSubmit={handleAddVisit} className="mb-4 grid grid-cols-2 gap-2 rounded-xl border border-border p-3">
            <select required value={visitForm.doctorId} onChange={(e) => setVisitForm((f) => ({ ...f, doctorId: e.target.value }))} className={inputClass}>
              <option value="">{t("doctor.selectDoctorPlaceholder")}</option>
              {doctors.map((d) => (
                <option key={d._id} value={d._id}>
                  {d.name}
                </option>
              ))}
            </select>
            <select required value={visitForm.personId} onChange={(e) => setVisitForm((f) => ({ ...f, personId: e.target.value }))} className={inputClass}>
              <option value="">{t("doctor.selectTreatedPersonPlaceholder")}</option>
              {people.map((p) => (
                <option key={p._id} value={p._id}>
                  {p.name}
                </option>
              ))}
            </select>
            <input placeholder={t("doctor.ailmentPlaceholder")} value={visitForm.ailment} onChange={(e) => setVisitForm((f) => ({ ...f, ailment: e.target.value }))} className={cn(inputClass, "col-span-2")} />
            <label className="flex flex-col gap-1">
              <span className="text-xs text-ink-muted">{t("common.date")}</span>
              <DateInput value={visitForm.date} onChange={(e) => setVisitForm((f) => ({ ...f, date: e.target.value }))} className={inputClass} />
            </label>
            <input type="number" min={0} placeholder={t("doctor.medicineCostPlaceholder")} value={visitForm.medicineCost} onChange={(e) => setVisitForm((f) => ({ ...f, medicineCost: e.target.value }))} className={inputClass} />
            <input type="number" min={0} placeholder={t("doctor.consultationFeePlaceholder")} value={visitForm.consultationFee} onChange={(e) => setVisitForm((f) => ({ ...f, consultationFee: e.target.value }))} className={cn(inputClass, "col-span-2")} />

            {(Number(visitForm.medicineCost) || 0) + (Number(visitForm.consultationFee) || 0) > 0 && (
              <AmountPaymentModeFields
                amount={(Number(visitForm.medicineCost) || 0) + (Number(visitForm.consultationFee) || 0)}
                paymentMode={visitForm.paymentMode}
                cashAmount={visitForm.cashAmount}
                onlineAmount={visitForm.onlineAmount}
                onPaymentModeChange={(mode) => setVisitForm((f) => ({ ...f, paymentMode: mode }))}
                onCashAmountChange={(v) => setVisitForm((f) => ({ ...f, cashAmount: v }))}
                onOnlineAmountChange={(v) => setVisitForm((f) => ({ ...f, onlineAmount: v }))}
                inputClassName={inputClass}
              />
            )}

            <input placeholder={t("common.notesOptional")} value={visitForm.notes} onChange={(e) => setVisitForm((f) => ({ ...f, notes: e.target.value }))} className={cn(inputClass, "col-span-2")} />
            {visitFormError && <p className="col-span-2 text-sm text-status-critical">{visitFormError}</p>}
            <div className="col-span-2 flex gap-2">
              {editingVisitId && (
                <button type="button" onClick={cancelVisitForm} className="h-10 shrink-0 rounded-xl border border-border px-4 text-sm font-medium text-ink-secondary hover:bg-ink-primary/5">
                  {t("common.cancel")}
                </button>
              )}
              <Button type="submit" disabled={savingVisit} className="flex-1">
                {editingVisitId ? t("common.saveChanges") : t("doctor.saveVisit")}
              </Button>
            </div>
          </form>
        )}

        {visits.length === 0 ? (
          <p className="py-8 text-center text-sm text-ink-muted">{t("doctor.noVisitsYet")}</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-sm">
              <thead>
                <tr className="border-b border-border text-left text-sm text-ink-muted">
                  <th className="pb-2 font-medium">{t("common.date")}</th>
                  <th className="pb-2 font-medium">{t("doctor.doctorColumn")}</th>
                  <th className="pb-2 font-medium">{t("doctor.treatedPersonColumn")}</th>
                  <th className="pb-2 font-medium">{t("doctor.ailmentColumn")}</th>
                  <th className="pb-2 font-medium">{t("doctor.totalCostColumn")}</th>
                  <th className="pb-2 font-medium text-right"></th>
                </tr>
              </thead>
              <tbody>
                {pagedVisits.map((v) => (
                  <tr key={v._id} className="border-b border-border/60 last:border-0">
                    <td className="py-3 text-ink-secondary">{new Date(v.date).toLocaleDateString("en-IN")}</td>
                    <td className="py-3 text-ink-primary">{typeof v.doctorId === "object" ? v.doctorId.name : "—"}</td>
                    <td className="py-3 text-ink-secondary">{typeof v.personId === "object" ? v.personId.name : "—"}</td>
                    <td className="py-3 text-ink-secondary">{v.ailment || "—"}</td>
                    <td className="py-3 tabular-nums text-ink-secondary">₹{formatINR(v.medicineCost + v.consultationFee)}</td>
                    <td className="py-3 text-right">
                      <button onClick={() => startEditVisit(v)} className="mr-3 text-xs font-medium text-series-1 hover:underline">
                        {t("common.edit")}
                      </button>
                      <button onClick={() => deleteVisit(v)} className="text-xs font-medium text-status-critical hover:underline">
                        {t("common.delete")}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <Pagination page={visitPage} pageCount={visitPageCount} onChange={setVisitPage} total={visitTotal} pageSize={10} />
          </div>
        )}
      </Card>
    </div>
  );
}
