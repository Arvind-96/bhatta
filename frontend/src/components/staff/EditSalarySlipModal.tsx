import { FormEvent, useState } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api";
import { useTranslation } from "@/hooks/useTranslation";
import type { SalarySlip } from "@/types";

const inputClass =
  "h-11 rounded-xl border border-border bg-ink-primary/5 px-3 text-sm text-ink-primary outline-none focus:ring-2 focus:ring-series-1";

interface EditSalarySlipModalProps {
  slip: SalarySlip;
  onClose: () => void;
  onSaved: () => void;
}

// A manual correction to an already-generated slip's final numbers (see
// salary.service.ts's updateSalarySlip) — for when the automatic
// attendance/advance-based calculation needs a one-off override rather
// than a full regenerate. Does not touch the PDF, which stays as
// originally generated.
export function EditSalarySlipModal({ slip, onClose, onSaved }: EditSalarySlipModalProps) {
  const { t } = useTranslation();
  const [deductions, setDeductions] = useState(String(slip.deductions));
  const [advanceDeducted, setAdvanceDeducted] = useState(String(slip.advanceDeducted));
  const [netSalary, setNetSalary] = useState(String(slip.netSalary));
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      await api.salary.update(slip._id, {
        deductions: Number(deductions),
        advanceDeducted: Number(advanceDeducted),
        netSalary: Number(netSalary),
      });
      onSaved();
      onClose();
    } finally {
      setSaving(false);
    }
  }

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink-primary/50 p-4 backdrop-blur-sm">
      <Card className="w-full max-w-sm hover:translate-y-0">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-ink-primary">{t("salary.editSlipTitle")}</h3>
          <button onClick={onClose} className="text-ink-muted hover:text-ink-primary">
            <X className="h-4 w-4" />
          </button>
        </div>
        <p className="mb-3 text-sm text-ink-muted">{t("salary.editSlipNote")}</p>
        <form onSubmit={handleSubmit} className="flex flex-col gap-2.5">
          <label className="flex flex-col gap-1">
            <span className="text-xs text-ink-muted">{t("salary.deductions")}</span>
            <input type="number" value={deductions} onChange={(e) => setDeductions(e.target.value)} className={inputClass} />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs text-ink-muted">{t("salary.advanceDeductedLabel")}</span>
            <input type="number" value={advanceDeducted} onChange={(e) => setAdvanceDeducted(e.target.value)} className={inputClass} />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs text-ink-muted">{t("salary.netSalary")}</span>
            <input required type="number" value={netSalary} onChange={(e) => setNetSalary(e.target.value)} className={inputClass} />
          </label>
          <Button type="submit" disabled={saving} className="mt-1">
            {t("common.saveChanges")}
          </Button>
        </form>
      </Card>
    </div>,
    document.body
  );
}
