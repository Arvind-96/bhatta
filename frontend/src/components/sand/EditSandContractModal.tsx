import { FormEvent, useState } from "react";
import { createPortal } from "react-dom";
import { Trash2, X } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { DateInput } from "@/components/ui/date-input";
import { cn } from "@/lib/utils";
import { api } from "@/lib/api";
import type { SandContract, SandContractRateType } from "@/types";
import { useTranslation } from "@/hooks/useTranslation";

const inputClass =
  "h-10 rounded-xl border border-border bg-ink-primary/5 px-3 text-sm text-ink-primary outline-none focus:ring-2 focus:ring-series-1";

interface EditSandContractModalProps {
  contract: SandContract;
  onClose: () => void;
  onSaved: () => void;
}

// Editing an already-active contract is a money-affecting change if the
// total value/advance is revised — the backend posts a correction entry
// for the delta rather than silently rewriting the ledger (see
// sandContract.service.ts's updateSandContract). sandContractorId isn't
// editable here, same restriction the backend enforces.
export function EditSandContractModal({ contract, onClose, onSaved }: EditSandContractModalProps) {
  const { t } = useTranslation();
  const [rateType, setRateType] = useState<SandContractRateType>(contract.rateType);
  const [contractedTrolleys, setContractedTrolleys] = useState(
    contract.contractedTrolleys != null ? String(contract.contractedTrolleys) : ""
  );
  const [contractPrice, setContractPrice] = useState(contract.contractPrice != null ? String(contract.contractPrice) : "");
  const [totalContractValue, setTotalContractValue] = useState(String(contract.totalContractValue));
  const [advanceAmount, setAdvanceAmount] = useState(String(contract.advanceAmount ?? 0));
  const [startDate, setStartDate] = useState(contract.startDate ? contract.startDate.slice(0, 10) : "");
  const [endDate, setEndDate] = useState(contract.endDate ? contract.endDate.slice(0, 10) : "");
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!totalContractValue) return;
    setSaving(true);
    try {
      await api.sandContracts.update(contract._id, {
        rateType,
        contractedTrolleys: rateType === "PER_TROLLEY" && contractedTrolleys ? Number(contractedTrolleys) : undefined,
        contractPrice: contractPrice ? Number(contractPrice) : undefined,
        totalContractValue: Number(totalContractValue),
        advanceAmount: advanceAmount ? Number(advanceAmount) : undefined,
        startDate: startDate || undefined,
        endDate: endDate || undefined,
      });
      onSaved();
      onClose();
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!confirm(t("sand.confirmDeleteContract", { contractNumber: contract.contractNumber }))) return;
    setDeleting(true);
    try {
      await api.sandContracts.remove(contract._id);
      onSaved();
      onClose();
    } finally {
      setDeleting(false);
    }
  }

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <Card className="w-full max-w-md max-h-[90vh] overflow-y-auto hover:translate-y-0">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-ink-primary">{t("sand.editContractTitle", { contractNumber: contract.contractNumber })}</h3>
          <button onClick={onClose} className="text-ink-muted hover:text-ink-primary">
            <X className="h-4 w-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="grid grid-cols-2 gap-2">
          <div className="col-span-2 flex gap-1">
            {(
              [
                { value: "PER_TROLLEY", label: t("sand.perTrolley") },
                { value: "PER_THOUSAND_BRICKS", label: t("sand.perThousandBricks") },
              ] as { value: SandContractRateType; label: string }[]
            ).map((opt) => (
              <button
                key={opt.value}
                type="button"
                onClick={() => setRateType(opt.value)}
                className={cn(
                  "flex-1 rounded-lg border px-2 py-2 text-xs font-medium transition-colors",
                  rateType === opt.value
                    ? "border-series-1 bg-series-1/10 text-series-1"
                    : "border-ink-primary/20 bg-surface text-ink-secondary hover:bg-ink-primary/10"
                )}
              >
                {opt.label}
              </button>
            ))}
          </div>

          {rateType === "PER_TROLLEY" && (
            <input
              type="number"
              placeholder={t("sand.numberOfTrolleysContract")}
              value={contractedTrolleys}
              onChange={(e) => setContractedTrolleys(e.target.value)}
              className={inputClass}
            />
          )}
          <input
            type="number"
            placeholder={rateType === "PER_TROLLEY" ? t("sand.pricePerTrolley") : t("sand.pricePerThousandBricks")}
            value={contractPrice}
            onChange={(e) => setContractPrice(e.target.value)}
            className={cn(inputClass, rateType === "PER_THOUSAND_BRICKS" && "col-span-2")}
          />

          <input
            required
            type="number"
            placeholder={t("sand.totalContractAmount")}
            value={totalContractValue}
            onChange={(e) => setTotalContractValue(e.target.value)}
            className={cn(inputClass, "col-span-2")}
          />
          <input
            type="number"
            placeholder={t("sand.advanceAmountPaid")}
            value={advanceAmount}
            onChange={(e) => setAdvanceAmount(e.target.value)}
            className={cn(inputClass, "col-span-2")}
          />
          <DateInput value={startDate} onChange={(e) => setStartDate(e.target.value)} className={inputClass} />
          <DateInput value={endDate} onChange={(e) => setEndDate(e.target.value)} className={inputClass} />

          <div className="col-span-2 flex gap-2">
            <button
              type="button"
              onClick={handleDelete}
              disabled={deleting}
              className="flex h-10 shrink-0 items-center gap-1.5 rounded-xl border border-status-critical/30 bg-status-critical/5 px-3.5 text-xs font-medium text-status-critical hover:bg-status-critical/10"
            >
              <Trash2 className="h-3.5 w-3.5" /> {t("common.delete")}
            </button>
            <Button type="submit" disabled={saving} className="flex-1">
              {t("common.saveChanges")}
            </Button>
          </div>
        </form>
      </Card>
    </div>,
    document.body
  );
}
