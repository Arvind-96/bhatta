import { useEffect, useState } from "react";
import { Wallet } from "lucide-react";
import { Card } from "@/components/ui/card";
import { api } from "@/lib/api";
import { useKilnEvent } from "@/hooks/useKilnEvent";
import { useTranslation } from "@/hooks/useTranslation";
import { formatINR } from "@/lib/utils";
import type { ContractorNetBalance } from "@/types";

// A LABOUR_CONTRACTOR's plain ledger balance (their own advances/
// commission/settlements) doesn't account for money the kiln pays straight
// to one of their gang instead of routing it through them — this card adds
// that back live, computed fresh from the gang's own ledger entries every
// time (never a stored/duplicated figure), so it can never drift. Dropped
// into every contractor detail page (Thekedar, Pathai, Bharai, Nikasi,
// Pakayi) — same card, same numbers, wherever a contractor's profile lives.
export function ContractorNetBalanceCard({ contractorId }: { contractorId: string }) {
  const { t } = useTranslation();
  const [balance, setBalance] = useState<ContractorNetBalance | null>(null);

  async function refresh() {
    setBalance(await api.people.contractorBalance(contractorId));
  }

  useEffect(() => {
    refresh().catch(console.error);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contractorId]);

  useKilnEvent("ledger:update", () => refresh().catch(console.error));

  if (!balance) return null;

  return (
    <Card>
      <h4 className="mb-1 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-ink-muted">
        <Wallet className="h-3.5 w-3.5" /> {t("contractor.netBalanceTitle")}
      </h4>
      <p className="mb-3 text-sm text-ink-muted">{t("contractor.netBalanceDescription")}</p>
      <div className="grid grid-cols-3 gap-2 text-center">
        <div className="rounded-xl border border-border bg-ink-primary/[0.03] p-3">
          <p className="text-lg font-semibold tabular-nums text-ink-primary">₹{formatINR(Math.abs(balance.ownBalance))}</p>
          <p className="text-sm text-ink-muted">{t("contractor.ownBalanceLabel")}</p>
        </div>
        <div className="rounded-xl border border-border bg-ink-primary/[0.03] p-3">
          <p className="text-lg font-semibold tabular-nums text-ink-primary">₹{formatINR(balance.gangDrawdown)}</p>
          <p className="text-sm text-ink-muted">{t("contractor.gangDrawdownLabel")}</p>
        </div>
        <div className="rounded-xl border border-series-1/30 bg-series-1/5 p-3">
          <p className="text-lg font-semibold tabular-nums text-series-1">₹{formatINR(Math.abs(balance.netBalance))}</p>
          <p className="text-sm text-ink-muted">
            {balance.netBalance < 0 ? t("contractor.netAdvanceOutstanding") : balance.netBalance > 0 ? t("contractor.netOwedToContractor") : t("contractor.netSettled")}
          </p>
        </div>
      </div>
    </Card>
  );
}
