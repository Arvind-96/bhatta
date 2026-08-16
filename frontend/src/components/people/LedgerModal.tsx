import { FormEvent, useEffect, useRef, useState } from "react";
import { Wallet, X } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { api } from "@/lib/api";
import { useKilnEvent } from "@/hooks/useKilnEvent";
import type { LedgerCategory, LedgerEntry, LedgerPaymentMode, Person } from "@/types";
import { formatINR } from "@/lib/utils";
import { useTranslation } from "@/hooks/useTranslation";
import { PaymentSplitFields } from "@/components/shared/PaymentSplitFields";

interface LedgerModalProps {
  person: Person;
  onClose: () => void;
}

const quickButtonClass =
  "rounded-xl border border-border bg-ink-primary/5 px-3 py-3 text-xs font-medium text-ink-secondary transition-colors hover:bg-ink-primary/10 hover:text-ink-primary";

// Ledger behaviour is intentionally different for the two person kinds:
// a labourer (WORKER/HELPER) gets personal-circumstance quick actions
// (medical/festival advances) alongside their own wage; a thekedar
// (LABOUR_CONTRACTOR) is a business relationship, so instead it gets a
// lump-sum "Settlement payment" action and no medical/festival buttons.
export function LedgerModal({ person, onClose }: LedgerModalProps) {
  const { t } = useTranslation();
  const [entries, setEntries] = useState<LedgerEntry[]>([]);
  const [balance, setBalance] = useState(0);
  const [form, setForm] = useState({
    direction: "DUE" as "DUE" | "PAID",
    amount: "",
    reason: "",
    paymentMode: "CASH" as LedgerPaymentMode,
    cashAmount: "",
    onlineAmount: "",
    category: undefined as LedgerCategory | undefined,
  });
  const [loading, setLoading] = useState(false);
  const [formError, setFormError] = useState("");
  const amountRef = useRef<HTMLInputElement>(null);
  const isCustomer = person.type === "CUSTOMER";
  const isPartner = person.type === "PARTNER";
  const isContractor = person.type === "LABOUR_CONTRACTOR";
  const entityLabel = isContractor ? t("people.thekedarWord") : t("people.labourWord");

  async function refresh() {
    const [detail, ledger] = await Promise.all([api.people.get(person._id), api.people.listLedger(person._id)]);
    setBalance(detail.balance);
    setEntries(ledger);
  }

  useEffect(() => {
    refresh().catch(console.error);
  }, [person._id]);

  useKilnEvent("ledger:update", () => refresh());

  function fillQuickAction(next: Partial<typeof form>) {
    setForm((f) => ({ ...f, amount: "", ...next }));
    setFormError("");
    requestAnimationFrame(() => amountRef.current?.focus());
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!form.amount || Number(form.amount) <= 0) {
      setFormError(t("people.enterAmountGreaterThanZero"));
      amountRef.current?.focus();
      return;
    }
    if (!form.reason.trim()) {
      setFormError(t("people.enterReasonForEntry"));
      return;
    }
    setFormError("");
    setLoading(true);
    try {
      const usingSplit = form.direction === "PAID" && form.paymentMode === "CASH_AND_ONLINE";
      await api.people.addLedger(person._id, {
        direction: form.direction,
        amount: Number(form.amount),
        reason: form.reason,
        paymentMode: form.direction === "PAID" ? form.paymentMode : undefined,
        cashAmount: usingSplit ? Number(form.cashAmount) : undefined,
        onlineAmount: usingSplit ? Number(form.onlineAmount) : undefined,
        category: form.category,
      });
      setForm({ direction: "DUE", amount: "", reason: "", paymentMode: "CASH", cashAmount: "", onlineAmount: "", category: undefined });
      await refresh();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : t("people.failedToAddLedgerEntry"));
    } finally {
      setLoading(false);
    }
  }

  const balanceLabel = isCustomer
    ? balance > 0
      ? t("people.outstandingCreditCustomerOwes")
      : t("people.noOutstandingCredit")
    : balance < 0
    ? t("people.advanceOutstandingEntityOwes", { entity: entityLabel })
    : t("people.balanceDueYouOweEntity", { entity: entityLabel });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink-primary/50 p-4 backdrop-blur-sm">
      <Card className="w-full max-w-2xl hover:translate-y-0">
        <div className="mb-5 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="gradient-brand flex h-10 w-10 items-center justify-center rounded-xl shadow-glow-1">
              <Wallet className="h-5 w-5 text-white" />
            </div>
            <div>
              <h3 className="text-base font-semibold text-ink-primary">{person.name}</h3>
              <p className="text-sm text-ink-muted">
                {t("people.ledger")} {isContractor ? t("people.dotThekedarContractor") : !isCustomer && !isPartner ? t("people.dotLabour") : ""}
              </p>
            </div>
          </div>
          <button onClick={onClose} className="text-ink-muted hover:text-ink-primary">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="mb-5 rounded-xl border border-border bg-ink-primary/5 p-4">
          <p className="text-sm text-ink-muted">{balanceLabel}</p>
          <p className={`text-3xl font-semibold tabular-nums ${balance > 0 ? "text-status-critical" : balance < 0 ? "text-status-warning" : "text-status-good"}`}>
            ₹{formatINR(Math.abs(balance))}
          </p>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-muted">{t("people.quickActions")}</p>
            <div className={`grid gap-2 ${isCustomer || isPartner ? "grid-cols-1" : "grid-cols-2"}`}>
              {isCustomer ? (
                <button
                  type="button"
                  onClick={() => fillQuickAction({ direction: "PAID", reason: t("people.paymentReceived"), category: "SALE" })}
                  className={quickButtonClass}
                >
                  {t("people.recordPaymentReceived")}
                </button>
              ) : isPartner ? (
                <button
                  type="button"
                  onClick={() => fillQuickAction({ direction: "PAID", reason: t("people.reasonPartnerWithdrawal"), category: "OTHER" })}
                  className={quickButtonClass}
                >
                  {t("people.recordPartnerWithdrawal")}
                </button>
              ) : (
                <>
                  {person.monthlySalary != null && (
                    <button
                      type="button"
                      onClick={() =>
                        fillQuickAction({
                          direction: "DUE",
                          amount: String(person.monthlySalary),
                          reason: isContractor ? t("people.reasonMonthlyCommissionSalaryDue") : t("people.reasonMonthlySalaryDue"),
                          category: "SALARY",
                        })
                      }
                      className={quickButtonClass}
                    >
                      {isContractor ? t("people.salaryDueButtonContractor") : t("people.reasonMonthlySalaryDue")}
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() =>
                      fillQuickAction({
                        direction: "PAID",
                        reason: isContractor ? t("people.reasonAdvanceToThekedar") : t("people.reasonAdvancePeshgi"),
                        category: "ADVANCE",
                      })
                    }
                    className={quickButtonClass}
                  >
                    {t("people.advancePeshgiTitle")}
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      fillQuickAction({
                        direction: "PAID",
                        reason: isContractor ? t("people.reasonKharchiGivenToThekedar") : t("people.reasonKharchiWeeklyPettyCash"),
                        category: "KHARCHI",
                      })
                    }
                    className={quickButtonClass}
                  >
                    {t("people.kharchi")}
                  </button>
                  {isContractor ? (
                    <button
                      type="button"
                      onClick={() =>
                        fillQuickAction({
                          direction: "PAID",
                          reason: t("people.reasonSettlementPayment"),
                          category: "OTHER",
                        })
                      }
                      className={quickButtonClass}
                    >
                      {t("people.settlementPaymentButton")}
                    </button>
                  ) : (
                    <>
                      <button
                        type="button"
                        onClick={() =>
                          fillQuickAction({ direction: "PAID", reason: t("people.reasonMedicalInjuryAdvance"), category: "MEDICAL" })
                        }
                        className={quickButtonClass}
                      >
                        {t("people.medical")}
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          fillQuickAction({ direction: "PAID", reason: t("people.reasonTyoharFestivalAdvance"), category: "FESTIVAL" })
                        }
                        className={quickButtonClass}
                      >
                        {t("people.tyoharFestivalButton")}
                      </button>
                    </>
                  )}
                </>
              )}
            </div>

            <form onSubmit={handleSubmit} className="mt-4 flex flex-col gap-2.5">
              <div className="flex gap-2">
                <select
                  value={form.direction}
                  onChange={(e) => setForm((f) => ({ ...f, direction: e.target.value as "DUE" | "PAID" }))}
                  className="h-11 flex-1 rounded-xl border border-border bg-ink-primary/5 px-3 text-sm text-ink-primary outline-none focus:ring-2 focus:ring-series-1"
                >
                  <option value="DUE">{isCustomer ? t("people.saleCreditGiven") : t("people.dueOweEntity", { entity: entityLabel })}</option>
                  <option value="PAID">{isCustomer ? t("people.paymentReceived") : t("people.paidSettled")}</option>
                </select>
                {form.direction === "PAID" && !isCustomer && (
                  <select
                    value={form.paymentMode}
                    onChange={(e) => setForm((f) => ({ ...f, paymentMode: e.target.value as LedgerPaymentMode }))}
                    className="h-11 rounded-xl border border-border bg-ink-primary/5 px-3 text-sm text-ink-primary outline-none focus:ring-2 focus:ring-series-1"
                  >
                    <option value="CASH">{t("people.cash")}</option>
                    <option value="BANK">{t("people.bank")}</option>
                    <option value="UPI">{t("people.upi")}</option>
                    <option value="CASH_AND_ONLINE">{t("common.paymentModeCashAndOnline")}</option>
                  </select>
                )}
              </div>
              <input
                ref={amountRef}
                type="number"
                min={0}
                placeholder={t("people.amountRupees")}
                value={form.amount}
                onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))}
                className="h-11 rounded-xl border border-border bg-ink-primary/5 px-3 text-sm text-ink-primary outline-none focus:ring-2 focus:ring-series-1"
              />
              {form.direction === "PAID" && !isCustomer && form.paymentMode === "CASH_AND_ONLINE" && (
                <PaymentSplitFields
                  totalAmount={Number(form.amount) || 0}
                  cashAmount={form.cashAmount}
                  onlineAmount={form.onlineAmount}
                  onCashAmountChange={(v) => setForm((f) => ({ ...f, cashAmount: v }))}
                  onOnlineAmountChange={(v) => setForm((f) => ({ ...f, onlineAmount: v }))}
                  inputClassName="h-11 rounded-xl border border-border bg-ink-primary/5 px-3 text-sm text-ink-primary outline-none focus:ring-2 focus:ring-series-1"
                />
              )}
              {!isCustomer && !isPartner && (
                <select
                  value={form.category ?? ""}
                  onChange={(e) => setForm((f) => ({ ...f, category: (e.target.value || undefined) as LedgerCategory | undefined }))}
                  className="h-11 rounded-xl border border-border bg-ink-primary/5 px-3 text-sm text-ink-primary outline-none focus:ring-2 focus:ring-series-1"
                >
                  <option value="">{t("people.categoryOptional")}</option>
                  <option value="SALARY">{isContractor ? t("people.salaryCommissionOption") : t("people.salaryOption")}</option>
                  <option value="COMMISSION">{t("people.commissionOption")}</option>
                  <option value="ADVANCE">{t("people.advance")}</option>
                  <option value="KHARCHI">{t("people.kharchi")}</option>
                  {!isContractor && <option value="MEDICAL">{t("people.medical")}</option>}
                  {!isContractor && <option value="FESTIVAL">{t("people.festival")}</option>}
                  <option value="OTHER">{t("people.other")}</option>
                </select>
              )}
              <input
                placeholder={isCustomer ? t("people.reasonPlaceholderCustomer") : t("people.reasonPlaceholderDefault")}
                value={form.reason}
                onChange={(e) => setForm((f) => ({ ...f, reason: e.target.value }))}
                className="h-11 rounded-xl border border-border bg-ink-primary/5 px-3 text-sm text-ink-primary outline-none focus:ring-2 focus:ring-series-1"
              />
              {formError && <p className="text-xs font-medium text-status-critical">{formError}</p>}
              <Button type="submit" disabled={loading} className="w-full">
                {loading ? t("people.adding") : t("people.addEntry")}
              </Button>
            </form>
          </div>

          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-muted">{t("people.history")}</p>
            <div className="max-h-[26rem] space-y-1.5 overflow-y-auto pr-1">
              {entries.length === 0 && <p className="py-4 text-center text-sm text-ink-muted">{t("people.noEntriesYet")}</p>}
              {entries.map((entry) => (
                <div key={entry._id} className="flex items-center justify-between rounded-xl border border-border px-3 py-3 text-sm">
                  <div>
                    <p className="text-ink-primary">{entry.reason}</p>
                    <p className="text-sm text-ink-muted">
                      {new Date(entry.date).toLocaleDateString("en-IN")}
                      {entry.category ? ` · ${entry.category}` : ""}
                      {entry.paymentMode ? ` · ${entry.paymentMode}` : ""}
                    </p>
                  </div>
                  <Badge variant={entry.direction === "DUE" ? "critical" : "good"}>
                    {entry.direction === "DUE" ? "+" : "-"}₹{formatINR(entry.amount)}
                  </Badge>
                </div>
              ))}
            </div>
          </div>
        </div>
      </Card>
    </div>
  );
}
