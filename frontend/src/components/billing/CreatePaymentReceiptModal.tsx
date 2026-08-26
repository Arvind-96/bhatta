import { FormEvent, useEffect, useState } from "react";
import { Search, X } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { DateInput } from "@/components/ui/date-input";
import { cn, formatINR } from "@/lib/utils";
import { api } from "@/lib/api";
import { printPaymentReceipt, printInvoiceRecord } from "@/lib/printDocument";
import { resolvePaymentInfo } from "@/lib/paymentStatus";
import { useTranslation } from "@/hooks/useTranslation";
import { useAuthStore } from "@/store/auth.store";
import { usePersonTypeMeta, PERSON_TYPES } from "@/components/people/personTypes";
import { isPaymentSplitMismatched, PaymentSplitFields } from "@/components/shared/PaymentSplitFields";
import type { Customer, LedgerPaymentMode, Person, PersonType } from "@/types";

const inputClass =
  "h-10 rounded-xl border border-border bg-ink-primary/5 px-3 text-sm text-ink-primary outline-none focus:ring-2 focus:ring-series-1";

interface CreatePaymentReceiptModalProps {
  kilnName: string;
  onClose: () => void;
  onCreated: () => void;
}

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

// A receipt can be issued to anyone in the People directory — field owner,
// thekedar, labourer, supplier... whoever — not just dispatch customers.
// Picking a "who is this for" type first (rather than one flat search
// across everyone) is what makes that discoverable instead of looking
// like a customer-only screen. Selecting a person then pulls their full
// ledger so how much has already been paid and how much is still due are
// both visible before typing in what's being paid right now.
//
// CUSTOMER is a special case: dispatch customers live in their own
// `customers` table (with dues tracked via the invoices they generate),
// not in the generic `people`/ledger system every other type here uses.
// So a CUSTOMER selection is fetched/priced/settled through the same
// customers+invoices path AddCustomerPaymentModal uses, instead of
// api.paymentReceipts — that's what actually updates a customer's
// profile and prints the invoice-style receipt they already get
// elsewhere in the app.
export function CreatePaymentReceiptModal({ kilnName, onClose, onCreated }: CreatePaymentReceiptModalProps) {
  const [personType, setPersonType] = useState<"" | PersonType>("");
  const [people, setPeople] = useState<Person[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [search, setSearch] = useState("");
  const [selectedPerson, setSelectedPerson] = useState<Person | null>(null);
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [balance, setBalance] = useState<number | null>(null);
  const [totalPaidSoFar, setTotalPaidSoFar] = useState<number | null>(null);
  const [amountPaid, setAmountPaid] = useState("");
  const [paymentMode, setPaymentMode] = useState<LedgerPaymentMode | "">("");
  const [cashAmount, setCashAmount] = useState("");
  const [onlineAmount, setOnlineAmount] = useState("");
  const [date, setDate] = useState(todayIso());
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState("");
  const { t } = useTranslation();
  const personTypeMeta = usePersonTypeMeta();
  const kilns = useAuthStore((s) => s.kilns);
  const activeKilnId = useAuthStore((s) => s.activeKilnId);
  const activeKiln = kilns.find((k) => k.kilnId === activeKilnId);
  const kilnInfo = { name: activeKiln?.name ?? kilnName, location: activeKiln?.location, phone: activeKiln?.phone, gstNumber: activeKiln?.gstNumber };

  const isCustomerType = personType === "CUSTOMER";

  useEffect(() => {
    if (!personType) {
      setPeople([]);
      setCustomers([]);
      return;
    }
    if (personType === "CUSTOMER") {
      api.customers.list().then(setCustomers).catch(console.error);
    } else {
      api.people.list(personType).then(setPeople).catch(console.error);
    }
  }, [personType]);

  useEffect(() => {
    if (!selectedPerson) return;
    setBalance(null);
    setTotalPaidSoFar(null);
    api.people.get(selectedPerson._id).then((r) => setBalance(r.balance)).catch(console.error);
    api.people
      .listLedger(selectedPerson._id)
      .then((entries) => setTotalPaidSoFar(entries.filter((e) => e.direction === "PAID").reduce((sum, e) => sum + e.amount, 0)))
      .catch(console.error);
  }, [selectedPerson]);

  useEffect(() => {
    if (!selectedCustomer) return;
    setBalance(null);
    setTotalPaidSoFar(null);
    api.customers
      .detail(selectedCustomer._id)
      .then((d) => {
        setBalance(d.totalDue);
        setTotalPaidSoFar(d.totalPaid);
      })
      .catch(console.error);
  }, [selectedCustomer]);

  useEffect(() => {
    if (!selectedPerson && !selectedCustomer) {
      setBalance(null);
      setTotalPaidSoFar(null);
    }
  }, [selectedPerson, selectedCustomer]);

  const filteredPeople =
    search.trim().length === 0
      ? people
      : people.filter((p) => p.name.toLowerCase().includes(search.toLowerCase()) || (p.phone ?? "").includes(search));

  const filteredCustomers =
    search.trim().length === 0
      ? customers
      : customers.filter(
          (c) => c.name.toLowerCase().includes(search.toLowerCase()) || c.phones.some((ph) => ph.includes(search))
        );

  function chooseType(next: "" | PersonType) {
    setPersonType(next);
    setSelectedPerson(null);
    setSelectedCustomer(null);
    setSearch("");
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if ((!selectedPerson && !selectedCustomer) || !amountPaid) return;
    const usingSplit = paymentMode === "CASH_AND_ONLINE";
    if (usingSplit && isPaymentSplitMismatched(paymentMode, Number(amountPaid), cashAmount, onlineAmount)) {
      setFormError(t("payment.splitMismatch", { total: Number(amountPaid).toLocaleString("en-IN") }));
      return;
    }
    setFormError("");
    setSaving(true);
    try {
      if (selectedCustomer) {
        const paidAmount = Number(amountPaid);
        const row = await api.invoices.create({
          customerId: selectedCustomer._id,
          customerName: selectedCustomer.name,
          customerPhone: selectedCustomer.phones[0],
          customerAddress: selectedCustomer.addresses[0],
          bricksCount: 0,
          netAmount: paidAmount,
          amountPaidNow: paidAmount,
          paymentMode: paymentMode || undefined,
          cashAmount: usingSplit ? Number(cashAmount) : undefined,
          onlineAmount: usingSplit ? Number(onlineAmount) : undefined,
          invoiceDate: date,
          notes: notes || t("customer.advancePaymentDefaultNote"),
        });
        const { stamp } = await resolvePaymentInfo({ customerId: selectedCustomer._id, customerName: selectedCustomer.name, remainingOnThisDoc: 0 });
        printInvoiceRecord(row, kilnInfo, [], stamp, t("customer.advancePaymentCategoryLabel"));
      } else if (selectedPerson) {
        const receipt = await api.paymentReceipts.create({
          personId: selectedPerson._id,
          amountPaid: Number(amountPaid),
          paymentMode: paymentMode || undefined,
          cashAmount: usingSplit ? Number(cashAmount) : undefined,
          onlineAmount: usingSplit ? Number(onlineAmount) : undefined,
          notes: notes || undefined,
          date,
        });
        printPaymentReceipt(receipt, selectedPerson.name, kilnName);
      }
      onCreated();
      onClose();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : t("common.somethingWentWrong"));
    } finally {
      setSaving(false);
    }
  }

  const projectedBalance = balance != null && amountPaid ? balance - Number(amountPaid) : null;
  const selectedName = selectedPerson?.name ?? selectedCustomer?.name ?? "";
  const selectedTypeLabel = selectedPerson ? personTypeMeta[selectedPerson.type].label : selectedCustomer ? personTypeMeta.CUSTOMER.label : "";

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-black/50 p-4">
      <div className="flex min-h-full items-center justify-center">
      <Card className="w-full max-w-md">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-ink-primary">{t("billing.newPaymentReceipt")}</h3>
          <button onClick={onClose} className="text-ink-muted hover:text-ink-primary">
            <X className="h-4 w-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-2">
          <label className="flex flex-col gap-1">
            <span className="text-xs font-medium text-ink-secondary">{t("billing.issueToTypeLabel")}</span>
            <select
              required
              value={personType}
              onChange={(e) => chooseType(e.target.value as "" | PersonType)}
              className={cn(inputClass, "w-full")}
            >
              <option value="">{t("billing.selectPersonTypePlaceholder")}</option>
              {PERSON_TYPES.map((pt) => (
                <option key={pt} value={pt}>
                  {personTypeMeta[pt].label}
                </option>
              ))}
            </select>
          </label>

          {personType && !selectedPerson && !selectedCustomer && (
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-muted" />
              <input
                autoFocus
                placeholder={t("billing.searchNameOrMobile")}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className={cn(inputClass, "w-full pl-9")}
              />
              <div className="mt-1 max-h-56 overflow-y-auto rounded-xl border border-border bg-surface shadow-sm">
                {isCustomerType ? (
                  filteredCustomers.length === 0 ? (
                    <p className="px-3 py-3 text-center text-xs text-ink-muted">{t("billing.noMatchingPeople")}</p>
                  ) : (
                    filteredCustomers.map((c) => (
                      <button
                        key={c._id}
                        type="button"
                        onClick={() => {
                          setSelectedCustomer(c);
                          setSearch("");
                        }}
                        className="flex w-full items-center justify-between px-3 py-2 text-left text-sm hover:bg-ink-primary/5"
                      >
                        <span className="text-ink-primary">{c.name}</span>
                        <span className="text-[11px] text-ink-muted">{c.phones[0] ?? "—"}</span>
                      </button>
                    ))
                  )
                ) : filteredPeople.length === 0 ? (
                  <p className="px-3 py-3 text-center text-xs text-ink-muted">{t("billing.noMatchingPeople")}</p>
                ) : (
                  filteredPeople.map((p) => (
                    <button
                      key={p._id}
                      type="button"
                      onClick={() => {
                        setSelectedPerson(p);
                        setSearch("");
                      }}
                      className="flex w-full items-center justify-between px-3 py-2 text-left text-sm hover:bg-ink-primary/5"
                    >
                      <span className="text-ink-primary">{p.name}</span>
                      <span className="text-[11px] text-ink-muted">{p.phone ?? "—"}</span>
                    </button>
                  ))
                )}
              </div>
            </div>
          )}

          {(selectedPerson || selectedCustomer) && (
            <div className="rounded-xl border border-border bg-ink-primary/5 px-3 py-2.5">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-ink-primary">{selectedName}</p>
                  <p className="text-[11px] text-ink-muted">{selectedTypeLabel}</p>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setSelectedPerson(null);
                    setSelectedCustomer(null);
                  }}
                  className="text-xs font-medium text-series-1 hover:underline"
                >
                  {t("billing.changeButton")}
                </button>
              </div>
              <div className="mt-2 grid grid-cols-2 gap-2 border-t border-border pt-2 text-center">
                <div>
                  <p className="text-sm font-semibold tabular-nums text-status-good">
                    ₹{totalPaidSoFar != null ? formatINR(totalPaidSoFar) : "—"}
                  </p>
                  <p className="text-[11px] text-ink-muted">{t("billing.totalPaidSoFarLabel")}</p>
                </div>
                <div>
                  <p className={`text-sm font-semibold tabular-nums ${(balance ?? 0) > 0 ? "text-status-critical" : "text-ink-primary"}`}>
                    ₹{balance != null ? formatINR(Math.abs(balance)) : "—"}
                  </p>
                  <p className="text-[11px] text-ink-muted">
                    {balance != null && balance < 0 ? t("billing.advanceOutstandingLabel") : t("billing.currentlyDueLabel")}
                  </p>
                </div>
              </div>
            </div>
          )}

          <input
            required
            type="number"
            placeholder={t("billing.amountPayingNowPlaceholder")}
            value={amountPaid}
            onChange={(e) => setAmountPaid(e.target.value)}
            className={cn(inputClass, "w-full")}
          />
          <div className="grid grid-cols-2 gap-2">
            <select
              value={paymentMode}
              onChange={(e) => setPaymentMode(e.target.value as LedgerPaymentMode | "")}
              className={inputClass}
            >
              <option value="">{t("billing.paymentModeOptional")}</option>
              <option value="CASH">{t("billing.paymentCash")}</option>
              <option value="BANK">{t("billing.paymentBank")}</option>
              <option value="UPI">{t("billing.paymentUpi")}</option>
              <option value="CASH_AND_ONLINE">{t("common.paymentModeCashAndOnline")}</option>
            </select>
            <DateInput
              required
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className={inputClass}
            />
          </div>
          {paymentMode === "CASH_AND_ONLINE" && (
            <PaymentSplitFields
              totalAmount={Number(amountPaid) || 0}
              cashAmount={cashAmount}
              onlineAmount={onlineAmount}
              onCashAmountChange={setCashAmount}
              onOnlineAmountChange={setOnlineAmount}
              inputClassName={cn(inputClass, "w-full")}
            />
          )}
          <input
            placeholder={t("common.notesOptional")}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            className={cn(inputClass, "w-full")}
          />

          {projectedBalance != null && (
            <p className="rounded-lg bg-ink-primary/5 px-3 py-2 text-xs text-ink-muted">
              {t("billing.remainingBalanceAfterPayment", { amount: projectedBalance.toLocaleString("en-IN") })}
            </p>
          )}
          {formError && <p className="text-sm text-status-critical">{formError}</p>}

          <Button type="submit" disabled={saving || (!selectedPerson && !selectedCustomer)} className="w-full">
            {t("billing.savePrintReceipt")}
          </Button>
        </form>
      </Card>
      </div>
    </div>
  );
}
