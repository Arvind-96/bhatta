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
import { AddSoilArrivalModal } from "@/components/soil/AddSoilArrivalModal";
import { EditSoilArrivalModal } from "@/components/soil/EditSoilArrivalModal";
import { AddSoilContractModal } from "@/components/soil/AddSoilContractModal";
import { EditSoilContractModal } from "@/components/soil/EditSoilContractModal";
import { rateBasisLabel, contractStatusLabel } from "@/components/soil/ContractDetailPage";
import { PersonAvatar } from "@/components/people/PersonAvatar";
import { PhotoCaptureInput } from "@/components/people/PhotoCaptureInput";
import { ProfileViewField } from "@/components/people/ProfileViewField";
import { useTranslation } from "@/hooks/useTranslation";
import type { DepthUnit, Land, LedgerEntry, Person, SoilArrival, SoilContract } from "@/types";
import { cn, formatDateTime, formatINR } from "@/lib/utils";
import { printLandownerContract } from "@/lib/printDocument";

const inputClass =
  "h-10 rounded-xl border border-border bg-ink-primary/5 px-3 text-sm text-ink-primary outline-none focus:ring-2 focus:ring-series-1";

interface LandownerDetailPageProps {
  landownerId: string;
  onBack: () => void;
}

function driverName(p: SoilArrival["jcbDriverId"]) {
  if (!p) return "";
  return typeof p === "string" ? p : p.name;
}

interface LandDraft {
  _id?: string;
  khasraNumber: string;
  area: string;
}

// The field owner (Khet ka malik) profile — personal details plus the
// full soil-arrival history logged against them, auto-synced from the
// Soil page's arrivals log (or entered directly here), same pattern as
// LabourDetailPage's work history.
export function LandownerDetailPage({ landownerId, onBack }: LandownerDetailPageProps) {
  const { t } = useTranslation();
  const [landowner, setLandowner] = useState<Person | null>(null);
  const [balance, setBalance] = useState(0);
  const [ledgerEntries, setLedgerEntries] = useState<LedgerEntry[]>([]);
  const [drivers, setDrivers] = useState<Person[]>([]);
  const [arrivals, setArrivals] = useState<SoilArrival[]>([]);
  const [contracts, setContracts] = useState<SoilContract[]>([]);
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
  const [showAddArrival, setShowAddArrival] = useState(false);
  const [showAddContract, setShowAddContract] = useState(false);
  const [editingArrival, setEditingArrival] = useState<SoilArrival | null>(null);
  const [editingContract, setEditingContract] = useState<SoilContract | null>(null);
  const [editingLedgerEntry, setEditingLedgerEntry] = useState<LedgerEntry | null>(null);
  // Bug fix (C3): every mutation below used to have no visible error
  // surface at all — a rejection was a silent unhandled promise rejection.
  const [profileError, setProfileError] = useState("");
  const [contractError, setContractError] = useState("");
  const kilns = useAuthStore((s) => s.kilns);
  const activeKilnId = useAuthStore((s) => s.activeKilnId);
  const activeKiln = kilns.find((k) => k.kilnId === activeKilnId);
  const kilnInfo = {
    name: activeKiln?.name ?? "Bhatta Cloud",
    location: activeKiln?.location,
    phone: activeKiln?.phone,
  };

  async function refresh() {
    const [detail, ledger, driversData, arrivalsData, contractsData, landsData] = await Promise.all([
      api.people.get(landownerId),
      api.people.listLedger(landownerId),
      api.people.list("DRIVER"),
      api.soilArrivals.list({ landownerId }),
      api.soilContracts.list({ landownerId }),
      api.lands.list(landownerId),
    ]);
    setLandowner(detail.person);
    setBalance(detail.balance);
    setLedgerEntries(ledger);
    setDrivers(driversData);
    setArrivals(arrivalsData);
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
  }, [landownerId]);

  useKilnEvent("ledger:update", () => refresh());
  useKilnEvent("person:update", () => refresh());
  useKilnEvent("soilArrival:update", () => refresh());
  useKilnEvent("soilContract:update", () => refresh());

  async function saveProfile(e: FormEvent) {
    e.preventDefault();
    setProfileError("");
    setSavingProfile(true);
    try {
      await api.people.update(landownerId, {
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
                landownerId,
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
    } catch (err) {
      setProfileError(err instanceof Error ? err.message : t("common.somethingWentWrong"));
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
    if (landowner) {
      setName(landowner.name);
      setPhone(landowner.phone ?? "");
      setAddress(landowner.address ?? "");
      setIdNumber(landowner.idNumber ?? "");
      setKhetArea(landowner.khetArea ? String(landowner.khetArea) : "");
      setKhetAreaUnit(landowner.khetAreaUnit ?? "bigha");
      setKhetLocation(landowner.khetLocation ?? "");
      setAgreedDepthFeet(landowner.agreedDepthFeet ? String(landowner.agreedDepthFeet) : "");
      setAgreedDepthUnit((landowner.agreedDepthUnit as DepthUnit) ?? "feet");
      setNickname(landowner.nickname ?? "");
      setJoiningDate(landowner.joiningDate ? landowner.joiningDate.slice(0, 10) : "");
    }
    setLandDrafts(lands.map((l) => ({ _id: l._id, khasraNumber: l.khasraNumber ?? "", area: l.area != null ? String(l.area) : "" })));
    setIsEditing(false);
  }

  async function handlePhotoChange(file: File | Blob | null) {
    if (!file) return;
    setProfileError("");
    setUploadingPhoto(true);
    try {
      await api.people.uploadPhoto(landownerId, file);
      await refresh();
    } catch (err) {
      setProfileError(err instanceof Error ? err.message : t("common.somethingWentWrong"));
    } finally {
      setUploadingPhoto(false);
    }
  }

  async function handleIdentityProofChange(file: File | null) {
    if (!file) return;
    setProfileError("");
    setUploadingPhoto(true);
    try {
      await api.people.uploadIdentityProof(landownerId, file);
      await refresh();
    } catch (err) {
      setProfileError(err instanceof Error ? err.message : t("common.somethingWentWrong"));
    } finally {
      setUploadingPhoto(false);
    }
  }

  // Permanent delete — refused by the backend if this landowner has any
  // real history (contracts, lands, arrivals, ledger entries). Use the
  // Absconded toggle instead to just take them off the active list.
  async function deleteProfile() {
    if (!landowner) return;
    if (!confirm(t("people.confirmDeleteLandownerProfile", { name: landowner.name }))) return;
    setProfileError("");
    try {
      await api.people.remove(landownerId);
      onBack();
    } catch (err) {
      setProfileError(err instanceof Error ? err.message : t("common.somethingWentWrong"));
    }
  }

  async function deleteContract(contract: SoilContract) {
    if (!confirm(t("people.confirmDeleteContract", { contractNumber: contract.contractNumber }))) return;
    setContractError("");
    try {
      await api.soilContracts.remove(contract._id);
      await refresh();
    } catch (err) {
      setContractError(err instanceof Error ? err.message : t("common.somethingWentWrong"));
    }
  }

  function printContract(contract: SoilContract) {
    if (!landowner) return;
    // Payment history for a contract is every ledger entry tied to it via
    // contractId — soilContract.service.ts posts the advance PAID and (for
    // non-PER_TROLLEY types) the totalContractValue DUE there, plus any
    // later revision corrections, all carrying this same contractId.
    const contractEntries = ledgerEntries.filter((e) => e.contractId === contract._id);
    printLandownerContract(contract, landowner.name, kilnInfo, contractEntries);
  }

  const backButton = (
    <button onClick={onBack} className="mb-3 flex items-center gap-1.5 text-sm text-ink-secondary hover:text-ink-primary">
      <ArrowLeft className="h-4 w-4" /> {t("people.backToPeople")}
    </button>
  );

  if (!landowner) {
    return (
      <div>
        {backButton}
        <Card>
          <p className="py-8 text-center text-sm text-ink-muted">{t("common.loading")}</p>
        </Card>
      </div>
    );
  }

  // Prefer the sum of this landowner's own `lands` rows (the per-field
  // Khasra/area entries captured via AddLandownerModal) — that's always
  // accurate for landowners added through the new flow, where the
  // person-level `khetArea` is never set at all. Falls back to the legacy
  // single khetArea field for landowners added before the Lands system
  // existed, so "Field Area" doesn't go blank for them either.
  const landsTotalArea = lands.reduce((sum, l) => sum + (l.area ?? 0), 0);
  const fieldAreaDisplay =
    landsTotalArea > 0
      ? `${landsTotalArea} ${landowner.khetAreaUnit ?? "bigha"}`
      : landowner.khetArea
      ? `${landowner.khetArea} ${landowner.khetAreaUnit ?? "bigha"}`
      : undefined;

  const totalTrolleys = arrivals.reduce((sum, a) => sum + a.trolleyCount, 0);
  const totalGiven = arrivals.reduce((sum, a) => sum + (a.paymentGiven ?? 0), 0);
  const totalPending = arrivals.reduce((sum, a) => sum + (a.paymentPending ?? 0), 0);
  const latestRemaining = arrivals.find((a) => a.soilRemaining != null)?.soilRemaining;

  // Contract payment is whatever each contract's own rate basis (per
  // trolley/bigha/depth) computed its totalContractValue to be — summed
  // across every contract this owner has, active or settled. "Paid so
  // far" and "remaining due" both come straight from the ledger (the same
  // DUE/PAID entries the contract and arrival flows already post), so
  // these three figures can never drift from what ContractDetailPage and
  // the Advance/Kharchi history below already show.
  const totalContractPayment = contracts.reduce((sum, c) => sum + c.totalContractValue, 0);
  const totalPaidSoFar = ledgerEntries.filter((e) => e.direction === "PAID").reduce((sum, e) => sum + e.amount, 0);
  // Remaining against the agreed contract total specifically -- NOT the raw
  // ledger `balance` below, which (for PER_TROLLEY contracts especially)
  // only reflects DUE entries actually posted so far per arrival, not the
  // full agreed totalContractValue. Pairing that raw balance next to
  // "Total contract payment"/"Paid so far" made a partial advance against
  // the contract read as "advance outstanding" instead of "remaining due".
  const contractBalance = totalContractPayment - totalPaidSoFar;

  // ledgerEntries comes back newest-first (see person.service.ts's
  // listLedgerForPerson) — the running paid-so-far/remaining-due shown
  // alongside each row still needs to build up chronologically, so it's
  // computed once here over a date-ascending copy and looked up by id
  // while rendering in the existing newest-first order.
  //
  // Bug fix: this used to ALSO inject each PER_TROLLEY contract's full
  // totalContractValue as a synthetic DUE at contract start, on the
  // premise that no real DUE ever gets posted for it — but that premise
  // was wrong: soilTrip.service.ts's createSoilTrip DOES post a real DUE
  // per trip for exactly a PER_TROLLEY contract (skipped only for
  // PER_BIGHA/PER_DEPTH, which bill their full value once at contract
  // creation instead). Keeping the synthetic injection meant the running
  // due counted the contract's full value once as a lump sum, THEN counted
  // it again as each real trip's own DUE posted — doubling once every
  // trolley had actually arrived. Real ledger entries (an advance PAID at
  // signing, each trip's own DUE as it's delivered) already accumulate to
  // the correct total on their own, same as every other contract type —
  // nothing owed for undelivered trolleys is the economically correct
  // state, not a display bug to paper over.
  const runningTotalsById = new Map<string, { paidSoFar: number; remainingDue: number }>();
  {
    const sorted = [...ledgerEntries].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
    let paid = 0;
    let due = 0;
    for (const entry of sorted) {
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
            <PersonAvatar personId={landownerId} hasPhoto={!!landowner.photoPath} name={landowner.name} />
            <div>
              <h3 className="text-lg font-semibold text-ink-primary">
                {landowner.name}
                {landowner.nickname && <span className="ml-1.5 font-normal text-ink-muted">"{landowner.nickname}"</span>}
              </h3>
              <p className="text-sm text-ink-muted">
                {landowner.landownerSerial ? `${t("people.landowner")} - ${landowner.landownerSerial}` : t("people.fieldOwnerLabel")}
                {khetLocation ? ` · ${khetLocation}` : ""}
              </p>
              {landowner.joiningDate && (
                <p className="mt-0.5 text-sm text-ink-muted">
                  {t("people.joiningDate")}: {new Date(landowner.joiningDate).toLocaleDateString("en-IN")}
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
        {profileError && <p className="mt-2 text-sm text-status-critical">{profileError}</p>}
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
                      <input
                        placeholder={t("people.khasraNumber")}
                        value={draft.khasraNumber}
                        onChange={(e) => updateLandDraft(i, { khasraNumber: e.target.value })}
                        className={inputClass}
                      />
                      <input
                        type="number"
                        placeholder={t("people.fieldAreaBigha")}
                        value={draft.area}
                        onChange={(e) => updateLandDraft(i, { area: e.target.value })}
                        className={inputClass}
                      />
                    </div>
                  ))}
                  <button
                    type="button"
                    onClick={addLandDraft}
                    className="flex w-fit items-center gap-1 text-xs font-medium text-series-1 hover:underline"
                  >
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
                <input
                  type="number"
                  min={0}
                  placeholder={t("people.agreedDigDepth")}
                  value={agreedDepthFeet}
                  onChange={(e) => setAgreedDepthFeet(e.target.value)}
                  className={cn(inputClass, "flex-1")}
                />
                <select value={agreedDepthUnit} onChange={(e) => setAgreedDepthUnit(e.target.value as DepthUnit)} className={cn(inputClass, "w-24")}>
                  <option value="feet">{t("soil.unitFeet")}</option>
                  <option value="meter">{t("soil.unitMeter")}</option>
                </select>
              </div>
              <label className="flex flex-col gap-1">
                <span className="text-xs text-ink-muted">{t("people.joiningDate")}</span>
                <DateInput value={joiningDate} onChange={(e) => setJoiningDate(e.target.value)} className={inputClass} />
              </label>
              {profileError && <p className="text-sm text-status-critical">{profileError}</p>}
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
                  {landowner.identityProofPath ? t("people.replaceIdentityProof") : t("people.uploadIdentityProofHint")}
                </label>
              </div>
            </form>
          ) : (
            <div className="grid grid-cols-2 gap-3">
              <ProfileViewField label={t("people.mobileNumber")} value={landowner.phone} />
              <ProfileViewField label={t("people.aadharIdNumber")} value={landowner.idNumber} />
              <ProfileViewField label={t("people.address")} value={landowner.address} />
              <ProfileViewField label={t("people.khetArea")} value={fieldAreaDisplay} />
              <ProfileViewField
                label={t("people.agreedDigDepth")}
                value={landowner.agreedDepthFeet ? `${landowner.agreedDepthFeet} ${landowner.agreedDepthUnit === "meter" ? t("soil.unitMeter") : t("soil.unitFeet")}` : undefined}
              />
              <ProfileViewField
                label={t("people.identityProof")}
                value={
                  landowner.identityProofPath ? (
                    <button
                      type="button"
                      onClick={async () => {
                        const blob = await api.people.fetchIdentityProofBlob(landownerId);
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
          <h4 className="mb-3 text-xs font-semibold uppercase tracking-wide text-ink-muted">{t("people.soilSummaryAutoSynced")}</h4>
          <div className="grid grid-cols-2 gap-2 text-center">
            <div>
              <p className="text-xl font-semibold tabular-nums text-ink-primary">{totalTrolleys.toLocaleString("en-IN")}</p>
              <p className="text-sm text-ink-muted">{t("people.totalTrolleysArrived")}</p>
            </div>
            <div>
              <p className="text-xl font-semibold tabular-nums text-ink-primary">{(latestRemaining ?? 0).toLocaleString("en-IN")}</p>
              <p className="text-sm text-ink-muted">{t("people.soilStillLeft")}</p>
            </div>
            <div>
              <p className="text-xl font-semibold tabular-nums text-status-good">₹{formatINR(totalGiven)}</p>
              <p className="text-sm text-ink-muted">{t("people.paymentGiven")}</p>
            </div>
            <div>
              <p className="text-xl font-semibold tabular-nums text-status-warning">₹{formatINR(totalPending)}</p>
              <p className="text-sm text-ink-muted">{t("people.paymentPending")}</p>
            </div>
          </div>
          <div className="mt-3 border-t border-border pt-3 text-center">
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
              <Plus className="h-4 w-4" /> {t("soil.newContract")}
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
          {contractError && <p className="mt-2 text-sm text-status-critical">{contractError}</p>}
          {contracts.length > 0 && (
            <div className="mt-3 flex flex-col gap-2 border-t border-border pt-3">
              {contracts.map((c) => (
                <div
                  key={c._id}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border bg-ink-primary/5 px-3 py-2"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-ink-primary">{c.contractNumber}</p>
                    <p className="truncate text-xs text-ink-muted">
                      {rateBasisLabel(c, t)} · {contractStatusLabel(c.status, t)} · ₹{formatINR(c.totalContractValue)}
                    </p>
                    <p className="truncate text-xs text-ink-muted/70">
                      {c.startDate && `${t("common.transactionDate")}: ${new Date(c.startDate).toLocaleDateString("en-IN")} · `}
                      {t("common.entryDateTime")}: {formatDateTime(c.createdAt)}
                    </p>
                  </div>
                  <div className="flex shrink-0 gap-3">
                    <button
                      onClick={() => printContract(c)}
                      className="flex items-center gap-1 text-xs font-medium text-series-1 hover:underline"
                    >
                      <Printer className="h-3.5 w-3.5" /> {t("common.print")}
                    </button>
                    <button
                      onClick={() => setEditingContract(c)}
                      className="flex items-center gap-1 text-xs font-medium text-series-1 hover:underline"
                    >
                      <Pencil className="h-3.5 w-3.5" /> {t("common.edit")}
                    </button>
                    <button
                      onClick={() => deleteContract(c)}
                      className="flex items-center gap-1 text-xs font-medium text-status-critical hover:underline"
                    >
                      <Trash2 className="h-3.5 w-3.5" /> {t("common.delete")}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>

        <Card className="lg:col-span-2">
          <div className="mb-3 flex items-center justify-between">
            <h4 className="text-xs font-semibold uppercase tracking-wide text-ink-muted">{t("people.soilArrivals")}</h4>
            <Button size="sm" onClick={() => setShowAddArrival(true)}>
              <Plus className="h-4 w-4" /> {t("people.logArrival")}
            </Button>
          </div>

          {arrivals.length === 0 ? (
            <p className="py-6 text-center text-sm text-ink-muted">{t("people.noSoilArrivalsYet")}</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px] text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-sm text-ink-muted">
                    <th className="pb-2 font-medium">{t("common.date")}</th>
                    <th className="pb-2 font-medium">{t("people.jcb")}</th>
                    <th className="pb-2 font-medium">{t("people.tractor")}</th>
                    <th className="pb-2 font-medium">{t("people.trolleys")}</th>
                    <th className="pb-2 font-medium">{t("people.given")}</th>
                    <th className="pb-2 font-medium">{t("people.pending")}</th>
                    <th className="pb-2 font-medium">{t("people.remaining")}</th>
                    <th className="pb-2 font-medium" />
                  </tr>
                </thead>
                <tbody>
                  {arrivals.map((a) => (
                    <tr key={a._id} className="border-b border-border/60 last:border-0 hover:bg-ink-primary/5">
                      <td className="py-3 text-ink-secondary">
                        {new Date(a.date).toLocaleDateString("en-IN")}
                        <p className="text-xs text-ink-muted/70">{formatDateTime(a.createdAt)}</p>
                      </td>
                      <td className="py-3 text-ink-secondary">{a.jcbUsed ? driverName(a.jcbDriverId) || t("common.yes") : "—"}</td>
                      <td className="py-3 text-ink-secondary">{a.tractorUsed ? driverName(a.tractorDriverId) || t("common.yes") : "—"}</td>
                      <td className="py-3 tabular-nums text-ink-secondary">{a.trolleyCount.toLocaleString("en-IN")}</td>
                      <td className="py-3 tabular-nums text-status-good">₹{formatINR((a.paymentGiven ?? 0))}</td>
                      <td className="py-3 tabular-nums text-status-warning">₹{formatINR((a.paymentPending ?? 0))}</td>
                      <td className="py-3 tabular-nums text-ink-secondary">{a.soilRemaining != null ? a.soilRemaining.toLocaleString("en-IN") : "—"}</td>
                      <td className="py-3 text-right">
                        <button onClick={() => setEditingArrival(a)} className="text-xs font-medium text-series-1 hover:underline">
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
                          <button
                            type="button"
                            onClick={() => setEditingLedgerEntry(entry)}
                            className="text-ink-muted hover:text-ink-primary"
                            aria-label={t("people.editLedgerEntry")}
                          >
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

      {ledgerOpen && <LedgerModal person={landowner} onClose={() => setLedgerOpen(false)} />}
      {showAddArrival && (
        <AddSoilArrivalModal landownerId={landownerId} drivers={drivers} onClose={() => setShowAddArrival(false)} onCreated={refresh} />
      )}
      {editingArrival && (
        <EditSoilArrivalModal entry={editingArrival} drivers={drivers} onClose={() => setEditingArrival(null)} onSaved={refresh} />
      )}
      {showAddContract && (
        <AddSoilContractModal landownerId={landownerId} lands={lands} onClose={() => setShowAddContract(false)} onCreated={refresh} />
      )}
      {editingContract && (
        <EditSoilContractModal contract={editingContract} onClose={() => setEditingContract(null)} onSaved={refresh} />
      )}
      {editingLedgerEntry && <EditLedgerEntryModal entry={editingLedgerEntry} onClose={() => setEditingLedgerEntry(null)} />}
    </div>
  );
}
