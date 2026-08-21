import { FormEvent, useEffect, useState } from "react";
import { ArrowLeft, Pencil, Plus, Trash2, X } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { DateInput } from "@/components/ui/date-input";
import { api } from "@/lib/api";
import { cn, formatINR } from "@/lib/utils";
import { useKilnEvent } from "@/hooks/useKilnEvent";
import { useTranslation } from "@/hooks/useTranslation";
import { LedgerQuickActions } from "@/components/people/LedgerQuickActions";
import { LedgerCategoryHistorySections } from "@/components/people/LedgerCategoryHistorySections";
import { AddWorkEntryModal } from "@/components/people/AddWorkEntryModal";
import { EditWorkEntryModal } from "@/components/people/EditWorkEntryModal";
import { AttendanceCalendar } from "@/components/staff/AttendanceCalendar";
import { PersonAvatar } from "@/components/people/PersonAvatar";
import { PhotoCaptureInput } from "@/components/people/PhotoCaptureInput";
import { ProfileViewField } from "@/components/people/ProfileViewField";
import { useFamilyRelationLabels, usePersonTypeMeta, useWorkTypeLabels } from "@/components/people/personTypes";
import type {
  FamilyForPerson,
  FamilyRelation,
  InventoryItem,
  LedgerEntry,
  PayType,
  Person,
  Sex,
  SuppliedItem,
  WorkEntry,
  WorkType,
} from "@/types";

const inputClass =
  "h-10 rounded-xl border border-border bg-ink-primary/5 px-3 text-sm text-ink-primary outline-none focus:ring-2 focus:ring-series-1";

interface LabourDetailPageProps {
  labourId: string;
  onBack: () => void;
  onOpenThekedar: (thekedarId: string) => void;
  onOpenLabour?: (labourId: string) => void;
}

// The general Labour profile (People page) — separate from the
// module-specific worker pages under Molding/Bharai/Nikasi, this is the
// one-stop directory record: personal details, which thekedar they belong
// to (editable), pay type/rate, and their overall financial ledger.
export function LabourDetailPage({ labourId, onBack, onOpenThekedar, onOpenLabour }: LabourDetailPageProps) {
  const { t } = useTranslation();
  const workTypeLabels = useWorkTypeLabels();
  const familyRelationLabels = useFamilyRelationLabels();
  const personTypeMeta = usePersonTypeMeta();
  const [labour, setLabour] = useState<Person | null>(null);
  const [balance, setBalance] = useState(0);
  const [ledgerEntries, setLedgerEntries] = useState<LedgerEntry[]>([]);
  const [thekedars, setThekedars] = useState<Person[]>([]);
  const [contractorId, setContractorId] = useState("");
  const [payType, setPayType] = useState<"" | PayType>("");
  const [monthlySalary, setMonthlySalary] = useState("");
  const [ratePerThousand, setRatePerThousand] = useState("");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [address, setAddress] = useState("");
  const [idNumber, setIdNumber] = useState("");
  const [age, setAge] = useState("");
  const [sex, setSex] = useState<"" | Sex>("");
  const [workType, setWorkType] = useState<"" | WorkType>("");
  const [nickname, setNickname] = useState("");
  const [joiningDate, setJoiningDate] = useState("");
  const [isEditing, setIsEditing] = useState(false);
  const [savingProfile, setSavingProfile] = useState(false);
  const [savingPay, setSavingPay] = useState(false);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [workEntries, setWorkEntries] = useState<WorkEntry[]>([]);
  const [showAddWork, setShowAddWork] = useState(false);
  const [editingEntry, setEditingEntry] = useState<WorkEntry | null>(null);
  const [family, setFamily] = useState<FamilyForPerson | null>(null);
  const [showAddFamily, setShowAddFamily] = useState(false);
  const [familyForm, setFamilyForm] = useState({
    name: "",
    relation: "SPOUSE" as FamilyRelation,
    age: "",
    sex: "" as "" | Sex,
    isWorking: false,
  });
  const [savingFamily, setSavingFamily] = useState(false);
  const [inventoryItems, setInventoryItems] = useState<InventoryItem[]>([]);
  const [suppliedItems, setSuppliedItems] = useState<SuppliedItem[]>([]);
  const [showAddSupply, setShowAddSupply] = useState(false);
  const [supplyForm, setSupplyForm] = useState({ itemId: "", quantity: "" });
  const [savingSupply, setSavingSupply] = useState(false);

  async function refresh() {
    const [detail, ledger, contractors, work, familyData, inventory, supplied] = await Promise.all([
      api.people.get(labourId),
      api.people.listLedger(labourId),
      api.people.list("LABOUR_CONTRACTOR"),
      api.workEntries.list({ personId: labourId }),
      api.familyMembers.forPerson(labourId),
      api.inventory.list(),
      api.suppliedItems.list(labourId),
    ]);
    setLabour(detail.person);
    setBalance(detail.balance);
    setLedgerEntries(ledger);
    setThekedars(contractors);
    setWorkEntries(work);
    setFamily(familyData);
    setInventoryItems(inventory);
    setSuppliedItems(supplied);
    setContractorId(detail.person.contractorId ?? "");
    setPayType(detail.person.payType ?? "");
    setMonthlySalary(detail.person.monthlySalary ? String(detail.person.monthlySalary) : "");
    setRatePerThousand(detail.person.ratePerThousand ? String(detail.person.ratePerThousand) : "");
    setName(detail.person.name);
    setPhone(detail.person.phone ?? "");
    setAddress(detail.person.address ?? "");
    setIdNumber(detail.person.idNumber ?? "");
    setAge(detail.person.age ? String(detail.person.age) : "");
    setSex(detail.person.sex ?? "");
    setWorkType(detail.person.workType ?? "");
    setNickname(detail.person.nickname ?? "");
    setJoiningDate(detail.person.joiningDate ? detail.person.joiningDate.slice(0, 10) : "");
  }

  useEffect(() => {
    refresh().catch(console.error);
  }, [labourId]);

  useKilnEvent("ledger:update", () => refresh());
  useKilnEvent("person:update", () => refresh());
  useKilnEvent("workEntry:update", () => refresh());
  useKilnEvent("familyMember:update", () => refresh());
  useKilnEvent("inventory:update", () => refresh());
  useKilnEvent("suppliedItem:update", () => refresh());

  async function addFamilyMember(e: FormEvent) {
    e.preventDefault();
    if (!familyForm.name.trim()) return;
    setSavingFamily(true);
    try {
      await api.familyMembers.create({
        headPersonId: family?.head?._id ?? labourId,
        name: familyForm.name.trim(),
        relation: familyForm.relation,
        age: familyForm.age ? Number(familyForm.age) : undefined,
        sex: familyForm.sex || undefined,
        isWorking: familyForm.isWorking,
      });
      setFamilyForm({ name: "", relation: "SPOUSE", age: "", sex: "", isWorking: false });
      setShowAddFamily(false);
      await refresh();
    } finally {
      setSavingFamily(false);
    }
  }

  async function addSuppliedItem(e: FormEvent) {
    e.preventDefault();
    if (!supplyForm.itemId || !supplyForm.quantity) return;
    setSavingSupply(true);
    try {
      await api.suppliedItems.create({
        personId: labourId,
        itemId: supplyForm.itemId,
        quantity: Number(supplyForm.quantity),
      });
      setSupplyForm({ itemId: "", quantity: "" });
      setShowAddSupply(false);
      await refresh();
    } finally {
      setSavingSupply(false);
    }
  }

  async function removeSuppliedItem(id: string) {
    await api.suppliedItems.remove(id);
    await refresh();
  }

  async function removeFamilyMember(member: FamilyForPerson["members"][number]) {
    if (!confirm(t("people.confirmRemoveFamilyMember", { name: member.name })))
      return;
    await api.familyMembers.remove(member._id);
    await refresh();
  }

  async function saveProfile(e: FormEvent) {
    e.preventDefault();
    setSavingProfile(true);
    try {
      await api.people.update(labourId, {
        name: name.trim(),
        phone: phone || undefined,
        address: address || undefined,
        idNumber: idNumber || undefined,
        age: age ? Number(age) : undefined,
        sex: sex || undefined,
        workType: workType || undefined,
        contractorId: contractorId || undefined,
        nickname: nickname.trim() || undefined,
        joiningDate: joiningDate || undefined,
      });
      await refresh();
    } finally {
      setSavingProfile(false);
    }
  }

  function cancelEditing() {
    if (labour) {
      setName(labour.name);
      setPhone(labour.phone ?? "");
      setAddress(labour.address ?? "");
      setIdNumber(labour.idNumber ?? "");
      setAge(labour.age ? String(labour.age) : "");
      setSex(labour.sex ?? "");
      setWorkType(labour.workType ?? "");
      setContractorId(labour.contractorId ?? "");
      setNickname(labour.nickname ?? "");
      setJoiningDate(labour.joiningDate ? labour.joiningDate.slice(0, 10) : "");
      setPayType(labour.payType ?? "");
      setMonthlySalary(labour.monthlySalary ? String(labour.monthlySalary) : "");
      setRatePerThousand(labour.ratePerThousand ? String(labour.ratePerThousand) : "");
    }
    setIsEditing(false);
  }

  async function handlePhotoChange(file: File | Blob | null) {
    if (!file) return;
    setUploadingPhoto(true);
    try {
      await api.people.uploadPhoto(labourId, file);
      await refresh();
    } finally {
      setUploadingPhoto(false);
    }
  }

  async function handleIdentityProofChange(file: File | null) {
    if (!file) return;
    setUploadingPhoto(true);
    try {
      await api.people.uploadIdentityProof(labourId, file);
      await refresh();
    } finally {
      setUploadingPhoto(false);
    }
  }

  async function savePay(e: FormEvent) {
    e.preventDefault();
    setSavingPay(true);
    try {
      await api.people.update(labourId, {
        payType: payType || undefined,
        monthlySalary: monthlySalary ? Number(monthlySalary) : undefined,
        ratePerThousand: ratePerThousand ? Number(ratePerThousand) : undefined,
      });
      await refresh();
    } finally {
      setSavingPay(false);
    }
  }

  async function toggleAbsconded() {
    if (!labour) return;
    await api.people.update(labourId, { status: labour.status === "ABSCONDED" ? "ACTIVE" : "ABSCONDED" });
    await refresh();
  }

  // Soft delete — active:false immediately drops them from every people
  // list app-wide (see person.service.ts's listPeople), but their existing
  // work entries and ledger history stay intact and still show their name
  // wherever those records are already referenced, so past wages/production
  // are never lost or orphaned.
  async function deleteProfile() {
    if (!labour) return;
    if (!confirm(t("people.confirmDeleteLabourProfile", { name: labour.name }))) return;
    await api.people.update(labourId, { active: false });
    onBack();
  }

  const backButton = (
    <button onClick={onBack} className="mb-3 flex items-center gap-1.5 text-sm text-ink-secondary hover:text-ink-primary">
      <ArrowLeft className="h-4 w-4" /> {t("people.backToPeople")}
    </button>
  );

  if (!labour) {
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
    .filter((e) => e.direction === "DUE" && (e.category === "WAGE" || e.category === "SALARY" || !e.category))
    .reduce((sum, e) => sum + e.amount, 0);

  const advancesByCategory = new Map<string, number>();
  for (const e of ledgerEntries) {
    if (e.direction !== "PAID") continue;
    const key = e.category ?? "OTHER";
    advancesByCategory.set(key, (advancesByCategory.get(key) ?? 0) + e.amount);
  }
  const totalAdvancesGiven = Array.from(advancesByCategory.values()).reduce((sum, v) => sum + v, 0);
  const thekedar = thekedars.find((t) => t._id === labour.contractorId);

  return (
    <div>
      {backButton}

      <Card className="mb-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex items-start gap-3">
            <PersonAvatar personId={labourId} hasPhoto={!!labour.photoPath} name={labour.name} />
            <div>
              <h3 className="text-lg font-semibold text-ink-primary">
                {labour.name}
                {labour.nickname && <span className="ml-1.5 font-normal text-ink-muted">"{labour.nickname}"</span>}
              </h3>
              <p className="text-sm text-ink-muted">
                {t("people.labourType", { type: personTypeMeta[labour.type].label })}
                {labour.workType ? ` · ${workTypeLabels[labour.workType]}` : ""}
                {thekedar ? (
                  <>
                    {t("people.underThekedar")}
                    <button onClick={() => onOpenThekedar(thekedar._id)} className="text-series-1 hover:underline">
                      {thekedar.name}
                    </button>
                  </>
                ) : (
                  t("people.noThekedarAssigned")
                )}
              </p>
              {labour.joiningDate && (
                <p className="mt-0.5 text-sm text-ink-muted">
                  {t("people.joiningDate")}: {new Date(labour.joiningDate).toLocaleDateString("en-IN")}
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
                {labour.status === "ABSCONDED" ? t("people.markActive") : t("people.markAbsconded")}
              </button>
              <button
                onClick={deleteProfile}
                className="flex items-center gap-1 rounded-lg border border-status-critical/30 bg-status-critical/5 px-3 py-1.5 text-xs font-medium text-status-critical hover:bg-status-critical/10"
              >
                <Trash2 className="h-3.5 w-3.5" /> {t("common.delete")}
              </button>
            </div>
            <LedgerQuickActions person={labour} onSaved={refresh} />
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
              <div className="grid grid-cols-2 gap-2">
                <input type="number" min={0} placeholder={t("people.age")} value={age} onChange={(e) => setAge(e.target.value)} className={inputClass} />
                <select value={sex} onChange={(e) => setSex(e.target.value as "" | Sex)} className={inputClass}>
                  <option value="">{t("people.sex")}</option>
                  <option value="MALE">{t("people.male")}</option>
                  <option value="FEMALE">{t("people.female")}</option>
                  <option value="OTHER">{t("people.other")}</option>
                </select>
              </div>
              <input placeholder={t("people.mobileNumber")} value={phone} onChange={(e) => setPhone(e.target.value)} className={inputClass} />
              <input placeholder={t("people.address")} value={address} onChange={(e) => setAddress(e.target.value)} className={inputClass} />
              <input
                placeholder={t("people.aadharCardNumber")}
                value={idNumber}
                onChange={(e) => setIdNumber(e.target.value)}
                className={inputClass}
              />
              <label className="flex flex-col gap-1">
                <span className="text-xs text-ink-muted">{t("people.joiningDate")}</span>
                <DateInput value={joiningDate} onChange={(e) => setJoiningDate(e.target.value)} className={inputClass} />
              </label>
              <select value={workType} onChange={(e) => setWorkType(e.target.value as "" | WorkType)} className={inputClass}>
                <option value="">{t("people.workTypeNotSet")}</option>
                {(Object.entries(workTypeLabels) as [WorkType, string][]).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
              <select value={contractorId} onChange={(e) => setContractorId(e.target.value)} className={inputClass}>
                <option value="">{t("people.noThekedarIndependent")}</option>
                {thekedars.map((t) => (
                  <option key={t._id} value={t._id}>
                    {t.name}
                  </option>
                ))}
              </select>
              <Button type="submit" size="sm" disabled={savingProfile}>
                {t("people.saveProfile")}
              </Button>
            </form>
          ) : (
            <div className="grid grid-cols-2 gap-3">
              <ProfileViewField label={t("people.age")} value={labour.age} />
              <ProfileViewField label={t("people.sex")} value={labour.sex} />
              <ProfileViewField label={t("people.mobileNumber")} value={labour.phone} />
              <ProfileViewField label={t("people.aadharCardNumber")} value={labour.idNumber} />
              <ProfileViewField label={t("people.address")} value={labour.address} />
              <ProfileViewField label={t("people.workTypeFieldLabel")} value={labour.workType ? workTypeLabels[labour.workType] : undefined} />
            </div>
          )}
        </Card>

        <Card>
          <div className="mb-2 flex items-center justify-between">
            <h4 className="text-xs font-semibold uppercase tracking-wide text-ink-muted">{t("people.payTypeAndRate")}</h4>
          </div>
          {isEditing ? (
            <form onSubmit={savePay} className="flex flex-col gap-2">
              <select value={payType} onChange={(e) => setPayType(e.target.value as "" | PayType)} className={inputClass}>
                <option value="">{t("people.payTypeNotSet")}</option>
                <option value="MONTHLY">{t("people.monthlySalaryOption")}</option>
                <option value="PER_THOUSAND">{t("people.perThousandBricks")}</option>
              </select>
              {payType === "PER_THOUSAND" ? (
                <input
                  type="number"
                  placeholder={t("people.ratePerThousandPlaceholder")}
                  value={ratePerThousand}
                  onChange={(e) => setRatePerThousand(e.target.value)}
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
              <p className="text-sm text-ink-muted">{t("people.payTypeNote")}</p>

              <div className="mt-2 border-t border-border pt-3">
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-muted">{t("people.photo")}</p>
                <PhotoCaptureInput value={null} onChange={handlePhotoChange} />
                {uploadingPhoto && <p className="mt-1 text-sm text-ink-muted">{t("common.saving")}</p>}
              </div>
              <div className="border-t border-border pt-3">
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-muted">{t("people.identityProof")}</p>
                <label className="flex h-11 cursor-pointer items-center justify-center gap-2 rounded-xl border border-dashed border-border text-sm text-ink-muted hover:border-series-1/40 hover:text-series-1">
                  <input type="file" accept="image/*,.pdf" className="hidden" onChange={(e) => handleIdentityProofChange(e.target.files?.[0] ?? null)} />
                  {labour.identityProofPath ? t("people.replaceIdentityProof") : t("people.uploadIdentityProofHint")}
                </label>
              </div>
            </form>
          ) : (
            <div className="flex flex-col gap-3">
              <div className="grid grid-cols-2 gap-3">
                <ProfileViewField
                  label={t("people.payTypeAndRate")}
                  value={
                    labour.payType === "MONTHLY"
                      ? t("people.ratePerMonth", { amount: formatINR(labour.monthlySalary ?? 0) })
                      : labour.payType === "PER_THOUSAND"
                      ? t("people.ratePerThousandBricks", { amount: formatINR(labour.ratePerThousand ?? 0) })
                      : undefined
                  }
                />
                <ProfileViewField
                  label={t("people.identityProof")}
                  value={
                    labour.identityProofPath ? (
                      <button
                        type="button"
                        onClick={async () => {
                          const blob = await api.people.fetchIdentityProofBlob(labourId);
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
              <p className="text-sm text-ink-muted">{t("people.payTypeNote")}</p>
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

        <div className="lg:col-span-2">
          <AttendanceCalendar personId={labourId} />
        </div>

        <Card className="lg:col-span-2">
          <div className="mb-3 flex items-center justify-between">
            <h4 className="text-xs font-semibold uppercase tracking-wide text-ink-muted">{t("people.workHistory")}</h4>
            <Button size="sm" onClick={() => setShowAddWork(true)}>
              <Plus className="h-4 w-4" /> {t("people.addWorkEntry")}
            </Button>
          </div>

          {workEntries.length === 0 ? (
            <p className="py-6 text-center text-sm text-ink-muted">{t("people.noWorkEntriesYet")}</p>
          ) : (
            <>
              <div className="mb-3 flex flex-wrap gap-1.5">
                {Object.entries(
                  workEntries.reduce<Record<string, number>>((acc, e) => {
                    acc[e.workType] = (acc[e.workType] ?? 0) + e.quantity;
                    return acc;
                  }, {})
                ).map(([wt, total]) => (
                  <span key={wt} className="rounded-full border border-border bg-ink-primary/5 px-2.5 py-1 text-xs text-ink-secondary">
                    {workTypeLabels[wt as WorkType]}: {total.toLocaleString("en-IN")}
                  </span>
                ))}
              </div>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[640px] text-sm">
                  <thead>
                    <tr className="border-b border-border text-left text-sm text-ink-muted">
                      <th className="pb-2 font-medium">{t("common.date")}</th>
                      <th className="pb-2 font-medium">{t("people.workType")}</th>
                      <th className="pb-2 font-medium">{t("common.quantity")}</th>
                      <th className="pb-2 font-medium">{t("people.ratePer1000")}</th>
                      <th className="pb-2 font-medium">{t("people.wage")}</th>
                      <th className="pb-2 font-medium text-right"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {workEntries.map((entry) => (
                      <tr key={entry._id} className="border-b border-border/60 last:border-0">
                        <td className="py-3 text-ink-secondary">{new Date(entry.date).toLocaleDateString("en-IN")}</td>
                        <td className="py-3 text-ink-primary">{workTypeLabels[entry.workType]}</td>
                        <td className="py-3 tabular-nums text-ink-secondary">{entry.quantity.toLocaleString("en-IN")}</td>
                        <td className="py-3 tabular-nums text-ink-secondary">₹{entry.ratePerThousand}</td>
                        <td className="py-3 tabular-nums text-ink-primary">
                          ₹{((entry.quantity / 1000) * entry.ratePerThousand).toLocaleString("en-IN", { maximumFractionDigits: 2 })}
                        </td>
                        <td className="py-3 text-right">
                          <button onClick={() => setEditingEntry(entry)} className="text-xs font-medium text-series-1 hover:underline">
                            {t("common.edit")}
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </Card>

        <LedgerCategoryHistorySections entries={ledgerEntries} />

        <Card className="lg:col-span-2">
          <div className="mb-3 flex items-center justify-between">
            <h4 className="text-xs font-semibold uppercase tracking-wide text-ink-muted">{t("people.family")}</h4>
            <Button size="sm" onClick={() => setShowAddFamily((s) => !s)}>
              <Plus className="h-4 w-4" /> {t("people.addFamilyMember")}
            </Button>
          </div>

          {family?.head && family.head._id !== labourId && (
            <p className="mb-3 text-sm text-ink-muted">
              {t("people.partOfFamilyPrefix")}{" "}
              <button onClick={() => onOpenLabour?.(family.head!._id)} className="text-series-1 hover:underline">
                {family.head.name}
              </button>
              {t("people.partOfFamilySuffix")}
            </p>
          )}

          {showAddFamily && (
            <form onSubmit={addFamilyMember} className="mb-4 grid grid-cols-2 gap-2 border-b border-border pb-4">
              <input
                required
                placeholder={t("common.name")}
                value={familyForm.name}
                onChange={(e) => setFamilyForm((f) => ({ ...f, name: e.target.value }))}
                className={inputClass}
              />
              <select
                value={familyForm.relation}
                onChange={(e) => setFamilyForm((f) => ({ ...f, relation: e.target.value as FamilyRelation }))}
                className={inputClass}
              >
                {(Object.entries(familyRelationLabels) as [FamilyRelation, string][]).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
              <input
                type="number"
                min={0}
                placeholder={t("people.age")}
                value={familyForm.age}
                onChange={(e) => setFamilyForm((f) => ({ ...f, age: e.target.value }))}
                className={inputClass}
              />
              <select
                value={familyForm.sex}
                onChange={(e) => setFamilyForm((f) => ({ ...f, sex: e.target.value as "" | Sex }))}
                className={inputClass}
              >
                <option value="">{t("people.sex")}</option>
                <option value="MALE">{t("people.male")}</option>
                <option value="FEMALE">{t("people.female")}</option>
                <option value="OTHER">{t("people.other")}</option>
              </select>
              <label className="col-span-2 flex items-center gap-2 text-sm text-ink-secondary">
                <input
                  type="checkbox"
                  checked={familyForm.isWorking}
                  onChange={(e) => setFamilyForm((f) => ({ ...f, isWorking: e.target.checked }))}
                />
                {t("people.alsoWorksAsLabour")}
              </label>
              <Button type="submit" disabled={savingFamily} className="col-span-2">
                {t("people.saveFamilyMember")}
              </Button>
            </form>
          )}

          {!family || family.members.length === 0 ? (
            <p className="py-6 text-center text-sm text-ink-muted">{t("people.noFamilyMembersYet")}</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px] text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-sm text-ink-muted">
                    <th className="pb-2 font-medium">{t("common.name")}</th>
                    <th className="pb-2 font-medium">{t("people.relation")}</th>
                    <th className="pb-2 font-medium">{t("people.age")}</th>
                    <th className="pb-2 font-medium">{t("people.sex")}</th>
                    <th className="pb-2 font-medium">{t("common.status")}</th>
                    <th className="pb-2 font-medium text-right"></th>
                  </tr>
                </thead>
                <tbody>
                  {family.members.map((m) => {
                    const workerId = typeof m.workerId === "object" ? m.workerId?._id : m.workerId;
                    return (
                      <tr key={m._id} className="border-b border-border/60 last:border-0">
                        <td className="py-3 text-ink-primary">
                          {workerId ? (
                            <button onClick={() => onOpenLabour?.(workerId)} className="hover:underline">
                              {m.name}
                            </button>
                          ) : (
                            m.name
                          )}
                        </td>
                        <td className="py-3 text-ink-secondary">{familyRelationLabels[m.relation]}</td>
                        <td className="py-3 tabular-nums text-ink-secondary">{m.age ?? "—"}</td>
                        <td className="py-3 text-ink-secondary">{m.sex ?? "—"}</td>
                        <td className="py-3">
                          {m.isWorking ? (
                            <Badge variant="good">{t("people.working")}</Badge>
                          ) : (
                            <span className="text-sm text-ink-muted">{t("people.notWorking")}</span>
                          )}
                        </td>
                        <td className="py-3 text-right">
                          <button
                            onClick={() => removeFamilyMember(m)}
                            className="text-xs font-medium text-status-critical hover:underline"
                          >
                            {t("common.remove")}
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </Card>

        <Card className="lg:col-span-2">
          <div className="mb-3 flex items-center justify-between">
            <h4 className="text-xs font-semibold uppercase tracking-wide text-ink-muted">{t("people.itemsSuppliedByKiln")}</h4>
            <Button size="sm" onClick={() => setShowAddSupply((s) => !s)}>
              <Plus className="h-4 w-4" /> {t("people.addSuppliedItem")}
            </Button>
          </div>

          {showAddSupply && (
            <form onSubmit={addSuppliedItem} className="mb-4 grid grid-cols-2 gap-2 border-b border-border pb-4">
              <select
                required
                value={supplyForm.itemId}
                onChange={(e) => setSupplyForm((f) => ({ ...f, itemId: e.target.value }))}
                className={cn(inputClass, "col-span-2")}
              >
                <option value="">{t("people.selectItem")}</option>
                {inventoryItems.map((i) => (
                  <option key={i._id} value={i._id}>
                    {i.name} ({t("people.stockQuantity", { quantity: i.quantity, unit: i.unit })})
                  </option>
                ))}
              </select>
              <input
                required
                type="number"
                min={1}
                placeholder={t("common.quantity")}
                value={supplyForm.quantity}
                onChange={(e) => setSupplyForm((f) => ({ ...f, quantity: e.target.value }))}
                className={inputClass}
              />
              <Button type="submit" disabled={savingSupply}>
                {t("common.save")}
              </Button>
            </form>
          )}

          {suppliedItems.length === 0 ? (
            <p className="py-6 text-center text-sm text-ink-muted">{t("people.noItemsSuppliedYet")}</p>
          ) : (
            <div className="space-y-1">
              {suppliedItems.map((s) => (
                <div key={s._id} className="flex items-center justify-between rounded-lg border border-border px-3 py-2 text-sm">
                  <div>
                    <p className="text-ink-primary">{typeof s.itemId === "object" ? s.itemId.name : "—"}</p>
                    <p className="text-sm text-ink-muted">{new Date(s.date).toLocaleDateString("en-IN")}</p>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="tabular-nums font-medium text-ink-primary">
                      {s.quantity.toLocaleString("en-IN")} {typeof s.itemId === "object" ? s.itemId.unit : ""}
                    </span>
                    <button onClick={() => removeSuppliedItem(s._id)} className="text-xs text-status-critical hover:underline">
                      {t("common.remove")}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>

      {showAddWork && <AddWorkEntryModal personId={labourId} onClose={() => setShowAddWork(false)} onCreated={refresh} />}
      {editingEntry && (
        <EditWorkEntryModal entry={editingEntry} onClose={() => setEditingEntry(null)} onSaved={refresh} />
      )}
    </div>
  );
}
