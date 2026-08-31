import { FormEvent, useEffect, useState } from "react";
import { Truck } from "lucide-react";
import { ModalHeader } from "@/components/ui/modal-header";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { DateInput } from "@/components/ui/date-input";
import { cn, formatINR } from "@/lib/utils";
import { api } from "@/lib/api";
import { useTranslation } from "@/hooks/useTranslation";
import { isPaymentSplitMismatched, PaymentSplitFields } from "@/components/shared/PaymentSplitFields";
import { PhotoCaptureInput } from "./PhotoCaptureInput";
import type { LedgerPaymentMode, SandContractRateType } from "@/types";

const inputClass =
  "h-10 rounded-xl border border-border bg-ink-primary/5 px-3 text-sm text-ink-primary outline-none focus:ring-2 focus:ring-series-1";

interface AddSandContractorModalProps {
  onClose: () => void;
  onCreated: () => void;
}

const RATE_TYPE_OPTIONS: { value: SandContractRateType; labelKey: string }[] = [
  { value: "PER_TROLLEY", labelKey: "sand.perTrolley" },
  { value: "PER_THOUSAND_BRICKS", labelKey: "sand.perThousandBricks" },
];

// Sand Contractor creation — a dedicated flow parallel to AddLandownerModal,
// but without any Land holdings step (a sand contractor isn't tied to a
// land parcel) and with the sand-specific rate types. totalContractValue
// is always the admin-entered lump sum (same override path Landowner
// contracts use), never computed from a per-unit rate.
export function AddSandContractorModal({ onClose, onCreated }: AddSandContractorModalProps) {
  const { t } = useTranslation();
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [address, setAddress] = useState("");
  const [photo, setPhoto] = useState<File | Blob | null>(null);
  const [rateType, setRateType] = useState<SandContractRateType>("PER_TROLLEY");
  const [contractedTrolleys, setContractedTrolleys] = useState("");
  const [contractPrice, setContractPrice] = useState("");
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

  // Auto-populate Total Contract Amount from trolleys × price per trolley,
  // same formula/guard as AddLandownerModal's equivalent effect — only
  // while both sides of the rate are actually filled in, so a manually-
  // typed lump sum is never overwritten, and only for PER_TROLLEY (the only
  // rate type with a known quantity up front; PER_THOUSAND_BRICKS is a
  // pure running rate with no fixed total to compute).
  useEffect(() => {
    if (rateType !== "PER_TROLLEY") return;
    const trolleys = Number(contractedTrolleys) || 0;
    const price = Number(contractPrice) || 0;
    if (trolleys && price) {
      setTotalContractValue(String(trolleys * price));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rateType, contractedTrolleys, contractPrice]);

  const wantsContract = totalContractValue.trim() !== "";
  const dueAmount = wantsContract ? Math.max(0, (Number(totalContractValue) || 0) - (Number(advanceAmount) || 0)) : 0;

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    if (wantsContract && rateType === "PER_TROLLEY" && !contractedTrolleys) {
      setFormError(t("sand.contractFieldsRequiredError"));
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
        type: "SAND_CONTRACTOR",
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

      if (wantsContract) {
        await api.sandContracts.create({
          sandContractorId: person._id,
          rateType,
          contractedTrolleys: rateType === "PER_TROLLEY" ? Number(contractedTrolleys) : undefined,
          contractPrice: contractPrice ? Number(contractPrice) : undefined,
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
        <ModalHeader icon={Truck} title={t("people.addSandContractorModalTitle")} subtitle={t("people.newSandContractorRecord")} onClose={onClose} />

        <form onSubmit={handleSubmit} className="flex flex-col gap-5">
          {/* Basic details */}
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

          {/* Contract */}
          <div className="flex flex-col gap-2 rounded-xl border border-border p-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-ink-muted">{t("sand.contractDetailsOptional")}</p>

            <div className="grid grid-cols-2 gap-1.5">
              {RATE_TYPE_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setRateType(opt.value)}
                  className={cn(
                    "rounded-lg border px-2 py-2 text-xs font-medium transition-colors",
                    rateType === opt.value
                      ? "border-series-1 bg-series-1/10 text-series-1"
                      : "border-ink-primary/20 bg-surface text-ink-secondary hover:bg-ink-primary/10"
                  )}
                >
                  {t(opt.labelKey)}
                </button>
              ))}
            </div>

            <div className="grid grid-cols-2 gap-2">
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
            </div>

            <div className="grid grid-cols-2 gap-2">
              <label className="flex flex-col gap-1">
                <span className="text-xs text-ink-muted">{t("sand.contractStartDate")}</span>
                <DateInput value={startDate} onChange={(e) => setStartDate(e.target.value)} className={inputClass} />
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-xs text-ink-muted">{t("sand.contractEndDate")}</span>
                <DateInput value={endDate} onChange={(e) => setEndDate(e.target.value)} className={inputClass} />
              </label>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <input
                type="number"
                placeholder={t("sand.advanceAmountPaid")}
                value={advanceAmount}
                onChange={(e) => setAdvanceAmount(e.target.value)}
                className={inputClass}
              />
              <input
                type="number"
                placeholder={t("sand.totalContractAmount")}
                value={totalContractValue}
                onChange={(e) => setTotalContractValue(e.target.value)}
                className={inputClass}
              />
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
              <div className="flex items-center justify-between rounded-xl border border-series-1/30 bg-series-1/5 px-4 py-3">
                <span className="text-sm font-medium text-ink-secondary">{t("sand.remainingDueAmount")}</span>
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
