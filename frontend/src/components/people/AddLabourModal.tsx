import { FormEvent, useEffect, useState } from "react";
import { X, UserPlus, Plus, Trash2 } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api";
import type { FamilyRelation, InventoryItem, PayType, Person, Sex, WorkType } from "@/types";
import { useTranslation } from "@/hooks/useTranslation";
import { useFamilyRelationLabels } from "./personTypes";

const inputClass =
  "h-11 w-full rounded-xl border border-border bg-ink-primary/5 px-3.5 text-sm text-ink-primary outline-none transition-shadow focus:ring-2 focus:ring-series-1";

function getWorkTypeOptions(t: (key: string) => string): { value: WorkType; label: string }[] {
  return [
    { value: "PATHAI", label: t("people.workTypePathai") },
    { value: "BHARAI_TRANSPORT", label: t("people.workTypeBharaiTransport") },
    { value: "PAKAYI", label: t("people.workTypePakayi") },
    { value: "NIKASI", label: t("people.workTypeNikasi") },
    { value: "LOADING", label: t("people.workTypeLoading") },
    { value: "BHARAI_CHAMBER_STACKING", label: t("people.workTypeBharaiChamberStacking") },
  ];
}

interface AddLabourModalProps {
  defaultContractorId?: string;
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

interface FamilyDraft {
  name: string;
  relation: FamilyRelation;
  age: string;
  sex: "" | Sex;
  isWorking: boolean;
}

const emptyFamilyDraft: FamilyDraft = { name: "", relation: "SPOUSE", age: "", sex: "", isWorking: false };

interface SupplyDraft {
  itemId: string;
  quantity: string;
}

const emptySupplyDraft: SupplyDraft = { itemId: "", quantity: "" };

// The simplified, purpose-built "Add Labour" form for the People page's
// Labour tab (and a thekedar's own "Add labour" button) — just the fields
// that matter for a labourer's record, not the full generic AddPersonModal
// (which stays as-is for the other person types/entry points that need its
// extra module-specific fields).
export function AddLabourModal({ defaultContractorId, onClose, onCreated }: AddLabourModalProps) {
  const [name, setName] = useState("");
  const [age, setAge] = useState("");
  const [sex, setSex] = useState<"" | Sex>("");
  const [phone, setPhone] = useState("");
  const [idNumber, setIdNumber] = useState("");
  const [workType, setWorkType] = useState<"" | WorkType>("");
  const [contractorId, setContractorId] = useState(defaultContractorId ?? "");
  const [payType, setPayType] = useState<"" | PayType>("");
  const [monthlySalary, setMonthlySalary] = useState("");
  const [ratePerThousand, setRatePerThousand] = useState("");
  const [contractors, setContractors] = useState<Person[]>([]);
  const [loading, setLoading] = useState(false);

  const [familyDrafts, setFamilyDrafts] = useState<FamilyDraft[]>([]);
  const [inventoryItems, setInventoryItems] = useState<InventoryItem[]>([]);
  const [supplyDrafts, setSupplyDrafts] = useState<SupplyDraft[]>([]);
  const { t } = useTranslation();
  const WORK_TYPE_OPTIONS = getWorkTypeOptions(t);
  const familyRelationLabels = useFamilyRelationLabels();

  useEffect(() => {
    api.people.list("LABOUR_CONTRACTOR").then(setContractors).catch(console.error);
    api.inventory.list().then(setInventoryItems).catch(console.error);
  }, []);

  function updateFamilyDraft(index: number, patch: Partial<FamilyDraft>) {
    setFamilyDrafts((rows) => rows.map((row, i) => (i === index ? { ...row, ...patch } : row)));
  }

  function updateSupplyDraft(index: number, patch: Partial<SupplyDraft>) {
    setSupplyDrafts((rows) => rows.map((row, i) => (i === index ? { ...row, ...patch } : row)));
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setLoading(true);
    try {
      const person = await api.people.create({
        type: "WORKER",
        name: name.trim(),
        age: age ? Number(age) : undefined,
        sex: sex || undefined,
        phone: phone || undefined,
        idNumber: idNumber || undefined,
        workType: workType || undefined,
        contractorId: contractorId || undefined,
        payType: payType || undefined,
        monthlySalary: payType === "MONTHLY" && monthlySalary ? Number(monthlySalary) : undefined,
        ratePerThousand: payType === "PER_THOUSAND" && ratePerThousand ? Number(ratePerThousand) : undefined,
      });

      for (const draft of familyDrafts) {
        if (!draft.name.trim()) continue;
        await api.familyMembers.create({
          headPersonId: person._id,
          name: draft.name.trim(),
          relation: draft.relation,
          age: draft.age ? Number(draft.age) : undefined,
          sex: draft.sex || undefined,
          isWorking: draft.isWorking,
        });
      }

      for (const draft of supplyDrafts) {
        if (!draft.itemId || !draft.quantity) continue;
        await api.suppliedItems.create({
          personId: person._id,
          itemId: draft.itemId,
          quantity: Number(draft.quantity),
        });
      }

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
              <UserPlus className="h-4 w-4 text-white" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-ink-primary">{t("people.addLabourModalTitle")}</h3>
              <p className="text-sm text-ink-muted">{t("people.newLabourRecord")}</p>
            </div>
          </div>
          <button onClick={onClose} className="text-ink-muted hover:text-ink-primary">
            <X className="h-4 w-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex max-h-[70vh] flex-col gap-3 overflow-y-auto pr-1">
          <Field label={t("common.name")}>
            <input required placeholder={t("people.labourNamePlaceholder")} value={name} onChange={(e) => setName(e.target.value)} className={inputClass} />
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label={t("people.age")}>
              <input type="number" min={0} placeholder={t("people.age")} value={age} onChange={(e) => setAge(e.target.value)} className={inputClass} />
            </Field>
            <Field label={t("people.sex")}>
              <select value={sex} onChange={(e) => setSex(e.target.value as "" | Sex)} className={inputClass}>
                <option value="">{t("common.select")}</option>
                <option value="MALE">{t("people.male")}</option>
                <option value="FEMALE">{t("people.female")}</option>
                <option value="OTHER">{t("people.other")}</option>
              </select>
            </Field>
          </div>

          <Field label={t("people.mobileNumber")}>
            <input placeholder={t("people.tenDigitMobilePlaceholder")} value={phone} onChange={(e) => setPhone(e.target.value)} className={inputClass} />
          </Field>

          <Field label={t("people.aadhaarCardNumber")}>
            <input placeholder={t("people.aadhaarNumberPlaceholder")} value={idNumber} onChange={(e) => setIdNumber(e.target.value)} className={inputClass} />
          </Field>

          <Field label={t("people.workTypeFieldLabel")}>
            <select value={workType} onChange={(e) => setWorkType(e.target.value as "" | WorkType)} className={inputClass}>
              <option value="">{t("people.selectWorkType")}</option>
              {WORK_TYPE_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </Field>

          <Field label={t("people.contractorAffiliationLabel")}>
            <select value={contractorId} onChange={(e) => setContractorId(e.target.value)} className={inputClass}>
              <option value="">{t("people.independentNoThekedar")}</option>
              {contractors.map((c) => (
                <option key={c._id} value={c._id}>
                  {c.name}
                </option>
              ))}
            </select>
          </Field>

          <Field label={t("common.paymentMode")}>
            <select value={payType} onChange={(e) => setPayType(e.target.value as "" | PayType)} className={inputClass}>
              <option value="">{t("people.selectPaymentMode")}</option>
              <option value="MONTHLY">{t("people.perMonthSalaryOption")}</option>
              <option value="PER_THOUSAND">{t("people.perThousandBricksOption")}</option>
            </select>
          </Field>

          {payType === "MONTHLY" && (
            <Field label={t("people.monthlySalaryPlaceholder")}>
              <input
                type="number"
                placeholder={t("people.egPlaceholder", { value: "9000" })}
                value={monthlySalary}
                onChange={(e) => setMonthlySalary(e.target.value)}
                className={inputClass}
              />
            </Field>
          )}
          {payType === "PER_THOUSAND" && (
            <Field label={t("people.ratePerThousandBricksLabel")}>
              <input
                type="number"
                placeholder={t("people.egPlaceholder", { value: "420" })}
                value={ratePerThousand}
                onChange={(e) => setRatePerThousand(e.target.value)}
                className={inputClass}
              />
            </Field>
          )}

          <div className="mt-1 border-t border-border pt-3">
            <div className="mb-2 flex items-center justify-between">
              <p className="text-xs font-semibold uppercase tracking-wide text-ink-muted">
                {t("people.familyMembers")} <span className="font-normal normal-case text-ink-muted">({t("common.optional")})</span>
              </p>
              <button
                type="button"
                onClick={() => setFamilyDrafts((rows) => [...rows, { ...emptyFamilyDraft }])}
                className="flex items-center gap-1 text-xs font-medium text-series-1 hover:underline"
              >
                <Plus className="h-3.5 w-3.5" /> {t("people.addFamilyMember")}
              </button>
            </div>

            <div className="flex flex-col gap-3">
              {familyDrafts.map((draft, index) => (
                <div key={index} className="rounded-xl border border-border p-3">
                  <div className="mb-2 flex items-center justify-between">
                    <span className="text-xs font-medium text-ink-muted">{t("people.familyMemberNumber", { number: index + 1 })}</span>
                    <button
                      type="button"
                      onClick={() => setFamilyDrafts((rows) => rows.filter((_, i) => i !== index))}
                      className="text-ink-muted hover:text-status-critical"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                  <div className="flex flex-col gap-3">
                    <Field label={t("common.name")}>
                      <input
                        placeholder={t("people.familyMemberNamePlaceholder")}
                        value={draft.name}
                        onChange={(e) => updateFamilyDraft(index, { name: e.target.value })}
                        className={inputClass}
                      />
                    </Field>
                    <div className="grid grid-cols-2 gap-3">
                      <Field label={t("people.relation")}>
                        <select
                          value={draft.relation}
                          onChange={(e) => updateFamilyDraft(index, { relation: e.target.value as FamilyRelation })}
                          className={inputClass}
                        >
                          {(Object.entries(familyRelationLabels) as [FamilyRelation, string][]).map(([value, label]) => (
                            <option key={value} value={value}>
                              {label}
                            </option>
                          ))}
                        </select>
                      </Field>
                      <Field label={t("people.age")}>
                        <input
                          type="number"
                          min={0}
                          placeholder={t("people.age")}
                          value={draft.age}
                          onChange={(e) => updateFamilyDraft(index, { age: e.target.value })}
                          className={inputClass}
                        />
                      </Field>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <Field label={t("people.sex")}>
                        <select
                          value={draft.sex}
                          onChange={(e) => updateFamilyDraft(index, { sex: e.target.value as "" | Sex })}
                          className={inputClass}
                        >
                          <option value="">{t("common.select")}</option>
                          <option value="MALE">{t("people.male")}</option>
                          <option value="FEMALE">{t("people.female")}</option>
                          <option value="OTHER">{t("people.other")}</option>
                        </select>
                      </Field>
                      <label className="flex items-center gap-2 self-end pb-2.5 text-sm text-ink-secondary">
                        <input
                          type="checkbox"
                          checked={draft.isWorking}
                          onChange={(e) => updateFamilyDraft(index, { isWorking: e.target.checked })}
                        />
                        {t("people.alsoWorksAsLabour")}
                      </label>
                    </div>
                    {draft.isWorking && draft.name.trim() && (
                      <p className="text-sm text-ink-muted">
                        {t("people.separateLabourProfileNote", { name: draft.name.trim() })}
                      </p>
                    )}
                  </div>
                </div>
              ))}
              {familyDrafts.length === 0 && (
                <p className="text-sm text-ink-muted">{t("people.noFamilyMembersYet")}</p>
              )}
            </div>
          </div>

          <div className="border-t border-border pt-3">
            <div className="mb-2 flex items-center justify-between">
              <p className="text-xs font-semibold uppercase tracking-wide text-ink-muted">
                {t("people.inventoryIssued")} <span className="font-normal normal-case text-ink-muted">({t("common.optional")})</span>
              </p>
              <button
                type="button"
                onClick={() => setSupplyDrafts((rows) => [...rows, { ...emptySupplyDraft }])}
                className="flex items-center gap-1 text-xs font-medium text-series-1 hover:underline"
              >
                <Plus className="h-3.5 w-3.5" /> {t("people.addItem")}
              </button>
            </div>

            <div className="flex flex-col gap-2">
              {supplyDrafts.map((draft, index) => (
                <div key={index} className="flex items-end gap-2">
                  <div className="flex-1">
                    <Field label={t("people.item")}>
                      <select
                        value={draft.itemId}
                        onChange={(e) => updateSupplyDraft(index, { itemId: e.target.value })}
                        className={inputClass}
                      >
                        <option value="">{t("people.selectItem")}</option>
                        {inventoryItems.map((i) => (
                          <option key={i._id} value={i._id}>
                            {t("people.itemStockOption", { name: i.name, quantity: i.quantity, unit: i.unit })}
                          </option>
                        ))}
                      </select>
                    </Field>
                  </div>
                  <div className="w-28">
                    <Field label={t("common.quantity")}>
                      <input
                        type="number"
                        min={1}
                        placeholder={t("people.qtyShort")}
                        value={draft.quantity}
                        onChange={(e) => updateSupplyDraft(index, { quantity: e.target.value })}
                        className={inputClass}
                      />
                    </Field>
                  </div>
                  <button
                    type="button"
                    onClick={() => setSupplyDrafts((rows) => rows.filter((_, i) => i !== index))}
                    className="mb-0.5 h-11 shrink-0 text-ink-muted hover:text-status-critical"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))}
              {supplyDrafts.length === 0 && (
                <p className="text-sm text-ink-muted">{t("people.noInventoryItemsYet")}</p>
              )}
            </div>
          </div>

          <Button type="submit" disabled={loading} className="mt-2 w-full">
            {t("people.addLabourModalTitle")}
          </Button>
        </form>
      </Card>
    </div>
  );
}
