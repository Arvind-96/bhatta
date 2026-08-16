import { FormEvent, useEffect, useState } from "react";
import { X } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api";
import type { PayType, Person, PersonType, ShiftType, StackingStage, WorkType } from "@/types";
import { usePersonTypeMeta, useWorkTypeLabels, PERSON_TYPES } from "./personTypes";
import { useTranslation } from "@/hooks/useTranslation";

interface AddPersonModalProps {
  defaultType: PersonType;
  defaultContractorId?: string;
  defaultBharaiContractorId?: string;
  defaultStackingStage?: StackingStage;
  defaultNikasiContractorId?: string;
  defaultIsOfficeStaff?: boolean;
  onClose: () => void;
  onCreated: () => void;
}

const inputClass =
  "h-10 rounded-xl border border-border bg-ink-primary/5 px-3 text-sm text-ink-primary outline-none focus:ring-2 focus:ring-series-1";

export function AddPersonModal({
  defaultType,
  defaultContractorId,
  defaultBharaiContractorId,
  defaultStackingStage,
  defaultNikasiContractorId,
  defaultIsOfficeStaff,
  onClose,
  onCreated,
}: AddPersonModalProps) {
  const [type, setType] = useState<PersonType>(defaultType);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [address, setAddress] = useState("");
  const [idNumber, setIdNumber] = useState("");
  const [dailyWage, setDailyWage] = useState("");
  const [ratePerThousand, setRatePerThousand] = useState("");
  const [vehicleNumber, setVehicleNumber] = useState("");
  const [ratePerTrolley, setRatePerTrolley] = useState("");
  const [khetArea, setKhetArea] = useState("");
  const [khetAreaUnit, setKhetAreaUnit] = useState("bigha");
  const [khetLocation, setKhetLocation] = useState("");
  const [agreedDepthFeet, setAgreedDepthFeet] = useState("");
  const [contractorId, setContractorId] = useState(defaultContractorId ?? "");
  const [workType, setWorkType] = useState<"" | WorkType>("");
  const [payType, setPayType] = useState<"" | PayType>("");
  const [commissionPerThousand, setCommissionPerThousand] = useState("");
  const [bharaiContractorId, setBharaiContractorId] = useState(defaultBharaiContractorId ?? "");
  const [nikasiContractorId, setNikasiContractorId] = useState(defaultNikasiContractorId ?? "");
  const [monthlySalary, setMonthlySalary] = useState("");
  const [stackingStage, setStackingStage] = useState<"" | StackingStage>(defaultStackingStage ?? "");
  const [firingShiftAnchorDate, setFiringShiftAnchorDate] = useState("");
  const [firingShiftAnchorType, setFiringShiftAnchorType] = useState<"" | ShiftType>("");
  const [designation, setDesignation] = useState("");
  const [isOfficeStaff, setIsOfficeStaff] = useState(defaultIsOfficeStaff ?? false);
  const [contractors, setContractors] = useState<Person[]>([]);
  const [loading, setLoading] = useState(false);
  const { t } = useTranslation();
  const personTypeMeta = usePersonTypeMeta();
  const workTypeLabels = useWorkTypeLabels();

  const meta = personTypeMeta[type];

  useEffect(() => {
    if (type !== "WORKER" && type !== "HELPER") return;
    api.people.list("LABOUR_CONTRACTOR").then(setContractors).catch(console.error);
  }, [type]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setLoading(true);
    try {
      await api.people.create({
        type,
        name: name.trim(),
        phone: phone || undefined,
        address: address || undefined,
        idNumber: idNumber || undefined,
        dailyWage: meta.hasWage && dailyWage ? Number(dailyWage) : undefined,
        ratePerThousand: meta.hasWage && ratePerThousand ? Number(ratePerThousand) : undefined,
        vehicleNumber: type === "DRIVER" && vehicleNumber ? vehicleNumber : undefined,
        ratePerTrolley: type === "DRIVER" && ratePerTrolley ? Number(ratePerTrolley) : undefined,
        khetArea: type === "LANDOWNER" && khetArea ? Number(khetArea) : undefined,
        khetAreaUnit: type === "LANDOWNER" ? khetAreaUnit : undefined,
        khetLocation: type === "LANDOWNER" && khetLocation ? khetLocation : undefined,
        agreedDepthFeet: type === "LANDOWNER" && agreedDepthFeet ? Number(agreedDepthFeet) : undefined,
        contractorId: (type === "WORKER" || type === "HELPER") && contractorId ? contractorId : undefined,
        workType: type === "LABOUR_CONTRACTOR" && workType ? workType : undefined,
        payType:
          (type === "WORKER" || type === "HELPER" || type === "LABOUR_CONTRACTOR") && payType ? payType : undefined,
        commissionPerThousand:
          type === "LABOUR_CONTRACTOR" && commissionPerThousand ? Number(commissionPerThousand) : undefined,
        bharaiContractorId: (type === "WORKER" || type === "HELPER") && bharaiContractorId ? bharaiContractorId : undefined,
        nikasiContractorId: (type === "WORKER" || type === "HELPER") && nikasiContractorId ? nikasiContractorId : undefined,
        monthlySalary:
          (type === "WORKER" ||
            type === "HELPER" ||
            type === "LABOUR_CONTRACTOR" ||
            type === "FITTER" ||
            type === "MUNIM" ||
            type === "CHOWKIDAR" ||
            type === "DRIVER") &&
          monthlySalary
            ? Number(monthlySalary)
            : undefined,
        stackingStage:
          (type === "WORKER" || type === "HELPER" || type === "LABOUR_CONTRACTOR") && stackingStage
            ? stackingStage
            : undefined,
        firingShiftAnchorDate: type === "FITTER" && firingShiftAnchorDate ? firingShiftAnchorDate : undefined,
        firingShiftAnchorType: type === "FITTER" && firingShiftAnchorType ? firingShiftAnchorType : undefined,
        designation:
          (type === "MUNIM" || type === "CHOWKIDAR" || type === "HELPER" || type === "DRIVER") && designation
            ? designation
            : undefined,
        isOfficeStaff: (type === "HELPER" || type === "DRIVER") && isOfficeStaff ? true : undefined,
      });
      onCreated();
      onClose();
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <Card className="w-full max-w-sm">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-ink-primary">{t("people.addPerson")}</h3>
          <button onClick={onClose} className="text-ink-muted hover:text-ink-primary">
            <X className="h-4 w-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex max-h-[70vh] flex-col gap-3 overflow-y-auto">
          <select value={type} onChange={(e) => setType(e.target.value as PersonType)} className={inputClass}>
            {PERSON_TYPES.map((pt) => (
              <option key={pt} value={pt}>
                {personTypeMeta[pt].label}
              </option>
            ))}
          </select>

          <input required placeholder={t("common.name")} value={name} onChange={(e) => setName(e.target.value)} className={inputClass} />
          <input placeholder={t("common.phone")} value={phone} onChange={(e) => setPhone(e.target.value)} className={inputClass} />
          <input placeholder={t("people.address")} value={address} onChange={(e) => setAddress(e.target.value)} className={inputClass} />
          <input
            placeholder={t("people.aadharIdNumberPlaceholder")}
            value={idNumber}
            onChange={(e) => setIdNumber(e.target.value)}
            className={inputClass}
          />

          {meta.hasWage && (
            <>
              <input
                type="number"
                placeholder={t("people.dailyWagePlaceholder")}
                value={dailyWage}
                onChange={(e) => setDailyWage(e.target.value)}
                className={inputClass}
              />
              <input
                type="number"
                placeholder={t("people.ratePerThousandPlaceholder")}
                value={ratePerThousand}
                onChange={(e) => setRatePerThousand(e.target.value)}
                className={inputClass}
              />
            </>
          )}

          {(type === "WORKER" || type === "HELPER") && (
            <select value={contractorId} onChange={(e) => setContractorId(e.target.value)} className={inputClass}>
              <option value="">{t("people.thekedarOptional")}</option>
              {contractors.map((c) => (
                <option key={c._id} value={c._id}>
                  {c.name}
                </option>
              ))}
            </select>
          )}

          {(type === "WORKER" || type === "HELPER" || type === "LABOUR_CONTRACTOR") && (
            <select value={payType} onChange={(e) => setPayType(e.target.value as "" | PayType)} className={inputClass}>
              <option value="">{t("people.payTypeOptional")}</option>
              <option value="MONTHLY">{t("people.monthlySalaryOption")}</option>
              <option value="PER_THOUSAND">{t("people.perThousandBricksOption")}</option>
            </select>
          )}

          {(type === "WORKER" ||
            type === "HELPER" ||
            type === "LABOUR_CONTRACTOR" ||
            type === "FITTER" ||
            type === "MUNIM" ||
            type === "CHOWKIDAR" ||
            type === "DRIVER") && (
            <input
              type="number"
              placeholder={t("people.monthlySalaryPlaceholder")}
              value={monthlySalary}
              onChange={(e) => setMonthlySalary(e.target.value)}
              className={inputClass}
            />
          )}

          {(type === "MUNIM" || type === "CHOWKIDAR" || type === "HELPER" || type === "DRIVER") && (
            <input
              placeholder={t("people.designationPlaceholder")}
              value={designation}
              onChange={(e) => setDesignation(e.target.value)}
              className={inputClass}
            />
          )}

          {(type === "HELPER" || type === "DRIVER") && (
            <label className="flex items-center gap-2 text-sm text-ink-secondary">
              <input type="checkbox" checked={isOfficeStaff} onChange={(e) => setIsOfficeStaff(e.target.checked)} />
              {t("people.officeStaffCheckboxLabel")}
            </label>
          )}

          {(type === "WORKER" || type === "HELPER") && (
            <select
              value={bharaiContractorId}
              onChange={(e) => setBharaiContractorId(e.target.value)}
              className={inputClass}
            >
              <option value="">{t("people.bharaiThekedarOptional")}</option>
              {contractors.map((c) => (
                <option key={c._id} value={c._id}>
                  {c.name}
                </option>
              ))}
            </select>
          )}

          {(type === "WORKER" || type === "HELPER" || type === "LABOUR_CONTRACTOR") && (
            <select
              value={stackingStage}
              onChange={(e) => setStackingStage(e.target.value as "" | StackingStage)}
              className={inputClass}
            >
              <option value="">{t("people.bharaiStageOptional")}</option>
              <option value="TRANSPORT">{t("people.stage1GroundLifting")}</option>
              <option value="CHAMBER_STACKING">{t("people.stage2ChamberStacking")}</option>
            </select>
          )}

          {(type === "WORKER" || type === "HELPER") && (
            <select
              value={nikasiContractorId}
              onChange={(e) => setNikasiContractorId(e.target.value)}
              className={inputClass}
            >
              <option value="">{t("people.nikasiThekedarOptional")}</option>
              {contractors.map((c) => (
                <option key={c._id} value={c._id}>
                  {c.name}
                </option>
              ))}
            </select>
          )}

          {type === "LABOUR_CONTRACTOR" && (
            <>
              <select value={workType} onChange={(e) => setWorkType(e.target.value as "" | WorkType)} className={inputClass}>
                <option value="">{t("people.workTypeThekedarOptional")}</option>
                {(Object.entries(workTypeLabels) as [WorkType, string][]).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
              <input
                type="number"
                placeholder={t("people.commissionPerThousandPlaceholder")}
                value={commissionPerThousand}
                onChange={(e) => setCommissionPerThousand(e.target.value)}
                className={inputClass}
              />
            </>
          )}

          {type === "FITTER" && (
            <>
              <p className="text-sm text-ink-muted">
                {t("people.firingRotationHint")}
              </p>
              <div className="flex gap-2">
                <input
                  type="date"
                  value={firingShiftAnchorDate}
                  onChange={(e) => setFiringShiftAnchorDate(e.target.value)}
                  className={inputClass}
                />
                <select
                  value={firingShiftAnchorType}
                  onChange={(e) => setFiringShiftAnchorType(e.target.value as "" | ShiftType)}
                  className={inputClass}
                >
                  <option value="">{t("people.startsOn")}</option>
                  <option value="DAY">{t("people.dayBlock")}</option>
                  <option value="NIGHT">{t("people.nightBlock")}</option>
                </select>
              </div>
            </>
          )}

          {type === "DRIVER" && (
            <>
              <input
                placeholder={t("people.vehicleTractorNumber")}
                value={vehicleNumber}
                onChange={(e) => setVehicleNumber(e.target.value)}
                className={inputClass}
              />
              <input
                type="number"
                placeholder={t("people.ratePerTrolleyTrip")}
                value={ratePerTrolley}
                onChange={(e) => setRatePerTrolley(e.target.value)}
                className={inputClass}
              />
            </>
          )}

          {type === "LANDOWNER" && (
            <>
              <input
                placeholder={t("people.khetLocation")}
                value={khetLocation}
                onChange={(e) => setKhetLocation(e.target.value)}
                className={inputClass}
              />
              <div className="flex gap-2">
                <input
                  type="number"
                  placeholder={t("people.khetArea")}
                  value={khetArea}
                  onChange={(e) => setKhetArea(e.target.value)}
                  className={inputClass}
                />
                <select value={khetAreaUnit} onChange={(e) => setKhetAreaUnit(e.target.value)} className={inputClass}>
                  <option value="bigha">{t("people.bigha")}</option>
                  <option value="acre">{t("people.acre")}</option>
                </select>
              </div>
              <input
                type="number"
                placeholder={t("people.agreedDigDepthLimit")}
                value={agreedDepthFeet}
                onChange={(e) => setAgreedDepthFeet(e.target.value)}
                className={inputClass}
              />
            </>
          )}

          <Button type="submit" disabled={loading} className="mt-1 w-full">
            {t("common.add")}
          </Button>
        </form>
      </Card>
    </div>
  );
}
