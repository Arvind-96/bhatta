import { FormEvent, useState } from "react";
import { ArrowLeft, Pencil, Stethoscope, Trash2, X } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api";
import { useTranslation } from "@/hooks/useTranslation";
import { cn, formatINR } from "@/lib/utils";
import { ProfileViewField } from "@/components/people/ProfileViewField";
import type { Doctor as DoctorRecord, DoctorVisit, Person } from "@/types";

const inputClass =
  "h-10 rounded-xl border border-border bg-ink-primary/5 px-3 text-sm text-ink-primary outline-none focus:ring-2 focus:ring-series-1";

interface DoctorDetailPageProps {
  doctor: DoctorRecord;
  visits: DoctorVisit[];
  people: Person[];
  onBack: () => void;
  onOpenVisit: (visitId: string) => void;
  onDeleted: () => void;
}

// The full profile for a single doctor — every field the roster's add-form
// collects, plus their own visit history. Mirrors MachineDetailPage.tsx's
// shape (header with Edit/Delete, an editable profile card, a history
// list) so it reads consistently with the rest of the app's profile pages.
export function DoctorDetailPage({ doctor, visits, people, onBack, onOpenVisit, onDeleted }: DoctorDetailPageProps) {
  const { t } = useTranslation();
  const [isEditing, setIsEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const [name, setName] = useState(doctor.name);
  const [phone, setPhone] = useState(doctor.phone ?? "");
  const [qualification, setQualification] = useState(doctor.qualification ?? "");
  const [clinicAddress, setClinicAddress] = useState(doctor.clinicAddress ?? "");
  const [notes, setNotes] = useState(doctor.notes ?? "");

  function loadFieldsFrom(d: DoctorRecord) {
    setName(d.name);
    setPhone(d.phone ?? "");
    setQualification(d.qualification ?? "");
    setClinicAddress(d.clinicAddress ?? "");
    setNotes(d.notes ?? "");
  }

  function cancelEditing() {
    loadFieldsFrom(doctor);
    setIsEditing(false);
  }

  async function saveProfile(e: FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setSaving(true);
    try {
      await api.doctors.update(doctor._id, {
        name: name.trim(),
        phone: phone || undefined,
        qualification: qualification || undefined,
        clinicAddress: clinicAddress || undefined,
        notes: notes || undefined,
      });
      setIsEditing(false);
    } finally {
      setSaving(false);
    }
  }

  async function deleteDoctor() {
    if (!confirm(t("doctor.confirmRemoveDoctor", { name: doctor.name }))) return;
    setDeleting(true);
    try {
      await api.doctors.remove(doctor._id);
      onDeleted();
    } catch (err) {
      alert(err instanceof Error ? err.message : t("common.somethingWentWrong"));
    } finally {
      setDeleting(false);
    }
  }

  const sortedVisits = [...visits].sort((a, b) => (a.date < b.date ? 1 : -1));

  return (
    <div>
      <button onClick={onBack} className="mb-3 flex items-center gap-1.5 text-sm text-ink-secondary hover:text-ink-primary">
        <ArrowLeft className="h-4 w-4" /> {t("doctor.backToDoctors")}
      </button>

      <Card className="mb-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h3 className="flex items-center gap-1.5 text-lg font-semibold text-ink-primary">
              <Stethoscope className="h-4 w-4 shrink-0 text-series-1" /> {doctor.name}
            </h3>
            {doctor.qualification && <p className="text-sm text-ink-muted">{doctor.qualification}</p>}
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
              onClick={deleteDoctor}
              disabled={deleting}
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
            <h4 className="text-xs font-semibold uppercase tracking-wide text-ink-muted">{t("doctor.profileSection")}</h4>
            {isEditing && (
              <button onClick={cancelEditing} className="flex items-center gap-1 text-xs font-medium text-ink-muted hover:text-ink-primary">
                <X className="h-3.5 w-3.5" /> {t("common.cancel")}
              </button>
            )}
          </div>
          {isEditing ? (
            <form onSubmit={saveProfile} className="grid grid-cols-2 gap-2">
              <input required placeholder={t("common.name")} value={name} onChange={(e) => setName(e.target.value)} className={inputClass} />
              <input placeholder={t("people.mobileNumber")} value={phone} onChange={(e) => setPhone(e.target.value)} className={inputClass} />
              <input
                placeholder={t("doctor.qualificationPlaceholder")}
                value={qualification}
                onChange={(e) => setQualification(e.target.value)}
                className={inputClass}
              />
              <input
                placeholder={t("doctor.clinicAddressPlaceholder")}
                value={clinicAddress}
                onChange={(e) => setClinicAddress(e.target.value)}
                className={inputClass}
              />
              <input
                placeholder={t("common.notesOptional")}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                className={cn(inputClass, "col-span-2")}
              />
              <Button type="submit" size="sm" disabled={saving} className="col-span-2">
                {t("common.saveChanges")}
              </Button>
            </form>
          ) : (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <ProfileViewField label={t("people.mobileNumber")} value={doctor.phone} />
              <ProfileViewField label={t("doctor.qualificationPlaceholder")} value={doctor.qualification} />
              <ProfileViewField label={t("doctor.clinicAddressPlaceholder")} value={doctor.clinicAddress} />
              <ProfileViewField label={t("common.notes")} value={doctor.notes} />
            </div>
          )}
        </Card>

        <Card className="lg:col-span-2">
          <h4 className="mb-3 text-xs font-semibold uppercase tracking-wide text-ink-muted">{t("doctor.visitHistorySection")}</h4>
          {sortedVisits.length === 0 ? (
            <p className="py-6 text-center text-sm text-ink-muted">{t("doctor.noVisitsForDoctorYet")}</p>
          ) : (
            <div className="space-y-1">
              {sortedVisits.map((v) => {
                const person = typeof v.personId === "object" ? v.personId : people.find((p) => p._id === v.personId);
                return (
                  <button
                    key={v._id}
                    onClick={() => onOpenVisit(v._id)}
                    className="flex w-full items-center justify-between rounded-lg border border-border px-3 py-2 text-left text-sm hover:bg-ink-primary/5"
                  >
                    <div>
                      <p className="text-ink-primary">{person?.name ?? "—"}</p>
                      <p className="text-sm text-ink-muted">
                        {new Date(v.date).toLocaleDateString("en-IN")}
                        {v.ailment ? ` · ${v.ailment}` : ""}
                      </p>
                    </div>
                    <span className="tabular-nums font-medium text-ink-primary">₹{formatINR(v.medicineCost + v.consultationFee)}</span>
                  </button>
                );
              })}
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
