import { FormEvent, useEffect, useState } from "react";
import { X } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { DateInput } from "@/components/ui/date-input";
import { api } from "@/lib/api";
import { useAuthStore } from "@/store/auth.store";
import { useTranslation } from "@/hooks/useTranslation";
import { printInvoiceRecord } from "@/lib/printDocument";
import { resolvePaymentInfo } from "@/lib/paymentStatus";
import { formatINR } from "@/lib/utils";
import { isPaymentSplitMismatched, PaymentSplitFields } from "@/components/shared/PaymentSplitFields";
import { BrickLineItemsEditor, emptyLineItemRow, isValidLineItemRow, lineItemRowsFrom, type LineItemRow } from "@/components/dispatch/BrickLineItemsEditor";
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
  // Pre-selected (but still changeable via the picker) when the caller
  // already knows which Customer this dispatch belongs to — e.g.
  // DispatchDetailPage matching the dispatch's customerName against the
  // Customer list for a dispatch that originated from a Brick Loading trip.
  defaultCustomerId?: string;
  // Offered as an optional link-to-customer picker when creating from a
  // Dispatch (no fixedCustomerId) — omitted entirely otherwise.
  customers?: Customer[];
  onClose: () => void;
  onSaved: () => void;
}

// Seeds the line-item rows from a saved invoice's own items (or its
// legacy single categoryId/bricksCount/ratePerBrick scalars), or — for a
// brand-new invoice — from the source dispatch, defaulting the price per
// row to the dispatch's own overall bricks-to-amount rate (the same
// default the single-category form used before multi-category items).
function seedInvoiceItems(existing: Invoice | null | undefined, dispatch: DispatchEntry | null): LineItemRow[] {
  if (existing) {
    return lineItemRowsFrom({ items: existing.items, categoryId: existing.categoryId, bricksCount: existing.bricksCount, pricePerBrick: existing.ratePerBrick });
  }
  if (dispatch) {
    const impliedRate = dispatch.bricksCount ? Math.round((dispatch.amount / dispatch.bricksCount) * 100) / 100 : undefined;
    return lineItemRowsFrom({ items: dispatch.items, categoryId: dispatch.categoryId, bricksCount: dispatch.bricksCount, pricePerBrick: impliedRate });
  }
  return [emptyLineItemRow()];
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
  defaultCustomerId,
  customers,
  onClose,
  onSaved,
}: CreateInvoiceFormProps) {
  const { t } = useTranslation();
  const kilns = useAuthStore((s) => s.kilns);
  const activeKilnId = useAuthStore((s) => s.activeKilnId);
  const activeKiln = kilns.find((k) => k.kilnId === activeKilnId);
  const kilnInfo = {
    name: activeKiln?.name ?? "Bhatta Cloud",
    location: activeKiln?.location,
    phone: activeKiln?.phone,
    gstNumber: activeKiln?.gstNumber,
    stateCode: activeKiln?.stateCode,
    bankAccountNumber: activeKiln?.bankAccountNumber,
    bankName: activeKiln?.bankName,
    bankIfscCode: activeKiln?.bankIfscCode,
  };

  const dispatchGstNumber = dispatch && typeof dispatch.customerId === "object" ? dispatch.customerId?.gstNumber ?? "" : "";
  const defaultCustomer = customers?.find((c) => c._id === defaultCustomerId);
  const [selectedCustomerId, setSelectedCustomerId] = useState(fixedCustomerId ?? existing?.customerId ?? defaultCustomerId ?? "");
  const [customerName, setCustomerName] = useState(existing?.customerName ?? fixedCustomer?.name ?? defaultCustomer?.name ?? dispatch?.customerName ?? "");
  const [customerAddress, setCustomerAddress] = useState(existing?.customerAddress ?? fixedCustomer?.addresses[0] ?? defaultCustomer?.addresses[0] ?? dispatch?.customerAddress ?? "");
  const [customerPhone, setCustomerPhone] = useState(existing?.customerPhone ?? fixedCustomer?.phones[0] ?? defaultCustomer?.phones[0] ?? dispatch?.customerPhone ?? "");
  const [customerGstNumber, setCustomerGstNumber] = useState(existing?.customerGstNumber ?? dispatchGstNumber);
  const [customerStateCode, setCustomerStateCode] = useState(existing?.customerStateCode ?? "");
  // Auto-filled from the originating Dispatch's own vehicleNumber (still
  // editable) — same "snapshot, then independently editable" convention as
  // customerAddress/customerPhone above.
  const [vehicleNumber, setVehicleNumber] = useState(existing?.vehicleNumber ?? dispatch?.vehicleNumber ?? "");
  const [gstRatePercent, setGstRatePercent] = useState(existing?.gstRatePercent != null ? String(existing.gstRatePercent) : "");
  const [gstType, setGstType] = useState<"CGST_SGST" | "IGST">(existing?.gstType ?? "CGST_SGST");
  const [termsAndConditions, setTermsAndConditions] = useState(existing?.termsAndConditions ?? activeKiln?.defaultTermsAndConditions ?? "");
  const [items, setItems] = useState<LineItemRow[]>(seedInvoiceItems(existing, dispatch));
  const [discountAmount, setDiscountAmount] = useState(
    existing?.discountAmount != null ? String(existing.discountAmount) : dispatch?.discountAmount != null ? String(dispatch.discountAmount) : ""
  );
  const [amountPaidNow, setAmountPaidNow] = useState(existing?.amountPaidNow != null ? String(existing.amountPaidNow) : "");
  const [paymentMode, setPaymentMode] = useState<PaymentMode>(existing?.paymentMode ?? dispatch?.paymentMode ?? "CASH");
  const [cashAmount, setCashAmount] = useState(existing?.cashAmount != null ? String(existing.cashAmount) : "");
  const [onlineAmount, setOnlineAmount] = useState(existing?.onlineAmount != null ? String(existing.onlineAmount) : "");
  const [invoiceDate, setInvoiceDate] = useState((existing?.invoiceDate ?? dispatch?.dispatchedOn ?? new Date().toISOString()).slice(0, 10));
  const [placeOfSupply, setPlaceOfSupply] = useState(existing?.placeOfSupply ?? dispatch?.placeOfSupply ?? "");
  const [notes, setNotes] = useState(existing?.notes ?? "");
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState("");
  const [customerCurrentPaid, setCustomerCurrentPaid] = useState<number | undefined>(undefined);
  const [customerCurrentDue, setCustomerCurrentDue] = useState<number | undefined>(undefined);
  const [sequenceNumber, setSequenceNumber] = useState("");

  useEffect(() => {
    if (existing) return;
    api.invoices.nextSequenceNumber().then((r) => setSequenceNumber(String(r.nextSequenceNumber)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Live balance for whichever customer is currently linked (fixed,
  // pre-selected, or manually picked) — refetched on every change so
  // switching the picker always previews the right customer's due, never a
  // stale one left over from a previous selection. Only meaningful for a
  // brand-new invoice (see overallDueAfter's own comment below).
  useEffect(() => {
    if (!selectedCustomerId || existing) {
      setCustomerCurrentPaid(undefined);
      setCustomerCurrentDue(undefined);
      return;
    }
    let cancelled = false;
    api.customers
      .detail(selectedCustomerId)
      .then((d) => {
        if (cancelled) return;
        setCustomerCurrentPaid(d.totalPaid);
        setCustomerCurrentDue(d.totalDue);
      })
      .catch(() => {
        if (cancelled) return;
        setCustomerCurrentPaid(undefined);
        setCustomerCurrentDue(undefined);
      });
    return () => {
      cancelled = true;
    };
  }, [selectedCustomerId, existing]);

  const validItems = items.filter(isValidLineItemRow);
  const bricksCount = validItems.reduce((sum, row) => sum + (Number(row.bricksCount) || 0), 0);
  const gross = validItems.reduce((sum, row) => sum + (Number(row.bricksCount) || 0) * (Number(row.pricePerBrick) || 0), 0);
  const net = Math.max(0, gross - (Number(discountAmount) || 0));
  const effectivePaidNow = amountPaidNow ? Number(amountPaidNow) : net;
  const remainingOnThisInvoice = Math.max(0, Math.round((net - effectivePaidNow) * 100) / 100);
  // Only shown for a brand-new invoice — recomputing it correctly for an
  // edit would need backing out the invoice's own old contribution first.
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
    if (validItems.length === 0) return;
    // Validated against effectivePaidNow (what's actually being collected
    // right now), not the invoice's full net total — a customer paying
    // only part of the bill via a Cash+Online split must still be able to
    // save the invoice, with the rest automatically becoming due (see
    // amountPaidNow's own handling below). Requiring the split to sum to
    // the FULL net amount would block exactly that partial-payment case.
    if (isPaymentSplitMismatched(paymentMode, effectivePaidNow, cashAmount, onlineAmount)) {
      setFormError(t("payment.splitMismatch", { total: effectivePaidNow.toLocaleString("en-IN") }));
      return;
    }
    setFormError("");
    setSaving(true);
    try {
      const lineItems = validItems.map((row) => ({
        categoryId: row.categoryId,
        bricksCount: Number(row.bricksCount),
        pricePerBrick: row.pricePerBrick ? Number(row.pricePerBrick) : undefined,
      }));
      const payload = {
        sequenceNumber: sequenceNumber ? Number(sequenceNumber) : undefined,
        customerId: selectedCustomerId || undefined,
        customerName,
        customerAddress: customerAddress || undefined,
        customerPhone: customerPhone || undefined,
        customerGstNumber: customerGstNumber || undefined,
        customerStateCode: customerStateCode || undefined,
        vehicleNumber: vehicleNumber || undefined,
        gstRatePercent: gstRatePercent ? Number(gstRatePercent) : undefined,
        gstType: gstRatePercent ? gstType : undefined,
        termsAndConditions: termsAndConditions || undefined,
        categoryId: lineItems[0].categoryId || undefined,
        bricksCount,
        items: lineItems,
        ratePerBrick: lineItems.length === 1 ? lineItems[0].pricePerBrick : undefined,
        grossAmount: gross || undefined,
        discountAmount: discountAmount ? Number(discountAmount) : undefined,
        netAmount: net,
        amountPaidNow: effectivePaidNow,
        paymentMode,
        cashAmount: paymentMode === "CASH_AND_ONLINE" ? Number(cashAmount) : undefined,
        onlineAmount: paymentMode === "CASH_AND_ONLINE" ? Number(onlineAmount) : undefined,
        placeOfSupply: placeOfSupply || undefined,
        invoiceDate,
        notes: notes || undefined,
      };
      const row = existing ? await api.invoices.update(existing._id, payload) : await api.invoices.create({ dispatchId: dispatch?._id, ...payload });
      // Resolved fresh, post-save, rather than reusing the pre-submit
      // overallDueAfter preview — this invoice is already persisted by now,
      // so api.customers.detail() already reflects it, giving an accurate
      // print on both a brand-new invoice AND an edit (the old preview only
      // ever covered the "new" case).
      const [{ stamp, overallDue }, signatureDataUri] = await Promise.all([
        resolvePaymentInfo({
          customerId: row.customerId || selectedCustomerId || undefined,
          customerName,
          remainingOnThisDoc: Math.max(0, Math.round((row.netAmount - (row.amountPaidNow ?? row.netAmount)) * 100) / 100),
        }),
        api.kilns.fetchSignatureDataUri(),
      ]);
      printInvoiceRecord(row, { ...kilnInfo, signatureDataUri }, categories, overallDue, stamp);
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
        {!existing && (
          <label className="col-span-2 flex flex-col gap-1">
            <span className="text-xs text-ink-muted">{t("dispatchDocs.serialNumberLabel")}</span>
            <input
              type="number"
              value={sequenceNumber}
              onChange={(e) => setSequenceNumber(e.target.value)}
              className={inputClass}
            />
            <span className="text-xs text-ink-muted">{t("dispatchDocs.serialNumberHint")}</span>
          </label>
        )}
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
        <input placeholder={t("dispatchDocs.customerStateCodePlaceholder")} value={customerStateCode} onChange={(e) => setCustomerStateCode(e.target.value)} className={inputClass} />
        <input placeholder={t("dispatch.vehicleNumberPlaceholder")} value={vehicleNumber} onChange={(e) => setVehicleNumber(e.target.value)} className={inputClass} />

        {/* Read-only — set once in Settings, auto-fetched onto every new
            invoice from there (see kilnInfo.stateCode above) and printed
            in the header next to the GSTIN. Shown here so the admin can
            see/confirm it's actually configured before printing. */}
        <div className="col-span-2 flex items-center justify-between rounded-xl border border-border bg-ink-primary/5 px-3 py-2">
          <span className="text-xs text-ink-muted">{t("dispatchDocs.adminStateCodeLabel")}</span>
          <span className={activeKiln?.stateCode ? "text-sm font-semibold text-ink-primary" : "text-xs text-status-warning"}>
            {activeKiln?.stateCode || t("dispatchDocs.adminStateCodeMissing")}
          </span>
        </div>

        {!existing && selectedCustomerId && customerCurrentDue != null && (
          <div className="col-span-2 grid grid-cols-2 gap-2 rounded-xl border border-border bg-ink-primary/5 px-3 py-2">
            <div className="text-center">
              <p className="text-xs text-ink-muted">{t("customer.totalPaidLabel")}</p>
              <p className="text-sm font-semibold tabular-nums text-ink-primary">₹{formatINR(customerCurrentPaid ?? 0)}</p>
            </div>
            <div className="text-center">
              <p className="text-xs text-ink-muted">{t("customer.totalDueLabel")}</p>
              <p className="text-sm font-semibold tabular-nums text-ink-primary">₹{formatINR(customerCurrentDue)}</p>
            </div>
          </div>
        )}

        <div className="col-span-2">
          <BrickLineItemsEditor items={items} onChange={setItems} categories={categories} />
        </div>
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
        <label className="flex flex-col gap-1">
          <span className="text-xs text-ink-muted">{t("common.transactionDate")}</span>
          <DateInput required value={invoiceDate} onChange={(e) => setInvoiceDate(e.target.value)} className={inputClass} />
        </label>
        <input
          placeholder={t("dispatchDocs.placeOfSupplyPlaceholder")}
          value={placeOfSupply}
          onChange={(e) => setPlaceOfSupply(e.target.value)}
          className="col-span-2 h-10 rounded-xl border border-border bg-ink-primary/5 px-3 text-sm text-ink-primary outline-none focus:ring-2 focus:ring-series-1"
        />

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
              totalAmount={effectivePaidNow}
              cashAmount={cashAmount}
              onlineAmount={onlineAmount}
              onCashAmountChange={setCashAmount}
              onOnlineAmountChange={setOnlineAmount}
              inputClassName={inputClass}
            />
          </div>
        )}
        <input placeholder={t("common.notes")} value={notes} onChange={(e) => setNotes(e.target.value)} className="col-span-2 h-10 rounded-xl border border-border bg-ink-primary/5 px-3 text-sm text-ink-primary outline-none focus:ring-2 focus:ring-series-1" />

        <div className="col-span-2 flex flex-col gap-2 rounded-xl border border-border bg-ink-primary/5 p-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-ink-muted">{t("dispatchDocs.gstDetailsSection")}</p>
          <p className="text-xs text-ink-muted">{t("dispatchDocs.gstDetailsHint")}</p>
          <div className="grid grid-cols-2 gap-2">
            <input
              type="number"
              step="0.01"
              placeholder={t("dispatchDocs.gstRatePlaceholder")}
              value={gstRatePercent}
              onChange={(e) => setGstRatePercent(e.target.value)}
              className={inputClass}
            />
            {gstRatePercent && (
              <select value={gstType} onChange={(e) => setGstType(e.target.value as "CGST_SGST" | "IGST")} className={inputClass}>
                <option value="CGST_SGST">{t("dispatchDocs.gstTypeSameState")}</option>
                <option value="IGST">{t("dispatchDocs.gstTypeDifferentState")}</option>
              </select>
            )}
          </div>
        </div>
        <textarea
          placeholder={t("settings.termsAndConditionsPlaceholder")}
          value={termsAndConditions}
          onChange={(e) => setTermsAndConditions(e.target.value)}
          rows={3}
          className="col-span-2 rounded-xl border border-border bg-ink-primary/5 px-3 py-2 text-sm text-ink-primary outline-none focus:ring-2 focus:ring-series-1"
        />

        {formError && <p className="col-span-2 text-sm text-status-critical">{formError}</p>}
        <Button type="submit" disabled={saving} className="col-span-2">
          {existing ? t("dispatchDocs.saveAndReprintInvoice") : t("dispatchDocs.generateInvoice")}
        </Button>
      </form>
    </Card>
  );
}
