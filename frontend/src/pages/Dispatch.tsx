import { Fragment, FormEvent, useEffect, useState } from "react";
import { AlertTriangle, Plus } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Pagination, usePagination } from "@/components/ui/pagination";
import { cn, formatINR } from "@/lib/utils";
import { api } from "@/lib/api";
import { useKilnEvent } from "@/hooks/useKilnEvent";
import { useAuthStore } from "@/store/auth.store";
import { useTranslation } from "@/hooks/useTranslation";
import { isPaymentSplitMismatched, PaymentSplitFields } from "@/components/shared/PaymentSplitFields";
import type { BrickCategory, BrickGrade, Dispatch as DispatchEntry, FinishedGoodsReconciliation, PaymentMode, Person } from "@/types";

const inputClass =
  "h-10 rounded-xl border border-border bg-ink-primary/5 px-3 text-sm text-ink-primary outline-none focus:ring-2 focus:ring-series-1";

function categoryGradeLabel(c: BrickCategory) {
  return c.grade ? `${c.category} (${c.grade})` : c.category;
}

// Prefer the free-form category+grade this dispatch was linked to over the
// older fixed A1/JHAMA/PELA classification — same fallback rule used on the
// Gate Pass/Challan print templates.
function dispatchCategoryGradeLabel(d: DispatchEntry, gradeLabels: Record<string, string>) {
  const cat = d.categoryId;
  if (cat && typeof cat === "object") {
    return cat.grade ? `${cat.category} (${cat.grade})` : cat.category;
  }
  return gradeLabels[d.grade] ?? d.grade;
}

export function Dispatch() {
  const [dispatches, setDispatches] = useState<DispatchEntry[]>([]);
  const [customers, setCustomers] = useState<Person[]>([]);
  const [drivers, setDrivers] = useState<Person[]>([]);
  const [categories, setCategories] = useState<BrickCategory[]>([]);
  const [reconciliation, setReconciliation] = useState<FinishedGoodsReconciliation | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [adjustingId, setAdjustingId] = useState<string | null>(null);
  const [adjustForm, setAdjustForm] = useState({ breakageCount: "", returnedCount: "", returnReason: "" });
  const [form, setForm] = useState({
    customerId: "",
    customerName: "",
    grade: "A1" as BrickGrade,
    categoryId: "",
    bricksCount: "",
    amount: "",
    discountAmount: "",
    driverId: "",
    vehicleNumber: "",
    vehicleType: "",
    driverTipAmount: "",
    transportCost: "",
    transportPaidBy: "OWNER" as "OWNER" | "CUSTOMER",
    paymentMode: "CASH" as PaymentMode,
    cashAmount: "",
    onlineAmount: "",
  });
  const [loading, setLoading] = useState(false);
  const [formError, setFormError] = useState("");
  const activeKilnId = useAuthStore((s) => s.activeKilnId);
  const { t } = useTranslation();
  const { page, setPage, pageCount, pageItems: pagedDispatches, total } = usePagination(dispatches, 10);
  const GRADE_LABELS: Record<string, string> = {
    A1: t("dispatch.gradeA1"),
    JHAMA: t("dispatch.gradeJhama"),
    PELA: t("dispatch.gradePela"),
  };

  async function refresh() {
    const [dispatchData, customerData, driverData, recon, categoryData] = await Promise.all([
      api.dispatch.list(),
      api.people.list("CUSTOMER"),
      api.people.list("DRIVER"),
      api.finishedGoodsReconciliation(),
      api.brickCategories.list(),
    ]);
    setDispatches(dispatchData);
    setCustomers(customerData);
    setDrivers(driverData);
    setReconciliation(recon);
    setCategories(categoryData);
  }

  useEffect(() => {
    if (!activeKilnId) return;
    refresh().catch(console.error);
  }, [activeKilnId]);

  useKilnEvent("dispatch:update", () => refresh());
  useKilnEvent("grading:update", () => refresh());

  function handleCustomerSelect(id: string) {
    const customer = customers.find((c) => c._id === id);
    setForm((f) => ({ ...f, customerId: id, customerName: customer?.name ?? f.customerName }));
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!form.customerName || !form.bricksCount || !form.amount) return;
    const netAmount = Number(form.amount) - (Number(form.discountAmount) || 0);
    if (Number(form.discountAmount) > Number(form.amount)) {
      setFormError(t("dispatch.discountExceedsAmount"));
      return;
    }
    if (isPaymentSplitMismatched(form.paymentMode, netAmount, form.cashAmount, form.onlineAmount)) {
      setFormError(t("payment.splitMismatch", { total: netAmount.toLocaleString("en-IN") }));
      return;
    }
    setFormError("");
    setLoading(true);
    try {
      await api.dispatch.create({
        customerName: form.customerName,
        customerId: form.customerId || undefined,
        grade: form.grade,
        categoryId: form.categoryId || undefined,
        bricksCount: Number(form.bricksCount),
        amount: Number(form.amount),
        discountAmount: form.discountAmount ? Number(form.discountAmount) : undefined,
        driverId: form.driverId || undefined,
        vehicleNumber: form.vehicleNumber || undefined,
        vehicleType: form.vehicleType || undefined,
        driverTipAmount: form.driverTipAmount ? Number(form.driverTipAmount) : undefined,
        transportCost: form.transportCost ? Number(form.transportCost) : undefined,
        transportPaidBy: form.transportCost ? form.transportPaidBy : undefined,
        paymentMode: form.paymentMode,
        cashAmount: form.paymentMode === "CASH_AND_ONLINE" ? Number(form.cashAmount) : undefined,
        onlineAmount: form.paymentMode === "CASH_AND_ONLINE" ? Number(form.onlineAmount) : undefined,
      });
      setForm({
        customerId: "",
        customerName: "",
        grade: "A1",
        categoryId: "",
        bricksCount: "",
        amount: "",
        discountAmount: "",
        driverId: "",
        vehicleNumber: "",
        vehicleType: "",
        driverTipAmount: "",
        transportCost: "",
        transportPaidBy: "OWNER",
        paymentMode: "CASH",
        cashAmount: "",
        onlineAmount: "",
      });
      setShowForm(false);
      await refresh();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : t("common.somethingWentWrong"));
    } finally {
      setLoading(false);
    }
  }

  async function submitAdjustment(id: string) {
    await api.dispatch.adjustment(id, {
      breakageCount: adjustForm.breakageCount ? Number(adjustForm.breakageCount) : undefined,
      returnedCount: adjustForm.returnedCount ? Number(adjustForm.returnedCount) : undefined,
      returnReason: adjustForm.returnReason || undefined,
    });
    setAdjustingId(null);
    setAdjustForm({ breakageCount: "", returnedCount: "", returnReason: "" });
    refresh();
  }

  return (
    <div className="space-y-4">
      {reconciliation?.alert && (
        <Card className="border-status-critical/40 bg-status-critical/5">
          <div className="flex items-start gap-3">
            <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-status-critical" />
            <div>
              <p className="text-sm font-medium text-status-critical">
                {t("dispatch.mismatchAlert", { percent: reconciliation.mismatchPercent, days: reconciliation.days })}
              </p>
              <p className="mt-1 text-sm text-ink-muted">
                {t("dispatch.producedA1")} {reconciliation.totalA1Produced.toLocaleString("en-IN")} · {t("dispatch.dispatchedLabel")}{" "}
                {reconciliation.totalDispatched.toLocaleString("en-IN")} · {t("dispatch.inStockLabel")}{" "}
                {reconciliation.currentStock.toLocaleString("en-IN")} · {t("dispatch.unaccountedLabel")}{" "}
                {reconciliation.unaccounted.toLocaleString("en-IN")} {t("dispatch.checkUnloggedNote")}
              </p>
            </div>
          </div>
        </Card>
      )}

      <div className="flex justify-end">
        <Button size="sm" onClick={() => setShowForm((s) => !s)}>
          <Plus className="h-4 w-4" /> {t("dispatch.logDispatch")}
        </Button>
      </div>

      {showForm && (
        <Card>
          <form onSubmit={handleSubmit} className="grid grid-cols-2 gap-2">
            <select value={form.customerId} onChange={(e) => handleCustomerSelect(e.target.value)} className={inputClass}>
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
              value={form.customerName}
              onChange={(e) => setForm((f) => ({ ...f, customerName: e.target.value, customerId: "" }))}
              className={inputClass}
            />
            <select value={form.grade} onChange={(e) => setForm((f) => ({ ...f, grade: e.target.value as BrickGrade }))} className={inputClass}>
              <option value="A1">{t("dispatch.gradeA1")}</option>
              <option value="JHAMA">{t("dispatch.gradeJhama")}</option>
              <option value="PELA">{t("dispatch.gradePela")}</option>
            </select>
            <select
              value={form.categoryId}
              onChange={(e) => setForm((f) => ({ ...f, categoryId: e.target.value }))}
              className={inputClass}
            >
              <option value="">{t("dispatch.categoryPlaceholder")}</option>
              {categories.map((c) => (
                <option key={c._id} value={c._id}>
                  {categoryGradeLabel(c)}
                </option>
              ))}
            </select>
            <select
              value={form.paymentMode}
              onChange={(e) => setForm((f) => ({ ...f, paymentMode: e.target.value as PaymentMode }))}
              className={inputClass}
            >
              <option value="CASH">{t("dispatch.paymentCash")}</option>
              <option value="BANK">{t("dispatch.paymentBankTransfer")}</option>
              <option value="UPI">{t("dispatch.paymentUpi")}</option>
              <option value="GST_INVOICE">{t("dispatch.paymentGstInvoice")}</option>
              <option value="CASH_AND_ONLINE">{t("common.paymentModeCashAndOnline")}</option>
            </select>
            {form.paymentMode === "CASH_AND_ONLINE" && (
              <PaymentSplitFields
                totalAmount={Math.max(0, (Number(form.amount) || 0) - (Number(form.discountAmount) || 0))}
                cashAmount={form.cashAmount}
                onlineAmount={form.onlineAmount}
                onCashAmountChange={(v) => setForm((f) => ({ ...f, cashAmount: v }))}
                onOnlineAmountChange={(v) => setForm((f) => ({ ...f, onlineAmount: v }))}
                inputClassName={inputClass}
              />
            )}
            <input
              required
              type="number"
              placeholder={t("dispatch.bricksDispatchedPlaceholder")}
              value={form.bricksCount}
              onChange={(e) => setForm((f) => ({ ...f, bricksCount: e.target.value }))}
              className={inputClass}
            />
            <input
              required
              type="number"
              placeholder={t("dispatch.amountPlaceholder")}
              value={form.amount}
              onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))}
              className={inputClass}
            />
            <input
              type="number"
              placeholder={t("dispatch.discountPlaceholder")}
              value={form.discountAmount}
              onChange={(e) => setForm((f) => ({ ...f, discountAmount: e.target.value }))}
              className={inputClass}
            />
            {form.discountAmount && Number(form.discountAmount) > 0 && form.amount && (
              <p className="col-span-2 text-sm text-ink-secondary">
                {t("dispatch.netAmountPreview")}:{" "}
                <span className="font-semibold text-ink-primary">
                  ₹{formatINR(Math.max(0, Number(form.amount) - Number(form.discountAmount)))}
                </span>
              </p>
            )}
            <select
              value={form.driverId}
              onChange={(e) => setForm((f) => ({ ...f, driverId: e.target.value }))}
              className={inputClass}
            >
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
              value={form.driverTipAmount}
              onChange={(e) => setForm((f) => ({ ...f, driverTipAmount: e.target.value }))}
              className={inputClass}
            />
            <input
              placeholder={t("dispatch.vehicleNumberPlaceholder")}
              value={form.vehicleNumber}
              onChange={(e) => setForm((f) => ({ ...f, vehicleNumber: e.target.value }))}
              className={inputClass}
            />
            <select
              value={form.vehicleType}
              onChange={(e) => setForm((f) => ({ ...f, vehicleType: e.target.value }))}
              className={inputClass}
            >
              <option value="">{t("dispatch.vehicleTypePlaceholder")}</option>
              <option value="TRUCK">{t("brickLoading.truck")}</option>
              <option value="TRACTOR">{t("brickLoading.tractor")}</option>
            </select>
            <input
              type="number"
              placeholder={t("dispatch.transportCostPlaceholder")}
              value={form.transportCost}
              onChange={(e) => setForm((f) => ({ ...f, transportCost: e.target.value }))}
              className={inputClass}
            />
            {form.transportCost && (
              <select
                value={form.transportPaidBy}
                onChange={(e) => setForm((f) => ({ ...f, transportPaidBy: e.target.value as "OWNER" | "CUSTOMER" }))}
                className={cn(inputClass, "col-span-2")}
              >
                <option value="OWNER">{t("dispatch.transportPaidByOwner")}</option>
                <option value="CUSTOMER">{t("dispatch.transportPaidByCustomer")}</option>
              </select>
            )}
            {formError && <p className="col-span-2 text-sm text-status-critical">{formError}</p>}
            <Button type="submit" disabled={loading} className="col-span-2">
              {t("dispatch.saveDispatch")}
            </Button>
          </form>
        </Card>
      )}

      <Card>
        {dispatches.length === 0 ? (
          <p className="py-8 text-center text-sm text-ink-muted">{t("dispatch.noDispatchesYet")}</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-sm">
              <thead>
                <tr className="border-b border-border text-left text-sm text-ink-muted">
                  <th className="pb-2 font-medium">{t("dispatch.slipHeader")}</th>
                  <th className="pb-2 font-medium">{t("dispatch.customerHeader")}</th>
                  <th className="pb-2 font-medium">{t("dispatch.gradeHeader")}</th>
                  <th className="pb-2 font-medium">{t("dispatch.bricksHeader")}</th>
                  <th className="pb-2 font-medium">{t("dispatch.adjustmentsHeader")}</th>
                  <th className="pb-2 font-medium text-right">{t("common.amount")}</th>
                </tr>
              </thead>
              <tbody>
                {pagedDispatches.map((d) => (
                  <Fragment key={d._id}>
                    <tr className="border-b border-border/60 last:border-0">
                      <td className="py-3 text-sm text-ink-muted">{d.slipNumber}</td>
                      <td className="py-3 text-ink-primary">{d.customerName}</td>
                      <td className="py-3">
                        <Badge variant="neutral">{dispatchCategoryGradeLabel(d, GRADE_LABELS)}</Badge>
                      </td>
                      <td className="py-3 tabular-nums text-ink-secondary">{d.bricksCount.toLocaleString("en-IN")}</td>
                      <td className="py-3">
                        <button
                          onClick={() => setAdjustingId(adjustingId === d._id ? null : d._id)}
                          className="text-xs text-series-1 hover:underline"
                        >
                          {d.breakageCount > 0 || d.returnedCount > 0
                            ? t("dispatch.brokenReturnedSummary", { broken: d.breakageCount, returned: d.returnedCount })
                            : t("dispatch.addBreakageReturn")}
                        </button>
                      </td>
                      <td className="py-3 text-right tabular-nums font-medium text-ink-primary">
                        ₹{formatINR(d.amount)}
                      </td>
                    </tr>
                    {adjustingId === d._id && (
                      <tr key={`${d._id}-adjust`}>
                        <td colSpan={6} className="bg-ink-primary/5 p-3">
                          <div className="flex flex-wrap items-end gap-2">
                            <input
                              type="number"
                              placeholder={t("dispatch.breakageCountPlaceholder")}
                              value={adjustForm.breakageCount}
                              onChange={(e) => setAdjustForm((f) => ({ ...f, breakageCount: e.target.value }))}
                              className="h-9 w-32 rounded-lg border border-border bg-ink-primary/5 px-2 text-xs text-ink-primary outline-none"
                            />
                            <input
                              type="number"
                              placeholder={t("dispatch.returnedCountPlaceholder")}
                              value={adjustForm.returnedCount}
                              onChange={(e) => setAdjustForm((f) => ({ ...f, returnedCount: e.target.value }))}
                              className="h-9 w-32 rounded-lg border border-border bg-ink-primary/5 px-2 text-xs text-ink-primary outline-none"
                            />
                            <input
                              placeholder={t("dispatch.returnReasonPlaceholder")}
                              value={adjustForm.returnReason}
                              onChange={(e) => setAdjustForm((f) => ({ ...f, returnReason: e.target.value }))}
                              className="h-9 flex-1 rounded-lg border border-border bg-ink-primary/5 px-2 text-xs text-ink-primary outline-none"
                            />
                            <Button size="sm" onClick={() => submitAdjustment(d._id)}>
                              {t("common.save")}
                            </Button>
                          </div>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                ))}
              </tbody>
            </table>
            <Pagination page={page} pageCount={pageCount} onChange={setPage} total={total} pageSize={10} />
          </div>
        )}
      </Card>
    </div>
  );
}
