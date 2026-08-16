import { useEffect, useState } from "react";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { api } from "@/lib/api";
import { useKilnEvent } from "@/hooks/useKilnEvent";
import { useTranslation } from "@/hooks/useTranslation";
import { formatINR } from "@/lib/utils";
import type { SalarySlip } from "@/types";

function monthLabel(month: string) {
  const [year, m] = month.split("-").map(Number);
  return new Date(year, m - 1, 1).toLocaleDateString("en-IN", { month: "long", year: "numeric" });
}

export function SalarySlipHistory({ personId }: { personId: string }) {
  const { t } = useTranslation();
  const [slips, setSlips] = useState<SalarySlip[]>([]);

  async function refresh() {
    setSlips(await api.salary.forPerson(personId));
  }

  useEffect(() => {
    refresh().catch(console.error);
  }, [personId]);

  useKilnEvent("salary:update", () => refresh());

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("salary.slipHistory")}</CardTitle>
      </CardHeader>
      {slips.length === 0 ? (
        <p className="py-6 text-center text-sm text-ink-muted">{t("salary.noSlipsYet")}</p>
      ) : (
        <div className="space-y-2">
          {slips.map((slip) => (
            <div key={slip._id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border px-3 py-2 text-sm">
              <div>
                <p className="font-medium text-ink-primary">{monthLabel(slip.month)}</p>
                <p className="text-sm text-ink-muted">
                  {t("salary.daysPresent")} {slip.daysPresent} · {t("salary.daysAbsent")} {slip.daysAbsent}
                  {slip.daysHalfDay > 0 ? ` · ${t("salary.daysHalfDay")} ${slip.daysHalfDay}` : ""}
                  {slip.daysLate > 0 ? ` · ${t("salary.daysLate")} ${slip.daysLate}` : ""}
                </p>
              </div>
              <div className="flex items-center gap-3">
                <span className="font-semibold tabular-nums text-ink-primary">₹{formatINR(slip.netSalary)}</span>
                <a href={api.salary.pdfUrl(slip._id, "en")} target="_blank" rel="noreferrer" className="text-series-1 hover:underline">
                  {t("salary.viewEnglish")}
                </a>
                <a href={api.salary.pdfUrl(slip._id, "hi")} target="_blank" rel="noreferrer" className="text-series-1 hover:underline">
                  {t("salary.viewHindi")}
                </a>
              </div>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}
