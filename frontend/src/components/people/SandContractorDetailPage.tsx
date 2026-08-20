import { FormEvent, useEffect, useState } from "react";
import { ArrowLeft, Pencil, Plus, Printer, Trash2, X } from "lucide-react";
import { EditLedgerEntryModal } from "@/components/people/EditLedgerEntryModal";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api";
import { useKilnEvent } from "@/hooks/useKilnEvent";
import { useAuthStore } from "@/store/auth.store";
import { LedgerModal } from "@/components/people/LedgerModal";
import { AddSandDeliveryModal } from "@/components/sand/AddSandDeliveryModal";
import { EditSandDeliveryModal } from "@/components/sand/EditSandDeliveryModal";
import { AddSandContractModal } from "@/components/sand/AddSandContractModal";
import { EditSandContractModal } from "@/components/sand/EditSandContractModal";
import { PersonAvatar } from "@/components/people/PersonAvatar";
import { PhotoCaptureInput } from "@/components/people/PhotoCaptureInput";
import { ProfileViewField } from "@/components/people/ProfileViewField";
import { useTranslation } from "@/hooks/useTranslation";
import type { LedgerEntry, Person, SandContract, SandDelivery } from "@/types";
import { formatDateTime, formatINR } from "@/lib/utils";
import { printSandContract } from "@/lib/printDocument";

const inputClass =
  "h-10 rounded-xl border border-border bg-ink-primary/5 px-3 text-sm text-ink-primary outline-none focus:ring-2 focus:ring-series-1";

interface SandContractorDetailPageProps {
  sandContractorId: string;
  onBack: () => void;
}

function tractorSummary(entry: SandDelivery, t: (key: string) => string) {
  if (!entry.tractorUsed) return "—";
  const names = (entry.tractors ?? []).map((tr) => tr.driverName || tr.tractorNumber).filter(Boolean);
  return names.length > 0 ? names.join(", ") : t("common.yes");
}

function rateBasisText(contract: SandContract, t: (key: string) => string) {
  const parts = [
    contract.rateType === "PER_THOUSAND_BRICKS"
      ? t("sand.perThousandBricks")
      : contract.contractedTrolleys != null
      ? `${contract.contractedTrolleys} · ${t("sand.perTrolley")}`
      : t("sand.perTrolley"),
  ];
  if (contract.contractPrice != null) {
    parts.push(
      `${t("sand.contractPrice")}: ₹${formatINR(contract.contractPrice)}${
        contract.rateType === "PER_THOUSAND_BRICKS" ? "/1000" : "/trolley"
      }`
    );
  }
  return parts.join(" · ");
}

// The sand contractor profile — personal details plus their contracts and
// full delivery history, same shape as LandownerDetailPage but without any
// Land/khet/depth concept (a sand contractor isn't tied to a land parcel).
export function SandContractorDetailPage({ sandContractorId, onBack }: SandContractorDetailPageProps) {
  const { t } = useTranslation();
  const [contractor, setContractor] = useState<Person | null>(null);
  const [balance, setBalance] = useState(0);
  const [ledgerEntries, setLedgerEntries] = useState<LedgerEntry[]>([]);
  const [deliveries, setDeliveries] = useState<SandDelivery[]>([]);
  const [contracts, setContracts] = useState<SandContract[]>([]);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [address, setAddress] = useState("");
  const [isEditing, setIsEditing] = useState(false);
  const [savingProfile, setSavingProfile] = useState(false);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [ledgerOpen, setLedgerOpen] = useState(false);
  const [showAddDelivery, setShowAddDelivery] = useState(false);
  const [showAddContract, setShowAddContract] = useState(false);
  const [editingDelivery, setEditingDelivery] = useState<SandDelivery | null>(null);
  const [editingContract, setEditingContract] = useState<SandContract | null>(null);
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
    const [detail, ledger, deliveriesData, contractsData] = await Promise.all([
      api.people.get(sandContractorId),
      api.people.listLedger(sandContractorId),
      api.sandDeliveries.list({ sandContractorId }),
      api.sandContracts.list({ sandContractorId }),
    ]);
    setContractor(detail.person);
    setBalance(detail.balance);
    setLedgerEntries(ledger);
    setDeliveries(deliveriesData);
    setContracts(contractsData);
    setName(detail.person.name);
    setPhone(detail.person.phone ?? "");
    setAddress(detail.person.address ?? "");
  }

  useEffect(() => {
    refresh().catch(console.error);
  }, [sandContractorId]);

  useKilnEvent("ledger:update", () => refresh());
  useKilnEvent("person:update", () => refresh());
  useKilnEvent("sandDelivery:update", () => refresh());
  useKilnEvent("sandContract:update", () => refresh());

  async function saveProfile(e: FormEvent) {
    e.preventDefault();
    setSavingProfile(true);
    try {
      await api.people.update(sandContractorId, {
        name: name.trim(),
        phone: phone || undefined,
        address: address || undefined,
      });
      await refresh();
      setIsEditing(false);
    } finally {
      setSavingProfile(false);
    }
  }

  function cancelEditing() {
    if (contractor) {
      setName(contractor.name);
      setPhone(contractor.phone ?? "");
      setAddress(contractor.address ?? "");
    }
    setIsEditing(false);
  }

  async function handlePhotoChange(file: File | Blob | null) {
    if (!file) return;
    setUploadingPhoto(true);
    try {
      await api.people.uploadPhoto(sandContractorId, file);
      await refresh();
    } finally {
      setUploadingPhoto(false);
    }
  }

  // Soft delete — same pattern as LandownerDetailPage/LabourDetailPage.
  async function deleteProfile() {
    if (!contractor) return;
    if (!confirm(t("people.confirmDeleteSandContractorProfile", { name: contractor.name }))) return;
    await api.people.update(sandContractorId, { active: false });
    onBack();
  }

  async function deleteContract(contract: SandContract) {
    if (!confirm(t("sand.confirmDeleteContract", { contractNumber: contract.contractNumber }))) return;
    await api.sandContracts.remove(contract._id);
    await refresh();
  }

  function printContract(contract: SandContract) {
    if (!contractor) return;
    const contractEntries = ledgerEntries.filter((e) => e.contractId === contract._id);
    printSandContract(contract, contractor.name, kilnInfo, contractEntries);
  }

  const backButton = (
    <button onClick={onBack} className="mb-3 flex items-center gap-1.5 text-sm text-ink-secondary hover:text-ink-primary">
      <ArrowLeft className="h-4 w-4" /> {t("people.backToPeople")}
    </button>
  );

  if (!contractor) {
    return (
      <div>
        {backButton}
        <Card>
          <p className="py-8 text-center text-sm text-ink-muted">{t("common.loading")}</p>
        </Card>
      </div>
    );
  }

  const totalTrolleys = deliveries.reduce((sum, d) => sum + d.trolleyCount, 0);
  const totalGiven = deliveries.reduce((sum, d) => sum + (d.paymentGiven ?? 0), 0);
  const totalPending = deliveries.reduce((sum, d) => sum + (d.paymentPending ?? 0), 0);

  const totalContractPayment = contracts.reduce((sum, c) => sum + c.totalContractValue, 0);
  const totalPaidSoFar = ledgerEntries.filter((e) => e.direction === "PAID").reduce((sum, e) => sum + e.amount, 0);
  // Remaining against the agreed contract total specifically -- NOT the raw
  // ledger `balance` above, which (for PER_TROLLEY contracts especially)
  // only reflects DUE entries actually posted so far per delivery, not the
  // full agreed totalContractValue. Pairing that raw balance next to
  // "Total contract payment"/"Paid so far" here made a ₹500 advance against
  // a ₹1,200 contract read as "₹500 advance outstanding" instead of the
  // correct "₹700 remaining due".
  const contractBalance = totalContractPayment - totalPaidSoFar;

  // ledgerEntries comes back newest-first — the running paid-so-far/
  // remaining-due shown alongside each row still needs to build up
  // chronologically, same computation LandownerDetailPage uses.
  //
  // For PER_TROLLEY contracts specifically, no DUE ledger entry is ever
  // posted for the agreed totalContractValue (only real deliveries bill
  // their own DUE later, per sandContract.service.ts) -- so without this,
  // the running "remaining due" would clamp to 0 the moment the advance
  // (PAID) posts, same root cause as the Contract Payment Summary card's
  // contractBalance above. Each contract's totalContractValue is folded in
  // as a synthetic DUE contribution dated at its own startDate, merged into
  // the same chronological pass, so per-row Remaining Due tracks the
  // agreed contract total rather than only what's actually been billed.
  const runningTotalsById = new Map<string, { paidSoFar: number; remainingDue: number }>();
  {
    // Only PER_TROLLEY contracts need this -- PER_THOUSAND_BRICKS already
    // gets a real DUE entry posted for totalContractValue at creation time
    // (see sandContract.service.ts), so adding it again here would
    // double-count.
    const contractDue = contracts
      .filter((c) => c.rateType === "PER_TROLLEY")
      .map((c) => ({
        date: c.startDate ?? c.createdAt,
        amount: c.totalContractValue,
      }));
    let paid = 0;
    let due = 0;
    const timeline = [
      ...ledgerEntries.map((e) => ({ date: e.date, type: "entry" as const, entry: e })),
      ...contractDue.map((c) => ({ date: c.date, type: "contract" as const, amount: c.amount })),
    ].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
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
            <PersonAvatar personId={sandContractorId} hasPhoto={!!contractor.photoPath} name={contractor.name} />
            <div>
              <h3 className="text-lg font-semibold text-ink-primary">{contractor.name}</h3>
              <p className="text-sm text-ink-muted">
                {contractor.sandContractorSerial ? `${t("people.sandContractor")} - ${contractor.sandContractorSerial}` : t("people.sandContractor")}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {!isEditing && (
              <button
                onClick={() => setIsEditing(true)}
                className="flex items-center gap-1 rounded-lg border border-border bg-ink-primary/5 px-3 py-1.5 text-xs font-medium text-ink-secondary hover:bg-ink-primary/10"
              >
                <Pencil className="h-3.5 w-3.5" /> {t("common.edit")}
              </button>
            )}
            <button
              onClick={deleteProfile}
              className="flex items-center gap-1 rounded-lg border border-status-critical/30 bg-status-critical/5 px-3 py-1.5 text-xs font-medium text-status-critical hover:bg-status-critical/10"
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
              <input placeholder={t("people.mobileNumber")} value={phone} onChange={(e) => setPhone(e.target.value)} className={inputClass} />
              <input placeholder={t("people.address")} value={address} onChange={(e) => setAddress(e.target.value)} className={inputClass} />
              <Button type="submit" size="sm" disabled={savingProfile}>
                {t("people.saveProfile")}
              </Button>

              <div className="mt-2 border-t border-border pt-3">
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-muted">{t("people.photo")}</p>
                <PhotoCaptureInput value={null} onChange={handlePhotoChange} />
                {uploadingPhoto && <p className="mt-1 text-sm text-ink-muted">{t("common.saving")}</p>}
              </div>
            </form>
          ) : (
            <div className="grid grid-cols-2 gap-3">
              <ProfileViewField label={t("people.mobileNumber")} value={contractor.phone} />
              <ProfileViewField label={t("people.address")} value={contractor.address} />
            </div>
          )}
        </Card>

        <Card>
          <h4 className="mb-3 text-xs font-semibold uppercase tracking-wide text-ink-muted">{t("sand.deliveries")}</h4>
          <div className="grid grid-cols-3 gap-2 text-center">
            <div>
              <p className="text-xl font-semibold tabular-nums text-ink-primary">{totalTrolleys.toLocaleString("en-IN")}</p>
              <p className="text-sm text-ink-muted">{t("sand.trolleysDelivered")}</p>
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
            <p className="text-sm text-ink-muted">{balance >= 0 ? t("sand.netDueLedger") : t("sand.advanceOutstanding")}</p>
          </div>
        </Card>

        <Card className="lg:col-span-2">
          <div className="mb-3 flex items-center justify-between">
            <h4 className="text-xs font-semibold uppercase tracking-wide text-ink-muted">{t("sand.contractPaymentSummary")}</h4>
            <Button size="sm" onClick={() => setShowAddContract(true)}>
              <Plus className="h-4 w-4" /> {t("sand.newContractModalTitle")}
            </Button>
          </div>
          <div className="grid grid-cols-3 gap-2 text-center">
            <div>
              <p className="text-xl font-semibold tabular-nums text-ink-primary">₹{formatINR(totalContractPayment)}</p>
              <p className="text-sm text-ink-muted">{t("sand.totalContractPayment")}</p>
            </div>
            <div>
              <p className="text-xl font-semibold tabular-nums text-status-good">₹{formatINR(totalPaidSoFar)}</p>
              <p className="text-sm text-ink-muted">{t("sand.paidSoFar")}</p>
            </div>
            <div>
              <p className={`text-xl font-semibold tabular-nums ${contractBalance > 0 ? "text-status-critical" : contractBalance < 0 ? "text-status-warning" : "text-status-good"}`}>
                ₹{formatINR(Math.abs(contractBalance))}
              </p>
              <p className="text-sm text-ink-muted">{contractBalance >= 0 ? t("sand.remainingDue") : t("sand.advanceOutstanding")}</p>
            </div>
          </div>
          {contracts.length > 0 && (
            <div className="mt-3 flex flex-col gap-2 border-t border-border pt-3">
              {contracts.map((c) => (
                <div key={c._id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border bg-ink-primary/5 px-3 py-2">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-ink-primary">{c.contractNumber}</p>
                    <p className="truncate text-xs text-ink-muted">
                      {rateBasisText(c, t)} · ₹{formatINR(c.totalContractValue)}
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
          <div className="mb-3 flex items-center justify-between">
            <h4 className="text-xs font-semibold uppercase tracking-wide text-ink-muted">{t("sand.deliveries")}</h4>
            <Button size="sm" onClick={() => setShowAddDelivery(true)}>
              <Plus className="h-4 w-4" /> {t("sand.logDelivery")}
            </Button>
          </div>

          {deliveries.length === 0 ? (
            <p className="py-6 text-center text-sm text-ink-muted">{t("sand.noDeliveriesYet")}</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px] text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-sm text-ink-muted">
                    <th className="pb-2 font-medium">{t("common.date")}</th>
                    <th className="pb-2 font-medium">{t("people.tractor")}</th>
                    <th className="pb-2 font-medium">{t("people.trolleys")}</th>
                    <th className="pb-2 font-medium">{t("people.given")}</th>
                    <th className="pb-2 font-medium">{t("people.pending")}</th>
                    <th className="pb-2 font-medium" />
                  </tr>
                </thead>
                <tbody>
                  {deliveries.map((d) => (
                    <tr key={d._id} className="border-b border-border/60 last:border-0 hover:bg-ink-primary/5">
                      <td className="py-3 text-ink-secondary">
                        {new Date(d.date).toLocaleDateString("en-IN")}
                        <p className="text-xs text-ink-muted/70">{formatDateTime(d.createdAt)}</p>
                      </td>
                      <td className="py-3 text-ink-secondary">{tractorSummary(d, t)}</td>
                      <td className="py-3 tabular-nums text-ink-secondary">{d.trolleyCount.toLocaleString("en-IN")}</td>
                      <td className="py-3 tabular-nums text-status-good">₹{formatINR(d.paymentGiven ?? 0)}</td>
                      <td className="py-3 pr-2 tabular-nums text-status-warning">₹{formatINR(d.paymentPending ?? 0)}</td>
                      <td className="py-3 pl-3 text-right">
                        <button onClick={() => setEditingDelivery(d)} className="text-xs font-medium text-series-1 hover:underline">
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
          <h4 className="mb-3 text-xs font-semibold uppercase tracking-wide text-ink-muted">{t("sand.paymentHistory")}</h4>
          {ledgerEntries.length === 0 ? (
            <p className="py-6 text-center text-sm text-ink-muted">{t("sand.noLedgerEntriesYet")}</p>
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
                    <th className="pb-2 font-medium text-right">{t("sand.paidSoFar")}</th>
                    <th className="pb-2 font-medium text-right">{t("sand.remainingDue")}</th>
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

      {ledgerOpen && <LedgerModal person={contractor} onClose={() => setLedgerOpen(false)} />}
      {showAddDelivery && <AddSandDeliveryModal sandContractorId={sandContractorId} onClose={() => setShowAddDelivery(false)} onCreated={refresh} />}
      {editingDelivery && <EditSandDeliveryModal entry={editingDelivery} onClose={() => setEditingDelivery(null)} onSaved={refresh} />}
      {showAddContract && <AddSandContractModal sandContractorId={sandContractorId} onClose={() => setShowAddContract(false)} onCreated={refresh} />}
      {editingContract && <EditSandContractModal contract={editingContract} onClose={() => setEditingContract(null)} onSaved={refresh} />}
      {editingLedgerEntry && <EditLedgerEntryModal entry={editingLedgerEntry} onClose={() => setEditingLedgerEntry(null)} />}
    </div>
  );
}
