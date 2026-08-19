import { FormEvent, useEffect, useState } from "react";
import { X, Truck } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api";
import { rateBasisLabel } from "@/components/soil/ContractDetailPage";
import { useTranslation } from "@/hooks/useTranslation";
import type { Person, SoilArrivalTractorEntry, SoilContract } from "@/types";
import { cn, formatINR } from "@/lib/utils";

const inputClass =
  "h-11 w-full rounded-xl border border-border bg-ink-primary/5 px-3.5 text-sm text-ink-primary outline-none transition-shadow focus:ring-2 focus:ring-series-1";

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-xs font-medium text-ink-secondary">{label}</span>
      {children}
    </label>
  );
}

function ContractDetailsPreview({ contract }: { contract: SoilContract }) {
  const { t } = useTranslation();
  return (
    <div className="rounded-xl border border-border bg-ink-primary/5 p-3">
      <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-muted">
        {contract.contractNumber} · {contract.rateType === "PER_TROLLEY" ? t("soil.perTrolley") : contract.rateType === "PER_BIGHA" ? t("soil.fixedPerBigha") : t("soil.fixedPerDepth")}
      </p>
      <div className="grid grid-cols-2 gap-2 text-sm">
        <div>
          <p className="text-sm text-ink-muted">{t("common.rate")}</p>
          <p className="text-ink-primary">{rateBasisLabel(contract, t)}</p>
        </div>
        <div>
          <p className="text-sm text-ink-muted">{t("soil.totalContractValue")}</p>
          <p className="text-ink-primary">₹{formatINR(contract.totalContractValue)}</p>
        </div>
        {contract.contractedQuantity != null && (
          <div>
            <p className="text-sm text-ink-muted">{t("soil.trolleysUthayiGayiContracted")}</p>
            <p className="text-ink-primary">
              {contract.excavatedQuantity.toLocaleString("en-IN")} / {contract.contractedQuantity.toLocaleString("en-IN")}
              {contract.remainingQuantity != null ? t("soil.leftSuffix", { count: contract.remainingQuantity.toLocaleString("en-IN") }) : ""}
            </p>
          </div>
        )}
        {contract.contractedDepth != null && (
          <div>
            <p className="text-sm text-ink-muted">{t("soil.depthReachedContracted")}</p>
            <p className={contract.contractedDepthOverrun ? "text-status-critical" : "text-ink-primary"}>
              {contract.depthUsedFeet} / {contract.contractedDepth} {contract.depthUnit ?? "feet"}
              {contract.contractedDepthRemaining != null ? t("soil.leftSuffix", { count: contract.contractedDepthRemaining }) : ""}
            </p>
          </div>
        )}
        {contract.agreedDepthFeet != null && (
          <div>
            <p className="text-sm text-ink-muted">{t("soil.depthUsedAllowedLimit")}</p>
            <p className={contract.depthExceeded ? "text-status-critical" : "text-ink-primary"}>
              {contract.depthUsedFeet} ft / {contract.agreedDepthFeet} ft
              {contract.remainingDepthFeet != null ? t("soil.ftLeftSuffix", { count: contract.remainingDepthFeet }) : ""}
            </p>
          </div>
        )}
        <div>
          <p className="text-sm text-ink-muted">{contract.ledgerBalance < 0 ? t("soil.advanceStillOutstanding") : t("soil.remainingPaymentDueToOwner")}</p>
          <p className="text-ink-primary">₹{formatINR(Math.abs(contract.ledgerBalance))}</p>
        </div>
      </div>
    </div>
  );
}

interface AddSoilArrivalModalProps {
  // Fixed field owner (used from their own profile, or from a contract
  // page) — hides the picker.
  landownerId?: string;
  // Pickable field owners (used from the Soil page) — shown as a select
  // when landownerId isn't already fixed.
  landowners?: Person[];
  // Fixed contract (used from ContractDetailPage's "Log arrival" button) —
  // hides the contract picker too and always links this arrival to it, so
  // there's no way to forget the link when entering data from a contract
  // you're already looking at.
  presetContractId?: string;
  drivers: Person[];
  onClose: () => void;
  onCreated: () => void;
}

// Logs one day's soil arrival against a field owner — used from the Soil
// page (owner picker), the field owner's own profile (owner fixed), and a
// contract's own detail page (owner + contract both fixed). Posts straight
// to soil-arrivals, which auto-updates the ledger and both the field
// owner's and the contract's totals live — no separate sync step, same
// pattern as AddWorkEntryModal for labour.
export function AddSoilArrivalModal({ landownerId, landowners, presetContractId, drivers, onClose, onCreated }: AddSoilArrivalModalProps) {
  const { t } = useTranslation();
  const [selectedLandownerId, setSelectedLandownerId] = useState(landownerId ?? "");
  const [contractId, setContractId] = useState(presetContractId ?? "");
  const [activeContracts, setActiveContracts] = useState<SoilContract[]>([]);
  const [jcbUsed, setJcbUsed] = useState(false);
  const [tractorUsed, setTractorUsed] = useState(false);
  const [jcbDriverId, setJcbDriverId] = useState("");
  const [tractors, setTractors] = useState<SoilArrivalTractorEntry[]>([]);
  const [trolleyCount, setTrolleyCount] = useState("");
  const [paymentGiven, setPaymentGiven] = useState("");
  const [paymentPending, setPaymentPending] = useState("");
  const [notes, setNotes] = useState("");
  const [loading, setLoading] = useState(false);

  // Each tractor gets its own driver name/phone/tractor number — free text,
  // not a Person picker, since day-hire tractor drivers are rarely entered
  // as a Driver profile. Multiple tractors can run the same arrival at
  // once, so this is a growable list, not a single set of fields.
  function toggleTractorUsed(checked: boolean) {
    setTractorUsed(checked);
    setTractors(checked ? [{ driverName: "", driverPhone: "", tractorNumber: "" }] : []);
  }

  function updateTractor(index: number, field: keyof SoilArrivalTractorEntry, value: string) {
    setTractors((list) => list.map((entry, i) => (i === index ? { ...entry, [field]: value } : entry)));
  }

  function addTractor() {
    setTractors((list) => [...list, { driverName: "", driverPhone: "", tractorNumber: "" }]);
  }

  function removeTractor(index: number) {
    setTractors((list) => list.filter((_, i) => i !== index));
  }

  useEffect(() => {
    api.soilContracts.list({ status: "ACTIVE" }).then(setActiveContracts).catch(console.error);
  }, []);

  const contractsForOwner = activeContracts.filter(
    (c) => (typeof c.landownerId === "object" ? c.landownerId._id : c.landownerId) === selectedLandownerId
  );

  // The moment a field owner is picked, jump straight to their contract
  // details — if they have exactly one active contract it's selected
  // automatically (no extra click); with more than one, the picker below
  // still lets the admin choose which one this arrival is against. Skipped
  // entirely when a contract was already preset by the caller.
  useEffect(() => {
    if (presetContractId) return;
    if (contractsForOwner.length === 1) {
      setContractId(contractsForOwner[0]._id);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedLandownerId, activeContracts, presetContractId]);

  const selectedContract = activeContracts.find((c) => c._id === contractId);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!selectedLandownerId || !trolleyCount) return;
    setLoading(true);
    try {
      await api.soilArrivals.create({
        landownerId: selectedLandownerId,
        contractId: contractId || undefined,
        jcbUsed,
        tractorUsed,
        jcbDriverId: jcbUsed && jcbDriverId ? jcbDriverId : undefined,
        tractors: tractorUsed
          ? tractors.filter((entry) => entry.driverName || entry.driverPhone || entry.tractorNumber)
          : undefined,
        trolleyCount: Number(trolleyCount),
        paymentGiven: paymentGiven ? Number(paymentGiven) : undefined,
        paymentPending: paymentPending ? Number(paymentPending) : undefined,
        notes: notes || undefined,
      });
      onCreated();
      onClose();
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink-primary/50 p-4 backdrop-blur-sm">
      <Card className="flex w-full max-w-lg flex-col hover:translate-y-0" style={{ maxHeight: "90vh" }}>
        <div className="mb-5 flex shrink-0 items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="gradient-brand flex h-9 w-9 items-center justify-center rounded-xl shadow-glow-1">
              <Truck className="h-4 w-4 text-white" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-ink-primary">{t("soil.logSoilArrival")}</h3>
              <p className="text-sm text-ink-muted">{t("soil.khetMalikKaMittiAana")}</p>
            </div>
          </div>
          <button onClick={onClose} className="text-ink-muted hover:text-ink-primary">
            <X className="h-4 w-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto pr-1">
          {!landownerId && landowners && (
            <Field label={t("soil.fieldOwnerKhetKaMalik")}>
              <select
                required
                value={selectedLandownerId}
                onChange={(e) => {
                  setSelectedLandownerId(e.target.value);
                  setContractId("");
                }}
                className={inputClass}
              >
                <option value="">{t("soil.selectFieldOwner")}</option>
                {landowners.map((l) => (
                  <option key={l._id} value={l._id}>
                    {l.name} {l.khetLocation ? `— ${l.khetLocation}` : ""}
                  </option>
                ))}
              </select>
            </Field>
          )}

          {presetContractId ? (
            selectedContract && <ContractDetailsPreview contract={selectedContract} />
          ) : (
            selectedLandownerId &&
            contractsForOwner.length > 0 && (
              <>
                {contractsForOwner.length > 1 && (
                  <Field label={t("soil.againstContract")}>
                    <select value={contractId} onChange={(e) => setContractId(e.target.value)} className={inputClass}>
                      <option value="">{t("soil.noContractNotTracked")}</option>
                      {contractsForOwner.map((c) => (
                        <option key={c._id} value={c._id}>
                          {c.contractNumber}
                          {c.remainingQuantity != null ? t("soil.trolleysLeftSuffix", { count: c.remainingQuantity }) : ""}
                        </option>
                      ))}
                    </select>
                  </Field>
                )}
                {selectedContract && <ContractDetailsPreview contract={selectedContract} />}
              </>
            )
          )}

          <div className="grid grid-cols-2 gap-3">
            <label className="flex items-center gap-2 rounded-xl border border-border bg-ink-primary/5 px-3.5 py-3 text-sm text-ink-primary">
              <input type="checkbox" checked={jcbUsed} onChange={(e) => setJcbUsed(e.target.checked)} />
              {t("soil.jcbUsed")}
            </label>
            <label className="flex items-center gap-2 rounded-xl border border-border bg-ink-primary/5 px-3.5 py-3 text-sm text-ink-primary">
              <input type="checkbox" checked={tractorUsed} onChange={(e) => toggleTractorUsed(e.target.checked)} />
              {t("soil.tractorUsed")}
            </label>
          </div>

          {jcbUsed && (
            <Field label={t("soil.jcbDriver")}>
              <select value={jcbDriverId} onChange={(e) => setJcbDriverId(e.target.value)} className={inputClass}>
                <option value="">{t("soil.selectJcbDriver")}</option>
                {drivers.map((d) => (
                  <option key={d._id} value={d._id}>
                    {d.name}
                  </option>
                ))}
              </select>
            </Field>
          )}
          {tractorUsed && (
            <div className="flex flex-col gap-2">
              {tractors.map((entry, index) => (
                <div key={index} className="flex flex-col gap-2 rounded-xl border border-border bg-ink-primary/5 p-3">
                  <div className="flex items-center justify-between">
                    <p className="text-xs font-semibold uppercase tracking-wide text-ink-muted">
                      {t("soil.tractorEntryLabel", { index: index + 1 })}
                    </p>
                    {tractors.length > 1 && (
                      <button
                        type="button"
                        onClick={() => removeTractor(index)}
                        className="text-xs font-medium text-status-critical hover:underline"
                      >
                        {t("common.remove")}
                      </button>
                    )}
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <input
                      placeholder={t("soil.tractorDriverName")}
                      value={entry.driverName ?? ""}
                      onChange={(e) => updateTractor(index, "driverName", e.target.value)}
                      className={cn(inputClass, "h-10")}
                    />
                    <input
                      placeholder={t("soil.tractorDriverPhone")}
                      value={entry.driverPhone ?? ""}
                      onChange={(e) => updateTractor(index, "driverPhone", e.target.value)}
                      className={cn(inputClass, "h-10")}
                    />
                  </div>
                  <input
                    placeholder={t("soil.tractorNumberField")}
                    value={entry.tractorNumber ?? ""}
                    onChange={(e) => updateTractor(index, "tractorNumber", e.target.value)}
                    className={cn(inputClass, "h-10")}
                  />
                </div>
              ))}
              <button
                type="button"
                onClick={addTractor}
                className="self-start text-xs font-medium text-series-1 hover:underline"
              >
                {t("soil.addAnotherTractor")}
              </button>
            </div>
          )}

          <Field label={t("soil.trolleysArrived")}>
            <input required type="number" min={0} placeholder={t("soil.egFive")} value={trolleyCount} onChange={(e) => setTrolleyCount(e.target.value)} className={inputClass} />
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label={t("soil.paymentGivenSoFar")}>
              <input type="number" min={0} placeholder="0" value={paymentGiven} onChange={(e) => setPaymentGiven(e.target.value)} className={inputClass} />
            </Field>
            <Field label={t("soil.paymentPendingStill")}>
              <input type="number" min={0} placeholder="0" value={paymentPending} onChange={(e) => setPaymentPending(e.target.value)} className={inputClass} />
            </Field>
          </div>

          <Field label={t("common.notesOptional")}>
            <input placeholder={t("common.notes")} value={notes} onChange={(e) => setNotes(e.target.value)} className={inputClass} />
          </Field>

          <Button type="submit" disabled={loading} className="mt-1 w-full">
            {t("soil.saveArrival")}
          </Button>
        </form>
      </Card>
    </div>
  );
}
