import { FormEvent, useEffect, useState } from "react";
import { X } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { cn, formatINR } from "@/lib/utils";
import { api } from "@/lib/api";
import { useTranslation } from "@/hooks/useTranslation";
import { BrickLineItemsEditor, isValidLineItemRow, lineItemRowsFrom, type LineItemRow } from "@/components/dispatch/BrickLineItemsEditor";
import type { BrickCategory, BrickGrade, Dispatch as DispatchEntry, Person } from "@/types";

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
// same convention as EditPaymentReceiptModal.
export function EditDispatchModal({ dispatch, onClose, onSaved }: EditDispatchModalProps) {
  const { t } = useTranslation();
  const [customers, setCustomers] = useState<Person[]>([]);
  const [drivers, setDrivers] = useState<Person[]>([]);
  const [categories, setCategories] = useState<BrickCategory[]>([]);

  const initialCustomerId = typeof dispatch.customerId === "object" ? dispatch.customerId?._id ?? "" : dispatch.customerId ?? "";
  const initialDriverId = typeof dispatch.driverId === "object" ? dispatch.driverId?._id ?? "" : dispatch.driverId ?? "";
  const grossAmount = dispatch.amount + (dispatch.discountAmount ?? 0);

  const [customerId, setCustomerId] = useState(initialCustomerId);
  const [customerName, setCustomerName] = useState(dispatch.customerName);
  const [grade, setGrade] = useState<BrickGrade>(dispatch.grade);
  const [items, setItems] = useState<LineItemRow[]>(lineItemRowsFrom(dispatch));
  const [amount, setAmount] = useState(String(grossAmount));
  const [discountAmount, setDiscountAmount] = useState(dispatch.discountAmount ? String(dispatch.discountAmount) : "");
  const [driverId, setDriverId] = useState(initialDriverId);
  const [vehicleNumber, setVehicleNumber] = useState(dispatch.vehicleNumber ?? "");
  const [vehicleType, setVehicleType] = useState(dispatch.vehicleType ?? "");
  const [driverTipAmount, setDriverTipAmount] = useState(dispatch.driverTipAmount ? String(dispatch.driverTipAmount) : "");
  const [transportCost, setTransportCost] = useState(dispatch.transportCost ? String(dispatch.transportCost) : "");
  const [transportPaidBy, setTransportPaidBy] = useState<"OWNER" | "CUSTOMER">(dispatch.transportPaidBy ?? "OWNER");
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState("");

  useEffect(() => {
    Promise.all([api.people.list("CUSTOMER"), api.people.list("DRIVER"), api.brickCategories.list()]).then(
      ([customerData, driverData, categoryData]) => {
        setCustomers(customerData);
        setDrivers(driverData);
        setCategories(categoryData);
      }
    );
  }, []);

  function handleCustomerSelect(id: string) {
    const customer = customers.find((c) => c._id === id);
    setCustomerId(id);
    if (customer) setCustomerName(customer.name);
  }

  const validItems = items.filter(isValidLineItemRow);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!customerName || validItems.length === 0 || !amount) return;
    if (Number(discountAmount) > Number(amount)) {
      setFormError(t("dispatch.discountExceedsAmount"));
      return;
    }
    setFormError("");
    setSaving(true);
    try {
      await api.dispatch.update(dispatch._id, {
        customerName,
        customerId: customerId || null,
        grade,
        items: validItems.map((row) => ({
          categoryId: row.categoryId,
          bricksCount: Number(row.bricksCount),
          pricePerBrick: row.pricePerBrick ? Number(row.pricePerBrick) : undefined,
        })),
        amount: Number(amount),
        discountAmount: discountAmount ? Number(discountAmount) : 0,
        driverId: driverId || null,
        vehicleNumber: vehicleNumber || undefined,
        vehicleType: vehicleType || undefined,
        driverTipAmount: driverTipAmount ? Number(driverTipAmount) : undefined,
        transportCost: transportCost ? Number(transportCost) : undefined,
        transportPaidBy: transportCost ? transportPaidBy : undefined,
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
            onChange={(e) => {
              setCustomerName(e.target.value);
              setCustomerId("");
            }}
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
          <select value={driverId} onChange={(e) => setDriverId(e.target.value)} className={inputClass}>
            <option value="">{t("dispatch.driverOptional")}</option>
            {drivers.map((d) => (
              <option key={d._id} value={d._id}>
                {d.name} {d.vehicleNumber ? `— ${d.vehicleNumber}` : ""}
              </option>
            ))}
          </select>
          <input
            placeholder={t("dispatch.driverTipPlaceholder")}
            type="number"
            value={driverTipAmount}
            onChange={(e) => setDriverTipAmount(e.target.value)}
            className={inputClass}
          />
          <input
            placeholder={t("dispatch.vehicleNumberPlaceholder")}
            value={vehicleNumber}
            onChange={(e) => setVehicleNumber(e.target.value)}
            className={inputClass}
          />
          <select value={vehicleType} onChange={(e) => setVehicleType(e.target.value)} className={inputClass}>
            <option value="">{t("dispatch.vehicleTypePlaceholder")}</option>
            <option value="TRUCK">{t("brickLoading.truck")}</option>
            <option value="TRACTOR">{t("brickLoading.tractor")}</option>
          </select>
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
          {formError && <p className="col-span-2 text-sm text-status-critical">{formError}</p>}
          <Button type="submit" disabled={saving} className="col-span-2">
            {t("common.saveChanges")}
          </Button>
        </form>
      </Card>
    </div>
  );
}
