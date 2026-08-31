import { FormEvent, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Pencil, Wallet, X } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { DateInput } from "@/components/ui/date-input";
import { api } from "@/lib/api";
import { useKilnEvent } from "@/hooks/useKilnEvent";
import type { LedgerCategory, LedgerEntry, LedgerPaymentMode, Person } from "@/types";
import { formatDateTime, formatINR } from "@/lib/utils";
import { useTranslation } from "@/hooks/useTranslation";
import { isPaymentSplitMismatched, PaymentSplitFields } from "@/components/shared/PaymentSplitFields";
import { EditLedgerEntryModal } from "@/components/people/EditLedgerEntryModal";

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
    date: new Date().toISOString().slice(0, 10),
    reason: "",
    paymentMode: "CASH" as LedgerPaymentMode,
    cashAmount: "",
    onlineAmount: "",
    category: undefined as LedgerCategory | undefined,
  });
  const [loading, setLoading] = useState(false);
  const [formError, setFormError] = useState("");
  const [editingEntry, setEditingEntry] = useState<LedgerEntry | null>(null);
  const amountRef = useRef<HTMLInputElement>(null);
  const isCustomer = person.type === "CUSTOMER";
  const isPartner = person.type === "PARTNER";
  const isSalesAgent = person.type === "SALES_AGENT";
  const isContractor = person.type === "LABOUR_CONTRACTOR";
  const isLandowner = person.type === "LANDOWNER";
  // Permanent bhatta admin/support staff (Main Munim, office Helpers,
  // Chowkidar, office Drivers — see Staff.tsx's roster) get their own
  // salary via the dedicated attendance-based Salary Slip system, not this
  // ledger's generic Salary quick action — and have no medical/festival/
  // settlement concept — so their popup narrows to just the two things an
  // admin actually posts against them day to day: Advance and Kharchi.
  const isStaff =
    person.type === "MUNIM" ||
    person.type === "CHOWKIDAR" ||
    ((person.type === "HELPER" || person.type === "DRIVER") && person.isOfficeStaff === true);
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
    const usingSplit = form.direction === "PAID" && form.paymentMode === "CASH_AND_ONLINE";
    if (usingSplit && isPaymentSplitMismatched(form.paymentMode, Number(form.amount), form.cashAmount, form.onlineAmount)) {
      setFormError(t("payment.splitMismatch", { total: Number(form.amount).toLocaleString("en-IN") }));
      return;
    }
    setFormError("");
    setLoading(true);
    try {
      await api.people.addLedger(person._id, {
        direction: form.direction,
        amount: Number(form.amount),
        reason: form.reason,
        date: form.date,
        paymentMode: form.direction === "PAID" ? form.paymentMode : undefined,
        cashAmount: usingSplit ? Number(form.cashAmount) : undefined,
        onlineAmount: usingSplit ? Number(form.onlineAmount) : undefined,
        category: form.category,
      });
      setForm({
        direction: "DUE",
        amount: "",
        date: new Date().toISOString().slice(0, 10),
        reason: "",
        paymentMode: "CASH",
        cashAmount: "",
        onlineAmount: "",
        category: undefined,
      });
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

  // Portalled to <body> — opened from buttons inside a profile header Card
  // that lifts on hover (hover:-translate-y-0.5), which becomes the
  // containing block for a `position: fixed` descendant while hovered,
  // pinning this modal to that Card's box instead of the viewport. See
  // QuickLedgerModal for the fuller explanation of the same fix.
  return createPortal(
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
                {t("people.ledger")} {isContractor ? t("people.dotThekedarContractor") : !isCustomer && !isPartner && !isSalesAgent ? t("people.dotLabour") : ""}
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
            <div className={`grid gap-2 ${isCustomer || isPartner || isSalesAgent ? "grid-cols-1" : "grid-cols-2"}`}>
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
              ) : isSalesAgent ? (
                <button
                  type="button"
                  onClick={() => fillQuickAction({ direction: "PAID", reason: t("salesAgent.reasonCommissionPayment"), category: "COMMISSION" })}
                  className={quickButtonClass}
                >
                  {t("salesAgent.recordCommissionPayment")}
                </button>
              ) : isStaff ? (
                <>
                  <button
                    type="button"
                    onClick={() => fillQuickAction({ direction: "PAID", reason: t("people.reasonAdvancePeshgi"), category: "ADVANCE" })}
                    className={quickButtonClass}
                  >
                    {t("people.advancePeshgiTitle")}
                  </button>
                  <button
                    type="button"
                    onClick={() => fillQuickAction({ direction: "PAID", reason: t("people.reasonKharchiWeeklyPettyCash"), category: "KHARCHI" })}
                    className={quickButtonClass}
                  >
                    {t("people.kharchi")}
                  </button>
                </>
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
                  {!isLandowner && (
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
                  )}
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
              <div className="flex gap-2">
                <input
                  ref={amountRef}
                  type="number"
                  min={0}
                  placeholder={t("people.amountRupees")}
                  value={form.amount}
                  onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))}
                  className="h-11 flex-1 rounded-xl border border-border bg-ink-primary/5 px-3 text-sm text-ink-primary outline-none focus:ring-2 focus:ring-series-1"
                />
                <DateInput
                  required
                  aria-label={t("common.transactionDate")}
                  value={form.date}
                  onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))}
                  className="h-11 rounded-xl border border-border bg-ink-primary/5 px-3 text-sm text-ink-primary outline-none focus:ring-2 focus:ring-series-1"
                />
              </div>
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
                  {isStaff ? (
                    <>
                      <option value="ADVANCE">{t("people.advance")}</option>
                      <option value="KHARCHI">{t("people.kharchi")}</option>
                    </>
                  ) : (
                    <>
                      <option value="SALARY">{isContractor ? t("people.salaryCommissionOption") : t("people.salaryOption")}</option>
                      <option value="COMMISSION">{t("people.commissionOption")}</option>
                      <option value="ADVANCE">{t("people.advance")}</option>
                      {!isLandowner && <option value="KHARCHI">{t("people.kharchi")}</option>}
                      {!isContractor && <option value="MEDICAL">{t("people.medical")}</option>}
                      {!isContractor && <option value="FESTIVAL">{t("people.festival")}</option>}
                      <option value="OTHER">{t("people.other")}</option>
                    </>
                  )}
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
                <div key={entry._id} className="flex items-center justify-between gap-2 rounded-xl border border-border px-3 py-3 text-sm">
                  <div className="min-w-0">
                    <p className="truncate text-ink-primary">{entry.reason}</p>
                    <p className="text-sm text-ink-muted">
                      {new Date(entry.date).toLocaleDateString("en-IN")}
                      {entry.category ? ` · ${entry.category}` : ""}
                      {entry.paymentMode ? ` · ${entry.paymentMode}` : ""}
                    </p>
                    <p className="text-xs text-ink-muted/70">
                      {t("common.entryDateTime")}: {formatDateTime(entry.createdAt)}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setEditingEntry(entry)}
                      className="text-ink-muted hover:text-ink-primary"
                      aria-label={t("people.editLedgerEntry")}
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </button>
                    <Badge variant={entry.direction === "DUE" ? "critical" : "good"}>
                      {entry.direction === "DUE" ? "+" : "-"}₹{formatINR(entry.amount)}
                    </Badge>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </Card>
      {editingEntry && (
        <EditLedgerEntryModal
          entry={editingEntry}
          onClose={() => {
            setEditingEntry(null);
            refresh();
          }}
        />
      )}
    </div>,
    document.body
  );
}
