import { FormEvent, useState } from "react";
import { X, Briefcase } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { DateInput } from "@/components/ui/date-input";
import { api } from "@/lib/api";
import type { PayType, WorkType } from "@/types";
import { useTranslation } from "@/hooks/useTranslation";
import { useWorkTypeLabels } from "./personTypes";
import { PhotoCaptureInput } from "./PhotoCaptureInput";

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
  const [nickname, setNickname] = useState("");
  const [joiningDate, setJoiningDate] = useState("");
  const [photo, setPhoto] = useState<File | Blob | null>(null);
  const [identityProof, setIdentityProof] = useState<File | null>(null);
  const [uploadWarning, setUploadWarning] = useState("");
  const { t } = useTranslation();
  const workTypeLabels = useWorkTypeLabels();

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setLoading(true);
    try {
      const person = await api.people.create({
        type: "LABOUR_CONTRACTOR",
        name: name.trim(),
        phone: phone || undefined,
        address: address || undefined,
        idNumber: idNumber || undefined,
        payType: payType || undefined,
        monthlySalary: payType === "MONTHLY" && monthlySalary ? Number(monthlySalary) : undefined,
        commissionPerThousand: payType === "PER_THOUSAND" && commissionPerThousand ? Number(commissionPerThousand) : undefined,
        workType: workType || undefined,
        nickname: nickname.trim() || undefined,
        joiningDate: joiningDate || undefined,
      });

      let warning = "";
      if (photo) {
        try {
          await api.people.uploadPhoto(person._id, photo);
        } catch {
          warning = t("people.photoUploadFailedAfterCreate", { name: person.name });
        }
      }
      if (identityProof) {
        try {
          await api.people.uploadIdentityProof(person._id, identityProof);
        } catch {
          warning = t("people.identityProofUploadFailedAfterCreate", { name: person.name });
        }
      }

      onCreated();
      if (warning) {
        setUploadWarning(warning);
      } else {
        onClose();
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-ink-primary/50 p-4 backdrop-blur-sm">
      <div className="flex min-h-full items-center justify-center">
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

        <form onSubmit={handleSubmit} className="flex flex-col gap-3">
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
            <select required value={workType} onChange={(e) => setWorkType(e.target.value as "" | WorkType)} className={inputClass}>
              <option value="">{t("people.selectWorkType")}</option>
              {(Object.entries(workTypeLabels) as [WorkType, string][]).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </Field>

          <div className="mt-1 border-t border-border pt-3">
            <div className="grid grid-cols-2 gap-3">
              <Field label={t("people.nickname")}>
                <input placeholder={t("people.nicknamePlaceholder")} value={nickname} onChange={(e) => setNickname(e.target.value)} className={inputClass} />
              </Field>
              <Field label={t("people.joiningDate")}>
                <DateInput value={joiningDate} onChange={(e) => setJoiningDate(e.target.value)} className={inputClass} />
              </Field>
            </div>
            <div className="mt-3 grid grid-cols-2 gap-3">
              <Field label={t("people.photoOptional")}>
                <PhotoCaptureInput value={photo} onChange={setPhoto} />
              </Field>
              <Field label={t("people.identityProofOptional")}>
                <label className="flex h-28 cursor-pointer flex-col items-center justify-center gap-1 rounded-xl border border-dashed border-border px-2 text-center text-sm text-ink-muted hover:border-series-1/40 hover:text-series-1">
                  <input type="file" accept="image/*,.pdf" className="hidden" onChange={(e) => setIdentityProof(e.target.files?.[0] ?? null)} />
                  <span>{identityProof ? identityProof.name : t("people.uploadIdentityProofHint")}</span>
                </label>
              </Field>
            </div>
          </div>

          {uploadWarning ? (
            <div className="mt-2 flex flex-col gap-2 rounded-xl border border-status-warning/30 bg-status-warning/10 p-3">
              <p className="text-sm text-status-warning">{uploadWarning}</p>
              <Button type="button" onClick={onClose} className="w-full">
                {t("common.close")}
              </Button>
            </div>
          ) : (
            <Button type="submit" disabled={loading} className="mt-2 w-full">
              {t("people.addThekedarModalTitle")}
            </Button>
          )}
        </form>
      </Card>
      </div>
    </div>
  );
}
