import { FormEvent, useEffect, useState } from "react";
import { MapPinned, Plus, Trash2 } from "lucide-react";
import { ModalHeader } from "@/components/ui/modal-header";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { DateInput } from "@/components/ui/date-input";
import { cn, formatINR } from "@/lib/utils";
import { api } from "@/lib/api";
import { useTranslation } from "@/hooks/useTranslation";
import { isPaymentSplitMismatched, PaymentSplitFields } from "@/components/shared/PaymentSplitFields";
import { PhotoCaptureInput } from "../people/PhotoCaptureInput";
import type { LedgerPaymentMode } from "@/types";

const inputClass =
  "h-10 rounded-xl border border-border bg-ink-primary/5 px-3 text-sm text-ink-primary outline-none focus:ring-2 focus:ring-series-1";

interface AddLandLeaseModalProps {
  onClose: () => void;
  onCreated: () => void;
}

interface FieldRow {
  khasraNumber: string;
  area: string;
}

// Land Lease (Patta) creation — an exact clone of AddLandownerModal.tsx's
// flow (land holdings + one overall rent contract), copying its own
// existing "always bigha" land-holdings behavior unchanged (see the
// `areaUnit: "bigha"` on api.lands.create below — this modal never exposed
// an acre/other-unit picker even for Landowner). The contract itself posts
// to the separate landLeaseContracts table (not soilContracts), so it
// never shows up on the Soil (Mitti) page.
//
// Unlike Landowner's contract (which can be per-trolley, per-depth, or
// both, since it's about soil excavation), this land is used exclusively
// for raw-brick molding — there's no excavation quantity or depth to
// price against, so the rate type is always PER_BIGHA; no picker shown.
export function AddLandLeaseModal({ onClose, onCreated }: AddLandLeaseModalProps) {
  const { t } = useTranslation();
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [address, setAddress] = useState("");
  const [photo, setPhoto] = useState<File | Blob | null>(null);
  const [numberOfFields, setNumberOfFields] = useState("1");
  const [fields, setFields] = useState<FieldRow[]>([{ khasraNumber: "", area: "" }]);
  const [contractedAreaBigha, setContractedAreaBigha] = useState("");
  const [ratePerBigha, setRatePerBigha] = useState("");
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

  useEffect(() => {
    const area = Number(contractedAreaBigha) || 0;
    const bighaRate = Number(ratePerBigha) || 0;
    if (area && bighaRate) {
      setTotalContractValue(String(area * bighaRate));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contractedAreaBigha, ratePerBigha]);

  const wantsContract = totalContractValue.trim() !== "";
  const dueAmount = wantsContract ? Math.max(0, (Number(totalContractValue) || 0) - (Number(advanceAmount) || 0)) : 0;

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    if (wantsContract && fields.length === 0) {
      setFormError(t("people.landownerContractNeedsFieldError"));
      return;
    }
    if (wantsContract && !contractedAreaBigha) {
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
        type: "LAND_LEASE",
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
        await api.landLeaseContracts.create({
          landId: createdLandIds[0],
          landLeaseId: person._id,
          rateType: "PER_BIGHA",
          contractedAreaBigha: Number(contractedAreaBigha),
          ratePerBigha: ratePerBigha ? Number(ratePerBigha) : undefined,
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
    <div className="fixed inset-0 z-50 overflow-y-auto bg-ink-primary/50 p-4 backdrop-blur-sm">
      <div className="flex min-h-full items-center justify-center">
      <Card className="w-full max-w-2xl">
        <ModalHeader icon={MapPinned} title={t("landLease.addModalTitle")} subtitle={t("people.newLandLeaseRecord")} onClose={onClose} />

        <form onSubmit={handleSubmit} className="flex flex-col gap-5">
          <div className="flex flex-col gap-2">
            <div className="grid grid-cols-2 gap-2">
              <input required placeholder={t("common.name")} value={name} onChange={(e) => setName(e.target.value)} className={inputClass} />
              <input placeholder={t("people.mobileNumber")} value={phone} onChange={(e) => setPhone(e.target.value)} className={inputClass} />
            </div>
            <input placeholder={t("people.address")} value={address} onChange={(e) => setAddress(e.target.value)} className={inputClass} />
            <div>
              <p className="mb-1 text-xs text-ink-muted">{t("people.photoOptional")}</p>
              <PhotoCaptureInput value={photo} onChange={setPhoto} />
            </div>
          </div>

          <div className="flex flex-col gap-2 rounded-xl border border-border p-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-ink-muted">{t("people.landHoldings")}</p>
            <label className="flex items-center gap-2">
              <span className="text-xs text-ink-muted">{t("people.numberOfFields")}</span>
              <input type="number" min={0} max={50} value={numberOfFields} onChange={(e) => applyFieldCount(e.target.value)} className={cn(inputClass, "w-24")} />
            </label>

            {fields.length > 0 && (
              <div className="flex flex-col gap-2">
                {fields.map((f, i) => (
                  <div key={i} className="grid grid-cols-[3.5rem_1fr_8rem_1.5rem] items-center gap-2">
                    <span className="text-xs text-ink-muted">
                      {t("people.fieldLabel")} {i + 1}
                    </span>
                    <input placeholder={t("people.khasraNumber")} value={f.khasraNumber} onChange={(e) => updateField(i, { khasraNumber: e.target.value })} className={inputClass} />
                    <input type="number" placeholder={t("people.fieldAreaBigha")} value={f.area} onChange={(e) => updateField(i, { area: e.target.value })} className={inputClass} />
                    <button type="button" onClick={() => removeField(i)} className="flex items-center justify-center text-status-critical hover:opacity-70" aria-label={t("common.remove")}>
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
              className="flex w-fit items-center gap-1 text-xs font-medium text-series-1 hover:underline"
            >
              <Plus className="h-3.5 w-3.5" /> {t("people.addAnotherField")}
            </button>
          </div>

          <div className="flex flex-col gap-2 rounded-xl border border-border p-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-ink-muted">{t("people.contractDetailsOptional")}</p>

            <div className="grid grid-cols-2 gap-1.5">
              <span className="rounded-lg border border-series-1 bg-series-1/10 px-2 py-2 text-center text-xs font-medium text-series-1">
                {t("soil.fixedPerBigha")}
              </span>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <input type="number" placeholder={t("people.numberOfBighas")} value={contractedAreaBigha} onChange={(e) => setContractedAreaBigha(e.target.value)} className={inputClass} />
              <input type="number" placeholder={t("soil.ratePerBighaRupees")} value={ratePerBigha} onChange={(e) => setRatePerBigha(e.target.value)} className={inputClass} />
            </div>

            <div className="grid grid-cols-2 gap-2">
              <label className="flex flex-col gap-1">
                <span className="text-xs text-ink-muted">{t("soil.contractStartDate")}</span>
                <DateInput value={startDate} onChange={(e) => setStartDate(e.target.value)} className={inputClass} />
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-xs text-ink-muted">{t("soil.contractEndDate")}</span>
                <DateInput value={endDate} onChange={(e) => setEndDate(e.target.value)} className={inputClass} />
              </label>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <input type="number" placeholder={t("people.advanceAmountPaid")} value={advanceAmount} onChange={(e) => setAdvanceAmount(e.target.value)} className={inputClass} />
              <input type="number" placeholder={t("people.totalContractAmount")} value={totalContractValue} onChange={(e) => setTotalContractValue(e.target.value)} className={inputClass} />
            </div>

            {advanceAmount && (
              <div className="flex flex-col gap-2">
                <select value={paymentMode} onChange={(e) => setPaymentMode(e.target.value as LedgerPaymentMode)} className={inputClass}>
                  <option value="CASH">{t("dispatch.paymentCash")}</option>
                  <option value="BANK">{t("dispatch.paymentBankTransfer")}</option>
                  <option value="UPI">{t("dispatch.paymentUpi")}</option>
                  <option value="CASH_AND_ONLINE">{t("common.paymentModeCashAndOnline")}</option>
                </select>
                {paymentMode === "CASH_AND_ONLINE" && (
                  <PaymentSplitFields totalAmount={Number(advanceAmount) || 0} cashAmount={cashAmount} onlineAmount={onlineAmount} onCashAmountChange={setCashAmount} onOnlineAmountChange={setOnlineAmount} inputClassName={inputClass} />
                )}
              </div>
            )}

            {wantsContract && (
              <div className="flex items-center justify-between rounded-xl border border-series-1/30 bg-series-1/5 px-4 py-3">
                <span className="text-sm font-medium text-ink-secondary">{t("people.remainingDueAmount")}</span>
                <span className="text-lg font-semibold tabular-nums text-ink-primary">₹{formatINR(dueAmount)}</span>
              </div>
            )}
          </div>

          {formError && <p className="text-sm text-status-critical">{formError}</p>}

          {uploadWarning ? (
            <div className="flex flex-col gap-2 rounded-xl border border-status-warning/30 bg-status-warning/10 p-3">
              <p className="text-sm text-status-warning">{uploadWarning}</p>
              <Button type="button" onClick={onClose} className="w-full">
                {t("common.close")}
              </Button>
            </div>
          ) : (
            <Button type="submit" disabled={loading} className="w-full">
              {t("common.add")}
            </Button>
          )}
        </form>
      </Card>
      </div>
    </div>
  );
}
