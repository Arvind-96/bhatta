import { FormEvent, useState } from "react";
import { X, Briefcase } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api";
import type { PayType, WorkType } from "@/types";
import { useTranslation } from "@/hooks/useTranslation";
import { useWorkTypeLabels } from "./personTypes";

const inputClass =
  "h-11 w-full rounded-xl border border-border bg-ink-primary/5 px-3.5 text-sm text-ink-primary outline-none transition-shadow focus:ring-2 focus:ring-series-1";

interface AddThekedarModalProps {
  onClose: () => void;
  onCreated: () => void;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-xs font-medium text-ink-secondary">{label}</span>
      {children}
    </label>
  );
}

// The simplified, purpose-built "Add Thekedar" form for the People page's
// Thekedar tab — just the fields that matter for a contractor's own
// record (name/phone/address/Aadhaar, pay type, and what kind of work
// they contract for). No type-switcher and no fields from other person
// types (there's no such thing as a thekedar reporting to another
// thekedar in this app), same simplification AddLabourModal already did
// for labourers.
export function AddThekedarModal({ onClose, onCreated }: AddThekedarModalProps) {
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [address, setAddress] = useState("");
  const [idNumber, setIdNumber] = useState("");
  const [payType, setPayType] = useState<"" | PayType>("");
  const [monthlySalary, setMonthlySalary] = useState("");
  const [commissionPerThousand, setCommissionPerThousand] = useState("");
  const [workType, setWorkType] = useState<"" | WorkType>("");
  const [loading, setLoading] = useState(false);
  const { t } = useTranslation();
  const workTypeLabels = useWorkTypeLabels();

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setLoading(true);
    try {
      await api.people.create({
        type: "LABOUR_CONTRACTOR",
        name: name.trim(),
        phone: phone || undefined,
        address: address || undefined,
        idNumber: idNumber || undefined,
        payType: payType || undefined,
        monthlySalary: payType === "MONTHLY" && monthlySalary ? Number(monthlySalary) : undefined,
        commissionPerThousand: payType === "PER_THOUSAND" && commissionPerThousand ? Number(commissionPerThousand) : undefined,
        workType: workType || undefined,
      });
      onCreated();
      onClose();
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink-primary/50 p-4 backdrop-blur-sm">
      <Card className="w-full max-w-md hover:translate-y-0">
        <div className="mb-5 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="gradient-brand flex h-9 w-9 items-center justify-center rounded-xl shadow-glow-1">
              <Briefcase className="h-4 w-4 text-white" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-ink-primary">{t("people.addThekedarModalTitle")}</h3>
              <p className="text-sm text-ink-muted">{t("people.newLabourContractorRecord")}</p>
            </div>
          </div>
          <button onClick={onClose} className="text-ink-muted hover:text-ink-primary">
            <X className="h-4 w-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex max-h-[70vh] flex-col gap-3 overflow-y-auto pr-1">
          <Field label={t("common.name")}>
            <input required placeholder={t("people.thekedarNamePlaceholder")} value={name} onChange={(e) => setName(e.target.value)} className={inputClass} />
          </Field>

          <Field label={t("common.phone")}>
            <input placeholder={t("people.tenDigitMobilePlaceholder")} value={phone} onChange={(e) => setPhone(e.target.value)} className={inputClass} />
          </Field>

          <Field label={t("people.address")}>
            <input placeholder={t("people.address")} value={address} onChange={(e) => setAddress(e.target.value)} className={inputClass} />
          </Field>

          <Field label={t("people.aadhaarCardNumber")}>
            <input placeholder={t("people.aadhaarNumberPlaceholder")} value={idNumber} onChange={(e) => setIdNumber(e.target.value)} className={inputClass} />
          </Field>

          <Field label={t("people.payType")}>
            <select value={payType} onChange={(e) => setPayType(e.target.value as "" | PayType)} className={inputClass}>
              <option value="">{t("people.selectPayType")}</option>
              <option value="MONTHLY">{t("people.monthlySalaryOption")}</option>
              <option value="PER_THOUSAND">{t("people.perThousandBricksOption")}</option>
            </select>
          </Field>

          {payType === "MONTHLY" && (
            <Field label={t("people.monthlySalaryPlaceholder")}>
              <input
                type="number"
                placeholder={t("people.egPlaceholder", { value: "15000" })}
                value={monthlySalary}
                onChange={(e) => setMonthlySalary(e.target.value)}
                className={inputClass}
              />
            </Field>
          )}
          {payType === "PER_THOUSAND" && (
            <Field label={t("people.commissionPerThousandLabel")}>
              <input
                type="number"
                placeholder={t("people.egPlaceholder", { value: "50" })}
                value={commissionPerThousand}
                onChange={(e) => setCommissionPerThousand(e.target.value)}
                className={inputClass}
              />
            </Field>
          )}

          <Field label={t("people.contractorWorkTypeLabel")}>
            <select value={workType} onChange={(e) => setWorkType(e.target.value as "" | WorkType)} className={inputClass}>
              <option value="">{t("people.selectWorkType")}</option>
              {(Object.entries(workTypeLabels) as [WorkType, string][]).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </Field>

          <Button type="submit" disabled={loading} className="mt-2 w-full">
            {t("people.addThekedarModalTitle")}
          </Button>
        </form>
      </Card>
    </div>
  );
}
