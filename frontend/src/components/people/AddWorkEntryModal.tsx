import { FormEvent, useState } from "react";
import { X, ClipboardList } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api";
import type { Person, WorkType } from "@/types";
import { useTranslation } from "@/hooks/useTranslation";
import { LOGGABLE_WORK_TYPES, useWorkTypeLabels } from "./personTypes";

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

interface AddWorkEntryModalProps {
  // Fixed labourer (used from their own profile) — hides the picker.
  personId?: string;
  // Pickable labourers (used from a thekedar's profile) — shown as a
  // select when personId isn't already fixed.
  labourers?: Person[];
  onClose: () => void;
  onCreated: () => void;
}

// Logs one day's production for a labourer against one of the six named
// work categories — used both from a labourer's own profile (personId
// fixed) and from their thekedar's profile (pick which labourer). Posts
// straight to work-entries, which auto-updates the ledger and both
// profiles' totals live — no separate sync step.
export function AddWorkEntryModal({ personId, labourers, onClose, onCreated }: AddWorkEntryModalProps) {
  const { t } = useTranslation();
  const workTypeLabels = useWorkTypeLabels();
  const [selectedPersonId, setSelectedPersonId] = useState(personId ?? "");
  const [workType, setWorkType] = useState<"" | WorkType>("");
  const [quantity, setQuantity] = useState("");
  const [ratePerThousand, setRatePerThousand] = useState("");
  const [notes, setNotes] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!selectedPersonId || !workType || !quantity || !ratePerThousand) return;
    setLoading(true);
    try {
      await api.workEntries.create({
        personId: selectedPersonId,
        workType,
        quantity: Number(quantity),
        ratePerThousand: Number(ratePerThousand),
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
      <Card className="w-full max-w-md hover:translate-y-0">
        <div className="mb-5 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="gradient-brand flex h-9 w-9 items-center justify-center rounded-xl shadow-glow-1">
              <ClipboardList className="h-4 w-4 text-white" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-ink-primary">{t("people.addWorkEntry")}</h3>
              <p className="text-sm text-ink-muted">{t("people.logDaysProduction")}</p>
            </div>
          </div>
          <button onClick={onClose} className="text-ink-muted hover:text-ink-primary">
            <X className="h-4 w-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-3">
          {!personId && labourers && (
            <Field label={t("people.labourer")}>
              <select required value={selectedPersonId} onChange={(e) => setSelectedPersonId(e.target.value)} className={inputClass}>
                <option value="">{t("people.selectLabourer")}</option>
                {labourers.map((l) => (
                  <option key={l._id} value={l._id}>
                    {l.name}
                  </option>
                ))}
              </select>
            </Field>
          )}

          <Field label={t("people.workTypeFieldLabel")}>
            <select required value={workType} onChange={(e) => setWorkType(e.target.value as "" | WorkType)} className={inputClass}>
              <option value="">{t("people.selectWorkType")}</option>
              {LOGGABLE_WORK_TYPES.map((value) => (
                <option key={value} value={value}>
                  {workTypeLabels[value]}
                </option>
              ))}
            </select>
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label={t("people.quantityUnitsBricks")}>
              <input required type="number" min={0} placeholder={t("people.egPlaceholder", { value: 200 })} value={quantity} onChange={(e) => setQuantity(e.target.value)} className={inputClass} />
            </Field>
            <Field label={t("people.ratePerThousandShort")}>
              <input
                required
                type="number"
                min={0}
                placeholder={t("people.egPlaceholder", { value: 420 })}
                value={ratePerThousand}
                onChange={(e) => setRatePerThousand(e.target.value)}
                className={inputClass}
              />
            </Field>
          </div>

          {quantity && ratePerThousand && (
            <p className="text-sm text-ink-muted">
              {t("people.wageAmount", {
                amount: ((Number(quantity) / 1000) * Number(ratePerThousand)).toLocaleString("en-IN", { maximumFractionDigits: 2 }),
              })}
            </p>
          )}

          <Field label={t("common.notesOptional")}>
            <input placeholder={t("common.notes")} value={notes} onChange={(e) => setNotes(e.target.value)} className={inputClass} />
          </Field>

          <Button type="submit" disabled={loading} className="mt-1 w-full">
            {t("people.saveEntry")}
          </Button>
        </form>
      </Card>
    </div>
  );
}
