import { FormEvent, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { ClipboardList, Plus, X } from "lucide-react";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { EmptyState } from "@/components/ui/empty-state";
import { ConfirmDialog } from "@/components/shared/ConfirmDialog";
import { AmountPaymentModeFields } from "@/components/shared/AmountPaymentModeFields";
import { isPaymentSplitMismatched } from "@/components/shared/PaymentSplitFields";
import { api } from "@/lib/api";
import { useKilnEvent } from "@/hooks/useKilnEvent";
import { useAuthStore } from "@/store/auth.store";
import { useTranslation } from "@/hooks/useTranslation";
import { formatINR, cn } from "@/lib/utils";
import type { PurchaseOrder, Supplier, SupplierInvoiceItem, SupplyUnit, LaborPaymentMode } from "@/types";

const SUPPLY_UNITS: SupplyUnit[] = ["KG", "PIECE", "METER"];

const inputClass =
  "h-10 rounded-xl border border-border bg-ink-primary/5 px-3 text-sm text-ink-primary outline-none focus:ring-2 focus:ring-series-1";

const STATUS_TONE: Record<PurchaseOrder["status"], string> = {
  PENDING: "bg-series-4/15 text-series-4",
  PARTIALLY_FULFILLED: "bg-series-2/15 text-series-2",
  FULFILLED: "bg-status-good/15 text-status-good",
  CANCELLED: "bg-ink-primary/10 text-ink-muted",
};

function emptyItem(): SupplierInvoiceItem {
  return { itemName: "", unit: "PIECE", quantity: 0, itemGroup: "" };
}

function ItemsEditor({ items, onChange }: { items: SupplierInvoiceItem[]; onChange: (items: SupplierInvoiceItem[]) => void }) {
  const { t } = useTranslation();
  function update(index: number, field: keyof SupplierInvoiceItem, value: string) {
    onChange(items.map((row, i) => (i === index ? { ...row, [field]: field === "quantity" ? Number(value) : value } as SupplierInvoiceItem : row)));
  }
  return (
    <div className="flex flex-col gap-2">
      {items.map((row, index) => (
        <div key={index} className="grid grid-cols-5 gap-2 rounded-xl border border-border bg-ink-primary/5 p-2">
          <input placeholder={t("purchaseOrder.itemNamePlaceholder")} value={row.itemName} onChange={(e) => update(index, "itemName", e.target.value)} className={cn(inputClass, "col-span-2")} />
          <select value={row.unit} onChange={(e) => update(index, "unit", e.target.value)} className={inputClass}>
            {SUPPLY_UNITS.map((u) => (
              <option key={u} value={u}>
                {u}
              </option>
            ))}
          </select>
          <input type="number" min={0} placeholder={t("purchaseOrder.quantityPlaceholder")} value={row.quantity || ""} onChange={(e) => update(index, "quantity", e.target.value)} className={inputClass} />
          <input placeholder={t("purchaseOrder.itemGroupPlaceholder")} value={row.itemGroup ?? ""} onChange={(e) => update(index, "itemGroup", e.target.value)} className={inputClass} />
        </div>
      ))}
      <button type="button" onClick={() => onChange([...items, emptyItem()])} className="self-start text-xs font-medium text-series-1 hover:underline">
        {t("purchaseOrder.addItem")}
      </button>
    </div>
  );
}

function CreatePurchaseOrderForm({ suppliers, onClose, onSaved }: { suppliers: Supplier[]; onClose: () => void; onSaved: () => void }) {
  const { t } = useTranslation();
  const [supplierId, setSupplierId] = useState("");
  const [items, setItems] = useState<SupplierInvoiceItem[]>([emptyItem()]);
  const [expectedAmount, setExpectedAmount] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!supplierId) {
      setError(t("purchaseOrder.supplierRequired"));
      return;
    }
    setSaving(true);
    setError("");
    try {
      await api.purchaseOrders.create({
        supplierId,
        items: items.filter((r) => r.itemName.trim() && r.quantity > 0),
        expectedAmount: expectedAmount ? Number(expectedAmount) : undefined,
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
        <CardTitle>{t("purchaseOrder.newOrder")}</CardTitle>
      </CardHeader>
      <form onSubmit={handleSubmit} className="flex flex-col gap-3">
        <SearchableSelect value={supplierId} onChange={setSupplierId} options={suppliers.map((s) => ({ value: s._id, label: s.name }))} placeholder={t("reports.filter.supplier")} />
        <ItemsEditor items={items} onChange={setItems} />
        <input type="number" min={0} placeholder={t("purchaseOrder.expectedAmountPlaceholder")} value={expectedAmount} onChange={(e) => setExpectedAmount(e.target.value)} className={inputClass} />
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

function FulfillModal({ order, onClose, onSaved }: { order: PurchaseOrder; onClose: () => void; onSaved: () => void }) {
  const { t } = useTranslation();
  const [itemsReceived, setItemsReceived] = useState<SupplierInvoiceItem[]>(order.items && order.items.length > 0 ? order.items : [emptyItem()]);
  const [totalBillAmount, setTotalBillAmount] = useState(order.expectedAmount ? String(order.expectedAmount) : "");
  const [amountPaid, setAmountPaid] = useState("");
  // Bug fix: the backend and API client already accept paymentMode/
  // cashAmount/onlineAmount (see api.purchaseOrders.fulfill) — this modal
  // just never collected them, so every PO-sourced Supplier Invoice (and
  // its auto-logged Expense) landed entirely in "unspecified" on
  // Financial Overview/P&L/Day Book's cash/online breakdown.
  const [paymentMode, setPaymentMode] = useState<LaborPaymentMode | "">("");
  const [cashAmount, setCashAmount] = useState("");
  const [onlineAmount, setOnlineAmount] = useState("");
  const [markFulfilled, setMarkFulfilled] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const paidAmountNumber = amountPaid ? Number(amountPaid) : 0;

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!totalBillAmount || Number(totalBillAmount) <= 0) {
      setError(t("purchaseOrder.billAmountPlaceholder"));
      return;
    }
    if (paymentMode === "CASH_AND_ONLINE" && isPaymentSplitMismatched(paymentMode, paidAmountNumber, cashAmount, onlineAmount)) {
      setError(t("payment.splitMismatch", { total: paidAmountNumber.toLocaleString("en-IN") }));
      return;
    }
    setSaving(true);
    setError("");
    try {
      await api.purchaseOrders.fulfill(order._id, {
        itemsReceived: itemsReceived.filter((r) => r.itemName.trim() && r.quantity > 0),
        totalBillAmount: Number(totalBillAmount),
        amountPaid: amountPaid ? Number(amountPaid) : undefined,
        paymentMode: paymentMode || undefined,
        cashAmount: paymentMode === "CASH_AND_ONLINE" ? Number(cashAmount) : undefined,
        onlineAmount: paymentMode === "CASH_AND_ONLINE" ? Number(onlineAmount) : undefined,
        markFulfilled,
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
      <Card className="w-full max-w-lg hover:translate-y-0">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-ink-primary">{t("purchaseOrder.fulfillOrder")}</h3>
          <button onClick={onClose} className="text-ink-muted hover:text-ink-primary">
            <X className="h-4 w-4" />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="flex flex-col gap-2.5">
          <ItemsEditor items={itemsReceived} onChange={setItemsReceived} />
          <input type="number" min={0} placeholder={t("purchaseOrder.billAmountPlaceholder")} value={totalBillAmount} onChange={(e) => setTotalBillAmount(e.target.value)} className={inputClass} />
          <input type="number" min={0} placeholder={t("purchaseOrder.amountPaidPlaceholder")} value={amountPaid} onChange={(e) => setAmountPaid(e.target.value)} className={inputClass} />
          {paidAmountNumber > 0 && (
            <AmountPaymentModeFields
              amount={paidAmountNumber}
              paymentMode={paymentMode}
              cashAmount={cashAmount}
              onlineAmount={onlineAmount}
              onPaymentModeChange={setPaymentMode}
              onCashAmountChange={setCashAmount}
              onOnlineAmountChange={setOnlineAmount}
              inputClassName={inputClass}
            />
          )}
          <label className="flex items-center gap-2 text-sm text-ink-secondary">
            <input type="checkbox" checked={markFulfilled} onChange={(e) => setMarkFulfilled(e.target.checked)} />
            {t("purchaseOrder.markFulfilledLabel")}
          </label>
          {error && <p className="text-sm text-status-critical">{error}</p>}
          <div className="flex gap-2">
            <Button type="submit" disabled={saving}>
              {saving ? t("settings.savingEllipsis") : t("purchaseOrder.fulfillOrder")}
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

export function PurchaseOrders() {
  const [orders, setOrders] = useState<PurchaseOrder[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [mode, setMode] = useState<"list" | "add">("list");
  const [fulfilling, setFulfilling] = useState<PurchaseOrder | null>(null);
  const [cancelling, setCancelling] = useState<PurchaseOrder | null>(null);
  const [cancelSaving, setCancelSaving] = useState(false);
  const [cancelError, setCancelError] = useState("");
  const activeKilnId = useAuthStore((s) => s.activeKilnId);
  const { t } = useTranslation();

  async function refresh() {
    setOrders(await api.purchaseOrders.list());
  }

  useEffect(() => {
    if (!activeKilnId) return;
    refresh().catch(console.error);
    api.suppliers.list().then(setSuppliers).catch(console.error);
  }, [activeKilnId]);

  useKilnEvent("purchaseOrder:update", () => refresh());

  const supplierById = new Map(suppliers.map((s) => [s._id, s.name]));

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap justify-end gap-2">
        <Button size="sm" variant={mode === "add" ? "primary" : "outline"} onClick={() => setMode("add")}>
          <Plus className="h-4 w-4" /> {t("purchaseOrder.newOrder")}
        </Button>
        <Button size="sm" variant={mode === "list" ? "primary" : "outline"} onClick={() => setMode("list")}>
          <ClipboardList className="h-4 w-4" /> {t("nav.purchaseOrders")}
        </Button>
      </div>

      {mode === "add" ? (
        <CreatePurchaseOrderForm
          suppliers={suppliers}
          onClose={() => setMode("list")}
          onSaved={() => {
            setMode("list");
            refresh();
          }}
        />
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>{t("nav.purchaseOrders")}</CardTitle>
          </CardHeader>
          {orders.length === 0 ? (
            <EmptyState icon={ClipboardList} title={t("purchaseOrder.noOrdersYet")} />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[680px] text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-sm text-ink-muted">
                    <th className="pb-2 font-medium">{t("reports.col.serial")}</th>
                    <th className="pb-2 font-medium">{t("reports.col.supplier")}</th>
                    <th className="pb-2 text-right font-medium">{t("reports.col.itemCount")}</th>
                    <th className="pb-2 text-right font-medium">{t("reports.col.expectedAmount")}</th>
                    <th className="pb-2 font-medium">{t("reports.col.status")}</th>
                    <th className="pb-2 font-medium text-right">{t("common.actions")}</th>
                  </tr>
                </thead>
                <tbody>
                  {orders.map((o) => (
                    <tr key={o._id} className="border-b border-border/60 last:border-0">
                      <td className="py-3 text-ink-primary">{o.sequenceNumber != null ? `PO-${o.sequenceNumber}` : "—"}</td>
                      <td className="py-3 text-ink-secondary">{supplierById.get(o.supplierId) ?? o.supplierId}</td>
                      <td className="py-3 text-right tabular-nums text-ink-secondary">{(o.items ?? []).length}</td>
                      <td className="py-3 text-right tabular-nums font-medium text-ink-primary">₹{formatINR(o.expectedAmount ?? 0)}</td>
                      <td className="py-3">
                        <span className={cn("rounded-full px-2.5 py-1 text-xs font-semibold", STATUS_TONE[o.status])}>{t(`saleOrder.status.${o.status}`)}</span>
                      </td>
                      <td className="py-3">
                        <div className="flex justify-end gap-1.5">
                          {(o.status === "PENDING" || o.status === "PARTIALLY_FULFILLED") && (
                            <>
                              <Button size="sm" variant="outline" onClick={() => setFulfilling(o)}>
                                {t("purchaseOrder.fulfillOrder")}
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
          detail={t("purchaseOrder.confirmCancel", { serial: cancelling.sequenceNumber ?? "" })}
          confirmLabel={t("common.cancel")}
          loading={cancelSaving}
          error={cancelError}
          onCancel={() => {
            setCancelling(null);
            setCancelError("");
          }}
          onConfirm={async () => {
            setCancelSaving(true);
            setCancelError("");
            try {
              await api.purchaseOrders.cancel(cancelling._id);
              setCancelling(null);
              refresh();
            } catch (err) {
              setCancelError(err instanceof Error ? err.message : t("common.somethingWentWrong"));
            } finally {
              setCancelSaving(false);
            }
          }}
        />
      )}
    </div>
  );
}
