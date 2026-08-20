import { FormEvent, useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api";
import { useKilnEvent } from "@/hooks/useKilnEvent";
import { useTranslation } from "@/hooks/useTranslation";
import { formatINR } from "@/lib/utils";
import type { LabourSessionSummary } from "@/types";

const inputClass =
  "h-10 rounded-xl border border-border bg-ink-primary/5 px-3 text-sm text-ink-primary outline-none focus:ring-2 focus:ring-series-1";

interface LabourSessionSectionProps {
  contractorId: string;
  editable: boolean;
}

// Total Amount Payable by Admin = (Laborers x Fare per laborer) + (Laborers
// x Advance per laborer) - (advance/kharchi/medical/festival paid to the
// gang) - (advance paid to the contractor) [+ balance carried forward from
// the previous session]. Persisted server-side (labour_sessions table,
// see labourSession.service.ts) so it's the same figure whether viewed
// editable (People page's Thekedar profile) or read-only (Molding/Pathai
// contractor profile) -- entry happens in exactly one place.
export function LabourSessionSection({ contractorId, editable }: LabourSessionSectionProps) {
  const { t } = useTranslation();
  const [summary, setSummary] = useState<LabourSessionSummary | null>(null);
  const [numberOfLaborers, setNumberOfLaborers] = useState("");
  const [farePerLaborer, setFarePerLaborer] = useState("");
  const [advancePerLaborer, setAdvancePerLaborer] = useState("");
  const [saving, setSaving] = useState(false);
  const [startingNew, setStartingNew] = useState(false);

  async function refresh() {
    const result = await api.labourSessions.get(contractorId);
    setSummary(result);
    setNumberOfLaborers(result.session ? String(result.session.numberOfLaborers) : "");
    setFarePerLaborer(result.session ? String(result.session.farePerLaborer) : "");
    setAdvancePerLaborer(result.session ? String(result.session.advancePerLaborer) : "");
  }

  useEffect(() => {
    refresh().catch(console.error);
  }, [contractorId]);

  useKilnEvent<{ contractorId: string }>("labourSession:update", (payload) => {
    if (payload.contractorId === contractorId) refresh().catch(console.error);
  });
  useKilnEvent("ledger:update", () => refresh().catch(console.error));

  async function save(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      const result = await api.labourSessions.save(contractorId, {
        numberOfLaborers: Number(numberOfLaborers) || 0,
        farePerLaborer: Number(farePerLaborer) || 0,
        advancePerLaborer: Number(advancePerLaborer) || 0,
      });
      setSummary(result);
    } finally {
      setSaving(false);
    }
  }

  async function startNewSession() {
    if (!confirm(t("molding.confirmStartNewSession"))) return;
    setStartingNew(true);
    try {
      const result = await api.labourSessions.startNew(contractorId, {
        numberOfLaborers: Number(numberOfLaborers) || 0,
        farePerLaborer: Number(farePerLaborer) || 0,
        advancePerLaborer: Number(advancePerLaborer) || 0,
      });
      setSummary(result);
    } finally {
      setStartingNew(false);
    }
  }

  if (!summary) return null;

  return (
    <Card className="lg:col-span-2">
      <h4 className="mb-1 text-xs font-semibold uppercase tracking-wide text-ink-muted">{t("molding.labourSessionTitle")}</h4>
      <p className="mb-3 text-sm text-ink-muted">{t("molding.labourSessionHint")}</p>

      {editable && (
        <form onSubmit={save} className="grid gap-3 sm:grid-cols-3">
          <label className="flex flex-col gap-1">
            <span className="text-sm text-ink-muted">{t("molding.numberOfLaborers")}</span>
            <input
              type="number"
              min={0}
              value={numberOfLaborers}
              onChange={(e) => setNumberOfLaborers(e.target.value)}
              className={inputClass}
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-sm text-ink-muted">{t("molding.perLaborFareAmount")}</span>
            <input
              type="number"
              min={0}
              value={farePerLaborer}
              onChange={(e) => setFarePerLaborer(e.target.value)}
              className={inputClass}
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-sm text-ink-muted">{t("molding.perLaborAdvanceAmount")}</span>
            <input
              type="number"
              min={0}
              value={advancePerLaborer}
              onChange={(e) => setAdvancePerLaborer(e.target.value)}
              className={inputClass}
            />
          </label>
          <div className="flex gap-2 sm:col-span-3">
            <Button type="submit" size="sm" disabled={saving}>
              {t("common.save")}
            </Button>
            <Button type="button" size="sm" variant="outline" onClick={startNewSession} disabled={startingNew}>
              {t("molding.startNewSession")}
            </Button>
          </div>
        </form>
      )}

      <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
        <div className="rounded-xl border border-border bg-ink-primary/5 p-3 text-center">
          <p className="text-lg font-semibold tabular-nums text-ink-primary">{summary.session?.numberOfLaborers ?? 0}</p>
          <p className="text-sm text-ink-muted">{t("molding.numberOfLaborers")}</p>
        </div>
        <div className="rounded-xl border border-border bg-ink-primary/5 p-3 text-center">
          <p className="text-lg font-semibold tabular-nums text-status-warning">₹{formatINR(summary.deductionsToLaborers)}</p>
          <p className="text-sm text-ink-muted">{t("molding.paidToLaborersLabel")}</p>
        </div>
        <div className="rounded-xl border border-border bg-ink-primary/5 p-3 text-center">
          <p className="text-lg font-semibold tabular-nums text-ink-primary">₹{formatINR(summary.advancePaidToContractor)}</p>
          <p className="text-sm text-ink-muted">{t("molding.advanceGivenLabel")}</p>
        </div>
        <div className="rounded-xl bg-series-1 p-3 text-center">
          <p className="text-lg font-semibold tabular-nums text-white">₹{formatINR(Math.abs(summary.total))}</p>
          <p className="text-sm text-white/80">{t("molding.totalPayableByAdminLabel")}</p>
        </div>
      </div>

      {summary.session && summary.session.carriedForwardAmount > 0 && (
        <p className="mt-3 text-sm text-status-warning">
          {t("molding.carriedForwardNote", { amount: formatINR(summary.session.carriedForwardAmount) })}
        </p>
      )}
    </Card>
  );
}
