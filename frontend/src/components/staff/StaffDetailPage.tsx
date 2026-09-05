import { FormEvent, useEffect, useState } from "react";
import { ArrowLeft, Pencil, Printer, Trash2, X } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { DateInput } from "@/components/ui/date-input";
import { api } from "@/lib/api";
import { useKilnEvent } from "@/hooks/useKilnEvent";
import { useAuthStore } from "@/store/auth.store";
import { LedgerModal } from "@/components/people/LedgerModal";
import { EditLedgerEntryModal } from "@/components/people/EditLedgerEntryModal";
import { PersonAvatar } from "@/components/people/PersonAvatar";
import { PhotoCaptureInput } from "@/components/people/PhotoCaptureInput";
import { ProfileViewField } from "@/components/people/ProfileViewField";
import { useTranslation } from "@/hooks/useTranslation";
import type { LedgerEntry, Person } from "@/types";
import { formatDateTime, formatINR } from "@/lib/utils";
import { printLedgerEntry } from "@/lib/printDocument";
import { usePersonTypeMeta } from "@/components/people/personTypes";
import { AttendanceCalendar } from "./AttendanceCalendar";
import { SalarySlipHistory } from "./SalarySlipHistory";
import { DriverDieselHistory } from "./DriverDieselHistory";

const inputClass =
  "h-10 rounded-xl border border-border bg-ink-primary/5 px-3 text-sm text-ink-primary outline-none focus:ring-2 focus:ring-series-1";

interface StaffDetailPageProps {
  staffId: string;
  onBack: () => void;
}

// Mirrors the backend's own attendance-eligibility rule (see
// attendance.service.ts's assertAttendanceEligible) — a Supplier/Partner/
// Customer(-legacy)/salary-less Fitter profile has no wage/attendance
// concept at all, so showing an always-empty calendar and salary history
// for them would just be confusing.
function isWageEligible(person: Person) {
  return (
    person.type === "WORKER" ||
    person.type === "HELPER" ||
    person.type === "LABOUR_CONTRACTOR" ||
    person.monthlySalary != null
  );
}

const ADVANCE_CATEGORY_KEYS: Record<string, string> = {
  ADVANCE: "staff.advanceCategoryAdvance",
  KHARCHI: "staff.advanceCategoryKharchi",
  MEDICAL: "staff.advanceCategoryMedical",
  FESTIVAL: "staff.advanceCategoryFestival",
  OTHER: "staff.advanceCategoryOther",
};

// Dedicated profile page for permanent bhatta admin/support staff (Main
// Munim, Junior Munims, office Helpers, Chowkidar, Driver) — personal
// details, editable monthly salary + designation, and their full financial
// ledger. No shift/attendance/output tracking here — that's specific to
// the production-side roles (Fitter, Bharai/Nikasi gangs), not office staff.
export function StaffDetailPage({ staffId, onBack }: StaffDetailPageProps) {
  const { t } = useTranslation();
  const personTypeMeta = usePersonTypeMeta();
  const [staff, setStaff] = useState<Person | null>(null);
  const [balance, setBalance] = useState(0);
  const [ledgerEntries, setLedgerEntries] = useState<LedgerEntry[]>([]);
  const [salaryInput, setSalaryInput] = useState("");
  const [designationInput, setDesignationInput] = useState("");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [address, setAddress] = useState("");
  const [idNumber, setIdNumber] = useState("");
  const [nickname, setNickname] = useState("");
  const [joiningDate, setJoiningDate] = useState("");
  const [isEditing, setIsEditing] = useState(false);
  const [profileError, setProfileError] = useState("");
  const [saving, setSaving] = useState(false);
  const [savingProfile, setSavingProfile] = useState(false);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [ledgerOpen, setLedgerOpen] = useState(false);
  const [editingLedgerEntry, setEditingLedgerEntry] = useState<LedgerEntry | null>(null);
  const kilns = useAuthStore((s) => s.kilns);
  const activeKilnId = useAuthStore((s) => s.activeKilnId);
  const activeKiln = kilns.find((k) => k.kilnId === activeKilnId);
  const kilnInfo = {
    name: activeKiln?.name ?? "Bhatta Cloud",
    location: activeKiln?.location,
    phone: activeKiln?.phone,
  };

  async function refresh() {
    const [detail, ledger] = await Promise.all([api.people.get(staffId), api.people.listLedger(staffId)]);
    setStaff(detail.person);
    setBalance(detail.balance);
    setLedgerEntries(ledger);
    setSalaryInput(detail.person.monthlySalary ? String(detail.person.monthlySalary) : "");
    setDesignationInput(detail.person.designation ?? "");
    setName(detail.person.name);
    setPhone(detail.person.phone ?? "");
    setAddress(detail.person.address ?? "");
    setIdNumber(detail.person.idNumber ?? "");
    setNickname(detail.person.nickname ?? "");
    setJoiningDate(detail.person.joiningDate ? detail.person.joiningDate.slice(0, 10) : "");
  }

  useEffect(() => {
    refresh().catch(console.error);
  }, [staffId]);

  useKilnEvent("ledger:update", () => refresh());
  useKilnEvent("person:update", () => refresh());

  async function saveContactInfo(e: FormEvent) {
    e.preventDefault();
    setSavingProfile(true);
    try {
      await api.people.update(staffId, {
        name: name.trim(),
        phone: phone || undefined,
        address: address || undefined,
        idNumber: idNumber || undefined,
        nickname: nickname.trim() || undefined,
        joiningDate: joiningDate || undefined,
      });
      await refresh();
    } finally {
      setSavingProfile(false);
    }
  }

  async function saveProfile(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      await api.people.update(staffId, {
        monthlySalary: salaryInput ? Number(salaryInput) : undefined,
        designation: designationInput || undefined,
      });
      await refresh();
    } finally {
      setSaving(false);
    }
  }

  function cancelEditing() {
    if (staff) {
      setName(staff.name);
      setPhone(staff.phone ?? "");
      setAddress(staff.address ?? "");
      setIdNumber(staff.idNumber ?? "");
      setNickname(staff.nickname ?? "");
      setJoiningDate(staff.joiningDate ? staff.joiningDate.slice(0, 10) : "");
      setSalaryInput(staff.monthlySalary ? String(staff.monthlySalary) : "");
      setDesignationInput(staff.designation ?? "");
    }
    setIsEditing(false);
  }

  async function handlePhotoChange(file: File | Blob | null) {
    if (!file) return;
    setUploadingPhoto(true);
    try {
      await api.people.uploadPhoto(staffId, file);
      await refresh();
    } finally {
      setUploadingPhoto(false);
    }
  }

  async function handleIdentityProofChange(file: File | null) {
    if (!file) return;
    setUploadingPhoto(true);
    try {
      await api.people.uploadIdentityProof(staffId, file);
      await refresh();
    } finally {
      setUploadingPhoto(false);
    }
  }

  // Permanent delete — refused by the backend if this staff member has
  // any real history (ledger entries, attendance, salary slips, diesel
  // entries, etc). Use the Absconded toggle instead to just take them off
  // the active list.
  async function deleteProfile() {
    if (!staff) return;
    if (!confirm(t("staff.confirmDeleteProfile", { name: staff.name }))) return;
    setProfileError("");
    try {
      await api.people.remove(staffId);
      onBack();
    } catch (err) {
      setProfileError(err instanceof Error ? err.message : t("common.somethingWentWrong"));
    }
  }

  function printEntry(entry: LedgerEntry) {
    if (!staff) return;
    printLedgerEntry(entry, staff.name, kilnInfo);
  }

  const backButton = (
    <button onClick={onBack} className="mb-3 flex items-center gap-1.5 text-sm text-ink-secondary hover:text-ink-primary">
      <ArrowLeft className="h-4 w-4" /> {t("staff.backToStaff")}
    </button>
  );

  if (!staff) {
    return (
      <div>
        {backButton}
        <Card>
          <p className="py-8 text-center text-sm text-ink-muted">{t("common.loading")}</p>
        </Card>
      </div>
    );
  }

  const totalEarnings = ledgerEntries
    .filter((e) => e.direction === "DUE" && (e.category === "SALARY" || e.category === "WAGE" || !e.category))
    .reduce((sum, e) => sum + e.amount, 0);

  const advancesByCategory = new Map<string, number>();
  for (const e of ledgerEntries) {
    if (e.direction !== "PAID") continue;
    const key = e.category ?? "OTHER";
    advancesByCategory.set(key, (advancesByCategory.get(key) ?? 0) + e.amount);
  }
  const totalAdvancesGiven = Array.from(advancesByCategory.values()).reduce((sum, v) => sum + v, 0);

  // ledgerEntries comes back newest-first — the running paid-so-far/
  // remaining-due shown alongside each row still needs to build up
  // chronologically, same computation LandownerDetailPage uses.
  const runningTotalsById = new Map<string, { paidSoFar: number; remainingDue: number }>();
  {
    let paid = 0;
    let due = 0;
    for (const entry of [...ledgerEntries].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())) {
      if (entry.direction === "PAID") paid += entry.amount;
      else due += entry.amount;
      runningTotalsById.set(entry._id, { paidSoFar: paid, remainingDue: Math.max(0, due - paid) });
    }
  }

  return (
    <div>
      {backButton}

      <Card className="mb-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex items-start gap-3">
            <PersonAvatar personId={staffId} hasPhoto={!!staff.photoPath} name={staff.name} />
            <div>
              <h3 className="text-lg font-semibold text-ink-primary">
                {staff.name}
                {staff.nickname && <span className="ml-1.5 font-normal text-ink-muted">"{staff.nickname}"</span>}
              </h3>
              <p className="text-sm text-ink-muted">{staff.designation || personTypeMeta[staff.type].label}</p>
              {staff.joiningDate && (
                <p className="mt-0.5 text-sm text-ink-muted">
                  {t("people.joiningDate")}: {new Date(staff.joiningDate).toLocaleDateString("en-IN")}
                </p>
              )}
            </div>
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
            <Button size="sm" onClick={() => setLedgerOpen(true)}>
              {t("staff.advanceSalaryButton")}
            </Button>
            <button
              onClick={deleteProfile}
              className="flex items-center gap-1 rounded-lg border border-status-critical/30 bg-status-critical/5 px-3 py-1.5 text-xs font-medium text-status-critical hover:bg-status-critical/10"
            >
              <Trash2 className="h-3.5 w-3.5" /> {t("common.delete")}
            </button>
          </div>
        </div>
        {profileError && <p className="mt-3 text-sm text-status-critical">{profileError}</p>}
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <div className="mb-2 flex items-center justify-between">
            <h4 className="text-xs font-semibold uppercase tracking-wide text-ink-muted">{t("staff.staffProfile")}</h4>
            {isEditing && (
              <button onClick={cancelEditing} className="flex items-center gap-1 text-xs font-medium text-ink-muted hover:text-ink-primary">
                <X className="h-3.5 w-3.5" /> {t("common.cancel")}
              </button>
            )}
          </div>
          {isEditing ? (
            <form onSubmit={saveContactInfo} className="flex flex-col gap-2">
              <input required placeholder={t("common.name")} value={name} onChange={(e) => setName(e.target.value)} className={inputClass} />
              <input placeholder={t("people.nickname")} value={nickname} onChange={(e) => setNickname(e.target.value)} className={inputClass} />
              <input placeholder={t("common.phone")} value={phone} onChange={(e) => setPhone(e.target.value)} className={inputClass} />
              <input placeholder={t("staff.address")} value={address} onChange={(e) => setAddress(e.target.value)} className={inputClass} />
              <input
                placeholder={t("staff.aadharIdNumber")}
                value={idNumber}
                onChange={(e) => setIdNumber(e.target.value)}
                className={inputClass}
              />
              <label className="flex flex-col gap-1">
                <span className="text-xs text-ink-muted">{t("people.joiningDate")}</span>
                <DateInput value={joiningDate} onChange={(e) => setJoiningDate(e.target.value)} className={inputClass} />
              </label>
              <Button type="submit" size="sm" disabled={savingProfile}>
                {t("staff.saveProfile")}
              </Button>
            </form>
          ) : (
            <div className="grid grid-cols-2 gap-3">
              <ProfileViewField label={t("common.phone")} value={staff.phone} />
              <ProfileViewField label={t("staff.aadharIdNumber")} value={staff.idNumber} />
              <ProfileViewField label={t("staff.address")} value={staff.address} />
            </div>
          )}
        </Card>

        <Card>
          <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-muted">{t("staff.designationSalary")}</h4>
          {isEditing ? (
            <form onSubmit={saveProfile} className="flex flex-col gap-2">
              <input
                placeholder={t("staff.designationPlaceholder")}
                value={designationInput}
                onChange={(e) => setDesignationInput(e.target.value)}
                className={inputClass}
              />
              <div className="flex items-end gap-2">
                <div className="flex-1">
                  <label className="mb-1 block text-sm text-ink-muted">{t("staff.monthlySalary")}</label>
                  <input
                    type="number"
                    value={salaryInput}
                    onChange={(e) => setSalaryInput(e.target.value)}
                    placeholder={t("staff.salaryExample")}
                    className={inputClass}
                  />
                </div>
                <Button type="submit" size="sm" disabled={saving}>
                  {t("common.save")}
                </Button>
              </div>

              <div className="mt-2 border-t border-border pt-3">
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-muted">{t("people.photo")}</p>
                <PhotoCaptureInput value={null} onChange={handlePhotoChange} />
                {uploadingPhoto && <p className="mt-1 text-sm text-ink-muted">{t("common.saving")}</p>}
              </div>
              <div className="border-t border-border pt-3">
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-muted">{t("people.identityProof")}</p>
                <label className="flex h-11 cursor-pointer items-center justify-center gap-2 rounded-xl border border-dashed border-border text-sm text-ink-muted hover:border-series-1/40 hover:text-series-1">
                  <input type="file" accept="image/*,.pdf" className="hidden" onChange={(e) => handleIdentityProofChange(e.target.files?.[0] ?? null)} />
                  {staff.identityProofPath ? t("people.replaceIdentityProof") : t("people.uploadIdentityProofHint")}
                </label>
              </div>
            </form>
          ) : (
            <div className="grid grid-cols-2 gap-3">
              <ProfileViewField
                label={t("staff.monthlySalary")}
                value={staff.monthlySalary ? `₹${formatINR(staff.monthlySalary)}/mo` : undefined}
              />
              <ProfileViewField
                label={t("people.identityProof")}
                value={
                  staff.identityProofPath ? (
                    <button
                      type="button"
                      onClick={async () => {
                        const blob = await api.people.fetchIdentityProofBlob(staffId);
                        if (blob) window.open(URL.createObjectURL(blob), "_blank");
                      }}
                      className="text-series-1 hover:underline"
                    >
                      {t("common.view")}
                    </button>
                  ) : undefined
                }
              />
            </div>
          )}
        </Card>

        <Card className="lg:col-span-2">
          <h4 className="mb-3 text-xs font-semibold uppercase tracking-wide text-ink-muted">{t("staff.financialLedger")}</h4>
          <div className="grid grid-cols-3 gap-2 text-center">
            <div>
              <p className="text-xl font-semibold tabular-nums text-ink-primary">₹{formatINR(totalEarnings)}</p>
              <p className="text-sm text-ink-muted">{t("staff.totalEarnings")}</p>
            </div>
            <div>
              <p className="text-xl font-semibold tabular-nums text-ink-primary">₹{formatINR(totalAdvancesGiven)}</p>
              <p className="text-sm text-ink-muted">{t("staff.advancesKharchiExpenses")}</p>
            </div>
            <div>
              <p className={`text-xl font-semibold tabular-nums ${balance > 0 ? "text-status-critical" : balance < 0 ? "text-status-warning" : "text-status-good"}`}>
                ₹{formatINR(Math.abs(balance))}
              </p>
              <p className="text-sm text-ink-muted">{balance >= 0 ? t("staff.netDue") : t("staff.advanceOutstanding")}</p>
            </div>
          </div>
          {advancesByCategory.size > 0 && (
            <div className="mt-3 flex flex-wrap gap-1.5 border-t border-border pt-3">
              {Array.from(advancesByCategory.entries()).map(([category, amount]) => (
                <span key={category} className="rounded-full border border-border bg-ink-primary/5 px-2.5 py-1 text-xs text-ink-secondary">
                  {ADVANCE_CATEGORY_KEYS[category] ? t(ADVANCE_CATEGORY_KEYS[category]) : category}: ₹{formatINR(amount)}
                </span>
              ))}
            </div>
          )}
        </Card>

        <Card className="lg:col-span-2">
          <h4 className="mb-3 text-xs font-semibold uppercase tracking-wide text-ink-muted">{t("staff.paymentHistory")}</h4>
          {ledgerEntries.length === 0 ? (
            <p className="py-6 text-center text-sm text-ink-muted">{t("people.noLedgerEntriesYet")}</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[900px] text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-sm text-ink-muted">
                    <th className="pb-2 font-medium">{t("common.transactionDate")}</th>
                    <th className="pb-2 font-medium">{t("common.entryDateTime")}</th>
                    <th className="pb-2 font-medium">{t("people.reason")}</th>
                    <th className="pb-2 font-medium">{t("people.category")}</th>
                    <th className="pb-2 font-medium">{t("people.mode")}</th>
                    <th className="pb-2 font-medium text-right">{t("common.amount")}</th>
                    <th className="pb-2 font-medium text-right">{t("staff.paidSoFar")}</th>
                    <th className="pb-2 font-medium text-right">{t("staff.remainingDue")}</th>
                    <th className="pb-2 font-medium" />
                  </tr>
                </thead>
                <tbody>
                  {ledgerEntries.map((entry) => {
                    const running = runningTotalsById.get(entry._id)!;
                    return (
                      <tr key={entry._id} className="border-b border-border/60 last:border-0">
                        <td className="py-3 text-ink-secondary">{new Date(entry.date).toLocaleDateString("en-IN")}</td>
                        <td className="py-3 text-xs text-ink-muted">{formatDateTime(entry.createdAt)}</td>
                        <td className="py-3 text-ink-primary">{entry.reason}</td>
                        <td className="py-3 text-ink-secondary">{entry.category ?? "—"}</td>
                        <td className="py-3 text-ink-secondary">
                          {entry.paymentMode === "CASH_AND_ONLINE"
                            ? `${t("payment.cashAmount")} ₹${formatINR(entry.cashAmount ?? 0)} + ${t("payment.onlineAmount")} ₹${formatINR(entry.onlineAmount ?? 0)}`
                            : entry.paymentMode ?? "—"}
                        </td>
                        <td className={`py-3 text-right tabular-nums font-medium ${entry.direction === "DUE" ? "text-status-critical" : "text-status-good"}`}>
                          {entry.direction === "DUE" ? "+" : "-"}₹{formatINR(entry.amount)}
                        </td>
                        <td className="py-3 text-right tabular-nums text-status-good">₹{formatINR(running.paidSoFar)}</td>
                        <td className="py-3 pr-2 text-right tabular-nums text-status-critical">₹{formatINR(running.remainingDue)}</td>
                        <td className="py-3 pl-3 text-right">
                          <div className="flex items-center justify-end gap-2.5">
                            <button
                              type="button"
                              onClick={() => printEntry(entry)}
                              className="text-ink-muted hover:text-ink-primary"
                              aria-label={t("common.print")}
                            >
                              <Printer className="h-3.5 w-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => setEditingLedgerEntry(entry)}
                              className="text-ink-muted hover:text-ink-primary"
                              aria-label={t("people.editLedgerEntry")}
                            >
                              <Pencil className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </div>

      {isWageEligible(staff) && (
        <div className="mt-4 grid gap-4 lg:grid-cols-2">
          <AttendanceCalendar personId={staffId} />
          <SalarySlipHistory personId={staffId} ledgerEntries={ledgerEntries} />
        </div>
      )}

      {staff.type === "DRIVER" && (
        <div className="mt-4">
          <DriverDieselHistory personId={staffId} />
        </div>
      )}

      {ledgerOpen && <LedgerModal person={staff} onClose={() => setLedgerOpen(false)} />}
      {editingLedgerEntry && (
        <EditLedgerEntryModal
          entry={editingLedgerEntry}
          onClose={() => {
            setEditingLedgerEntry(null);
            refresh();
          }}
        />
      )}
    </div>
  );
}
