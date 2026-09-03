import { FormEvent, useEffect, useState } from "react";
import { X } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { DateInput } from "@/components/ui/date-input";
import { cn, formatINR, formatVehicleNumber } from "@/lib/utils";
import { api } from "@/lib/api";
import { useTranslation } from "@/hooks/useTranslation";
import { BrickLineItemsEditor, isValidLineItemRow, lineItemRowsFrom, type LineItemRow } from "@/components/dispatch/BrickLineItemsEditor";
import { AmountPaymentModeFields } from "@/components/shared/AmountPaymentModeFields";
import { PaymentSplitFields, isPaymentSplitMismatched } from "@/components/shared/PaymentSplitFields";
import { VehicleNumberInput } from "@/components/shared/VehicleNumberInput";
import type { BrickCategory, BrickGrade, Dispatch as DispatchEntry, LaborPaymentMode, PaymentMode, Person } from "@/types";

const inputClass =
  "h-10 rounded-xl border border-border bg-ink-primary/5 px-3 text-sm text-ink-primary outline-none focus:ring-2 focus:ring-series-1";

interface EditDispatchModalProps {
  dispatch: DispatchEntry;
  onClose: () => void;
  onSaved: () => void;
}

// Shared by Dispatch.tsx, Billing.tsx, and GatePass.tsx — the editable
// field set (a bill/invoice/gate pass/challan are all just print views of
// the same Dispatch record) is identical regardless of which page opened
// it, so one modal is correct rather than three. Never rewrites the
// original ledger DUE or stock deduction; the backend posts a correction
// for exactly the delta instead (see dispatch.service.ts:updateDispatch),
// same convention as EditPaymentReceiptModal. Field set mirrors the Log
// Dispatch create form (Dispatch.tsx) exactly — driverName/driverPhone are
// free text there (not a driverId picker), so this matches rather than
// falling back to the older Person-linked driver select.
export function EditDispatchModal({ dispatch, onClose, onSaved }: EditDispatchModalProps) {
  const { t } = useTranslation();
  const [customers, setCustomers] = useState<Person[]>([]);
  const [categories, setCategories] = useState<BrickCategory[]>([]);

  const initialCustomerId = typeof dispatch.customerId === "object" ? dispatch.customerId?._id ?? "" : dispatch.customerId ?? "";
  const grossAmount = dispatch.amount + (dispatch.discountAmount ?? 0);

  const [customerId, setCustomerId] = useState(initialCustomerId);
  const [customerName, setCustomerName] = useState(dispatch.customerName);
  const [customerAddress, setCustomerAddress] = useState(dispatch.customerAddress ?? "");
  const [customerPhone, setCustomerPhone] = useState(dispatch.customerPhone ?? "");
  const [grade, setGrade] = useState<BrickGrade>(dispatch.grade);
  const [items, setItems] = useState<LineItemRow[]>(lineItemRowsFrom(dispatch));
  const [amount, setAmount] = useState(String(grossAmount));
  const [discountAmount, setDiscountAmount] = useState(dispatch.discountAmount ? String(dispatch.discountAmount) : "");
  const [paymentMode, setPaymentMode] = useState<PaymentMode | "">(dispatch.paymentMode ?? "");
  const [cashAmount, setCashAmount] = useState(dispatch.cashAmount != null ? String(dispatch.cashAmount) : "");
  const [onlineAmount, setOnlineAmount] = useState(dispatch.onlineAmount != null ? String(dispatch.onlineAmount) : "");
  const [driverName, setDriverName] = useState(dispatch.driverName ?? "");
  const [driverPhone, setDriverPhone] = useState(dispatch.driverPhone ?? "");
  const [vehicleNumber, setVehicleNumber] = useState(dispatch.vehicleNumber ? formatVehicleNumber(dispatch.vehicleNumber) : "");
  const [vehicleType, setVehicleType] = useState(dispatch.vehicleType ?? "");
  const [driverTipAmount, setDriverTipAmount] = useState(dispatch.driverTipAmount ? String(dispatch.driverTipAmount) : "");
  const [driverTipPaymentMode, setDriverTipPaymentMode] = useState<LaborPaymentMode | "">(dispatch.driverTipPaymentMode ?? "");
  const [driverTipCashAmount, setDriverTipCashAmount] = useState(dispatch.driverTipCashAmount != null ? String(dispatch.driverTipCashAmount) : "");
  const [driverTipOnlineAmount, setDriverTipOnlineAmount] = useState(
    dispatch.driverTipOnlineAmount != null ? String(dispatch.driverTipOnlineAmount) : ""
  );
  const [transportCost, setTransportCost] = useState(dispatch.transportCost ? String(dispatch.transportCost) : "");
  const [transportPaidBy, setTransportPaidBy] = useState<"OWNER" | "CUSTOMER">(dispatch.transportPaidBy ?? "OWNER");
  const [placeOfSupply, setPlaceOfSupply] = useState(dispatch.placeOfSupply ?? "");
  const [notes, setNotes] = useState(dispatch.notes ?? "");
  const [dispatchedOn, setDispatchedOn] = useState((dispatch.dispatchedOn ?? "").slice(0, 10));
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState("");

  useEffect(() => {
    Promise.all([api.people.list("CUSTOMER"), api.brickCategories.list()]).then(([customerData, categoryData]) => {
      setCustomers(customerData);
      setCategories(categoryData);
    });
  }, []);

  function handleCustomerSelect(id: string) {
    const customer = customers.find((c) => c._id === id);
    setCustomerId(id);
    if (customer) {
      setCustomerName(customer.name);
      setCustomerPhone(customer.phone ?? customerPhone);
      setCustomerAddress(customer.address ?? customerAddress);
    }
  }

  const validItems = items.filter(isValidLineItemRow);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!customerName || validItems.length === 0 || !amount) return;
    if (Number(discountAmount) > Number(amount)) {
      setFormError(t("dispatch.discountExceedsAmount"));
      return;
    }
    if (isPaymentSplitMismatched(driverTipPaymentMode, Number(driverTipAmount) || 0, driverTipCashAmount, driverTipOnlineAmount)) {
      setFormError(t("payment.splitMismatch", { total: (Number(driverTipAmount) || 0).toLocaleString("en-IN") }));
      return;
    }
    const netAmountForSplit = Math.max(0, (Number(amount) || 0) - (Number(discountAmount) || 0));
    if (isPaymentSplitMismatched(paymentMode, netAmountForSplit, cashAmount, onlineAmount)) {
      setFormError(t("payment.splitMismatch", { total: netAmountForSplit.toLocaleString("en-IN") }));
      return;
    }
    setFormError("");
    setSaving(true);
    try {
      await api.dispatch.update(dispatch._id, {
        customerName,
        customerId: customerId || null,
        customerAddress: customerAddress || undefined,
        customerPhone: customerPhone || undefined,
        grade,
        items: validItems.map((row) => ({
          categoryId: row.categoryId,
          bricksCount: Number(row.bricksCount),
          pricePerBrick: row.pricePerBrick ? Number(row.pricePerBrick) : undefined,
        })),
        amount: Number(amount),
        discountAmount: discountAmount ? Number(discountAmount) : 0,
        paymentMode: paymentMode || undefined,
        cashAmount: paymentMode === "CASH_AND_ONLINE" ? Number(cashAmount) : undefined,
        onlineAmount: paymentMode === "CASH_AND_ONLINE" ? Number(onlineAmount) : undefined,
        driverName: driverName || undefined,
        driverPhone: driverPhone || undefined,
        vehicleNumber: vehicleNumber || undefined,
        vehicleType: vehicleType || undefined,
        driverTipAmount: driverTipAmount ? Number(driverTipAmount) : undefined,
        driverTipPaymentMode: driverTipPaymentMode || undefined,
        driverTipCashAmount: driverTipPaymentMode === "CASH_AND_ONLINE" ? Number(driverTipCashAmount) : undefined,
        driverTipOnlineAmount: driverTipPaymentMode === "CASH_AND_ONLINE" ? Number(driverTipOnlineAmount) : undefined,
        transportCost: transportCost ? Number(transportCost) : undefined,
        transportPaidBy: transportCost ? transportPaidBy : undefined,
        placeOfSupply: placeOfSupply || undefined,
        notes: notes || undefined,
        dispatchedOn: dispatchedOn || undefined,
      });
      onSaved();
      onClose();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : t("common.somethingWentWrong"));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <Card className="w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h3 className="text-sm font-semibold text-ink-primary">{t("dispatch.editDispatch")}</h3>
            <p className="text-sm text-ink-muted">{dispatch.slipNumber}</p>
          </div>
          <button onClick={onClose} className="text-ink-muted hover:text-ink-primary">
            <X className="h-4 w-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="grid grid-cols-2 gap-2">
          <select value={customerId} onChange={(e) => handleCustomerSelect(e.target.value)} className={inputClass}>
            <option value="">{t("dispatch.walkInCustomer")}</option>
            {customers.map((c) => (
              <option key={c._id} value={c._id}>
                {c.name}
              </option>
            ))}
          </select>
          <input
            required
            placeholder={t("dispatch.customerNamePlaceholder")}
            value={customerName}
            // Editing this name does NOT clear customerId — the dropdown
            // above is the only thing that links/unlinks a real Customer
            // (its own "walk-in customer" option is how to go back to
            // none). See Dispatch.tsx's own customerName field for the
            // full history: this used to reset customerId on every
            // keystroke here too, so fixing a typo on an already-linked
            // dispatch would silently detach it from the real customer on
            // save — the same bug already fixed on the create form, just
            // never carried over to this edit modal.
            onChange={(e) => setCustomerName(e.target.value)}
            className={inputClass}
          />
          <input
            placeholder={t("dispatch.clientPhonePlaceholder")}
            value={customerPhone}
            onChange={(e) => setCustomerPhone(e.target.value)}
            className={inputClass}
          />
          <input
            placeholder={t("dispatch.clientAddressPlaceholder")}
            value={customerAddress}
            onChange={(e) => setCustomerAddress(e.target.value)}
            className={inputClass}
          />
          <select value={grade} onChange={(e) => setGrade(e.target.value as BrickGrade)} className={inputClass}>
            <option value="A1">{t("dispatch.gradeA1")}</option>
            <option value="JHAMA">{t("dispatch.gradeJhama")}</option>
            <option value="PELA">{t("dispatch.gradePela")}</option>
          </select>
          <div className="col-span-2">
            <BrickLineItemsEditor items={items} onChange={setItems} categories={categories} />
          </div>
          <input
            required
            type="number"
            placeholder={t("dispatch.amountPlaceholder")}
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            className={inputClass}
          />
          <input
            type="number"
            placeholder={t("dispatch.discountPlaceholder")}
            value={discountAmount}
            onChange={(e) => setDiscountAmount(e.target.value)}
            className={inputClass}
          />
          {discountAmount && Number(discountAmount) > 0 && amount && (
            <p className="col-span-2 text-sm text-ink-secondary">
              {t("dispatch.netAmountPreview")}:{" "}
              <span className="font-semibold text-ink-primary">₹{formatINR(Math.max(0, Number(amount) - Number(discountAmount)))}</span>
            </p>
          )}
          <label className="col-span-2 flex flex-col gap-1">
            <span className="text-xs text-ink-muted">{t("common.howWasThisPaid")}</span>
            <select value={paymentMode} onChange={(e) => setPaymentMode(e.target.value as PaymentMode)} className={inputClass}>
              <option value="">{t("common.select")}</option>
              <option value="CASH">{t("dispatch.paymentCash")}</option>
              <option value="BANK">{t("dispatch.paymentBankTransfer")}</option>
              <option value="UPI">{t("dispatch.paymentUpi")}</option>
              <option value="GST_INVOICE">{t("dispatch.paymentGstInvoice")}</option>
              <option value="CASH_AND_ONLINE">{t("common.paymentModeCashAndOnline")}</option>
            </select>
          </label>
          {paymentMode === "CASH_AND_ONLINE" && (
            <div className="col-span-2">
              <PaymentSplitFields
                totalAmount={Math.max(0, Number(amount) - Number(discountAmount || 0))}
                cashAmount={cashAmount}
                onlineAmount={onlineAmount}
                onCashAmountChange={setCashAmount}
                onOnlineAmountChange={setOnlineAmount}
                inputClassName={inputClass}
              />
            </div>
          )}
          <input
            placeholder={t("dispatch.driverNamePlaceholder")}
            value={driverName}
            onChange={(e) => setDriverName(e.target.value)}
            className={inputClass}
          />
          <input
            placeholder={t("dispatch.driverPhonePlaceholder")}
            value={driverPhone}
            onChange={(e) => setDriverPhone(e.target.value)}
            className={inputClass}
          />
          <input
            placeholder={t("dispatch.driverTipPlaceholder")}
            type="number"
            value={driverTipAmount}
            onChange={(e) => setDriverTipAmount(e.target.value)}
            className={inputClass}
          />
          {Number(driverTipAmount) > 0 && (
            <AmountPaymentModeFields
              amount={Number(driverTipAmount)}
              paymentMode={driverTipPaymentMode}
              cashAmount={driverTipCashAmount}
              onlineAmount={driverTipOnlineAmount}
              onPaymentModeChange={setDriverTipPaymentMode}
              onCashAmountChange={setDriverTipCashAmount}
              onOnlineAmountChange={setDriverTipOnlineAmount}
              inputClassName={inputClass}
            />
          )}
          <VehicleNumberInput
            placeholder={t("dispatch.vehicleNumberPlaceholder")}
            value={vehicleNumber}
            onChange={setVehicleNumber}
            className={inputClass}
          />
          <select value={vehicleType} onChange={(e) => setVehicleType(e.target.value)} className={inputClass}>
            <option value="">{t("dispatch.vehicleTypePlaceholder")}</option>
            <option value="TRUCK">{t("brickLoading.truck")}</option>
            <option value="TRACTOR">{t("brickLoading.tractor")}</option>
          </select>
          <label className="flex flex-col gap-1">
            <span className="text-xs text-ink-muted">{t("common.transactionDate")}</span>
            <DateInput required value={dispatchedOn} onChange={(e) => setDispatchedOn(e.target.value)} className={inputClass} />
          </label>
          <input
            placeholder={t("dispatchDocs.placeOfSupplyPlaceholder")}
            value={placeOfSupply}
            onChange={(e) => setPlaceOfSupply(e.target.value)}
            className={inputClass}
          />
          <input
            type="number"
            placeholder={t("dispatch.transportCostPlaceholder")}
            value={transportCost}
            onChange={(e) => setTransportCost(e.target.value)}
            className={inputClass}
          />
          {transportCost && (
            <select
              value={transportPaidBy}
              onChange={(e) => setTransportPaidBy(e.target.value as "OWNER" | "CUSTOMER")}
              className={cn(inputClass, "col-span-2")}
            >
              <option value="OWNER">{t("dispatch.transportPaidByOwner")}</option>
              <option value="CUSTOMER">{t("dispatch.transportPaidByCustomer")}</option>
            </select>
          )}
          <input
            placeholder={t("dispatch.notesPlaceholder")}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            className="col-span-2 h-10 rounded-xl border border-border bg-ink-primary/5 px-3 text-sm text-ink-primary outline-none focus:ring-2 focus:ring-series-1"
          />
          {formError && <p className="col-span-2 text-sm text-status-critical">{formError}</p>}
          <Button type="submit" disabled={saving} className="col-span-2">
            {t("common.saveChanges")}
          </Button>
        </form>
      </Card>
    </div>
  );
}
