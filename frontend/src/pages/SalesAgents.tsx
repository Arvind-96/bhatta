import { FormEvent, useEffect, useState } from "react";
import { ArrowDown, ArrowUp, Pencil, Phone, Plus, Search, Trash2, UserCheck } from "lucide-react";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Pagination, usePagination } from "@/components/ui/pagination";
import { EmptyState } from "@/components/ui/empty-state";
import { ConfirmDialog } from "@/components/shared/ConfirmDialog";
import { SalesAgentDetailPage } from "@/components/salesAgent/SalesAgentDetailPage";
import { api } from "@/lib/api";
import { useKilnEvent } from "@/hooks/useKilnEvent";
import { useAuthStore } from "@/store/auth.store";
import { useTranslation } from "@/hooks/useTranslation";
import { formatINR, cn } from "@/lib/utils";
import type { AgentCommissionType, Person, SalesAgentSummary } from "@/types";

const inputClass =
  "h-10 rounded-xl border border-border bg-ink-primary/5 px-3 text-sm text-ink-primary outline-none focus:ring-2 focus:ring-series-1";

function commissionLabel(t: (k: string, p?: Record<string, string | number>) => string, agent: Person) {
  if (agent.commissionType === "PERCENT_OF_SALE") return t("salesAgent.commissionPercentOfSale", { percent: agent.commissionPercent ?? 0 });
  if (agent.commissionType === "PER_THOUSAND_BRICKS") return t("salesAgent.commissionPerThousand", { rate: formatINR(agent.commissionPerThousand ?? 0) });
  return "—";
}

function AddAgentForm({ existing, onClose, onSaved }: { existing: Person | null; onClose: () => void; onSaved: () => void }) {
  const { t } = useTranslation();
  const [name, setName] = useState(existing?.name ?? "");
  const [phone, setPhone] = useState(existing?.phone ?? "");
  const [commissionType, setCommissionType] = useState<AgentCommissionType>(existing?.commissionType ?? "PERCENT_OF_SALE");
  const [commissionPercent, setCommissionPercent] = useState(existing?.commissionPercent?.toString() ?? "");
  const [commissionPerThousand, setCommissionPerThousand] = useState(existing?.commissionPerThousand?.toString() ?? "");
  const [monthlySalesTarget, setMonthlySalesTarget] = useState(existing?.monthlySalesTarget?.toString() ?? "");
  const [referralCode, setReferralCode] = useState(existing?.referralCode ?? "");
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setSaving(true);
    try {
      const input = {
        type: "SALES_AGENT" as const,
        name: name.trim(),
        phone: phone.trim() || undefined,
        commissionType,
        commissionPercent: commissionType === "PERCENT_OF_SALE" && commissionPercent ? Number(commissionPercent) : undefined,
        commissionPerThousand: commissionType === "PER_THOUSAND_BRICKS" && commissionPerThousand ? Number(commissionPerThousand) : undefined,
        monthlySalesTarget: monthlySalesTarget ? Number(monthlySalesTarget) : undefined,
        referralCode: referralCode.trim() || undefined,
      };
      if (existing) await api.people.update(existing._id, input);
      else await api.people.create(input);
      onSaved();
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card className="max-w-md">
      <CardHeader>
        <CardTitle>{existing ? t("salesAgent.editAgent") : t("salesAgent.addAgentButton")}</CardTitle>
      </CardHeader>
      <form onSubmit={handleSubmit} className="flex flex-col gap-3">
        <input required placeholder={t("salesAgent.namePlaceholder")} value={name} onChange={(e) => setName(e.target.value)} className={inputClass} />
        <input placeholder={t("salesAgent.phonePlaceholder")} value={phone} onChange={(e) => setPhone(e.target.value)} className={inputClass} />
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setCommissionType("PERCENT_OF_SALE")}
            className={cn("flex-1 rounded-xl border px-3 py-2 text-sm font-medium", commissionType === "PERCENT_OF_SALE" ? "border-series-1 bg-series-1/10 text-series-1" : "border-border text-ink-secondary")}
          >
            {t("salesAgent.basisPercentOfSale")}
          </button>
          <button
            type="button"
            onClick={() => setCommissionType("PER_THOUSAND_BRICKS")}
            className={cn("flex-1 rounded-xl border px-3 py-2 text-sm font-medium", commissionType === "PER_THOUSAND_BRICKS" ? "border-series-1 bg-series-1/10 text-series-1" : "border-border text-ink-secondary")}
          >
            {t("salesAgent.basisPerThousand")}
          </button>
        </div>
        {commissionType === "PERCENT_OF_SALE" ? (
          <input type="number" min={0} max={100} step="0.01" placeholder={t("salesAgent.commissionPercentPlaceholder")} value={commissionPercent} onChange={(e) => setCommissionPercent(e.target.value)} className={inputClass} />
        ) : (
          <input type="number" min={0} placeholder={t("salesAgent.commissionPerThousandPlaceholder")} value={commissionPerThousand} onChange={(e) => setCommissionPerThousand(e.target.value)} className={inputClass} />
        )}
        <input type="number" min={0} placeholder={t("salesAgent.monthlyTargetPlaceholder")} value={monthlySalesTarget} onChange={(e) => setMonthlySalesTarget(e.target.value)} className={inputClass} />
        <input placeholder={t("salesAgent.referralCodePlaceholder")} value={referralCode} onChange={(e) => setReferralCode(e.target.value)} className={inputClass} />
        <div className="flex gap-2">
          <Button type="submit" disabled={saving || !name.trim()}>
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

function SortableHeader<T extends string>({
  label,
  column,
  sortBy,
  sortDir,
  onSort,
}: {
  label: string;
  column: T;
  sortBy: T;
  sortDir: "asc" | "desc";
  onSort: (column: T) => void;
}) {
  const active = sortBy === column;
  return (
    <th className="pb-2 text-right font-medium">
      <button type="button" onClick={() => onSort(column)} className={cn("inline-flex items-center gap-1 hover:text-ink-primary", active && "text-ink-primary")}>
        {label}
        {active ? sortDir === "desc" ? <ArrowDown className="h-3 w-3" /> : <ArrowUp className="h-3 w-3" /> : null}
      </button>
    </th>
  );
}

export function SalesAgents() {
  const [agents, setAgents] = useState<SalesAgentSummary[]>([]);
  const [mode, setMode] = useState<"list" | "add">("list");
  const [editing, setEditing] = useState<Person | null>(null);
  const [search, setSearch] = useState("");
  const [openAgentId, setOpenAgentId] = useState<string | null>(null);
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const activeKilnId = useAuthStore((s) => s.activeKilnId);
  const { t } = useTranslation();

  async function refresh() {
    setAgents(await api.salesAgents.list());
  }

  useEffect(() => {
    if (!activeKilnId) return;
    refresh().catch(console.error);
  }, [activeKilnId]);

  useKilnEvent("person:update", () => refresh());
  useKilnEvent("invoice:update", () => refresh());

  const [sortBy, setSortBy] = useState<"customerCount" | "totalSales" | "balance">("balance");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  function toggleSort(column: typeof sortBy) {
    if (sortBy === column) {
      setSortDir((d) => (d === "desc" ? "asc" : "desc"));
    } else {
      setSortBy(column);
      setSortDir("desc");
    }
  }

  const filtered = agents
    .filter((row) => {
      if (!search.trim()) return true;
      const q = search.toLowerCase();
      return row.agent.name.toLowerCase().includes(q) || (row.agent.phone ?? "").includes(q);
    })
    .sort((a, b) => (sortDir === "desc" ? b[sortBy] - a[sortBy] : a[sortBy] - b[sortBy]));
  const { page, setPage, pageCount, pageItems: paged, total } = usePagination(filtered, 10);
  const pendingDeleteAgent = agents.find((row) => row.agent._id === pendingDeleteId)?.agent ?? null;

  if (openAgentId) {
    return <SalesAgentDetailPage agentId={openAgentId} onBack={() => setOpenAgentId(null)} onDeleted={() => setOpenAgentId(null)} />;
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap justify-end gap-2">
        <Button
          size="sm"
          variant={mode === "add" ? "primary" : "outline"}
          onClick={() => {
            setEditing(null);
            setMode("add");
          }}
        >
          <Plus className="h-4 w-4" /> {t("salesAgent.addAgentButton")}
        </Button>
        <Button size="sm" variant={mode === "list" ? "primary" : "outline"} onClick={() => setMode("list")}>
          <UserCheck className="h-4 w-4" /> {t("nav.salesAgents")}
        </Button>
      </div>

      {mode === "add" ? (
        <AddAgentForm
          existing={editing}
          onClose={() => {
            setEditing(null);
            setMode("list");
          }}
          onSaved={() => {
            setEditing(null);
            setMode("list");
            refresh();
          }}
        />
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>{t("nav.salesAgents")}</CardTitle>
          </CardHeader>
          <div className="relative mb-3">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-muted" />
            <input
              placeholder={t("salesAgent.searchPlaceholder")}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className={cn(inputClass, "w-full max-w-sm pl-9")}
            />
          </div>
          {agents.length === 0 ? (
            <EmptyState icon={UserCheck} title={t("salesAgent.noAgentsYet")} />
          ) : filtered.length === 0 ? (
            <p className="py-8 text-center text-sm text-ink-muted">{t("dispatchDocs.noMatchSearch")}</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[680px] text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-sm text-ink-muted">
                    <th className="pb-2 font-medium">{t("salesAgent.namePlaceholder")}</th>
                    <th className="pb-2 font-medium">{t("salesAgent.phonePlaceholder")}</th>
                    <th className="pb-2 font-medium">{t("salesAgent.commissionHeader")}</th>
                    <SortableHeader label={t("salesAgent.customersHeader")} column="customerCount" sortBy={sortBy} sortDir={sortDir} onSort={toggleSort} />
                    <SortableHeader label={t("salesAgent.totalSalesHeader")} column="totalSales" sortBy={sortBy} sortDir={sortDir} onSort={toggleSort} />
                    <SortableHeader label={t("salesAgent.balanceHeader")} column="balance" sortBy={sortBy} sortDir={sortDir} onSort={toggleSort} />
                    <th className="pb-2 font-medium text-right">{t("common.actions")}</th>
                  </tr>
                </thead>
                <tbody>
                  {paged.map((row) => (
                    <tr key={row.agent._id} onClick={() => setOpenAgentId(row.agent._id)} className="cursor-pointer border-b border-border/60 last:border-0 hover:bg-ink-primary/5">
                      <td className="py-3 text-ink-primary hover:underline">{row.agent.name}</td>
                      <td className="py-3 text-ink-secondary">
                        {row.agent.phone ? (
                          <a href={`tel:${row.agent.phone}`} onClick={(e) => e.stopPropagation()} className="flex items-center gap-1.5 hover:text-series-1">
                            <Phone className="h-3.5 w-3.5" /> {row.agent.phone}
                          </a>
                        ) : (
                          "—"
                        )}
                      </td>
                      <td className="py-3 text-ink-secondary">{commissionLabel(t, row.agent)}</td>
                      <td className="py-3 text-right tabular-nums text-ink-secondary">{row.customerCount}</td>
                      <td className="py-3 text-right tabular-nums font-medium text-ink-primary">₹{formatINR(row.totalSales)}</td>
                      <td className={`py-3 text-right tabular-nums ${row.balance > 0 ? "text-status-critical" : "text-ink-secondary"}`}>₹{formatINR(row.balance)}</td>
                      <td className="py-3" onClick={(e) => e.stopPropagation()}>
                        <div className="flex justify-end gap-1.5">
                          <button
                            onClick={() => {
                              setEditing(row.agent);
                              setMode("add");
                            }}
                            className="flex h-7 w-7 items-center justify-center rounded-lg border border-border text-ink-secondary hover:border-series-1/50 hover:text-series-1"
                            aria-label={t("common.edit")}
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </button>
                          <button
                            onClick={() => setPendingDeleteId(row.agent._id)}
                            className="flex h-7 w-7 items-center justify-center rounded-lg border border-status-critical/30 text-status-critical hover:bg-status-critical/10"
                            aria-label={t("common.delete")}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <Pagination page={page} pageCount={pageCount} onChange={setPage} total={total} pageSize={10} />
            </div>
          )}
        </Card>
      )}

      {pendingDeleteAgent && (
        <ConfirmDialog
          title={t("common.delete")}
          detail={t("salesAgent.confirmDeactivate", { name: pendingDeleteAgent.name })}
          confirmLabel={t("common.delete")}
          loading={deleting}
          onCancel={() => setPendingDeleteId(null)}
          onConfirm={async () => {
            setDeleting(true);
            try {
              await api.people.update(pendingDeleteAgent._id, { active: false });
              setPendingDeleteId(null);
              refresh();
            } finally {
              setDeleting(false);
            }
          }}
        />
      )}
    </div>
  );
}
