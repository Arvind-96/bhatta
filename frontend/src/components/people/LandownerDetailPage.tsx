import { FormEvent, useEffect, useState } from "react";
import { ArrowLeft, Plus } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api";
import { useKilnEvent } from "@/hooks/useKilnEvent";
import { LedgerModal } from "@/components/people/LedgerModal";
import { AddSoilArrivalModal } from "@/components/soil/AddSoilArrivalModal";
import { EditSoilArrivalModal } from "@/components/soil/EditSoilArrivalModal";
import { rateBasisLabel } from "@/components/soil/ContractDetailPage";
import { useTranslation } from "@/hooks/useTranslation";
import type { LedgerEntry, Person, SoilArrival, SoilContract } from "@/types";
import { formatINR } from "@/lib/utils";

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
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [address, setAddress] = useState("");
  const [idNumber, setIdNumber] = useState("");
  const [khetArea, setKhetArea] = useState("");
  const [khetAreaUnit, setKhetAreaUnit] = useState("bigha");
  const [khetLocation, setKhetLocation] = useState("");
  const [agreedDepthFeet, setAgreedDepthFeet] = useState("");
  const [savingProfile, setSavingProfile] = useState(false);
  const [ledgerOpen, setLedgerOpen] = useState(false);
  const [showAddArrival, setShowAddArrival] = useState(false);
  const [editingArrival, setEditingArrival] = useState<SoilArrival | null>(null);

  async function refresh() {
    const [detail, ledger, driversData, arrivalsData, contractsData] = await Promise.all([
      api.people.get(landownerId),
      api.people.listLedger(landownerId),
      api.people.list("DRIVER"),
      api.soilArrivals.list({ landownerId }),
      api.soilContracts.list({ landownerId }),
    ]);
    setLandowner(detail.person);
    setBalance(detail.balance);
    setLedgerEntries(ledger);
    setDrivers(driversData);
    setArrivals(arrivalsData);
    setContracts(contractsData);
    setName(detail.person.name);
    setPhone(detail.person.phone ?? "");
    setAddress(detail.person.address ?? "");
    setIdNumber(detail.person.idNumber ?? "");
    setKhetArea(detail.person.khetArea ? String(detail.person.khetArea) : "");
    setKhetAreaUnit(detail.person.khetAreaUnit ?? "bigha");
    setKhetLocation(detail.person.khetLocation ?? "");
    setAgreedDepthFeet(detail.person.agreedDepthFeet ? String(detail.person.agreedDepthFeet) : "");
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
      });
      await refresh();
    } finally {
      setSavingProfile(false);
    }
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

  return (
    <div>
      {backButton}

      <div className="mb-4 flex items-start justify-between">
        <div>
          <h3 className="text-lg font-semibold text-ink-primary">{landowner.name}</h3>
          <p className="text-sm text-ink-muted">{t("people.fieldOwnerLabel")}{khetLocation ? ` · ${khetLocation}` : ""}</p>
        </div>
        <Button size="sm" onClick={() => setLedgerOpen(true)}>
          {t("people.advanceKharchi")}
        </Button>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-muted">{t("people.profile")}</h4>
          <form onSubmit={saveProfile} className="flex flex-col gap-2">
            <input required placeholder={t("common.name")} value={name} onChange={(e) => setName(e.target.value)} className={inputClass} />
            <input placeholder={t("people.mobileNumber")} value={phone} onChange={(e) => setPhone(e.target.value)} className={inputClass} />
            <input placeholder={t("people.address")} value={address} onChange={(e) => setAddress(e.target.value)} className={inputClass} />
            <input placeholder={t("people.aadharIdNumber")} value={idNumber} onChange={(e) => setIdNumber(e.target.value)} className={inputClass} />
            <input placeholder={t("people.khetLocation")} value={khetLocation} onChange={(e) => setKhetLocation(e.target.value)} className={inputClass} />
            <div className="grid grid-cols-2 gap-2">
              <input type="number" min={0} placeholder={t("people.khetArea")} value={khetArea} onChange={(e) => setKhetArea(e.target.value)} className={inputClass} />
              <input placeholder={t("people.unitBigha")} value={khetAreaUnit} onChange={(e) => setKhetAreaUnit(e.target.value)} className={inputClass} />
            </div>
            <input
              type="number"
              min={0}
              placeholder={t("people.agreedDigDepth")}
              value={agreedDepthFeet}
              onChange={(e) => setAgreedDepthFeet(e.target.value)}
              className={inputClass}
            />
            <Button type="submit" size="sm" disabled={savingProfile}>
              {t("people.saveProfile")}
            </Button>
          </form>
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
          <h4 className="mb-3 text-xs font-semibold uppercase tracking-wide text-ink-muted">{t("people.contractPaymentSummary")}</h4>
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
              <p className={`text-xl font-semibold tabular-nums ${balance > 0 ? "text-status-critical" : balance < 0 ? "text-status-warning" : "text-status-good"}`}>
                ₹{formatINR(Math.abs(balance))}
              </p>
              <p className="text-sm text-ink-muted">{balance >= 0 ? t("people.remainingDue") : t("people.advanceOutstanding")}</p>
            </div>
          </div>
          {contracts.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-1.5 border-t border-border pt-3">
              {contracts.map((c) => (
                <span key={c._id} className="rounded-full border border-border bg-ink-primary/5 px-2.5 py-1 text-xs text-ink-secondary">
                  {c.contractNumber} · {rateBasisLabel(c, t)} · {c.status}
                </span>
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
                      <td className="py-3 text-ink-secondary">{new Date(a.date).toLocaleDateString("en-IN")}</td>
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
          <h4 className="mb-3 text-xs font-semibold uppercase tracking-wide text-ink-muted">{t("people.advanceKharchiHistory")}</h4>
          {ledgerEntries.length === 0 ? (
            <p className="py-6 text-center text-sm text-ink-muted">{t("people.noLedgerEntriesYet")}</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px] text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-sm text-ink-muted">
                    <th className="pb-2 font-medium">{t("common.date")}</th>
                    <th className="pb-2 font-medium">{t("people.reason")}</th>
                    <th className="pb-2 font-medium">{t("people.category")}</th>
                    <th className="pb-2 font-medium">{t("people.mode")}</th>
                    <th className="pb-2 font-medium text-right">{t("common.amount")}</th>
                  </tr>
                </thead>
                <tbody>
                  {ledgerEntries.map((entry) => (
                    <tr key={entry._id} className="border-b border-border/60 last:border-0">
                      <td className="py-3 text-ink-secondary">{new Date(entry.date).toLocaleDateString("en-IN")}</td>
                      <td className="py-3 text-ink-primary">{entry.reason}</td>
                      <td className="py-3 text-ink-secondary">{entry.category ?? "—"}</td>
                      <td className="py-3 text-ink-secondary">{entry.paymentMode ?? "—"}</td>
                      <td className={`py-3 text-right tabular-nums font-medium ${entry.direction === "DUE" ? "text-status-critical" : "text-status-good"}`}>
                        {entry.direction === "DUE" ? "+" : "-"}₹{formatINR(entry.amount)}
                      </td>
                    </tr>
                  ))}
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
    </div>
  );
}
