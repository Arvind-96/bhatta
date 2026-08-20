import { FormEvent, useEffect, useState } from "react";
import { ArrowLeft, Pencil, Plus, Trash2, X } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { DateInput } from "@/components/ui/date-input";
import { api } from "@/lib/api";
import { useKilnEvent } from "@/hooks/useKilnEvent";
import { LedgerQuickActions } from "@/components/people/LedgerQuickActions";
import { LedgerCategoryHistorySections } from "@/components/people/LedgerCategoryHistorySections";
import { AddLabourModal } from "@/components/people/AddLabourModal";
import { LabourSessionSection } from "@/components/people/LabourSessionSection";
import { AddWorkEntryModal } from "@/components/people/AddWorkEntryModal";
import { EditWorkEntryModal } from "@/components/people/EditWorkEntryModal";
import { PersonAvatar } from "@/components/people/PersonAvatar";
import { PhotoCaptureInput } from "@/components/people/PhotoCaptureInput";
import { ProfileViewField } from "@/components/people/ProfileViewField";
import type { LedgerEntry, PayType, Person, WorkEntry, WorkType } from "@/types";
import { formatINR } from "@/lib/utils";
import { useTranslation } from "@/hooks/useTranslation";
import { useWorkTypeLabels } from "@/components/people/personTypes";

const inputClass =
  "h-10 rounded-xl border border-border bg-ink-primary/5 px-3 text-sm text-ink-primary outline-none focus:ring-2 focus:ring-series-1";

interface ThekedarDetailPageProps {
  thekedarId: string;
  onBack: () => void;
  onOpenLabour: (labourId: string) => void;
}

// The general Thekedar profile (People page) — profile, pay type/rate, the
// full list of labour linked to them (Person.contractorId), and their
// financial ledger. Separate from the module-specific contractor pages
// under Molding/Bharai/Nikasi, which show production entries for that
// workflow; this is the general directory record.
export function ThekedarDetailPage({ thekedarId, onBack, onOpenLabour }: ThekedarDetailPageProps) {
  const { t } = useTranslation();
  const workTypeLabels = useWorkTypeLabels();
  const [thekedar, setThekedar] = useState<Person | null>(null);
  const [balance, setBalance] = useState(0);
  const [ledgerEntries, setLedgerEntries] = useState<LedgerEntry[]>([]);
  const [labourers, setLabourers] = useState<Person[]>([]);
  const [payType, setPayType] = useState<"" | PayType>("");
  const [monthlySalary, setMonthlySalary] = useState("");
  const [commissionPerThousand, setCommissionPerThousand] = useState("");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [address, setAddress] = useState("");
  const [idNumber, setIdNumber] = useState("");
  const [workType, setWorkType] = useState<"" | WorkType>("");
  const [nickname, setNickname] = useState("");
  const [joiningDate, setJoiningDate] = useState("");
  const [isEditing, setIsEditing] = useState(false);
  const [savingProfile, setSavingProfile] = useState(false);
  const [savingPay, setSavingPay] = useState(false);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [showAddLabour, setShowAddLabour] = useState(false);
  const [workEntries, setWorkEntries] = useState<WorkEntry[]>([]);
  const [showAddWork, setShowAddWork] = useState(false);
  const [editingEntry, setEditingEntry] = useState<WorkEntry | null>(null);

  async function refresh() {
    const [detail, ledger, allWorkers, allHelpers, allWorkEntries] = await Promise.all([
      api.people.get(thekedarId),
      api.people.listLedger(thekedarId),
      api.people.list("WORKER"),
      api.people.list("HELPER"),
      api.workEntries.list({}),
    ]);
    setThekedar(detail.person);
    setBalance(detail.balance);
    setLedgerEntries(ledger);
    const labourUnderThekedar = [...allWorkers, ...allHelpers].filter((p) => p.contractorId === thekedarId);
    setLabourers(labourUnderThekedar);
    const labourerIds = new Set(labourUnderThekedar.map((p) => p._id));
    setWorkEntries(
      allWorkEntries.filter((e) => {
        const pid = typeof e.personId === "string" ? e.personId : e.personId._id;
        return labourerIds.has(pid);
      })
    );
    setPayType(detail.person.payType ?? "");
    setMonthlySalary(detail.person.monthlySalary ? String(detail.person.monthlySalary) : "");
    setCommissionPerThousand(detail.person.commissionPerThousand ? String(detail.person.commissionPerThousand) : "");
    setName(detail.person.name);
    setPhone(detail.person.phone ?? "");
    setAddress(detail.person.address ?? "");
    setIdNumber(detail.person.idNumber ?? "");
    setWorkType(detail.person.workType ?? "");
    setNickname(detail.person.nickname ?? "");
    setJoiningDate(detail.person.joiningDate ? detail.person.joiningDate.slice(0, 10) : "");
  }

  useEffect(() => {
    refresh().catch(console.error);
  }, [thekedarId]);

  useKilnEvent("ledger:update", () => refresh());
  useKilnEvent("person:update", () => refresh());
  useKilnEvent("workEntry:update", () => refresh());

  async function saveProfile(e: FormEvent) {
    e.preventDefault();
    setSavingProfile(true);
    try {
      await api.people.update(thekedarId, {
        name: name.trim(),
        phone: phone || undefined,
        address: address || undefined,
        idNumber: idNumber || undefined,
        workType: workType || undefined,
        nickname: nickname.trim() || undefined,
        joiningDate: joiningDate || undefined,
      });
      await refresh();
    } finally {
      setSavingProfile(false);
    }
  }

  function cancelEditing() {
    if (thekedar) {
      setName(thekedar.name);
      setPhone(thekedar.phone ?? "");
      setAddress(thekedar.address ?? "");
      setIdNumber(thekedar.idNumber ?? "");
      setWorkType(thekedar.workType ?? "");
      setNickname(thekedar.nickname ?? "");
      setJoiningDate(thekedar.joiningDate ? thekedar.joiningDate.slice(0, 10) : "");
      setPayType(thekedar.payType ?? "");
      setMonthlySalary(thekedar.monthlySalary ? String(thekedar.monthlySalary) : "");
      setCommissionPerThousand(thekedar.commissionPerThousand ? String(thekedar.commissionPerThousand) : "");
    }
    setIsEditing(false);
  }

  async function handlePhotoChange(file: File | Blob | null) {
    if (!file) return;
    setUploadingPhoto(true);
    try {
      await api.people.uploadPhoto(thekedarId, file);
      await refresh();
    } finally {
      setUploadingPhoto(false);
    }
  }

  async function handleIdentityProofChange(file: File | null) {
    if (!file) return;
    setUploadingPhoto(true);
    try {
      await api.people.uploadIdentityProof(thekedarId, file);
      await refresh();
    } finally {
      setUploadingPhoto(false);
    }
  }

  async function savePay(e: FormEvent) {
    e.preventDefault();
    setSavingPay(true);
    try {
      await api.people.update(thekedarId, {
        payType: payType || undefined,
        monthlySalary: monthlySalary ? Number(monthlySalary) : undefined,
        commissionPerThousand: commissionPerThousand ? Number(commissionPerThousand) : undefined,
      });
      await refresh();
    } finally {
      setSavingPay(false);
    }
  }

  async function toggleAbsconded() {
    if (!thekedar) return;
    await api.people.update(thekedarId, { status: thekedar.status === "ABSCONDED" ? "ACTIVE" : "ABSCONDED" });
    await refresh();
  }

  // Soft delete — active:false drops them from every people list app-wide
  // (see person.service.ts's listPeople), but their ledger/production
  // history is kept intact. Their labour keeps its contractorId link (the
  // Person document isn't removed), it just won't show "under X" on
  // lists that resolve the name from the active-only contractor list.
  async function deleteProfile() {
    if (!thekedar) return;
    const warning =
      labourers.length > 0
        ? t("people.labourStillAssignedWarning", {
            count: labourers.length,
            verb: labourers.length === 1 ? "is" : "are",
          })
        : "";
    if (!confirm(t("people.confirmDeleteThekedarProfile", { name: thekedar.name, warning }))) return;
    await api.people.update(thekedarId, { active: false });
    onBack();
  }

  const backButton = (
    <button onClick={onBack} className="mb-3 flex items-center gap-1.5 text-sm text-ink-secondary hover:text-ink-primary">
      <ArrowLeft className="h-4 w-4" /> {t("people.backToPeople")}
    </button>
  );

  if (!thekedar) {
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
    .filter((e) => e.direction === "DUE" && (e.category === "WAGE" || e.category === "SALARY" || e.category === "COMMISSION" || !e.category))
    .reduce((sum, e) => sum + e.amount, 0);

  const advancesByCategory = new Map<string, number>();
  for (const e of ledgerEntries) {
    if (e.direction !== "PAID") continue;
    const key = e.category ?? "OTHER";
    advancesByCategory.set(key, (advancesByCategory.get(key) ?? 0) + e.amount);
  }
  const totalAdvancesGiven = Array.from(advancesByCategory.values()).reduce((sum, v) => sum + v, 0);

  const workTotalsByType = new Map<string, number>();
  for (const e of workEntries) {
    workTotalsByType.set(e.workType, (workTotalsByType.get(e.workType) ?? 0) + e.quantity);
  }
  const labourNameById = new Map(labourers.map((l) => [l._id, l.name]));

  function personName(e: WorkEntry) {
    if (typeof e.personId === "string") return labourNameById.get(e.personId) ?? "—";
    return e.personId.name;
  }

  return (
    <div>
      {backButton}

      <Card className="mb-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex items-start gap-3">
            <PersonAvatar personId={thekedarId} hasPhoto={!!thekedar.photoPath} name={thekedar.name} />
            <div>
              <h3 className="text-lg font-semibold text-ink-primary">
                {thekedar.name}
                {thekedar.nickname && <span className="ml-1.5 font-normal text-ink-muted">"{thekedar.nickname}"</span>}
              </h3>
              <p className="text-sm text-ink-muted">
                {t("people.thekedarLabel")}
                {thekedar.workType ? ` · ${workTypeLabels[thekedar.workType]}` : ""}
                {t("people.countLabour", { count: labourers.length })}
              </p>
              {thekedar.joiningDate && (
                <p className="mt-0.5 text-sm text-ink-muted">
                  {t("people.joiningDate")}: {new Date(thekedar.joiningDate).toLocaleDateString("en-IN")}
                </p>
              )}
            </div>
          </div>
          <div className="flex flex-col items-end gap-2">
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
                onClick={toggleAbsconded}
                className="rounded-lg border border-border bg-ink-primary/5 px-3 py-1.5 text-xs font-medium text-ink-secondary hover:bg-ink-primary/10"
              >
                {thekedar.status === "ABSCONDED" ? t("people.markActive") : t("people.markAbsconded")}
              </button>
              <button
                onClick={deleteProfile}
                className="flex items-center gap-1 rounded-lg border border-status-critical/30 bg-status-critical/5 px-3 py-1.5 text-xs font-medium text-status-critical hover:bg-status-critical/10"
              >
                <Trash2 className="h-3.5 w-3.5" /> {t("common.delete")}
              </button>
            </div>
            <LedgerQuickActions person={thekedar} onSaved={refresh} />
          </div>
        </div>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <div className="mb-2 flex items-center justify-between">
            <h4 className="text-xs font-semibold uppercase tracking-wide text-ink-muted">{t("people.profile")}</h4>
            {isEditing && (
              <button onClick={cancelEditing} className="flex items-center gap-1 text-xs font-medium text-ink-muted hover:text-ink-primary">
                <X className="h-3.5 w-3.5" /> {t("common.cancel")}
              </button>
            )}
          </div>
          {isEditing ? (
            <form onSubmit={saveProfile} className="flex flex-col gap-2">
              <input required placeholder={t("common.name")} value={name} onChange={(e) => setName(e.target.value)} className={inputClass} />
              <input placeholder={t("people.nickname")} value={nickname} onChange={(e) => setNickname(e.target.value)} className={inputClass} />
              <input placeholder={t("common.phone")} value={phone} onChange={(e) => setPhone(e.target.value)} className={inputClass} />
              <input placeholder={t("people.address")} value={address} onChange={(e) => setAddress(e.target.value)} className={inputClass} />
              <input
                placeholder={t("people.aadharIdNumber")}
                value={idNumber}
                onChange={(e) => setIdNumber(e.target.value)}
                className={inputClass}
              />
              <label className="flex flex-col gap-1">
                <span className="text-xs text-ink-muted">{t("people.joiningDate")}</span>
                <DateInput value={joiningDate} onChange={(e) => setJoiningDate(e.target.value)} className={inputClass} />
              </label>
              <select value={workType} onChange={(e) => setWorkType(e.target.value as "" | WorkType)} className={inputClass}>
                <option value="">{t("people.thekedarWorkTypeNotSet")}</option>
                {(Object.entries(workTypeLabels) as [WorkType, string][]).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
              <Button type="submit" size="sm" disabled={savingProfile}>
                {t("people.saveProfile")}
              </Button>
            </form>
          ) : (
            <div className="grid grid-cols-2 gap-3">
              <ProfileViewField label={t("common.phone")} value={thekedar.phone} />
              <ProfileViewField label={t("people.aadharIdNumber")} value={thekedar.idNumber} />
              <ProfileViewField label={t("people.address")} value={thekedar.address} />
              <ProfileViewField label={t("people.contractorWorkTypeLabel")} value={thekedar.workType ? workTypeLabels[thekedar.workType] : undefined} />
            </div>
          )}
        </Card>

        <Card>
          <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-muted">{t("people.payTypeAndRate")}</h4>
          {isEditing ? (
            <form onSubmit={savePay} className="flex flex-col gap-2">
              <select value={payType} onChange={(e) => setPayType(e.target.value as "" | PayType)} className={inputClass}>
                <option value="">{t("people.payTypeNotSet")}</option>
                <option value="MONTHLY">{t("people.monthlySalaryOption")}</option>
                <option value="PER_THOUSAND">{t("people.perThousandBricksCommission")}</option>
              </select>
              {payType === "PER_THOUSAND" ? (
                <input
                  type="number"
                  placeholder={t("people.commissionPerThousandPlaceholder")}
                  value={commissionPerThousand}
                  onChange={(e) => setCommissionPerThousand(e.target.value)}
                  className={inputClass}
                />
              ) : (
                <input
                  type="number"
                  placeholder={t("people.monthlySalaryPlaceholder")}
                  value={monthlySalary}
                  onChange={(e) => setMonthlySalary(e.target.value)}
                  className={inputClass}
                />
              )}
              <Button type="submit" size="sm" disabled={savingPay}>
                {t("people.savePayType")}
              </Button>

              <div className="mt-2 border-t border-border pt-3">
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-muted">{t("people.photo")}</p>
                <PhotoCaptureInput value={null} onChange={handlePhotoChange} />
                {uploadingPhoto && <p className="mt-1 text-sm text-ink-muted">{t("common.saving")}</p>}
              </div>
              <div className="border-t border-border pt-3">
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-muted">{t("people.identityProof")}</p>
                <label className="flex h-11 cursor-pointer items-center justify-center gap-2 rounded-xl border border-dashed border-border text-sm text-ink-muted hover:border-series-1/40 hover:text-series-1">
                  <input type="file" accept="image/*,.pdf" className="hidden" onChange={(e) => handleIdentityProofChange(e.target.files?.[0] ?? null)} />
                  {thekedar.identityProofPath ? t("people.replaceIdentityProof") : t("people.uploadIdentityProofHint")}
                </label>
              </div>
            </form>
          ) : (
            <div className="grid grid-cols-2 gap-3">
              <ProfileViewField
                label={t("people.payTypeAndRate")}
                value={
                  thekedar.payType === "MONTHLY"
                    ? t("people.ratePerMonth", { amount: formatINR(thekedar.monthlySalary ?? 0) })
                    : thekedar.payType === "PER_THOUSAND"
                    ? t("people.ratePerThousandBricks", { amount: formatINR(thekedar.commissionPerThousand ?? 0) })
                    : undefined
                }
              />
              <ProfileViewField
                label={t("people.identityProof")}
                value={
                  thekedar.identityProofPath ? (
                    <button
                      type="button"
                      onClick={async () => {
                        const blob = await api.people.fetchIdentityProofBlob(thekedarId);
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
          <h4 className="mb-3 text-xs font-semibold uppercase tracking-wide text-ink-muted">{t("people.financialLedger")}</h4>
          <div className="grid grid-cols-3 gap-2 text-center">
            <div>
              <p className="text-xl font-semibold tabular-nums text-ink-primary">₹{formatINR(totalEarnings)}</p>
              <p className="text-sm text-ink-muted">{t("people.totalEarnings")}</p>
            </div>
            <div>
              <p className="text-xl font-semibold tabular-nums text-ink-primary">₹{formatINR(totalAdvancesGiven)}</p>
              <p className="text-sm text-ink-muted">{t("people.advancesKharchiExpenses")}</p>
            </div>
            <div>
              <p className={`text-xl font-semibold tabular-nums ${balance > 0 ? "text-status-critical" : balance < 0 ? "text-status-warning" : "text-status-good"}`}>
                ₹{formatINR(Math.abs(balance))}
              </p>
              <p className="text-sm text-ink-muted">{balance >= 0 ? t("people.netDue") : t("people.advanceOutstanding")}</p>
            </div>
          </div>
        </Card>

        <Card className="lg:col-span-2">
          <div className="mb-3 flex items-center justify-between">
            <h4 className="text-xs font-semibold uppercase tracking-wide text-ink-muted">{t("people.labourUnderThekedar", { count: labourers.length })}</h4>
            <Button size="sm" onClick={() => setShowAddLabour(true)}>
              <Plus className="h-4 w-4" /> {t("people.addLabour")}
            </Button>
          </div>
          {labourers.length === 0 ? (
            <p className="py-6 text-center text-sm text-ink-muted">{t("people.noLabourAssignedYet")}</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px] text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-sm text-ink-muted">
                    <th className="pb-2 font-medium">{t("common.name")}</th>
                    <th className="pb-2 font-medium">{t("common.type")}</th>
                    <th className="pb-2 font-medium">{t("common.phone")}</th>
                    <th className="pb-2 font-medium">{t("people.pay")}</th>
                    <th className="pb-2 font-medium">{t("common.status")}</th>
                  </tr>
                </thead>
                <tbody>
                  {labourers.map((l) => (
                    <tr
                      key={l._id}
                      onClick={() => onOpenLabour(l._id)}
                      className="cursor-pointer border-b border-border/60 last:border-0 hover:bg-ink-primary/5"
                    >
                      <td className="py-3 text-ink-primary hover:underline">{l.name}</td>
                      <td className="py-3 text-ink-secondary">{l.type === "WORKER" ? t("people.worker") : t("people.helper")}</td>
                      <td className="py-3 text-ink-secondary">{l.phone ?? "—"}</td>
                      <td className="py-3 text-ink-secondary">
                        {l.payType === "PER_THOUSAND"
                          ? l.ratePerThousand
                            ? `₹${l.ratePerThousand}/1000`
                            : "—"
                          : l.monthlySalary
                          ? `₹${formatINR(l.monthlySalary)}/mo`
                          : "—"}
                      </td>
                      <td className="py-3">
                        <span className={l.status === "ABSCONDED" ? "text-status-critical" : "text-status-good"}>
                          {l.status === "ABSCONDED" ? t("people.absconded") : t("common.active")}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>

        <Card className="lg:col-span-2">
          <div className="mb-3 flex items-center justify-between">
            <h4 className="text-xs font-semibold uppercase tracking-wide text-ink-muted">{t("people.workSummaryAutoSynced")}</h4>
            <Button size="sm" onClick={() => setShowAddWork(true)} disabled={labourers.length === 0}>
              <Plus className="h-4 w-4" /> {t("people.addWorkEntry")}
            </Button>
          </div>

          {workTotalsByType.size > 0 && (
            <div className="mb-3 flex flex-wrap gap-1.5">
              {Array.from(workTotalsByType.entries()).map(([workType, qty]) => (
                <span key={workType} className="rounded-full border border-border bg-ink-primary/5 px-2.5 py-1 text-xs text-ink-secondary">
                  {workTypeLabels[workType as keyof typeof workTypeLabels]}: {qty.toLocaleString("en-IN")}
                </span>
              ))}
            </div>
          )}

          {workEntries.length === 0 ? (
            <p className="py-6 text-center text-sm text-ink-muted">{t("people.noWorkEntriesForThekedarYet")}</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px] text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-sm text-ink-muted">
                    <th className="pb-2 font-medium">{t("common.date")}</th>
                    <th className="pb-2 font-medium">{t("people.labourer")}</th>
                    <th className="pb-2 font-medium">{t("people.workType")}</th>
                    <th className="pb-2 font-medium">{t("common.quantity")}</th>
                    <th className="pb-2 font-medium">{t("common.rate")}</th>
                    <th className="pb-2 font-medium">{t("people.wage")}</th>
                    <th className="pb-2 font-medium" />
                  </tr>
                </thead>
                <tbody>
                  {workEntries
                    .slice()
                    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
                    .map((e) => (
                      <tr key={e._id} className="border-b border-border/60 last:border-0 hover:bg-ink-primary/5">
                        <td className="py-3 text-ink-secondary">{new Date(e.date).toLocaleDateString("en-IN")}</td>
                        <td className="py-3 text-ink-primary">{personName(e)}</td>
                        <td className="py-3 text-ink-secondary">{workTypeLabels[e.workType]}</td>
                        <td className="py-3 text-ink-secondary">{e.quantity.toLocaleString("en-IN")}</td>
                        <td className="py-3 text-ink-secondary">₹{e.ratePerThousand}/1000</td>
                        <td className="py-3 text-ink-secondary">
                          ₹{((e.quantity / 1000) * e.ratePerThousand).toLocaleString("en-IN", { maximumFractionDigits: 2 })}
                        </td>
                        <td className="py-3 text-right">
                          <button onClick={() => setEditingEntry(e)} className="text-xs text-series-1 hover:underline">
                            {t("common.edit")}
                          </button>
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>

        {thekedar.workType === "PATHAI" && <LabourSessionSection contractorId={thekedarId} editable />}

        <LedgerCategoryHistorySections entries={ledgerEntries} />
      </div>

      {showAddLabour && (
        <AddLabourModal defaultContractorId={thekedarId} onClose={() => setShowAddLabour(false)} onCreated={refresh} />
      )}
      {showAddWork && (
        <AddWorkEntryModal labourers={labourers} onClose={() => setShowAddWork(false)} onCreated={refresh} />
      )}
      {editingEntry && (
        <EditWorkEntryModal entry={editingEntry} onClose={() => setEditingEntry(null)} onSaved={refresh} />
      )}
    </div>
  );
}
