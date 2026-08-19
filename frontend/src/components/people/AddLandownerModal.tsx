import { FormEvent, useState } from "react";
import { Plus, Trash2, X } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { cn, formatINR } from "@/lib/utils";
import { api } from "@/lib/api";
import { useTranslation } from "@/hooks/useTranslation";
import { isPaymentSplitMismatched, PaymentSplitFields } from "@/components/shared/PaymentSplitFields";
import { PhotoCaptureInput } from "./PhotoCaptureInput";
import type { DepthUnit, LedgerPaymentMode, SoilContractRateType } from "@/types";

const inputClass =
  "h-10 rounded-xl border border-border bg-ink-primary/5 px-3 text-sm text-ink-primary outline-none focus:ring-2 focus:ring-series-1";

interface AddLandownerModalProps {
  onClose: () => void;
  onCreated: () => void;
}

interface FieldRow {
  khasraNumber: string;
  area: string;
}

const RATE_TYPE_OPTIONS: { value: SoilContractRateType; labelKey: string }[] = [
  { value: "PER_BIGHA", labelKey: "soil.fixedPerBigha" },
  { value: "PER_DEPTH", labelKey: "soil.fixedPerDepth" },
  { value: "BOTH", labelKey: "soil.bothBighaAndDepth" },
  { value: "PER_TROLLEY", labelKey: "soil.perTrolley" },
];

// Landowner ("Khet Malik") creation — a dedicated, richer flow distinct
// from AddPersonModal since it also captures the owner's land holdings
// (any number of Khasra/field-area entries, each becoming its own `lands`
// row) and one overall contract covering all of them (per the app's
// existing one-contract-per-landowner Soil module — see
// soilContract.service.ts). totalContractValue is taken directly from the
// admin (the agreed lump sum) rather than computed from a per-unit rate,
// same "override" path createSoilContract already supports.
export function AddLandownerModal({ onClose, onCreated }: AddLandownerModalProps) {
  const { t } = useTranslation();
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [address, setAddress] = useState("");
  const [photo, setPhoto] = useState<File | Blob | null>(null);
  const [numberOfFields, setNumberOfFields] = useState("1");
  const [fields, setFields] = useState<FieldRow[]>([{ khasraNumber: "", area: "" }]);
  const [rateType, setRateType] = useState<SoilContractRateType>("PER_TROLLEY");
  const [contractedAreaBigha, setContractedAreaBigha] = useState("");
  const [contractedDepth, setContractedDepth] = useState("");
  const [depthUnit, setDepthUnit] = useState<DepthUnit>("feet");
  const [contractedQuantity, setContractedQuantity] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [advanceAmount, setAdvanceAmount] = useState("");
  const [totalContractValue, setTotalContractValue] = useState("");
  const [paymentMode, setPaymentMode] = useState<LedgerPaymentMode>("CASH");
  const [cashAmount, setCashAmount] = useState("");
  const [onlineAmount, setOnlineAmount] = useState("");
  const [loading, setLoading] = useState(false);
  const [formError, setFormError] = useState("");
  const [uploadWarning, setUploadWarning] = useState("");

  function applyFieldCount(value: string) {
    setNumberOfFields(value);
    const count = Math.max(0, Math.min(50, Math.floor(Number(value)) || 0));
    setFields((prev) => {
      const next = prev.slice(0, count);
      while (next.length < count) next.push({ khasraNumber: "", area: "" });
      return next;
    });
  }

  function updateField(index: number, patch: Partial<FieldRow>) {
    setFields((prev) => prev.map((f, i) => (i === index ? { ...f, ...patch } : f)));
  }

  function removeField(index: number) {
    setFields((prev) => prev.filter((_, i) => i !== index));
    setNumberOfFields((n) => String(Math.max(0, (Number(n) || 0) - 1)));
  }

  const wantsContract = totalContractValue.trim() !== "";
  const dueAmount = wantsContract ? Math.max(0, (Number(totalContractValue) || 0) - (Number(advanceAmount) || 0)) : 0;

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    if (wantsContract && fields.length === 0) {
      setFormError(t("people.landownerContractNeedsFieldError"));
      return;
    }
    if (wantsContract && rateType === "PER_BIGHA" && !contractedAreaBigha) {
      setFormError(t("people.landownerContractFieldsRequiredError"));
      return;
    }
    if (wantsContract && rateType === "PER_DEPTH" && !contractedDepth) {
      setFormError(t("people.landownerContractFieldsRequiredError"));
      return;
    }
    if (wantsContract && rateType === "BOTH" && (!contractedAreaBigha || !contractedDepth)) {
      setFormError(t("people.landownerContractFieldsRequiredError"));
      return;
    }
    if (wantsContract && rateType === "PER_TROLLEY" && !contractedQuantity) {
      setFormError(t("people.landownerContractFieldsRequiredError"));
      return;
    }
    if (wantsContract && isPaymentSplitMismatched(paymentMode, Number(advanceAmount) || 0, cashAmount, onlineAmount)) {
      setFormError(t("payment.splitMismatch", { total: (Number(advanceAmount) || 0).toLocaleString("en-IN") }));
      return;
    }
    setFormError("");
    setLoading(true);
    try {
      const person = await api.people.create({
        type: "LANDOWNER",
        name: name.trim(),
        phone: phone || undefined,
        address: address || undefined,
      });

      if (photo) {
        try {
          await api.people.uploadPhoto(person._id, photo);
        } catch {
          setUploadWarning(t("people.photoUploadFailedAfterCreate", { name: person.name }));
        }
      }

      const createdLandIds: string[] = [];
      for (let i = 0; i < fields.length; i++) {
        const f = fields[i];
        const land = await api.lands.create({
          landownerId: person._id,
          name: `${t("people.fieldLabel")} ${i + 1}`,
          khasraNumber: f.khasraNumber || undefined,
          area: f.area ? Number(f.area) : undefined,
          areaUnit: "bigha",
        });
        createdLandIds.push(land._id);
      }

      if (wantsContract && createdLandIds.length > 0) {
        await api.soilContracts.create({
          landId: createdLandIds[0],
          landownerId: person._id,
          rateType,
          contractedAreaBigha: rateType === "PER_BIGHA" || rateType === "BOTH" ? Number(contractedAreaBigha) : undefined,
          contractedDepth: rateType === "PER_DEPTH" || rateType === "BOTH" ? Number(contractedDepth) : undefined,
          depthUnit: rateType === "PER_DEPTH" || rateType === "BOTH" ? depthUnit : undefined,
          contractedQuantity: rateType === "PER_TROLLEY" ? Number(contractedQuantity) : undefined,
          totalContractValue: Number(totalContractValue),
          advanceAmount: advanceAmount ? Number(advanceAmount) : undefined,
          paymentMode: advanceAmount ? paymentMode : undefined,
          cashAmount: advanceAmount && paymentMode === "CASH_AND_ONLINE" ? Number(cashAmount) : undefined,
          onlineAmount: advanceAmount && paymentMode === "CASH_AND_ONLINE" ? Number(onlineAmount) : undefined,
          startDate: startDate || undefined,
          endDate: endDate || undefined,
        });
      }

      onCreated();
      if (uploadWarning) {
        // handled below via the warning banner
      } else {
        onClose();
      }
    } catch (err) {
      setFormError(err instanceof Error ? err.message : t("common.somethingWentWrong"));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <Card className="w-full max-w-lg">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-ink-primary">{t("people.addLandownerModalTitle")}</h3>
          <button onClick={onClose} className="text-ink-muted hover:text-ink-primary">
            <X className="h-4 w-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex max-h-[75vh] flex-col gap-3 overflow-y-auto pr-1">
          <input required placeholder={t("common.name")} value={name} onChange={(e) => setName(e.target.value)} className={inputClass} />
          <div className="grid grid-cols-2 gap-2">
            <input placeholder={t("people.mobileNumber")} value={phone} onChange={(e) => setPhone(e.target.value)} className={inputClass} />
            <input placeholder={t("people.address")} value={address} onChange={(e) => setAddress(e.target.value)} className={inputClass} />
          </div>

          <div>
            <p className="mb-1 text-xs text-ink-muted">{t("people.photoOptional")}</p>
            <PhotoCaptureInput value={photo} onChange={setPhoto} />
          </div>

          <div className="border-t border-border pt-3">
            <label className="mb-1 block text-xs text-ink-muted">{t("people.numberOfFields")}</label>
            <input
              type="number"
              min={0}
              max={50}
              value={numberOfFields}
              onChange={(e) => applyFieldCount(e.target.value)}
              className={cn(inputClass, "w-32")}
            />
            {fields.length > 0 && (
              <div className="mt-2 flex flex-col gap-2">
                {fields.map((f, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <span className="w-14 shrink-0 text-xs text-ink-muted">
                      {t("people.fieldLabel")} {i + 1}
                    </span>
                    <input
                      placeholder={t("people.khasraNumber")}
                      value={f.khasraNumber}
                      onChange={(e) => updateField(i, { khasraNumber: e.target.value })}
                      className={cn(inputClass, "flex-1")}
                    />
                    <input
                      type="number"
                      placeholder={t("people.fieldAreaBigha")}
                      value={f.area}
                      onChange={(e) => updateField(i, { area: e.target.value })}
                      className={cn(inputClass, "w-28")}
                    />
                    <button
                      type="button"
                      onClick={() => removeField(i)}
                      className="shrink-0 text-status-critical hover:opacity-70"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                ))}
              </div>
            )}
            <button
              type="button"
              onClick={() => {
                setFields((prev) => [...prev, { khasraNumber: "", area: "" }]);
                setNumberOfFields((n) => String((Number(n) || 0) + 1));
              }}
              className="mt-2 flex items-center gap-1 text-xs font-medium text-series-1 hover:underline"
            >
              <Plus className="h-3.5 w-3.5" /> {t("people.addAnotherField")}
            </button>
          </div>

          <div className="border-t border-border pt-3">
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-muted">{t("people.contractDetailsOptional")}</p>
            <div className="flex gap-1">
              {RATE_TYPE_OPTIONS.map((opt) => (
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
                  {t(opt.labelKey)}
                </button>
              ))}
            </div>

            <div className="mt-2 grid grid-cols-2 gap-2">
              {(rateType === "PER_BIGHA" || rateType === "BOTH") && (
                <input
                  type="number"
                  placeholder={t("people.numberOfBighas")}
                  value={contractedAreaBigha}
                  onChange={(e) => setContractedAreaBigha(e.target.value)}
                  className={inputClass}
                />
              )}
              {(rateType === "PER_DEPTH" || rateType === "BOTH") && (
                <div className="flex gap-2">
                  <input
                    type="number"
                    placeholder={t("people.depth")}
                    value={contractedDepth}
                    onChange={(e) => setContractedDepth(e.target.value)}
                    className={inputClass}
                  />
                  <select value={depthUnit} onChange={(e) => setDepthUnit(e.target.value as DepthUnit)} className={inputClass}>
                    <option value="feet">{t("soil.unitFeet")}</option>
                    <option value="meter">{t("soil.unitMeter")}</option>
                  </select>
                </div>
              )}
              {rateType === "PER_TROLLEY" && (
                <input
                  type="number"
                  placeholder={t("people.numberOfTrolleys")}
                  value={contractedQuantity}
                  onChange={(e) => setContractedQuantity(e.target.value)}
                  className={inputClass}
                />
              )}
            </div>

            <div className="mt-2 grid grid-cols-2 gap-2">
              <label className="flex flex-col gap-1">
                <span className="text-xs text-ink-muted">{t("soil.contractStartDate")}</span>
                <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className={inputClass} />
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-xs text-ink-muted">{t("soil.contractEndDate")}</span>
                <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className={inputClass} />
              </label>
            </div>

            <div className="mt-2 grid grid-cols-2 gap-2">
              <input
                type="number"
                placeholder={t("people.advanceAmountPaid")}
                value={advanceAmount}
                onChange={(e) => setAdvanceAmount(e.target.value)}
                className={inputClass}
              />
              <input
                type="number"
                placeholder={t("people.totalContractAmount")}
                value={totalContractValue}
                onChange={(e) => setTotalContractValue(e.target.value)}
                className={inputClass}
              />
            </div>

            {advanceAmount && (
              <div className="mt-2 flex flex-col gap-2">
                <select
                  value={paymentMode}
                  onChange={(e) => setPaymentMode(e.target.value as LedgerPaymentMode)}
                  className={inputClass}
                >
                  <option value="CASH">{t("dispatch.paymentCash")}</option>
                  <option value="BANK">{t("dispatch.paymentBankTransfer")}</option>
                  <option value="UPI">{t("dispatch.paymentUpi")}</option>
                  <option value="CASH_AND_ONLINE">{t("common.paymentModeCashAndOnline")}</option>
                </select>
                {paymentMode === "CASH_AND_ONLINE" && (
                  <PaymentSplitFields
                    totalAmount={Number(advanceAmount) || 0}
                    cashAmount={cashAmount}
                    onlineAmount={onlineAmount}
                    onCashAmountChange={setCashAmount}
                    onOnlineAmountChange={setOnlineAmount}
                    inputClassName={inputClass}
                  />
                )}
              </div>
            )}

            {wantsContract && (
              <div className="mt-2 flex items-center justify-between rounded-xl border border-series-1/30 bg-series-1/5 px-4 py-3">
                <span className="text-sm font-medium text-ink-secondary">{t("people.remainingDueAmount")}</span>
                <span className="text-lg font-semibold tabular-nums text-ink-primary">₹{formatINR(dueAmount)}</span>
              </div>
            )}
          </div>

          {formError && <p className="text-sm text-status-critical">{formError}</p>}

          {uploadWarning ? (
            <div className="mt-1 flex flex-col gap-2 rounded-xl border border-status-warning/30 bg-status-warning/10 p-3">
              <p className="text-sm text-status-warning">{uploadWarning}</p>
              <Button type="button" onClick={onClose} className="w-full">
                {t("common.close")}
              </Button>
            </div>
          ) : (
            <Button type="submit" disabled={loading} className="mt-1 w-full">
              {t("common.add")}
            </Button>
          )}
        </form>
      </Card>
    </div>
  );
}
