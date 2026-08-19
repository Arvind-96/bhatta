import { FormEvent, useEffect, useState } from "react";
import { X, Truck } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api";
import { useTranslation } from "@/hooks/useTranslation";
import type { Person, SandContract, SandDeliveryTractorEntry } from "@/types";
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

function ContractPreview({ contract, t }: { contract: SandContract; t: (key: string, params?: Record<string, string | number>) => string }) {
  return (
    <div className="rounded-xl border border-border bg-ink-primary/5 p-3">
      <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-muted">
        {contract.contractNumber} · {contract.rateType === "PER_TROLLEY" ? t("sand.perTrolley") : t("sand.perThousandBricks")}
      </p>
      <div className="grid grid-cols-2 gap-2 text-sm">
        <div>
          <p className="text-sm text-ink-muted">{t("sand.totalContractAmount")}</p>
          <p className="text-ink-primary">₹{formatINR(contract.totalContractValue)}</p>
        </div>
        {contract.contractedTrolleys != null && (
          <div>
            <p className="text-sm text-ink-muted">{t("sand.numberOfTrolleysContract")}</p>
            <p className="text-ink-primary">{contract.contractedTrolleys.toLocaleString("en-IN")}</p>
          </div>
        )}
      </div>
    </div>
  );
}

interface AddSandDeliveryModalProps {
  sandContractorId?: string;
  sandContractors?: Person[];
  presetContractId?: string;
  onClose: () => void;
  onCreated: () => void;
}

// Logs one delivery of sand trolleys against a sand contractor — same
// shape as AddSoilArrivalModal, minus JCB (not relevant here) and depth
// tracking (sand contracts don't track excavation depth).
export function AddSandDeliveryModal({ sandContractorId, sandContractors, presetContractId, onClose, onCreated }: AddSandDeliveryModalProps) {
  const { t } = useTranslation();
  const [selectedContractorId, setSelectedContractorId] = useState(sandContractorId ?? "");
  const [contractId, setContractId] = useState(presetContractId ?? "");
  const [contracts, setContracts] = useState<SandContract[]>([]);
  const [tractorUsed, setTractorUsed] = useState(false);
  const [tractors, setTractors] = useState<SandDeliveryTractorEntry[]>([]);
  const [trolleyCount, setTrolleyCount] = useState("");
  const [paymentGiven, setPaymentGiven] = useState("");
  const [paymentPending, setPaymentPending] = useState("");
  const [notes, setNotes] = useState("");
  const [loading, setLoading] = useState(false);

  function toggleTractorUsed(checked: boolean) {
    setTractorUsed(checked);
    setTractors(checked ? [{ driverName: "", driverPhone: "", tractorNumber: "" }] : []);
  }

  function updateTractor(index: number, field: keyof SandDeliveryTractorEntry, value: string) {
    setTractors((list) => list.map((entry, i) => (i === index ? { ...entry, [field]: value } : entry)));
  }

  function addTractor() {
    setTractors((list) => [...list, { driverName: "", driverPhone: "", tractorNumber: "" }]);
  }

  function removeTractor(index: number) {
    setTractors((list) => list.filter((_, i) => i !== index));
  }

  useEffect(() => {
    api.sandContracts.list().then(setContracts).catch(console.error);
  }, []);

  const contractsForContractor = contracts.filter(
    (c) => (typeof c.sandContractorId === "object" ? c.sandContractorId._id : c.sandContractorId) === selectedContractorId
  );

  useEffect(() => {
    if (presetContractId) return;
    if (contractsForContractor.length === 1) {
      setContractId(contractsForContractor[0]._id);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedContractorId, contracts, presetContractId]);

  const selectedContract = contracts.find((c) => c._id === contractId);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!selectedContractorId || !trolleyCount) return;
    setLoading(true);
    try {
      await api.sandDeliveries.create({
        sandContractorId: selectedContractorId,
        contractId: contractId || undefined,
        tractorUsed,
        tractors: tractorUsed ? tractors.filter((entry) => entry.driverName || entry.driverPhone || entry.tractorNumber) : undefined,
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
              <h3 className="text-sm font-semibold text-ink-primary">{t("sand.logSandDelivery")}</h3>
              <p className="text-sm text-ink-muted">{t("sand.deliverySubtitle")}</p>
            </div>
          </div>
          <button onClick={onClose} className="text-ink-muted hover:text-ink-primary">
            <X className="h-4 w-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto pr-1">
          {!sandContractorId && sandContractors && (
            <Field label={t("people.sandContractor")}>
              <select
                required
                value={selectedContractorId}
                onChange={(e) => {
                  setSelectedContractorId(e.target.value);
                  setContractId("");
                }}
                className={inputClass}
              >
                <option value="">{t("sand.selectSandContractor")}</option>
                {sandContractors.map((c) => (
                  <option key={c._id} value={c._id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </Field>
          )}

          {presetContractId ? (
            selectedContract && <ContractPreview contract={selectedContract} t={t} />
          ) : (
            selectedContractorId &&
            contractsForContractor.length > 0 && (
              <>
                {contractsForContractor.length > 1 && (
                  <Field label={t("sand.againstContract")}>
                    <select value={contractId} onChange={(e) => setContractId(e.target.value)} className={inputClass}>
                      <option value="">{t("sand.noContractNotTracked")}</option>
                      {contractsForContractor.map((c) => (
                        <option key={c._id} value={c._id}>
                          {c.contractNumber}
                        </option>
                      ))}
                    </select>
                  </Field>
                )}
                {selectedContract && <ContractPreview contract={selectedContract} t={t} />}
              </>
            )
          )}

          <label className="flex items-center gap-2 rounded-xl border border-border bg-ink-primary/5 px-3.5 py-3 text-sm text-ink-primary">
            <input type="checkbox" checked={tractorUsed} onChange={(e) => toggleTractorUsed(e.target.checked)} />
            {t("soil.tractorUsed")}
          </label>

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
              <button type="button" onClick={addTractor} className="self-start text-xs font-medium text-series-1 hover:underline">
                {t("soil.addAnotherTractor")}
              </button>
            </div>
          )}

          <Field label={t("sand.trolleysDelivered")}>
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
            {t("sand.saveDelivery")}
          </Button>
        </form>
      </Card>
    </div>
  );
}
