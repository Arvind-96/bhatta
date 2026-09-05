import { FormEvent, useEffect, useState } from "react";
import { ArrowLeft, Pencil, Phone, Trash2, Users, Wallet } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { LedgerModal } from "@/components/people/LedgerModal";
import { api } from "@/lib/api";
import { useKilnEvent } from "@/hooks/useKilnEvent";
import { useTranslation } from "@/hooks/useTranslation";
import { formatINR } from "@/lib/utils";
import type { AgentCommissionType, SalesAgentDetail } from "@/types";

const inputClass =
  "h-10 rounded-xl border border-border bg-ink-primary/5 px-3 text-sm text-ink-primary outline-none focus:ring-2 focus:ring-series-1";

interface SalesAgentDetailPageProps {
  agentId: string;
  onBack: () => void;
  onDeleted: () => void;
}

export function SalesAgentDetailPage({ agentId, onBack, onDeleted }: SalesAgentDetailPageProps) {
  const { t } = useTranslation();
  const [detail, setDetail] = useState<SalesAgentDetail | null>(null);
  const [editing, setEditing] = useState(false);
  const [ledgerOpen, setLedgerOpen] = useState(false);

  async function refresh() {
    setDetail(await api.salesAgents.detail(agentId));
  }

  useEffect(() => {
    refresh().catch(console.error);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [agentId]);

  useKilnEvent<{ _id: string; deleted?: boolean }>("person:update", (payload) => {
    if (payload._id === agentId && payload.deleted) {
      onDeleted();
      return;
    }
    refresh().catch(console.error);
  });
  useKilnEvent("ledger:update", () => refresh().catch(console.error));
  useKilnEvent("invoice:update", () => refresh().catch(console.error));

  if (!detail) {
    return (
      <div>
        <button onClick={onBack} className="mb-3 flex items-center gap-1.5 text-sm text-ink-secondary hover:text-ink-primary">
          <ArrowLeft className="h-4 w-4" /> {t("nav.salesAgents")}
        </button>
        <Card>
          <p className="py-8 text-center text-sm text-ink-muted">{t("common.loading")}</p>
        </Card>
      </div>
    );
  }

  const { agent, balance, invoicesThrough, customers, totalSales, monthSales } = detail;
  const commissionLabel =
    agent.commissionType === "PERCENT_OF_SALE"
      ? t("salesAgent.commissionPercentOfSale", { percent: agent.commissionPercent ?? 0 })
      : agent.commissionType === "PER_THOUSAND_BRICKS"
      ? t("salesAgent.commissionPerThousand", { rate: formatINR(agent.commissionPerThousand ?? 0) })
      : "—";
  const targetProgressPercent = agent.monthlySalesTarget ? Math.min(100, Math.round((monthSales / agent.monthlySalesTarget) * 100)) : null;

  return (
    <div>
      <button onClick={onBack} className="mb-3 flex items-center gap-1.5 text-sm text-ink-secondary hover:text-ink-primary">
        <ArrowLeft className="h-4 w-4" /> {t("nav.salesAgents")}
      </button>

      <Card className="mb-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h3 className="text-lg font-semibold text-ink-primary">{agent.name}</h3>
            {agent.phone && (
              <a href={`tel:${agent.phone}`} className="flex items-center gap-1.5 text-sm text-ink-secondary hover:text-series-1">
                <Phone className="h-3.5 w-3.5" /> {agent.phone}
              </a>
            )}
            <div className="mt-2 flex flex-wrap gap-1.5">
              <Badge variant="neutral">{commissionLabel}</Badge>
              {agent.referralCode && <Badge variant="good">{t("salesAgent.referralCodeLabel")}: {agent.referralCode}</Badge>}
            </div>
          </div>
          <div className="flex gap-2">
            <button onClick={() => setLedgerOpen(true)} className="flex items-center gap-1 rounded-lg border border-border bg-ink-primary/5 px-3 py-1.5 text-xs font-medium text-ink-secondary hover:bg-ink-primary/10">
              <Wallet className="h-3.5 w-3.5" /> {t("common.ledger")}
            </button>
            <button onClick={() => setEditing(true)} className="flex items-center gap-1 rounded-lg border border-border bg-ink-primary/5 px-3 py-1.5 text-xs font-medium text-ink-secondary hover:bg-ink-primary/10">
              <Pencil className="h-3.5 w-3.5" /> {t("common.edit")}
            </button>
            <button
              onClick={async () => {
                if (!confirm(t("salesAgent.confirmDeactivate", { name: agent.name }))) return;
                await api.people.update(agentId, { active: false });
                onDeleted();
              }}
              className="flex items-center gap-1 rounded-lg border border-status-critical/30 bg-status-critical/5 px-3 py-1.5 text-xs font-medium text-status-critical hover:bg-status-critical/10"
            >
              <Trash2 className="h-3.5 w-3.5" /> {t("common.delete")}
            </button>
          </div>
        </div>
      </Card>

      {editing && (
        <Card className="mb-4">
          <h4 className="mb-3 text-sm font-semibold text-ink-primary">{t("salesAgent.editAgent")}</h4>
          <AgentEditForm
            agentId={agentId}
            existing={agent}
            onClose={() => setEditing(false)}
            onSaved={() => {
              setEditing(false);
              refresh();
            }}
          />
        </Card>
      )}

      <div className="grid gap-4 lg:grid-cols-3">
        <Card>
          <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-muted">{t("salesAgent.balanceHeader")}</h4>
          <div className="rounded-xl border border-border bg-ink-primary/[0.03] p-3 text-center">
            <p className={`text-xl font-semibold tabular-nums ${balance > 0 ? "text-status-critical" : balance < 0 ? "text-status-good" : "text-ink-primary"}`}>
              ₹{formatINR(Math.abs(balance))}
            </p>
            <p className="text-sm text-ink-muted">{balance > 0 ? t("salesAgent.commissionDue") : balance < 0 ? t("salesAgent.commissionOverpaid") : t("partner.settledLabel")}</p>
          </div>
        </Card>
        <Card>
          <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-muted">{t("salesAgent.totalSalesHeader")}</h4>
          <div className="rounded-xl border border-border bg-ink-primary/[0.03] p-3 text-center">
            <p className="text-xl font-semibold tabular-nums text-ink-primary">₹{formatINR(totalSales)}</p>
            <p className="text-sm text-ink-muted">{t("salesAgent.acrossInvoicesLabel", { count: invoicesThrough.length })}</p>
          </div>
        </Card>
        <Card>
          <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-muted">{t("salesAgent.customersHeader")}</h4>
          <div className="rounded-xl border border-border bg-ink-primary/[0.03] p-3 text-center">
            <p className="text-xl font-semibold tabular-nums text-ink-primary">{customers.length}</p>
            <p className="text-sm text-ink-muted">{t("salesAgent.uniqueCustomersLabel")}</p>
          </div>
        </Card>

        <Card className="lg:col-span-3">
          <div className="mb-2 flex items-center justify-between">
            <h4 className="text-xs font-semibold uppercase tracking-wide text-ink-muted">{t("salesAgent.monthlyTargetSection")}</h4>
            {targetProgressPercent != null && targetProgressPercent >= 100 && <Badge variant="good">{t("salesAgent.targetMetBadge")}</Badge>}
          </div>
          {agent.monthlySalesTarget ? (
            <>
              <div className="h-2.5 w-full overflow-hidden rounded-full bg-ink-primary/10">
                <div className="h-full rounded-full bg-series-1 transition-all" style={{ width: `${targetProgressPercent}%` }} />
              </div>
              <p className="mt-2 text-sm text-ink-secondary">
                {t("salesAgent.targetProgressLabel", { achieved: `₹${formatINR(monthSales)}`, target: `₹${formatINR(agent.monthlySalesTarget)}` })}
              </p>
            </>
          ) : (
            <p className="text-sm text-ink-muted">{t("salesAgent.noTargetSet")}</p>
          )}
        </Card>

        <Card className="lg:col-span-3">
          <h4 className="mb-3 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-ink-muted">
            <Users className="h-3.5 w-3.5" /> {t("salesAgent.customersSection")}
          </h4>
          {customers.length === 0 ? (
            <p className="py-6 text-center text-sm text-ink-muted">{t("salesAgent.noCustomersYet")}</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[560px] text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-sm text-ink-muted">
                    <th className="pb-2 font-medium">{t("partner.customerHeader")}</th>
                    <th className="pb-2 font-medium text-right">{t("salesAgent.invoiceCountHeader")}</th>
                    <th className="pb-2 font-medium text-right">{t("salesAgent.totalSalesHeader")}</th>
                    <th className="pb-2 font-medium text-right">{t("salesAgent.lastSaleHeader")}</th>
                  </tr>
                </thead>
                <tbody>
                  {customers.map((c) => (
                    <tr key={c.customerId ?? c.customerName} className="border-b border-border/60 last:border-0">
                      <td className="py-3 text-ink-primary">{c.customerName}</td>
                      <td className="py-3 text-right tabular-nums text-ink-secondary">{c.invoiceCount}</td>
                      <td className="py-3 text-right tabular-nums font-medium text-ink-primary">₹{formatINR(c.totalSales)}</td>
                      <td className="py-3 text-right text-ink-secondary">{c.lastSaleDate ? new Date(c.lastSaleDate).toLocaleDateString("en-IN") : "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </div>

      {ledgerOpen && <LedgerModal person={agent} onClose={() => setLedgerOpen(false)} />}
    </div>
  );
}

function AgentEditForm({ agentId, existing, onClose, onSaved }: { agentId: string; existing: SalesAgentDetail["agent"]; onClose: () => void; onSaved: () => void }) {
  const { t } = useTranslation();
  const [name, setName] = useState(existing.name);
  const [phone, setPhone] = useState(existing.phone ?? "");
  const [commissionType, setCommissionType] = useState<AgentCommissionType>(existing.commissionType ?? "PERCENT_OF_SALE");
  const [commissionPercent, setCommissionPercent] = useState(existing.commissionPercent?.toString() ?? "");
  const [commissionPerThousand, setCommissionPerThousand] = useState(existing.commissionPerThousand?.toString() ?? "");
  const [monthlySalesTarget, setMonthlySalesTarget] = useState(existing.monthlySalesTarget?.toString() ?? "");
  const [referralCode, setReferralCode] = useState(existing.referralCode ?? "");
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState("");

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setFormError("");
    setSaving(true);
    try {
      await api.people.update(agentId, {
        name: name.trim(),
        phone: phone.trim() || undefined,
        commissionType,
        commissionPercent: commissionType === "PERCENT_OF_SALE" && commissionPercent ? Number(commissionPercent) : undefined,
        commissionPerThousand: commissionType === "PER_THOUSAND_BRICKS" && commissionPerThousand ? Number(commissionPerThousand) : undefined,
        monthlySalesTarget: monthlySalesTarget ? Number(monthlySalesTarget) : undefined,
        referralCode: referralCode.trim() || undefined,
      });
      onSaved();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : t("common.somethingWentWrong"));
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex max-w-md flex-col gap-3">
      <input required value={name} onChange={(e) => setName(e.target.value)} className={inputClass} placeholder={t("salesAgent.namePlaceholder")} />
      <input value={phone} onChange={(e) => setPhone(e.target.value)} className={inputClass} placeholder={t("salesAgent.phonePlaceholder")} />
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => setCommissionType("PERCENT_OF_SALE")}
          className={`flex-1 rounded-xl border px-3 py-2 text-sm font-medium ${commissionType === "PERCENT_OF_SALE" ? "border-series-1 bg-series-1/10 text-series-1" : "border-border text-ink-secondary"}`}
        >
          {t("salesAgent.basisPercentOfSale")}
        </button>
        <button
          type="button"
          onClick={() => setCommissionType("PER_THOUSAND_BRICKS")}
          className={`flex-1 rounded-xl border px-3 py-2 text-sm font-medium ${commissionType === "PER_THOUSAND_BRICKS" ? "border-series-1 bg-series-1/10 text-series-1" : "border-border text-ink-secondary"}`}
        >
          {t("salesAgent.basisPerThousand")}
        </button>
      </div>
      {commissionType === "PERCENT_OF_SALE" ? (
        <input type="number" min={0} max={100} step="0.01" value={commissionPercent} onChange={(e) => setCommissionPercent(e.target.value)} className={inputClass} placeholder={t("salesAgent.commissionPercentPlaceholder")} />
      ) : (
        <input type="number" min={0} value={commissionPerThousand} onChange={(e) => setCommissionPerThousand(e.target.value)} className={inputClass} placeholder={t("salesAgent.commissionPerThousandPlaceholder")} />
      )}
      <input type="number" min={0} value={monthlySalesTarget} onChange={(e) => setMonthlySalesTarget(e.target.value)} className={inputClass} placeholder={t("salesAgent.monthlyTargetPlaceholder")} />
      <input value={referralCode} onChange={(e) => setReferralCode(e.target.value)} className={inputClass} placeholder={t("salesAgent.referralCodePlaceholder")} />
      {formError && <p className="text-sm text-status-critical">{formError}</p>}
      <div className="flex gap-2">
        <Button type="submit" size="sm" disabled={saving}>
          {saving ? t("settings.savingEllipsis") : t("common.save")}
        </Button>
        <Button type="button" size="sm" variant="outline" onClick={onClose}>
          {t("common.cancel")}
        </Button>
      </div>
    </form>
  );
}
