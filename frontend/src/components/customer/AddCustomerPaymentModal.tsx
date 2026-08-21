import { FormEvent, useState } from "react";
import { X } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { DateInput } from "@/components/ui/date-input";
import { api } from "@/lib/api";
import { useAuthStore } from "@/store/auth.store";
import { useTranslation } from "@/hooks/useTranslation";
import { formatINR } from "@/lib/utils";
import { printInvoiceRecord } from "@/lib/printDocument";
import { resolvePaymentInfo } from "@/lib/paymentStatus";
import type { Customer, PaymentMode } from "@/types";

const inputClass =
  "h-10 rounded-xl border border-border bg-ink-primary/5 px-3 text-sm text-ink-primary outline-none focus:ring-2 focus:ring-series-1";

interface AddCustomerPaymentModalProps {
  customer: Customer;
  currentDue: number;
  onClose: () => void;
  onSaved: () => void;
}

// A general/advance payment with no brick sale behind it — bricksCount=0,
// netAmount=amountPaidNow=the amount paid, so it contributes fully to
// totalPaid and nothing to totalDue (see customer.service.ts's
// getCustomerDetail). Still lands in the same invoices list/table as
// every priced sale, per the admin's explicit request that this "generate
// a corresponding receipt/invoice entry in the list below".
export function AddCustomerPaymentModal({ customer, currentDue, onClose, onSaved }: AddCustomerPaymentModalProps) {
  const { t } = useTranslation();
  const kilns = useAuthStore((s) => s.kilns);
  const activeKilnId = useAuthStore((s) => s.activeKilnId);
  const activeKiln = kilns.find((k) => k.kilnId === activeKilnId);
  const kilnInfo = { name: activeKiln?.name ?? "Bhatta Cloud", location: activeKiln?.location, phone: activeKiln?.phone, gstNumber: activeKiln?.gstNumber };

  const [amount, setAmount] = useState("");
  const [paymentMode, setPaymentMode] = useState<PaymentMode>("CASH");
  const [paymentDate, setPaymentDate] = useState(new Date().toISOString().slice(0, 10));
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);

  const remainingDueAfter = Math.max(0, currentDue - (Number(amount) || 0));

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      const paidAmount = Number(amount);
      const row = await api.invoices.create({
        customerId: customer._id,
        customerName: customer.name,
        customerPhone: customer.phones[0],
        customerAddress: customer.addresses[0],
        bricksCount: 0,
        netAmount: paidAmount,
        amountPaidNow: paidAmount,
        paymentMode,
        invoiceDate: paymentDate,
        notes: notes || t("customer.advancePaymentDefaultNote"),
      });
      const { stamp, overallDue } = await resolvePaymentInfo({ customerId: customer._id, customerName: customer.name, remainingOnThisDoc: 0 });
      printInvoiceRecord(row, kilnInfo, [], overallDue ?? remainingDueAfter, stamp, t("customer.advancePaymentCategoryLabel"));
      onSaved();
      onClose();
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <Card className="w-full max-w-md">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-ink-primary">{t("customer.addAmountTitle")}</h3>
          <button onClick={onClose} className="text-ink-muted hover:text-ink-primary">
            <X className="h-4 w-4" />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="flex flex-col gap-3">
          <input required type="number" placeholder={t("customer.amountPlaceholder")} value={amount} onChange={(e) => setAmount(e.target.value)} className={inputClass} />
          <select value={paymentMode} onChange={(e) => setPaymentMode(e.target.value as PaymentMode)} className={inputClass}>
            <option value="CASH">{t("dispatch.paymentCash")}</option>
            <option value="BANK">{t("dispatch.paymentBankTransfer")}</option>
            <option value="UPI">{t("dispatch.paymentUpi")}</option>
          </select>
          <DateInput required value={paymentDate} onChange={(e) => setPaymentDate(e.target.value)} className={inputClass} />
          <input placeholder={t("common.notes")} value={notes} onChange={(e) => setNotes(e.target.value)} className={inputClass} />

          <div className="rounded-xl border border-series-1/30 bg-series-1/5 px-4 py-3">
            <div className="flex items-center justify-between text-sm">
              <span className="text-ink-secondary">{t("customer.currentDueLabel")}</span>
              <span className="font-medium tabular-nums text-ink-primary">₹{formatINR(currentDue)}</span>
            </div>
            <div className="mt-1 flex items-center justify-between text-sm">
              <span className="text-ink-secondary">{t("customer.dueAfterPaymentLabel")}</span>
              <span className="font-semibold tabular-nums text-ink-primary">₹{formatINR(remainingDueAfter)}</span>
            </div>
          </div>

          <Button type="submit" disabled={saving}>
            {t("customer.savePayment")}
          </Button>
        </form>
      </Card>
    </div>
  );
}
