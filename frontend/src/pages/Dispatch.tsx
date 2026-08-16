import { Fragment, FormEvent, useEffect, useState } from "react";
import { AlertTriangle, Plus } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { SegmentedTabs } from "@/components/ui/segmented-tabs";
import { Pagination, usePagination } from "@/components/ui/pagination";
import { cn, formatINR } from "@/lib/utils";
import { api } from "@/lib/api";
import { useKilnEvent } from "@/hooks/useKilnEvent";
import { useAuthStore } from "@/store/auth.store";
import { useTranslation } from "@/hooks/useTranslation";
import { isPaymentSplitMismatched, PaymentSplitFields } from "@/components/shared/PaymentSplitFields";
import type { BrickGrade, Dispatch as DispatchEntry, FinishedGoodsReconciliation, LoadingEntry, PaymentMode, Person } from "@/types";

const inputClass =
  "h-10 rounded-xl border border-border bg-ink-primary/5 px-3 text-sm text-ink-primary outline-none focus:ring-2 focus:ring-series-1";

function DispatchesTab() {
  const [dispatches, setDispatches] = useState<DispatchEntry[]>([]);
  const [customers, setCustomers] = useState<Person[]>([]);
  const [drivers, setDrivers] = useState<Person[]>([]);
  const [reconciliation, setReconciliation] = useState<FinishedGoodsReconciliation | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [adjustingId, setAdjustingId] = useState<string | null>(null);
  const [adjustForm, setAdjustForm] = useState({ breakageCount: "", returnedCount: "", returnReason: "" });
  const [form, setForm] = useState({
    customerId: "",
    customerName: "",
    grade: "A1" as BrickGrade,
    bricksCount: "",
    amount: "",
    driverId: "",
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

  async function refresh() {
    const [dispatchData, customerData, driverData, recon] = await Promise.all([
      api.dispatch.list(),
      api.people.list("CUSTOMER"),
      api.people.list("DRIVER"),
      api.finishedGoodsReconciliation(),
    ]);
    setDispatches(dispatchData);
    setCustomers(customerData);
    setDrivers(driverData);
    setReconciliation(recon);
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
    if (isPaymentSplitMismatched(form.paymentMode, Number(form.amount), form.cashAmount, form.onlineAmount)) {
      setFormError(t("payment.splitMismatch", { total: Number(form.amount).toLocaleString("en-IN") }));
      return;
    }
    setFormError("");
    setLoading(true);
    try {
      await api.dispatch.create({
        customerName: form.customerName,
        customerId: form.customerId || undefined,
        grade: form.grade,
        bricksCount: Number(form.bricksCount),
        amount: Number(form.amount),
        driverId: form.driverId || undefined,
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
        bricksCount: "",
        amount: "",
        driverId: "",
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
                totalAmount={Number(form.amount) || 0}
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
                        <Badge variant="neutral">{d.grade}</Badge>
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

function LoadingTab() {
  const [entries, setEntries] = useState<LoadingEntry[]>([]);
  const [palledars, setPalledars] = useState<Person[]>([]);
  const [dispatches, setDispatches] = useState<DispatchEntry[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ dispatchId: "", palledarId: "", bricksCount: "", ratePerThousand: "" });
  const [loading, setLoading] = useState(false);
  const [mismatchWarning, setMismatchWarning] = useState<string | null>(null);
  const activeKilnId = useAuthStore((s) => s.activeKilnId);
  const { t } = useTranslation();
  const { page, setPage, pageCount, pageItems: pagedEntries, total } = usePagination(entries, 10);

  async function refresh() {
    const [entryData, workers, contractors, dispatchData] = await Promise.all([
      api.loadingEntries.list(),
      api.people.list("WORKER"),
      api.people.list("LABOUR_CONTRACTOR"),
      api.dispatch.list(),
    ]);
    setEntries(entryData);
    setPalledars([...workers, ...contractors]);
    setDispatches(dispatchData);
  }

  useEffect(() => {
    if (!activeKilnId) return;
    refresh().catch(console.error);
  }, [activeKilnId]);

  useKilnEvent("loading:update", () => refresh());

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!form.palledarId || !form.bricksCount || !form.ratePerThousand) return;
    setLoading(true);
    setMismatchWarning(null);
    try {
      const result = await api.loadingEntries.create({
        dispatchId: form.dispatchId || undefined,
        palledarId: form.palledarId,
        bricksCount: Number(form.bricksCount),
        ratePerThousand: Number(form.ratePerThousand),
      });
      if (result.countMismatch) {
        setMismatchWarning(
          t("dispatch.loadedCountMismatchWarning", { count: result.dispatchBricksCount?.toLocaleString("en-IN") ?? "" })
        );
      }
      setForm({ dispatchId: "", palledarId: "", bricksCount: "", ratePerThousand: "" });
      setShowForm(false);
      await refresh();
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex justify-end">
        <Button size="sm" onClick={() => setShowForm((s) => !s)}>
          <Plus className="h-4 w-4" /> {t("dispatch.logLoadingEntry")}
        </Button>
      </div>

      {showForm && (
        <Card>
          <form onSubmit={handleSubmit} className="grid grid-cols-2 gap-2">
            <select
              required
              value={form.palledarId}
              onChange={(e) => setForm((f) => ({ ...f, palledarId: e.target.value }))}
              className={cn(inputClass, "col-span-2")}
            >
              <option value="">{t("dispatch.palledarGangPlaceholder")}</option>
              {palledars.map((p) => (
                <option key={p._id} value={p._id}>
                  {p.name}
                </option>
              ))}
            </select>
            <select
              value={form.dispatchId}
              onChange={(e) => setForm((f) => ({ ...f, dispatchId: e.target.value }))}
              className={cn(inputClass, "col-span-2")}
            >
              <option value="">{t("dispatch.linkDispatchOptional")}</option>
              {dispatches.map((d) => (
                <option key={d._id} value={d._id}>
                  {d.slipNumber} — {d.customerName} ({d.bricksCount.toLocaleString("en-IN")} {t("dispatch.bricksUnit")})
                </option>
              ))}
            </select>
            <input
              required
              type="number"
              placeholder={t("brickLoading.bricksLoadedPlaceholder")}
              value={form.bricksCount}
              onChange={(e) => setForm((f) => ({ ...f, bricksCount: e.target.value }))}
              className={inputClass}
            />
            <input
              required
              type="number"
              placeholder={t("dispatch.ratePerThousandPlaceholder")}
              value={form.ratePerThousand}
              onChange={(e) => setForm((f) => ({ ...f, ratePerThousand: e.target.value }))}
              className={inputClass}
            />
            <Button type="submit" disabled={loading} className="col-span-2">
              {t("common.save")}
            </Button>
          </form>
        </Card>
      )}

      {mismatchWarning && (
        <Card className="border-status-warning/40 bg-status-warning/5">
          <p className="text-sm text-status-warning">{mismatchWarning}</p>
        </Card>
      )}

      <Card>
        {entries.length === 0 ? (
          <p className="py-8 text-center text-sm text-ink-muted">{t("dispatch.noLoadingEntriesYet")}</p>
        ) : (
          <div className="space-y-1">
            {pagedEntries.map((e) => (
              <div key={e._id} className="flex items-center justify-between rounded-lg border border-border px-3 py-2 text-sm">
                <div>
                  <p className="text-ink-primary">
                    {typeof e.palledarId === "object" ? e.palledarId.name : "—"}
                    {typeof e.dispatchId === "object" && e.dispatchId ? ` · ${e.dispatchId.slipNumber}` : ""}
                    {e.countMismatch && <Badge variant="critical" className="ml-2">{t("dispatch.countMismatchBadge")}</Badge>}
                  </p>
                  <p className="text-sm text-ink-muted">{new Date(e.date).toLocaleDateString("en-IN")}</p>
                </div>
                <span className="tabular-nums font-medium text-ink-primary">{e.bricksCount.toLocaleString("en-IN")}</span>
              </div>
            ))}
            <Pagination page={page} pageCount={pageCount} onChange={setPage} total={total} pageSize={10} />
          </div>
        )}
      </Card>
    </div>
  );
}

export function Dispatch() {
  const [tab, setTab] = useState<"dispatches" | "loading">("dispatches");
  const { t } = useTranslation();

  return (
    <div className="space-y-4">
      <SegmentedTabs
        options={[
          { value: "dispatches" as const, label: t("dispatch.dispatchesTab") },
          { value: "loading" as const, label: t("dispatch.loadingPalledarTab") },
        ]}
        value={tab}
        onChange={setTab}
      />

      {tab === "dispatches" && <DispatchesTab />}
      {tab === "loading" && <LoadingTab />}
    </div>
  );
}
