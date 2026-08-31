import { FormEvent, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { ClipboardList, Plus, X } from "lucide-react";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { DateInput } from "@/components/ui/date-input";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { EmptyState } from "@/components/ui/empty-state";
import { ConfirmDialog } from "@/components/shared/ConfirmDialog";
import { PaymentSplitFields, isPaymentSplitMismatched } from "@/components/shared/PaymentSplitFields";
import { BrickLineItemsEditor, emptyLineItemRow, isValidLineItemRow, type LineItemRow } from "@/components/dispatch/BrickLineItemsEditor";
import { api } from "@/lib/api";
import { useKilnEvent } from "@/hooks/useKilnEvent";
import { useAuthStore } from "@/store/auth.store";
import { useTranslation } from "@/hooks/useTranslation";
import { formatINR, cn } from "@/lib/utils";
import type { BrickCategory, Customer, PaymentMode, SaleOrder } from "@/types";

const inputClass =
  "h-10 rounded-xl border border-border bg-ink-primary/5 px-3 text-sm text-ink-primary outline-none focus:ring-2 focus:ring-series-1";

const STATUS_TONE: Record<SaleOrder["status"], string> = {
  PENDING: "bg-series-4/15 text-series-4",
  PARTIALLY_FULFILLED: "bg-series-2/15 text-series-2",
  FULFILLED: "bg-status-good/15 text-status-good",
  CANCELLED: "bg-ink-primary/10 text-ink-muted",
};

function CreateSaleOrderForm({ customers, categories, onClose, onSaved }: { customers: Customer[]; categories: BrickCategory[]; onClose: () => void; onSaved: () => void }) {
  const { t } = useTranslation();
  const [customerId, setCustomerId] = useState("");
  const [customerName, setCustomerName] = useState("");
  const [items, setItems] = useState<LineItemRow[]>([emptyLineItemRow()]);
  const [estimatedAmount, setEstimatedAmount] = useState("");
  const [orderDate, setOrderDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [expectedDeliveryDate, setExpectedDeliveryDate] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const validRows = items.filter(isValidLineItemRow);
    const name = customerId ? customers.find((c) => c._id === customerId)?.name ?? customerName : customerName;
    if (!name.trim() || validRows.length === 0) {
      setError(t("saleOrder.customerAndItemsRequired"));
      return;
    }
    setSaving(true);
    setError("");
    try {
      await api.saleOrders.create({
        customerId: customerId || undefined,
        customerName: name.trim(),
        items: validRows.map((r) => ({ categoryId: r.categoryId, bricksCount: Number(r.bricksCount), pricePerBrick: r.pricePerBrick ? Number(r.pricePerBrick) : undefined })),
        estimatedAmount: estimatedAmount ? Number(estimatedAmount) : undefined,
        orderDate,
        expectedDeliveryDate: expectedDeliveryDate || undefined,
        notes: notes.trim() || undefined,
      });
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card className="max-w-xl">
      <CardHeader>
        <CardTitle>{t("saleOrder.newOrder")}</CardTitle>
      </CardHeader>
      <form onSubmit={handleSubmit} className="flex flex-col gap-3">
        <label className="flex flex-col gap-1">
          <span className="text-xs text-ink-muted">{t("reports.filter.customer")}</span>
          <SearchableSelect value={customerId} onChange={setCustomerId} options={customers.map((c) => ({ value: c._id, label: c.name }))} placeholder={t("saleOrder.orTypeNamePlaceholder")} />
        </label>
        {!customerId && <input placeholder={t("saleOrder.orTypeNamePlaceholder")} value={customerName} onChange={(e) => setCustomerName(e.target.value)} className={inputClass} />}
        <BrickLineItemsEditor items={items} onChange={setItems} categories={categories} pricingEnabled />
        <input type="number" min={0} placeholder={t("saleOrder.estimatedAmountPlaceholder")} value={estimatedAmount} onChange={(e) => setEstimatedAmount(e.target.value)} className={inputClass} />
        <div className="grid grid-cols-2 gap-2">
          <label className="flex flex-col gap-1">
            <span className="text-xs text-ink-muted">{t("saleOrder.orderDate")}</span>
            <DateInput value={orderDate} onChange={(e) => setOrderDate(e.target.value)} className={inputClass} />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs text-ink-muted">{t("saleOrder.expectedDeliveryDate")}</span>
            <DateInput value={expectedDeliveryDate} onChange={(e) => setExpectedDeliveryDate(e.target.value)} className={inputClass} />
          </label>
        </div>
        <textarea placeholder={t("common.notes")} value={notes} onChange={(e) => setNotes(e.target.value)} className={cn(inputClass, "h-20 resize-none py-2")} />
        {error && <p className="text-sm text-status-critical">{error}</p>}
        <div className="flex gap-2">
          <Button type="submit" disabled={saving}>
            {saving ? t("settings.savingEllipsis") : t("common.save")}
          </Button>
          <Button type="button" variant="outline" onClick={onClose}>
            {t("common.cancel")}
          </Button>
        </div>
      </form>
    </Card>
  );
}

function FulfillModal({ order, onClose, onSaved }: { order: SaleOrder; onClose: () => void; onSaved: () => void }) {
  const { t } = useTranslation();
  const pending = order.bricksCount - order.bricksFulfilled;
  const [bricksCount, setBricksCount] = useState(String(pending));
  const [amount, setAmount] = useState(order.ratePerBrick ? String(Math.round(pending * order.ratePerBrick)) : "");
  const [vehicleNumber, setVehicleNumber] = useState("");
  const [driverName, setDriverName] = useState("");
  const [paymentMode, setPaymentMode] = useState<PaymentMode>("CASH");
  const [cashAmount, setCashAmount] = useState("");
  const [onlineAmount, setOnlineAmount] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (Number(bricksCount) <= 0 || Number(bricksCount) > pending) {
      setError(t("saleOrder.bricksCountExceedsPending", { pending }));
      return;
    }
    if (isPaymentSplitMismatched(paymentMode, Number(amount) || 0, cashAmount, onlineAmount)) {
      setError(t("payment.splitMismatch", { total: Number(amount) || 0 }));
      return;
    }
    setSaving(true);
    setError("");
    try {
      await api.saleOrders.fulfill(order._id, {
        bricksCount: Number(bricksCount),
        amount: Number(amount) || 0,
        vehicleNumber: vehicleNumber.trim() || undefined,
        driverName: driverName.trim() || undefined,
        paymentMode,
        cashAmount: paymentMode === "CASH_AND_ONLINE" ? Number(cashAmount) : undefined,
        onlineAmount: paymentMode === "CASH_AND_ONLINE" ? Number(onlineAmount) : undefined,
      });
      onSaved();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  }

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink-primary/50 p-4 backdrop-blur-sm">
      <Card className="w-full max-w-sm hover:translate-y-0">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h3 className="text-sm font-semibold text-ink-primary">{t("saleOrder.fulfillOrder")}</h3>
            <p className="text-sm text-ink-muted">{order.customerName}</p>
          </div>
          <button onClick={onClose} className="text-ink-muted hover:text-ink-primary">
            <X className="h-4 w-4" />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="flex flex-col gap-2.5">
          <input type="number" min={1} max={pending} placeholder={t("brickLoading.bricksLoadedPlaceholder")} value={bricksCount} onChange={(e) => setBricksCount(e.target.value)} className={inputClass} />
          <p className="text-xs text-ink-muted">{t("saleOrder.pendingCount", { pending })}</p>
          <input type="number" min={0} placeholder={t("common.amount")} value={amount} onChange={(e) => setAmount(e.target.value)} className={inputClass} />
          <input placeholder={t("dispatch.vehicleNumberPlaceholder")} value={vehicleNumber} onChange={(e) => setVehicleNumber(e.target.value)} className={inputClass} />
          <input placeholder={t("dispatch.driverNamePlaceholder")} value={driverName} onChange={(e) => setDriverName(e.target.value)} className={inputClass} />
          <select value={paymentMode} onChange={(e) => setPaymentMode(e.target.value as PaymentMode)} className={inputClass}>
            <option value="CASH">{t("billing.paymentCash")}</option>
            <option value="BANK">{t("billing.paymentBank")}</option>
            <option value="UPI">{t("billing.paymentUpi")}</option>
            <option value="CASH_AND_ONLINE">{t("common.paymentModeCashAndOnline")}</option>
          </select>
          {paymentMode === "CASH_AND_ONLINE" && (
            <PaymentSplitFields totalAmount={Number(amount) || 0} cashAmount={cashAmount} onlineAmount={onlineAmount} onCashAmountChange={setCashAmount} onOnlineAmountChange={setOnlineAmount} inputClassName={inputClass} />
          )}
          {error && <p className="text-sm text-status-critical">{error}</p>}
          <div className="flex gap-2">
            <Button type="submit" disabled={saving}>
              {saving ? t("settings.savingEllipsis") : t("saleOrder.fulfillOrder")}
            </Button>
            <Button type="button" variant="outline" onClick={onClose}>
              {t("common.cancel")}
            </Button>
          </div>
        </form>
      </Card>
    </div>,
    document.body
  );
}

export function SaleOrders() {
  const [orders, setOrders] = useState<SaleOrder[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [categories, setCategories] = useState<BrickCategory[]>([]);
  const [mode, setMode] = useState<"list" | "add">("list");
  const [fulfilling, setFulfilling] = useState<SaleOrder | null>(null);
  const [cancelling, setCancelling] = useState<SaleOrder | null>(null);
  const activeKilnId = useAuthStore((s) => s.activeKilnId);
  const { t } = useTranslation();

  async function refresh() {
    setOrders(await api.saleOrders.list());
  }

  useEffect(() => {
    if (!activeKilnId) return;
    refresh().catch(console.error);
    api.customers.list().then(setCustomers).catch(console.error);
    api.brickCategories.list().then(setCategories).catch(console.error);
  }, [activeKilnId]);

  useKilnEvent("saleOrder:update", () => refresh());

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap justify-end gap-2">
        <Button size="sm" variant={mode === "add" ? "primary" : "outline"} onClick={() => setMode("add")}>
          <Plus className="h-4 w-4" /> {t("saleOrder.newOrder")}
        </Button>
        <Button size="sm" variant={mode === "list" ? "primary" : "outline"} onClick={() => setMode("list")}>
          <ClipboardList className="h-4 w-4" /> {t("nav.saleOrders")}
        </Button>
      </div>

      {mode === "add" ? (
        <CreateSaleOrderForm
          customers={customers}
          categories={categories}
          onClose={() => setMode("list")}
          onSaved={() => {
            setMode("list");
            refresh();
          }}
        />
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>{t("nav.saleOrders")}</CardTitle>
          </CardHeader>
          {orders.length === 0 ? (
            <EmptyState icon={ClipboardList} title={t("saleOrder.noOrdersYet")} />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[720px] text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-sm text-ink-muted">
                    <th className="pb-2 font-medium">{t("reports.col.serial")}</th>
                    <th className="pb-2 font-medium">{t("reports.col.customer")}</th>
                    <th className="pb-2 text-right font-medium">{t("reports.col.bricksCount")}</th>
                    <th className="pb-2 text-right font-medium">{t("reports.col.bricksPending")}</th>
                    <th className="pb-2 font-medium">{t("reports.col.status")}</th>
                    <th className="pb-2 font-medium text-right">{t("common.actions")}</th>
                  </tr>
                </thead>
                <tbody>
                  {orders.map((o) => (
                    <tr key={o._id} className="border-b border-border/60 last:border-0">
                      <td className="py-3 text-ink-primary">{o.sequenceNumber != null ? `SO-${o.sequenceNumber}` : "—"}</td>
                      <td className="py-3 text-ink-secondary">{o.customerName}</td>
                      <td className="py-3 text-right tabular-nums text-ink-secondary">{o.bricksCount.toLocaleString("en-IN")}</td>
                      <td className="py-3 text-right tabular-nums font-medium text-ink-primary">{(o.bricksCount - o.bricksFulfilled).toLocaleString("en-IN")}</td>
                      <td className="py-3">
                        <span className={cn("rounded-full px-2.5 py-1 text-xs font-semibold", STATUS_TONE[o.status])}>{t(`saleOrder.status.${o.status}`)}</span>
                      </td>
                      <td className="py-3">
                        <div className="flex justify-end gap-1.5">
                          {(o.status === "PENDING" || o.status === "PARTIALLY_FULFILLED") && (
                            <>
                              <Button size="sm" variant="outline" onClick={() => setFulfilling(o)}>
                                {t("saleOrder.fulfillOrder")}
                              </Button>
                              <Button size="sm" variant="outline" onClick={() => setCancelling(o)}>
                                {t("common.cancel")}
                              </Button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      )}

      {fulfilling && <FulfillModal order={fulfilling} onClose={() => setFulfilling(null)} onSaved={refresh} />}

      {cancelling && (
        <ConfirmDialog
          title={t("common.cancel")}
          detail={t("saleOrder.confirmCancel", { serial: cancelling.sequenceNumber ?? "" })}
          confirmLabel={t("common.cancel")}
          loading={false}
          onCancel={() => setCancelling(null)}
          onConfirm={async () => {
            await api.saleOrders.cancel(cancelling._id);
            setCancelling(null);
            refresh();
          }}
        />
      )}
    </div>
  );
}
