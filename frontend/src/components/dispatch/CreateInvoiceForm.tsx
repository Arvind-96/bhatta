import { FormEvent, useState } from "react";
import { X } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { DateInput } from "@/components/ui/date-input";
import { api } from "@/lib/api";
import { useAuthStore } from "@/store/auth.store";
import { useTranslation } from "@/hooks/useTranslation";
import { printInvoiceRecord } from "@/lib/printDocument";
import { formatINR } from "@/lib/utils";
import { isPaymentSplitMismatched, PaymentSplitFields } from "@/components/shared/PaymentSplitFields";
import type { BrickCategory, Customer, Dispatch as DispatchEntry, Invoice, PaymentMode } from "@/types";

const inputClass =
  "h-10 rounded-xl border border-border bg-ink-primary/5 px-3 text-sm text-ink-primary outline-none focus:ring-2 focus:ring-series-1";

interface CreateInvoiceFormProps {
  // Null when opened from the standalone Invoice detail page to edit an
  // already-created record with no Dispatch loaded.
  dispatch: DispatchEntry | null;
  categories: BrickCategory[];
  existing?: Invoice | null;
  // Fixed link when opened from a Customer's own profile page — the
  // picker below is hidden and every field is pre-filled from `fixedCustomer`.
  fixedCustomerId?: string;
  fixedCustomer?: Customer | null;
  // The customer's current due BEFORE this invoice, used to preview their
  // overall remaining due after it — only meaningful (and only shown) when
  // creating a brand-new invoice, since recomputing it correctly for an
  // edit would need backing out the invoice's own old contribution first.
  customerCurrentDue?: number;
  // Offered as an optional link-to-customer picker when creating from a
  // Dispatch (no fixedCustomerId) — omitted entirely otherwise.
  customers?: Customer[];
  onClose: () => void;
  onSaved: () => void;
}

function categoryLabelFor(categoryId: string, categories: BrickCategory[]) {
  const c = categories.find((cat) => cat._id === categoryId);
  if (!c) return "—";
  return c.grade ? `${c.category} (${c.grade})` : c.category;
}

// The priced/GST commercial bill, its own saved record (see
// CreateChallanForm.tsx's doc comment for why). Rate/gross/net recompute
// live as bricks/rate/discount change, same convention as the Log
// Dispatch form's own total preview. amountPaidNow (item 10) is tracked
// separately from netAmount -- whatever's left becomes this customer's
// due balance (see customer.service.ts's getCustomerDetail).
export function CreateInvoiceForm({
  dispatch,
  categories,
  existing,
  fixedCustomerId,
  fixedCustomer,
  customerCurrentDue,
  customers,
  onClose,
  onSaved,
}: CreateInvoiceFormProps) {
  const { t } = useTranslation();
  const kilns = useAuthStore((s) => s.kilns);
  const activeKilnId = useAuthStore((s) => s.activeKilnId);
  const activeKiln = kilns.find((k) => k.kilnId === activeKilnId);
  const kilnInfo = { name: activeKiln?.name ?? "Bhatta Cloud", location: activeKiln?.location, phone: activeKiln?.phone, gstNumber: activeKiln?.gstNumber };

  const dispatchCategoryId = dispatch ? (typeof dispatch.categoryId === "object" ? dispatch.categoryId?._id ?? "" : dispatch.categoryId ?? "") : "";
  const dispatchGstNumber = dispatch && typeof dispatch.customerId === "object" ? dispatch.customerId?.gstNumber ?? "" : "";
  const [selectedCustomerId, setSelectedCustomerId] = useState(fixedCustomerId ?? existing?.customerId ?? "");
  const [customerName, setCustomerName] = useState(existing?.customerName ?? fixedCustomer?.name ?? dispatch?.customerName ?? "");
  const [customerAddress, setCustomerAddress] = useState(existing?.customerAddress ?? fixedCustomer?.addresses[0] ?? dispatch?.customerAddress ?? "");
  const [customerPhone, setCustomerPhone] = useState(existing?.customerPhone ?? fixedCustomer?.phones[0] ?? dispatch?.customerPhone ?? "");
  const [customerGstNumber, setCustomerGstNumber] = useState(existing?.customerGstNumber ?? dispatchGstNumber);
  const [categoryId, setCategoryId] = useState(existing?.categoryId ?? dispatchCategoryId);
  const [bricksCount, setBricksCount] = useState(String(existing?.bricksCount ?? dispatch?.bricksCount ?? ""));
  const [ratePerBrick, setRatePerBrick] = useState(
    existing?.ratePerBrick != null
      ? String(existing.ratePerBrick)
      : dispatch?.bricksCount
      ? String(Math.round((dispatch.amount / dispatch.bricksCount) * 100) / 100)
      : ""
  );
  const [discountAmount, setDiscountAmount] = useState(
    existing?.discountAmount != null ? String(existing.discountAmount) : dispatch?.discountAmount != null ? String(dispatch.discountAmount) : ""
  );
  const [amountPaidNow, setAmountPaidNow] = useState(existing?.amountPaidNow != null ? String(existing.amountPaidNow) : "");
  const [paymentMode, setPaymentMode] = useState<PaymentMode>(existing?.paymentMode ?? dispatch?.paymentMode ?? "CASH");
  const [cashAmount, setCashAmount] = useState(existing?.cashAmount != null ? String(existing.cashAmount) : "");
  const [onlineAmount, setOnlineAmount] = useState(existing?.onlineAmount != null ? String(existing.onlineAmount) : "");
  const [invoiceDate, setInvoiceDate] = useState((existing?.invoiceDate ?? dispatch?.dispatchedOn ?? new Date().toISOString()).slice(0, 10));
  const [notes, setNotes] = useState(existing?.notes ?? "");
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState("");

  const gross = (Number(bricksCount) || 0) * (Number(ratePerBrick) || 0);
  const net = Math.max(0, gross - (Number(discountAmount) || 0));
  const effectivePaidNow = amountPaidNow ? Number(amountPaidNow) : net;
  const remainingOnThisInvoice = Math.max(0, Math.round((net - effectivePaidNow) * 100) / 100);
  const overallDueAfter = !existing && customerCurrentDue != null ? Math.max(0, customerCurrentDue + remainingOnThisInvoice) : undefined;

  function handleCustomerSelect(id: string) {
    setSelectedCustomerId(id);
    const c = customers?.find((cust) => cust._id === id);
    if (c) {
      setCustomerName(c.name);
      setCustomerPhone(c.phones[0] ?? "");
      setCustomerAddress(c.addresses[0] ?? "");
    }
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (isPaymentSplitMismatched(paymentMode, net, cashAmount, onlineAmount)) {
      setFormError(t("payment.splitMismatch", { total: net.toLocaleString("en-IN") }));
      return;
    }
    setFormError("");
    setSaving(true);
    try {
      const payload = {
        customerId: selectedCustomerId || undefined,
        customerName,
        customerAddress: customerAddress || undefined,
        customerPhone: customerPhone || undefined,
        customerGstNumber: customerGstNumber || undefined,
        categoryId: categoryId || undefined,
        bricksCount: Number(bricksCount),
        ratePerBrick: ratePerBrick ? Number(ratePerBrick) : undefined,
        grossAmount: gross || undefined,
        discountAmount: discountAmount ? Number(discountAmount) : undefined,
        netAmount: net,
        amountPaidNow: effectivePaidNow,
        paymentMode,
        cashAmount: paymentMode === "CASH_AND_ONLINE" ? Number(cashAmount) : undefined,
        onlineAmount: paymentMode === "CASH_AND_ONLINE" ? Number(onlineAmount) : undefined,
        invoiceDate: invoiceDate || undefined,
        notes: notes || undefined,
      };
      const row = existing ? await api.invoices.update(existing._id, payload) : await api.invoices.create({ dispatchId: dispatch?._id, ...payload });
      printInvoiceRecord(row, kilnInfo, categoryLabelFor(categoryId, categories), overallDueAfter);
      onSaved();
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card className="border-series-1/30">
      <div className="mb-3 flex items-center justify-between">
        <h4 className="text-sm font-semibold text-ink-primary">{t("dispatchDocs.createInvoiceTitle")}</h4>
        <button onClick={onClose} className="text-ink-muted hover:text-ink-primary">
          <X className="h-4 w-4" />
        </button>
      </div>
      <form onSubmit={handleSubmit} className="grid grid-cols-2 gap-2">
        {customers && !fixedCustomerId && (
          <select value={selectedCustomerId} onChange={(e) => handleCustomerSelect(e.target.value)} className="col-span-2 h-10 rounded-xl border border-border bg-ink-primary/5 px-3 text-sm text-ink-primary outline-none focus:ring-2 focus:ring-series-1">
            <option value="">{t("customer.linkToCustomerPlaceholder")}</option>
            {customers.map((c) => (
              <option key={c._id} value={c._id}>
                {c.name}
              </option>
            ))}
          </select>
        )}
        <input required placeholder={t("brickLoading.customerNamePlaceholder")} value={customerName} onChange={(e) => setCustomerName(e.target.value)} className={inputClass} />
        <input placeholder={t("brickLoading.customerPhonePlaceholder")} value={customerPhone} onChange={(e) => setCustomerPhone(e.target.value)} className={inputClass} />
        <input placeholder={t("brickLoading.customerAddressPlaceholder")} value={customerAddress} onChange={(e) => setCustomerAddress(e.target.value)} className={inputClass} />
        <input placeholder={t("dispatchDocs.gstNumberPlaceholder")} value={customerGstNumber} onChange={(e) => setCustomerGstNumber(e.target.value)} className={inputClass} />
        <select value={categoryId} onChange={(e) => setCategoryId(e.target.value)} className={inputClass}>
          <option value="">{t("brickLoading.categoryPlaceholder")}</option>
          {categories.map((c) => (
            <option key={c._id} value={c._id}>
              {c.grade ? `${c.category} (${c.grade})` : c.category}
            </option>
          ))}
        </select>
        <input required type="number" placeholder={t("brickLoading.bricksLoadedPlaceholder")} value={bricksCount} onChange={(e) => setBricksCount(e.target.value)} className={inputClass} />
        <input type="number" placeholder={t("dispatchDocs.ratePerBrickPlaceholder")} value={ratePerBrick} onChange={(e) => setRatePerBrick(e.target.value)} className={inputClass} />
        <input type="number" placeholder={t("dispatch.discountPlaceholder")} value={discountAmount} onChange={(e) => setDiscountAmount(e.target.value)} className={inputClass} />

        <div className="col-span-2 flex items-center justify-between rounded-xl border border-series-1/30 bg-series-1/5 px-4 py-2">
          <span className="text-sm font-medium text-ink-secondary">{t("dispatch.totalAmountLabel")}</span>
          <span className="text-lg font-semibold tabular-nums text-ink-primary">₹{formatINR(net)}</span>
        </div>

        <input
          type="number"
          placeholder={t("customer.amountPayingNowPlaceholder")}
          value={amountPaidNow}
          onChange={(e) => setAmountPaidNow(e.target.value)}
          className={inputClass}
        />
        <DateInput value={invoiceDate} onChange={(e) => setInvoiceDate(e.target.value)} className={inputClass} />

        <div className="col-span-2 grid grid-cols-2 gap-2">
          <div className="rounded-xl border border-border bg-ink-primary/5 px-3 py-2 text-center">
            <p className="text-xs text-ink-muted">{t("customer.remainingOnThisInvoiceLabel")}</p>
            <p className="text-sm font-semibold tabular-nums text-ink-primary">₹{formatINR(remainingOnThisInvoice)}</p>
          </div>
          {overallDueAfter != null && (
            <div className="rounded-xl border border-status-warning/30 bg-status-warning/5 px-3 py-2 text-center">
              <p className="text-xs text-ink-muted">{t("customer.overallDueAfterLabel")}</p>
              <p className="text-sm font-semibold tabular-nums text-ink-primary">₹{formatINR(overallDueAfter)}</p>
            </div>
          )}
        </div>

        <select value={paymentMode} onChange={(e) => setPaymentMode(e.target.value as PaymentMode)} className={inputClass}>
          <option value="CASH">{t("dispatch.paymentCash")}</option>
          <option value="BANK">{t("dispatch.paymentBankTransfer")}</option>
          <option value="UPI">{t("dispatch.paymentUpi")}</option>
          <option value="GST_INVOICE">{t("dispatch.paymentGstInvoice")}</option>
          <option value="CASH_AND_ONLINE">{t("common.paymentModeCashAndOnline")}</option>
        </select>
        {paymentMode === "CASH_AND_ONLINE" && (
          <div className="col-span-2">
            <PaymentSplitFields
              totalAmount={net}
              cashAmount={cashAmount}
              onlineAmount={onlineAmount}
              onCashAmountChange={setCashAmount}
              onOnlineAmountChange={setOnlineAmount}
              inputClassName={inputClass}
            />
          </div>
        )}
        <input placeholder={t("common.notes")} value={notes} onChange={(e) => setNotes(e.target.value)} className="col-span-2 h-10 rounded-xl border border-border bg-ink-primary/5 px-3 text-sm text-ink-primary outline-none focus:ring-2 focus:ring-series-1" />
        {formError && <p className="col-span-2 text-sm text-status-critical">{formError}</p>}
        <Button type="submit" disabled={saving} className="col-span-2">
          {existing ? t("dispatchDocs.saveAndReprintInvoice") : t("dispatchDocs.generateInvoice")}
        </Button>
      </form>
    </Card>
  );
}
