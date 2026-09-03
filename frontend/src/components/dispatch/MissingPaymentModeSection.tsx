import { useState } from "react";
import { AlertTriangle, ChevronDown, ChevronUp } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api";
import { useTranslation } from "@/hooks/useTranslation";
import { formatINR } from "@/lib/utils";
import { PaymentSplitFields, isPaymentSplitMismatched } from "@/components/shared/PaymentSplitFields";
import type { Dispatch as DispatchEntry, PaymentMode } from "@/types";

const inputClass =
  "h-9 rounded-lg border border-border bg-ink-primary/5 px-2.5 text-sm text-ink-primary outline-none focus:ring-2 focus:ring-series-1";

interface Draft {
  paymentMode: PaymentMode | "";
  cashAmount: string;
  onlineAmount: string;
}

// Every dispatch created before the "How was this paid?" field existed on
// the Log Dispatch form has paymentMode sitting permanently null — that
// history can't be reconstructed automatically (only whoever handled each
// sale knows how it was actually paid), so this gives the admin a fast,
// one-row-at-a-time way to fill it in without opening the full Edit modal
// 20+ times. Collapsed by default (a big list of unknowns isn't something
// to lead with), and each row disappears from here the moment it's saved
// since dispatches (the parent list) refetches and this component is
// re-derived from it.
export function MissingPaymentModeSection({ dispatches, onUpdated }: { dispatches: DispatchEntry[]; onUpdated: () => void }) {
  const { t } = useTranslation();
  const [expanded, setExpanded] = useState(false);
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const [savingId, setSavingId] = useState<string | null>(null);
  const [rowError, setRowError] = useState<{ id: string; message: string } | null>(null);

  const missing = dispatches.filter((d) => !d.paymentMode);
  if (missing.length === 0) return null;

  function draftFor(id: string): Draft {
    return drafts[id] ?? { paymentMode: "", cashAmount: "", onlineAmount: "" };
  }

  function updateDraft(id: string, patch: Partial<Draft>) {
    setDrafts((s) => ({ ...s, [id]: { ...draftFor(id), ...patch } }));
  }

  async function saveRow(d: DispatchEntry) {
    const draft = draftFor(d._id);
    if (!draft.paymentMode) return;
    if (isPaymentSplitMismatched(draft.paymentMode, d.amount, draft.cashAmount, draft.onlineAmount)) {
      setRowError({ id: d._id, message: t("payment.splitMismatch", { total: d.amount.toLocaleString("en-IN") }) });
      return;
    }
    setRowError(null);
    setSavingId(d._id);
    try {
      await api.dispatch.update(d._id, {
        paymentMode: draft.paymentMode,
        cashAmount: draft.paymentMode === "CASH_AND_ONLINE" ? Number(draft.cashAmount) : undefined,
        onlineAmount: draft.paymentMode === "CASH_AND_ONLINE" ? Number(draft.onlineAmount) : undefined,
      });
      setDrafts((s) => {
        const next = { ...s };
        delete next[d._id];
        return next;
      });
      onUpdated();
    } catch (err) {
      setRowError({ id: d._id, message: err instanceof Error ? err.message : t("common.somethingWentWrong") });
    } finally {
      setSavingId(null);
    }
  }

  return (
    <Card>
      <button
        type="button"
        onClick={() => setExpanded((e) => !e)}
        className="flex w-full items-center justify-between text-left"
      >
        <span className="flex items-center gap-2 text-sm font-medium text-status-warning">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          {t("dispatch.missingPaymentModeCount", { count: missing.length })}
        </span>
        {expanded ? <ChevronUp className="h-4 w-4 text-ink-muted" /> : <ChevronDown className="h-4 w-4 text-ink-muted" />}
      </button>

      {expanded && (
        <div className="mt-3 space-y-2 border-t border-border pt-3">
          <p className="text-xs text-ink-muted">{t("dispatch.missingPaymentModeHint")}</p>
          {missing.map((d) => {
            const draft = draftFor(d._id);
            const saving = savingId === d._id;
            return (
              <div key={d._id} className="rounded-lg border border-border px-3 py-2">
                <div className="flex flex-wrap items-center gap-2">
                  <div className="min-w-[180px] flex-1">
                    <p className="text-sm text-ink-primary">{d.customerName}</p>
                    <p className="text-xs text-ink-muted">
                      {d.slipNumber} · {new Date(d.dispatchedOn).toLocaleDateString("en-IN")} · ₹{formatINR(d.amount)}
                    </p>
                  </div>
                  <select
                    value={draft.paymentMode}
                    onChange={(e) => updateDraft(d._id, { paymentMode: e.target.value as PaymentMode })}
                    className={inputClass}
                  >
                    <option value="">{t("common.select")}</option>
                    <option value="CASH">{t("dispatch.paymentCash")}</option>
                    <option value="BANK">{t("dispatch.paymentBankTransfer")}</option>
                    <option value="UPI">{t("dispatch.paymentUpi")}</option>
                    <option value="GST_INVOICE">{t("dispatch.paymentGstInvoice")}</option>
                    <option value="CASH_AND_ONLINE">{t("common.paymentModeCashAndOnline")}</option>
                  </select>
                  <Button size="sm" disabled={!draft.paymentMode || saving} onClick={() => saveRow(d)}>
                    {saving ? t("common.saving") : t("common.save")}
                  </Button>
                </div>
                {draft.paymentMode === "CASH_AND_ONLINE" && (
                  <div className="mt-2">
                    <PaymentSplitFields
                      totalAmount={d.amount}
                      cashAmount={draft.cashAmount}
                      onlineAmount={draft.onlineAmount}
                      onCashAmountChange={(v) => updateDraft(d._id, { cashAmount: v })}
                      onOnlineAmountChange={(v) => updateDraft(d._id, { onlineAmount: v })}
                      inputClassName={inputClass}
                    />
                  </div>
                )}
                {rowError?.id === d._id && <p className="mt-1 text-xs text-status-critical">{rowError.message}</p>}
              </div>
            );
          })}
        </div>
      )}
    </Card>
  );
}
