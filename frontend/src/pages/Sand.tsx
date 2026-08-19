import { FormEvent, useEffect, useState } from "react";
import { Plus, Printer, Search } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { FilterChips } from "@/components/ui/filter-chips";
import { DateInput } from "@/components/ui/date-input";
import { SegmentedTabs } from "@/components/ui/segmented-tabs";
import { Pagination, usePagination } from "@/components/ui/pagination";
import { cn, formatINR } from "@/lib/utils";
import { api } from "@/lib/api";
import { useKilnEvent } from "@/hooks/useKilnEvent";
import { useAuthStore } from "@/store/auth.store";
import { useTranslation } from "@/hooks/useTranslation";
import { AddSandDeliveryModal } from "@/components/sand/AddSandDeliveryModal";
import { EditSandDeliveryModal } from "@/components/sand/EditSandDeliveryModal";
import { EditSandContractModal } from "@/components/sand/EditSandContractModal";
import { AddSandContractorModal } from "@/components/people/AddSandContractorModal";
import { SandContractorDetailPage } from "@/components/people/SandContractorDetailPage";
import { printSandContract } from "@/lib/printDocument";
import type { LedgerPaymentMode, Person, SandContract, SandContractRateType, SandDelivery } from "@/types";
import { isPaymentSplitMismatched, PaymentSplitFields } from "@/components/shared/PaymentSplitFields";

const inputClass =
  "h-10 rounded-xl border border-border bg-ink-primary/5 px-3 text-sm text-ink-primary outline-none focus:ring-2 focus:ring-series-1";

function tractorSummary(entry: SandDelivery, t: (key: string) => string) {
  if (!entry.tractorUsed) return "—";
  const names = (entry.tractors ?? []).map((tr) => tr.driverName || tr.tractorNumber).filter(Boolean);
  return names.length > 0 ? names.join(", ") : t("common.yes");
}

// The Sand page's day-to-day workflow — logging today's sand deliveries
// against a sand contractor, independent of the Contract apparatus below.
// Same shape as Soil.tsx's ArrivalsTab (arrivals ↔ deliveries, field owner
// ↔ sand contractor), minus JCB and depth tracking which don't apply here.
function SandArrivalsTab({ onOpenContractor }: { onOpenContractor: (id: string) => void }) {
  const { t } = useTranslation();
  const [deliveries, setDeliveries] = useState<SandDelivery[]>([]);
  const [contractors, setContractors] = useState<Person[]>([]);
  const [showAdd, setShowAdd] = useState(false);
  const [showAddContractor, setShowAddContractor] = useState(false);
  const [editingDelivery, setEditingDelivery] = useState<SandDelivery | null>(null);
  const activeKilnId = useAuthStore((s) => s.activeKilnId);

  async function refresh() {
    const [deliveriesData, contractorsData] = await Promise.all([
      api.sandDeliveries.list(),
      api.people.list("SAND_CONTRACTOR"),
    ]);
    setDeliveries(deliveriesData);
    setContractors(contractorsData);
  }

  useEffect(() => {
    if (!activeKilnId) return;
    refresh().catch(console.error);
  }, [activeKilnId]);

  useKilnEvent("sandDelivery:update", () => refresh());
  useKilnEvent("person:update", () => refresh());

  const { page, setPage, pageCount, pageItems: pagedDeliveries, total } = usePagination(deliveries, 10);

  const totalTrolleys = deliveries.reduce((sum, d) => sum + d.trolleyCount, 0);
  const totalGiven = deliveries.reduce((sum, d) => sum + (d.paymentGiven ?? 0), 0);
  const totalPending = deliveries.reduce((sum, d) => sum + (d.paymentPending ?? 0), 0);

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-3 gap-2">
        <Card className="p-3 text-center">
          <p className="text-xl font-semibold tabular-nums text-ink-primary">{totalTrolleys.toLocaleString("en-IN")}</p>
          <p className="text-sm text-ink-muted">{t("sand.trolleysDeliveredAllTime")}</p>
        </Card>
        <Card className="p-3 text-center">
          <p className="text-xl font-semibold tabular-nums text-status-good">₹{formatINR(totalGiven)}</p>
          <p className="text-sm text-ink-muted">{t("soil.paymentGivenLabel")}</p>
        </Card>
        <Card className="p-3 text-center">
          <p className="text-xl font-semibold tabular-nums text-status-warning">₹{formatINR(totalPending)}</p>
          <p className="text-sm text-ink-muted">{t("soil.paymentPendingLabel")}</p>
        </Card>
      </div>

      <div className="flex justify-end gap-2">
        <Button size="sm" variant="outline" onClick={() => setShowAddContractor(true)}>
          <Plus className="h-4 w-4" /> {t("people.addSandContractor")}
        </Button>
        <Button size="sm" onClick={() => setShowAdd(true)}>
          <Plus className="h-4 w-4" /> {t("sand.logSandDelivery")}
        </Button>
      </div>

      <Card>
        {deliveries.length === 0 ? (
          <p className="py-8 text-center text-sm text-ink-muted">{t("sand.noDeliveriesYet")}</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-sm">
              <thead>
                <tr className="border-b border-border text-left text-sm text-ink-muted">
                  <th className="pb-2 font-medium">{t("common.date")}</th>
                  <th className="pb-2 font-medium">{t("people.sandContractor")}</th>
                  <th className="pb-2 font-medium">{t("soil.tractorHeader")}</th>
                  <th className="pb-2 font-medium">{t("soil.trolleysHeader")}</th>
                  <th className="pb-2 font-medium">{t("soil.givenHeader")}</th>
                  <th className="pb-2 font-medium">{t("soil.pendingHeader")}</th>
                  <th className="pb-2 font-medium" />
                </tr>
              </thead>
              <tbody>
                {pagedDeliveries.map((d) => {
                  const contractor = typeof d.sandContractorId === "object" ? d.sandContractorId : null;
                  return (
                  <tr key={d._id} className="border-b border-border/60 last:border-0 hover:bg-ink-primary/5">
                    <td className="py-3 text-ink-secondary">{new Date(d.date).toLocaleDateString("en-IN")}</td>
                    <td className="py-3 text-ink-primary">
                      {contractor ? (
                        <button onClick={() => onOpenContractor(contractor._id)} className="hover:underline">
                          {contractor.name}
                        </button>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className="py-3 text-ink-secondary">{tractorSummary(d, t)}</td>
                    <td className="py-3 tabular-nums text-ink-secondary">{d.trolleyCount.toLocaleString("en-IN")}</td>
                    <td className="py-3 tabular-nums text-status-good">₹{formatINR(d.paymentGiven ?? 0)}</td>
                    <td className="py-3 pr-2 tabular-nums text-status-warning">₹{formatINR(d.paymentPending ?? 0)}</td>
                    <td className="py-3 pl-3 text-right">
                      <button onClick={() => setEditingDelivery(d)} className="text-xs font-medium text-series-1 hover:underline">
                        {t("common.edit")}
                      </button>
                    </td>
                  </tr>
                  );
                })}
              </tbody>
            </table>
            <Pagination page={page} pageCount={pageCount} onChange={setPage} total={total} pageSize={10} />
          </div>
        )}
      </Card>

      {showAdd && <AddSandDeliveryModal sandContractors={contractors} onClose={() => setShowAdd(false)} onCreated={refresh} />}
      {editingDelivery && <EditSandDeliveryModal entry={editingDelivery} onClose={() => setEditingDelivery(null)} onSaved={refresh} />}
      {showAddContractor && <AddSandContractorModal onClose={() => setShowAddContractor(false)} onCreated={refresh} />}
    </div>
  );
}

const CONTRACT_RATE_TYPE_FILTERS: { value: SandContractRateType | "ALL"; labelKey: string }[] = [
  { value: "ALL", labelKey: "soil.allRates" },
  { value: "PER_TROLLEY", labelKey: "sand.perTrolley" },
  { value: "PER_THOUSAND_BRICKS", labelKey: "sand.perThousandBricks" },
];

function SandContractsTab({ onOpenContractor }: { onOpenContractor: (id: string) => void }) {
  const { t } = useTranslation();
  const [contracts, setContracts] = useState<SandContract[]>([]);
  const [contractors, setContractors] = useState<Person[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [editingContract, setEditingContract] = useState<SandContract | null>(null);
  const [search, setSearch] = useState("");
  const [rateTypeFilter, setRateTypeFilter] = useState<SandContractRateType | "ALL">("ALL");
  const [form, setForm] = useState({
    sandContractorId: "",
    rateType: "PER_TROLLEY" as SandContractRateType,
    contractedTrolleys: "",
    contractPrice: "",
    totalContractValue: "",
    advanceAmount: "",
    paymentMode: "CASH" as LedgerPaymentMode,
    cashAmount: "",
    onlineAmount: "",
    startDate: "",
    endDate: "",
  });
  const [formError, setFormError] = useState("");
  const [loading, setLoading] = useState(false);
  const activeKilnId = useAuthStore((s) => s.activeKilnId);

  const emptyContractForm = {
    sandContractorId: "",
    rateType: "PER_TROLLEY" as SandContractRateType,
    contractedTrolleys: "",
    contractPrice: "",
    totalContractValue: "",
    advanceAmount: "",
    paymentMode: "CASH" as LedgerPaymentMode,
    cashAmount: "",
    onlineAmount: "",
    startDate: "",
    endDate: "",
  };

  async function refresh() {
    const [contractsData, contractorsData] = await Promise.all([
      api.sandContracts.list(),
      api.people.list("SAND_CONTRACTOR"),
    ]);
    setContracts(contractsData);
    setContractors(contractorsData);
  }

  useEffect(() => {
    if (!activeKilnId) return;
    refresh().catch(console.error);
  }, [activeKilnId]);

  useKilnEvent("sandContract:update", () => refresh());
  useKilnEvent("sandDelivery:update", () => refresh());
  useKilnEvent("person:update", () => refresh());

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!form.sandContractorId || !form.totalContractValue) return;
    if (form.rateType === "PER_TROLLEY" && !form.contractedTrolleys) {
      setFormError(t("sand.contractFieldsRequiredError"));
      return;
    }
    if (isPaymentSplitMismatched(form.paymentMode, Number(form.advanceAmount) || 0, form.cashAmount, form.onlineAmount)) {
      setFormError(t("payment.splitMismatch", { total: (Number(form.advanceAmount) || 0).toLocaleString("en-IN") }));
      return;
    }
    setFormError("");
    setLoading(true);
    try {
      await api.sandContracts.create({
        sandContractorId: form.sandContractorId,
        rateType: form.rateType,
        contractedTrolleys: form.rateType === "PER_TROLLEY" ? Number(form.contractedTrolleys) : undefined,
        contractPrice: form.contractPrice ? Number(form.contractPrice) : undefined,
        totalContractValue: Number(form.totalContractValue),
        advanceAmount: form.advanceAmount ? Number(form.advanceAmount) : undefined,
        paymentMode: form.advanceAmount ? form.paymentMode : undefined,
        cashAmount: form.advanceAmount && form.paymentMode === "CASH_AND_ONLINE" ? Number(form.cashAmount) : undefined,
        onlineAmount: form.advanceAmount && form.paymentMode === "CASH_AND_ONLINE" ? Number(form.onlineAmount) : undefined,
        startDate: form.startDate || undefined,
        endDate: form.endDate || undefined,
      });
      setForm(emptyContractForm);
      setShowForm(false);
      await refresh();
    } finally {
      setLoading(false);
    }
  }

  async function remove(contract: SandContract) {
    if (!confirm(t("sand.confirmDeleteContract", { contractNumber: contract.contractNumber }))) return;
    await api.sandContracts.remove(contract._id);
    refresh();
  }

  async function printContract(contract: SandContract) {
    const contractorId = typeof contract.sandContractorId === "object" ? contract.sandContractorId._id : contract.sandContractorId;
    const contractorName = typeof contract.sandContractorId === "object" ? contract.sandContractorId.name : "—";
    const ledger = await api.people.listLedger(contractorId);
    const activeKiln = useAuthStore.getState().kilns.find((k) => k.kilnId === useAuthStore.getState().activeKilnId);
    printSandContract(
      contract,
      contractorName,
      { name: activeKiln?.name ?? "Bhatta Cloud", location: activeKiln?.location, phone: activeKiln?.phone },
      ledger.filter((e) => e.contractId === contract._id)
    );
  }

  const filteredContracts = contracts.filter((c) => {
    if (rateTypeFilter !== "ALL" && c.rateType !== rateTypeFilter) return false;
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    const owner = typeof c.sandContractorId === "object" ? c.sandContractorId : null;
    return c.contractNumber.toLowerCase().includes(q) || (owner?.name ?? "").toLowerCase().includes(q) || (owner?.phone ?? "").includes(q);
  });
  const { page, setPage, pageCount, pageItems: pagedContracts, total } = usePagination(filteredContracts, 10);

  const totalContractValue = contracts.reduce((sum, c) => sum + c.totalContractValue, 0);
  const totalContractedTrolleys = contracts.reduce((sum, c) => sum + (c.contractedTrolleys ?? 0), 0);

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-2 md:grid-cols-3">
        <Card className="p-3">
          <p className="text-sm text-ink-muted">{t("soil.totalContracts")}</p>
          <p className="text-xl font-semibold tabular-nums text-ink-primary">{contracts.length}</p>
        </Card>
        <Card className="p-3">
          <p className="text-sm text-ink-muted">{t("soil.contractedQuantity")}</p>
          <p className="text-xl font-semibold tabular-nums text-ink-primary">{totalContractedTrolleys.toLocaleString("en-IN")}</p>
          <p className="text-sm text-ink-muted">{t("soil.trolleysUnit")}</p>
        </Card>
        <Card className="p-3">
          <p className="text-sm text-ink-muted">{t("soil.totalContractValue")}</p>
          <p className="text-xl font-semibold tabular-nums text-ink-primary">₹{formatINR(totalContractValue)}</p>
        </Card>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-muted" />
          <input
            placeholder={t("soil.searchContractsPlaceholder")}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className={cn(inputClass, "w-72 pl-9")}
          />
        </div>
        <Button size="sm" onClick={() => setShowForm((s) => !s)}>
          <Plus className="h-4 w-4" /> {t("soil.newContract")}
        </Button>
      </div>

      <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-ink-primary/10 bg-surface/60 px-3 py-2.5 shadow-sm">
        <FilterChips
          label={t("common.rate")}
          options={CONTRACT_RATE_TYPE_FILTERS.map((f) => ({ value: f.value, label: t(f.labelKey) }))}
          value={rateTypeFilter}
          onChange={setRateTypeFilter}
        />
      </div>

      {showForm && (
        <Card>
          <form onSubmit={handleSubmit} className="grid grid-cols-2 gap-2">
            <select
              required
              value={form.sandContractorId}
              onChange={(e) => setForm((f) => ({ ...f, sandContractorId: e.target.value }))}
              className={cn(inputClass, "col-span-2")}
            >
              <option value="">{t("sand.selectSandContractor")}</option>
              {contractors.map((c) => (
                <option key={c._id} value={c._id}>
                  {c.name}
                </option>
              ))}
            </select>

            <div className="col-span-2 flex gap-1">
              {(
                [
                  { value: "PER_TROLLEY", label: t("sand.perTrolley") },
                  { value: "PER_THOUSAND_BRICKS", label: t("sand.perThousandBricks") },
                ] as { value: SandContractRateType; label: string }[]
              ).map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setForm((f) => ({ ...f, rateType: opt.value }))}
                  className={cn(
                    "flex-1 rounded-lg border px-2 py-2 text-xs font-medium transition-colors",
                    form.rateType === opt.value
                      ? "border-series-1 bg-series-1/10 text-series-1"
                      : "border-ink-primary/20 bg-surface text-ink-secondary hover:bg-ink-primary/10"
                  )}
                >
                  {opt.label}
                </button>
              ))}
            </div>

            {form.rateType === "PER_TROLLEY" && (
              <input
                required
                type="number"
                placeholder={t("sand.numberOfTrolleysContract")}
                value={form.contractedTrolleys}
                onChange={(e) => setForm((f) => ({ ...f, contractedTrolleys: e.target.value }))}
                className={inputClass}
              />
            )}
            <input
              type="number"
              placeholder={form.rateType === "PER_TROLLEY" ? t("sand.pricePerTrolley") : t("sand.pricePerThousandBricks")}
              value={form.contractPrice}
              onChange={(e) => setForm((f) => ({ ...f, contractPrice: e.target.value }))}
              className={cn(inputClass, form.rateType === "PER_THOUSAND_BRICKS" && "col-span-2")}
            />

            <input
              required
              type="number"
              placeholder={t("sand.totalContractAmount")}
              value={form.totalContractValue}
              onChange={(e) => setForm((f) => ({ ...f, totalContractValue: e.target.value }))}
              className={cn(inputClass, "col-span-2")}
            />
            <input
              type="number"
              placeholder={t("sand.advanceAmountPaid")}
              value={form.advanceAmount}
              onChange={(e) => setForm((f) => ({ ...f, advanceAmount: e.target.value }))}
              className={inputClass}
            />
            {form.advanceAmount && (
              <select
                value={form.paymentMode}
                onChange={(e) => setForm((f) => ({ ...f, paymentMode: e.target.value as LedgerPaymentMode }))}
                className={inputClass}
              >
                <option value="CASH">{t("dispatch.paymentCash")}</option>
                <option value="BANK">{t("dispatch.paymentBankTransfer")}</option>
                <option value="UPI">{t("dispatch.paymentUpi")}</option>
                <option value="CASH_AND_ONLINE">{t("common.paymentModeCashAndOnline")}</option>
              </select>
            )}
            {form.advanceAmount && form.paymentMode === "CASH_AND_ONLINE" && (
              <div className="col-span-2">
                <PaymentSplitFields
                  totalAmount={Number(form.advanceAmount) || 0}
                  cashAmount={form.cashAmount}
                  onlineAmount={form.onlineAmount}
                  onCashAmountChange={(v) => setForm((f) => ({ ...f, cashAmount: v }))}
                  onOnlineAmountChange={(v) => setForm((f) => ({ ...f, onlineAmount: v }))}
                  inputClassName={inputClass}
                />
              </div>
            )}
            <DateInput
              value={form.startDate}
              onChange={(e) => setForm((f) => ({ ...f, startDate: e.target.value }))}
              className={inputClass}
            />
            <DateInput value={form.endDate} onChange={(e) => setForm((f) => ({ ...f, endDate: e.target.value }))} className={inputClass} />

            {formError && <p className="col-span-2 text-sm text-status-critical">{formError}</p>}

            <Button type="submit" disabled={loading} className="col-span-2">
              {t("soil.saveContract")}
            </Button>
          </form>
        </Card>
      )}

      <Card>
        {filteredContracts.length === 0 ? (
          <p className="py-8 text-center text-sm text-ink-muted">
            {contracts.length === 0 ? t("soil.noContractsYet") : t("soil.noContractsMatchSearch")}
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-sm">
              <thead>
                <tr className="border-b border-border text-left text-sm text-ink-muted">
                  <th className="pb-2 font-medium">{t("soil.contractHeader")}</th>
                  <th className="pb-2 font-medium">{t("people.sandContractor")}</th>
                  <th className="pb-2 font-medium">{t("common.rate")}</th>
                  <th className="pb-2 font-medium">{t("soil.valueHeader")}</th>
                  <th className="pb-2 font-medium"></th>
                </tr>
              </thead>
              <tbody>
                {pagedContracts.map((c) => {
                  const contractor = typeof c.sandContractorId === "object" ? c.sandContractorId : null;
                  return (
                  <tr key={c._id} className="border-b border-border/60 last:border-0">
                    <td className="py-3 text-ink-primary">{c.contractNumber}</td>
                    <td className="py-3 text-ink-secondary">
                      {contractor ? (
                        <button onClick={() => onOpenContractor(contractor._id)} className="hover:underline">
                          {contractor.name}
                        </button>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className="py-3 text-ink-secondary">
                      {c.rateType === "PER_THOUSAND_BRICKS" ? t("sand.perThousandBricks") : t("sand.perTrolley")}
                      {c.contractedTrolleys != null ? ` · ${c.contractedTrolleys.toLocaleString("en-IN")}` : ""}
                      {c.contractPrice != null ? ` · ₹${formatINR(c.contractPrice)}` : ""}
                    </td>
                    <td className="py-3 tabular-nums text-ink-secondary">₹{formatINR(c.totalContractValue)}</td>
                    <td className="py-3 text-right">
                      <div className="flex items-center justify-end gap-3">
                        <button onClick={() => printContract(c)} className="flex items-center gap-1 text-xs font-medium text-series-1 hover:underline">
                          <Printer className="h-3.5 w-3.5" /> {t("common.print")}
                        </button>
                        <button onClick={() => setEditingContract(c)} className="text-xs font-medium text-series-1 hover:underline">
                          {t("common.edit")}
                        </button>
                        <button onClick={() => remove(c)} className="text-xs font-medium text-status-critical hover:underline">
                          {t("common.delete")}
                        </button>
                      </div>
                    </td>
                  </tr>
                  );
                })}
              </tbody>
            </table>
            <Pagination page={page} pageCount={pageCount} onChange={setPage} total={total} pageSize={10} />
          </div>
        )}
      </Card>

      {editingContract && (
        <EditSandContractModal contract={editingContract} onClose={() => setEditingContract(null)} onSaved={refresh} />
      )}
    </div>
  );
}

const TAB_LABEL_KEYS = {
  arrivals: "sand.tabDeliveries",
  contracts: "soil.tabContracts",
} as const;

export function Sand() {
  const { t } = useTranslation();
  const [tab, setTab] = useState<keyof typeof TAB_LABEL_KEYS>("arrivals");
  const [openContractorId, setOpenContractorId] = useState<string | null>(null);

  // Same SandContractorDetailPage the People page's Sand Contractor tab
  // opens, so the profile looks identical no matter which page it was
  // opened from — mirrors Soil.tsx's landowner click-through.
  if (openContractorId) {
    return <SandContractorDetailPage sandContractorId={openContractorId} onBack={() => setOpenContractorId(null)} />;
  }

  return (
    <div className="space-y-4">
      <SegmentedTabs
        options={(Object.keys(TAB_LABEL_KEYS) as (keyof typeof TAB_LABEL_KEYS)[]).map((tabKey) => ({ value: tabKey, label: t(TAB_LABEL_KEYS[tabKey]) }))}
        value={tab}
        onChange={setTab}
      />

      {tab === "arrivals" && <SandArrivalsTab onOpenContractor={setOpenContractorId} />}
      {tab === "contracts" && <SandContractsTab onOpenContractor={setOpenContractorId} />}
    </div>
  );
}
