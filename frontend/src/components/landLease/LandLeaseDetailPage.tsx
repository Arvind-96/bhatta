import { FormEvent, useEffect, useState } from "react";
import { ArrowLeft, Pencil, Plus, Printer, Trash2, X } from "lucide-react";
import { EditLedgerEntryModal } from "@/components/people/EditLedgerEntryModal";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { DateInput } from "@/components/ui/date-input";
import { api } from "@/lib/api";
import { useKilnEvent } from "@/hooks/useKilnEvent";
import { useAuthStore } from "@/store/auth.store";
import { LedgerModal } from "@/components/people/LedgerModal";
import { AddLandLeaseContractModal } from "./AddLandLeaseContractModal";
import { EditLandLeaseContractModal } from "./EditLandLeaseContractModal";
import { landLeaseRateBasisLabel, landLeaseContractStatusLabel } from "./landLeaseHelpers";
import { PersonAvatar } from "@/components/people/PersonAvatar";
import { PhotoCaptureInput } from "@/components/people/PhotoCaptureInput";
import { ProfileViewField } from "@/components/people/ProfileViewField";
import { useTranslation } from "@/hooks/useTranslation";
import type { DepthUnit, Land, LandLeaseContract, LedgerEntry, Person } from "@/types";
import { cn, formatDateTime, formatINR } from "@/lib/utils";
import { printLandLeaseContract } from "@/lib/printDocument";

const inputClass =
  "h-10 rounded-xl border border-border bg-ink-primary/5 px-3 text-sm text-ink-primary outline-none focus:ring-2 focus:ring-series-1";

interface LandLeaseDetailPageProps {
  landLeaseId: string;
  onBack: () => void;
}

interface LandDraft {
  _id?: string;
  khasraNumber: string;
  area: string;
}

// The Land Lease (Patta) profile — an exact clone of LandownerDetailPage's
// layout (profile, land holdings, rent-contract tracking, ledger) minus
// the Soil Arrivals section, which has no equivalent here: this land is
// leased for raw-brick molding, not soil excavation.
export function LandLeaseDetailPage({ landLeaseId, onBack }: LandLeaseDetailPageProps) {
  const { t } = useTranslation();
  const [landLease, setLandLease] = useState<Person | null>(null);
  const [balance, setBalance] = useState(0);
  const [ledgerEntries, setLedgerEntries] = useState<LedgerEntry[]>([]);
  const [contracts, setContracts] = useState<LandLeaseContract[]>([]);
  const [lands, setLands] = useState<Land[]>([]);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [address, setAddress] = useState("");
  const [idNumber, setIdNumber] = useState("");
  const [khetArea, setKhetArea] = useState("");
  const [khetAreaUnit, setKhetAreaUnit] = useState("bigha");
  const [khetLocation, setKhetLocation] = useState("");
  const [agreedDepthFeet, setAgreedDepthFeet] = useState("");
  const [agreedDepthUnit, setAgreedDepthUnit] = useState<DepthUnit>("feet");
  const [landDrafts, setLandDrafts] = useState<LandDraft[]>([]);
  const [nickname, setNickname] = useState("");
  const [joiningDate, setJoiningDate] = useState("");
  const [isEditing, setIsEditing] = useState(false);
  const [savingProfile, setSavingProfile] = useState(false);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [ledgerOpen, setLedgerOpen] = useState(false);
  const [showAddContract, setShowAddContract] = useState(false);
  const [editingContract, setEditingContract] = useState<LandLeaseContract | null>(null);
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
    const [detail, ledger, contractsData, landsData] = await Promise.all([
      api.people.get(landLeaseId),
      api.people.listLedger(landLeaseId),
      api.landLeaseContracts.list({ landLeaseId }),
      api.lands.list(landLeaseId),
    ]);
    setLandLease(detail.person);
    setBalance(detail.balance);
    setLedgerEntries(ledger);
    setContracts(contractsData);
    setLands(landsData);
    setLandDrafts(landsData.map((l) => ({ _id: l._id, khasraNumber: l.khasraNumber ?? "", area: l.area != null ? String(l.area) : "" })));
    setName(detail.person.name);
    setPhone(detail.person.phone ?? "");
    setAddress(detail.person.address ?? "");
    setIdNumber(detail.person.idNumber ?? "");
    setKhetArea(detail.person.khetArea ? String(detail.person.khetArea) : "");
    setKhetAreaUnit(detail.person.khetAreaUnit ?? "bigha");
    setKhetLocation(detail.person.khetLocation ?? "");
    setAgreedDepthFeet(detail.person.agreedDepthFeet ? String(detail.person.agreedDepthFeet) : "");
    setAgreedDepthUnit((detail.person.agreedDepthUnit as DepthUnit) ?? "feet");
    setNickname(detail.person.nickname ?? "");
    setJoiningDate(detail.person.joiningDate ? detail.person.joiningDate.slice(0, 10) : "");
  }

  useEffect(() => {
    refresh().catch(console.error);
  }, [landLeaseId]);

  useKilnEvent("ledger:update", () => refresh());
  useKilnEvent("person:update", () => refresh());
  useKilnEvent("landLeaseContract:update", () => refresh());

  async function saveProfile(e: FormEvent) {
    e.preventDefault();
    setSavingProfile(true);
    try {
      await api.people.update(landLeaseId, {
        name: name.trim(),
        phone: phone || undefined,
        address: address || undefined,
        idNumber: idNumber || undefined,
        khetArea: khetArea ? Number(khetArea) : undefined,
        khetAreaUnit: khetAreaUnit || undefined,
        khetLocation: khetLocation || undefined,
        agreedDepthFeet: agreedDepthFeet ? Number(agreedDepthFeet) : undefined,
        agreedDepthUnit: agreedDepthFeet ? agreedDepthUnit : undefined,
        nickname: nickname.trim() || undefined,
        joiningDate: joiningDate || undefined,
      });
      await Promise.all(
        landDrafts.map((draft) =>
          draft._id
            ? api.lands.update(draft._id, {
                khasraNumber: draft.khasraNumber || undefined,
                area: draft.area ? Number(draft.area) : undefined,
              })
            : draft.khasraNumber || draft.area
            ? api.lands.create({
                landownerId: landLeaseId,
                name: `${t("people.fieldLabel")} ${landDrafts.indexOf(draft) + 1}`,
                khasraNumber: draft.khasraNumber || undefined,
                area: draft.area ? Number(draft.area) : undefined,
                areaUnit: "bigha",
              })
            : Promise.resolve()
        )
      );
      await refresh();
      setIsEditing(false);
    } finally {
      setSavingProfile(false);
    }
  }

  function updateLandDraft(index: number, patch: Partial<LandDraft>) {
    setLandDrafts((rows) => rows.map((row, i) => (i === index ? { ...row, ...patch } : row)));
  }

  function addLandDraft() {
    setLandDrafts((rows) => [...rows, { khasraNumber: "", area: "" }]);
  }

  function cancelEditing() {
    if (landLease) {
      setName(landLease.name);
      setPhone(landLease.phone ?? "");
      setAddress(landLease.address ?? "");
      setIdNumber(landLease.idNumber ?? "");
      setKhetArea(landLease.khetArea ? String(landLease.khetArea) : "");
      setKhetAreaUnit(landLease.khetAreaUnit ?? "bigha");
      setKhetLocation(landLease.khetLocation ?? "");
      setAgreedDepthFeet(landLease.agreedDepthFeet ? String(landLease.agreedDepthFeet) : "");
      setAgreedDepthUnit((landLease.agreedDepthUnit as DepthUnit) ?? "feet");
      setNickname(landLease.nickname ?? "");
      setJoiningDate(landLease.joiningDate ? landLease.joiningDate.slice(0, 10) : "");
    }
    setLandDrafts(lands.map((l) => ({ _id: l._id, khasraNumber: l.khasraNumber ?? "", area: l.area != null ? String(l.area) : "" })));
    setIsEditing(false);
  }

  async function handlePhotoChange(file: File | Blob | null) {
    if (!file) return;
    setUploadingPhoto(true);
    try {
      await api.people.uploadPhoto(landLeaseId, file);
      await refresh();
    } finally {
      setUploadingPhoto(false);
    }
  }

  async function handleIdentityProofChange(file: File | null) {
    if (!file) return;
    setUploadingPhoto(true);
    try {
      await api.people.uploadIdentityProof(landLeaseId, file);
      await refresh();
    } finally {
      setUploadingPhoto(false);
    }
  }

  async function deleteProfile() {
    if (!landLease) return;
    if (!confirm(t("people.confirmDeleteLandownerProfile", { name: landLease.name }))) return;
    await api.people.update(landLeaseId, { active: false });
    onBack();
  }

  async function deleteContract(contract: LandLeaseContract) {
    if (!confirm(t("people.confirmDeleteContract", { contractNumber: contract.contractNumber }))) return;
    await api.landLeaseContracts.remove(contract._id);
    await refresh();
  }

  function printContract(contract: LandLeaseContract) {
    if (!landLease) return;
    const contractEntries = ledgerEntries.filter((e) => e.contractId === contract._id);
    printLandLeaseContract(contract, landLease.name, kilnInfo, contractEntries);
  }

  const backButton = (
    <button onClick={onBack} className="mb-3 flex items-center gap-1.5 text-sm text-ink-secondary hover:text-ink-primary">
      <ArrowLeft className="h-4 w-4" /> {t("people.backToPeople")}
    </button>
  );

  if (!landLease) {
    return (
      <div>
        {backButton}
        <Card>
          <p className="py-8 text-center text-sm text-ink-muted">{t("common.loading")}</p>
        </Card>
      </div>
    );
  }

  // A Land Lease person's area is entered on the contract itself
  // (contractedAreaBigha, same field the Contracts list's own "Land
  // holdings" stat tile sums) — the per-Khasra Lands entries and the
  // person-level khetArea field are essentially never populated for this
  // person type in practice, so those are kept only as fallbacks for a
  // profile with neither a contract's area nor Lands entries recorded.
  const contractsTotalArea = contracts.reduce((sum, c) => sum + (c.contractedAreaBigha ?? 0), 0);
  const landsTotalArea = lands.reduce((sum, l) => sum + (l.area ?? 0), 0);
  const fieldAreaDisplay =
    contractsTotalArea > 0
      ? `${contractsTotalArea} ${t("people.unitBigha")}`
      : landsTotalArea > 0
      ? `${landsTotalArea} ${landLease.khetAreaUnit ?? "bigha"}`
      : landLease.khetArea
      ? `${landLease.khetArea} ${landLease.khetAreaUnit ?? "bigha"}`
      : undefined;

  const totalContractPayment = contracts.reduce((sum, c) => sum + c.totalContractValue, 0);
  const totalPaidSoFar = ledgerEntries.filter((e) => e.direction === "PAID").reduce((sum, e) => sum + e.amount, 0);
  const contractBalance = totalContractPayment - totalPaidSoFar;

  const runningTotalsById = new Map<string, { paidSoFar: number; remainingDue: number }>();
  {
    const contractDue = contracts
      .filter((c) => c.rateType === "PER_TROLLEY")
      .map((c) => ({ date: c.startDate ?? c.createdAt, amount: c.totalContractValue }));
    let paid = 0;
    let due = 0;
    const dayStart = (d: string) => new Date(new Date(d).toDateString()).getTime();
    const timeline = [
      ...ledgerEntries.map((e) => ({ date: e.date, type: "entry" as const, entry: e })),
      ...contractDue.map((c) => ({ date: c.date, type: "contract" as const, amount: c.amount })),
    ].sort((a, b) => {
      const dayDiff = dayStart(a.date) - dayStart(b.date);
      if (dayDiff !== 0) return dayDiff;
      if (a.type === b.type) return 0;
      return a.type === "contract" ? -1 : 1;
    });
    for (const item of timeline) {
      if (item.type === "contract") {
        due += item.amount;
        continue;
      }
      const entry = item.entry;
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
            <PersonAvatar personId={landLeaseId} hasPhoto={!!landLease.photoPath} name={landLease.name} />
            <div>
              <h3 className="text-lg font-semibold text-ink-primary">
                {landLease.name}
                {landLease.nickname && <span className="ml-1.5 font-normal text-ink-muted">"{landLease.nickname}"</span>}
              </h3>
              <p className="text-sm text-ink-muted">
                {landLease.landLeaseSerial ? `${t("people.landLease")} - ${landLease.landLeaseSerial}` : t("people.landLease")}
                {khetLocation ? ` · ${khetLocation}` : ""}
              </p>
              {landLease.joiningDate && (
                <p className="mt-0.5 text-sm text-ink-muted">
                  {t("people.joiningDate")}: {new Date(landLease.joiningDate).toLocaleDateString("en-IN")}
                </p>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2">
            {!isEditing && (
              <Button variant="outline" size="sm" onClick={() => setIsEditing(true)}>
                <Pencil className="h-3.5 w-3.5" /> {t("common.edit")}
              </Button>
            )}
            <button
              onClick={deleteProfile}
              className="flex items-center gap-1 rounded-lg border border-status-critical/30 bg-status-critical/5 px-3 py-1.5 text-xs font-medium text-status-critical transition-all hover:-translate-y-0.5 hover:bg-status-critical/10 hover:shadow-[0_6px_16px_-6px_rgba(239,74,99,0.45)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-status-critical focus-visible:ring-offset-2 focus-visible:ring-offset-surface"
            >
              <Trash2 className="h-3.5 w-3.5" /> {t("common.delete")}
            </button>
            <Button size="sm" onClick={() => setLedgerOpen(true)}>
              {t("people.advance")}
            </Button>
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
              <input placeholder={t("people.mobileNumber")} value={phone} onChange={(e) => setPhone(e.target.value)} className={inputClass} />
              <input placeholder={t("people.address")} value={address} onChange={(e) => setAddress(e.target.value)} className={inputClass} />
              <input placeholder={t("people.aadharIdNumber")} value={idNumber} onChange={(e) => setIdNumber(e.target.value)} className={inputClass} />
              <input placeholder={t("people.khetLocation")} value={khetLocation} onChange={(e) => setKhetLocation(e.target.value)} className={inputClass} />
              {landDrafts.length > 0 ? (
                <div className="flex flex-col gap-2 rounded-xl border border-border p-2.5">
                  <p className="text-xs font-semibold uppercase tracking-wide text-ink-muted">{t("people.landHoldings")}</p>
                  {landDrafts.map((draft, i) => (
                    <div key={draft._id ?? `new-${i}`} className="grid grid-cols-[3.5rem_1fr_8rem] items-center gap-2">
                      <span className="text-xs text-ink-muted">
                        {t("people.fieldLabel")} {i + 1}
                      </span>
                      <input placeholder={t("people.khasraNumber")} value={draft.khasraNumber} onChange={(e) => updateLandDraft(i, { khasraNumber: e.target.value })} className={inputClass} />
                      <input type="number" placeholder={t("people.fieldAreaBigha")} value={draft.area} onChange={(e) => updateLandDraft(i, { area: e.target.value })} className={inputClass} />
                    </div>
                  ))}
                  <button type="button" onClick={addLandDraft} className="flex w-fit items-center gap-1 text-xs font-medium text-series-1 hover:underline">
                    <Plus className="h-3.5 w-3.5" /> {t("people.addAnotherField")}
                  </button>
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-2">
                  <input type="number" min={0} placeholder={t("people.khetArea")} value={khetArea} onChange={(e) => setKhetArea(e.target.value)} className={inputClass} />
                  <input placeholder={t("people.unitBigha")} value={khetAreaUnit} onChange={(e) => setKhetAreaUnit(e.target.value)} className={inputClass} />
                </div>
              )}
              <div className="flex gap-2">
                <input type="number" min={0} placeholder={t("people.agreedDigDepth")} value={agreedDepthFeet} onChange={(e) => setAgreedDepthFeet(e.target.value)} className={cn(inputClass, "flex-1")} />
                <select value={agreedDepthUnit} onChange={(e) => setAgreedDepthUnit(e.target.value as DepthUnit)} className={cn(inputClass, "w-24")}>
                  <option value="feet">{t("soil.unitFeet")}</option>
                  <option value="meter">{t("soil.unitMeter")}</option>
                </select>
              </div>
              <label className="flex flex-col gap-1">
                <span className="text-xs text-ink-muted">{t("people.joiningDate")}</span>
                <DateInput value={joiningDate} onChange={(e) => setJoiningDate(e.target.value)} className={inputClass} />
              </label>
              <Button type="submit" size="sm" disabled={savingProfile}>
                {t("people.saveProfile")}
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
                  {landLease.identityProofPath ? t("people.replaceIdentityProof") : t("people.uploadIdentityProofHint")}
                </label>
              </div>
            </form>
          ) : (
            <div className="grid grid-cols-2 gap-3">
              <ProfileViewField label={t("people.mobileNumber")} value={landLease.phone} />
              <ProfileViewField label={t("people.aadharIdNumber")} value={landLease.idNumber} />
              <ProfileViewField label={t("people.address")} value={landLease.address} />
              <ProfileViewField label={t("people.khetArea")} value={fieldAreaDisplay} />
              <ProfileViewField
                label={t("people.agreedDigDepth")}
                value={landLease.agreedDepthFeet ? `${landLease.agreedDepthFeet} ${landLease.agreedDepthUnit === "meter" ? t("soil.unitMeter") : t("soil.unitFeet")}` : undefined}
              />
              <ProfileViewField
                label={t("people.identityProof")}
                value={
                  landLease.identityProofPath ? (
                    <button
                      type="button"
                      onClick={async () => {
                        const blob = await api.people.fetchIdentityProofBlob(landLeaseId);
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

        <Card>
          <h4 className="mb-3 text-xs font-semibold uppercase tracking-wide text-ink-muted">{t("people.paymentHistory")}</h4>
          <div className="text-center">
            <p className={`text-xl font-semibold tabular-nums ${balance > 0 ? "text-status-critical" : balance < 0 ? "text-status-warning" : "text-status-good"}`}>
              ₹{formatINR(Math.abs(balance))}
            </p>
            <p className="text-sm text-ink-muted">{balance >= 0 ? t("people.netDueLedger") : t("people.advanceOutstanding")}</p>
          </div>
        </Card>

        <Card className="lg:col-span-2">
          <div className="mb-3 flex items-center justify-between">
            <h4 className="text-xs font-semibold uppercase tracking-wide text-ink-muted">{t("people.contractPaymentSummary")}</h4>
            <Button size="sm" onClick={() => setShowAddContract(true)} disabled={lands.length === 0} title={lands.length === 0 ? t("people.addLandFirstHint") : undefined}>
              <Plus className="h-4 w-4" /> {t("landLease.newContract")}
            </Button>
          </div>
          <div className="grid grid-cols-3 gap-2 text-center">
            <div>
              <p className="text-xl font-semibold tabular-nums text-ink-primary">₹{formatINR(totalContractPayment)}</p>
              <p className="text-sm text-ink-muted">{t("people.totalContractPayment")}</p>
            </div>
            <div>
              <p className="text-xl font-semibold tabular-nums text-status-good">₹{formatINR(totalPaidSoFar)}</p>
              <p className="text-sm text-ink-muted">{t("people.paidSoFar")}</p>
            </div>
            <div>
              <p className={`text-xl font-semibold tabular-nums ${contractBalance > 0 ? "text-status-critical" : contractBalance < 0 ? "text-status-warning" : "text-status-good"}`}>
                ₹{formatINR(Math.abs(contractBalance))}
              </p>
              <p className="text-sm text-ink-muted">{contractBalance >= 0 ? t("people.remainingDue") : t("people.advanceOutstanding")}</p>
            </div>
          </div>
          {contracts.length > 0 && (
            <div className="mt-3 flex flex-col gap-2 border-t border-border pt-3">
              {contracts.map((c) => (
                <div key={c._id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border bg-ink-primary/5 px-3 py-2">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-ink-primary">{c.contractNumber}</p>
                    <p className="truncate text-xs text-ink-muted">
                      {landLeaseRateBasisLabel(c, t)} · {landLeaseContractStatusLabel(c.status, t)} · ₹{formatINR(c.totalContractValue)}
                    </p>
                    <p className="truncate text-xs text-ink-muted/70">
                      {c.startDate && `${t("common.transactionDate")}: ${new Date(c.startDate).toLocaleDateString("en-IN")} · `}
                      {t("common.entryDateTime")}: {formatDateTime(c.createdAt)}
                    </p>
                  </div>
                  <div className="flex shrink-0 gap-3">
                    <button onClick={() => printContract(c)} className="flex items-center gap-1 text-xs font-medium text-series-1 hover:underline">
                      <Printer className="h-3.5 w-3.5" /> {t("common.print")}
                    </button>
                    <button onClick={() => setEditingContract(c)} className="flex items-center gap-1 text-xs font-medium text-series-1 hover:underline">
                      <Pencil className="h-3.5 w-3.5" /> {t("common.edit")}
                    </button>
                    <button onClick={() => deleteContract(c)} className="flex items-center gap-1 text-xs font-medium text-status-critical hover:underline">
                      <Trash2 className="h-3.5 w-3.5" /> {t("common.delete")}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>

        <Card className="lg:col-span-2">
          <h4 className="mb-3 text-xs font-semibold uppercase tracking-wide text-ink-muted">{t("people.paymentHistory")}</h4>
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
                    <th className="pb-2 font-medium text-right">{t("people.paidSoFar")}</th>
                    <th className="pb-2 font-medium text-right">{t("people.remainingDue")}</th>
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
                          <button type="button" onClick={() => setEditingLedgerEntry(entry)} className="text-ink-muted hover:text-ink-primary" aria-label={t("people.editLedgerEntry")}>
                            <Pencil className="h-3.5 w-3.5" />
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
      </div>

      {ledgerOpen && <LedgerModal person={landLease} onClose={() => setLedgerOpen(false)} />}
      {showAddContract && (
        <AddLandLeaseContractModal landLeaseId={landLeaseId} lands={lands} onClose={() => setShowAddContract(false)} onCreated={refresh} />
      )}
      {editingContract && <EditLandLeaseContractModal contract={editingContract} onClose={() => setEditingContract(null)} onSaved={refresh} />}
      {editingLedgerEntry && <EditLedgerEntryModal entry={editingLedgerEntry} onClose={() => setEditingLedgerEntry(null)} />}
    </div>
  );
}
