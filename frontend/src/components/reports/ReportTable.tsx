import { useTranslation } from "@/hooks/useTranslation";
import { formatINR } from "@/lib/utils";
import type { ReportResult } from "@/types/reports";

function formatCell(value: string | number | null, format: ReportResult["columns"][number]["format"]) {
  if (value == null || value === "") return "—";
  if (format === "date" && typeof value === "string") {
    return new Date(value).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
  }
  if (format === "currency" && typeof value === "number") return `₹${formatINR(value)}`;
  if (format === "number" && typeof value === "number") return value.toLocaleString("en-IN");
  return String(value);
}

// Fully generic: renders whatever columns/rows/totals the backend sent for
// the currently selected report — no per-report-type rendering code here.
export function ReportTable({ result }: { result: ReportResult }) {
  const { t } = useTranslation();

  if (result.rows.length === 0) {
    return <p className="py-10 text-center text-sm text-ink-muted">{t("reports.workspace.noData")}</p>;
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[560px] text-sm">
        <thead>
          <tr className="border-b border-border text-left text-ink-muted">
            {result.columns.map((c, i) => (
              <th key={c.key} className={`pb-2 pr-3 font-medium ${i > 0 && c.format !== "text" ? "text-right" : ""}`}>
                {t(c.labelKey)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {result.rows.map((row, ri) => (
            <tr key={ri} className="border-b border-border/60 last:border-0">
              {result.columns.map((c, i) => (
                <td key={c.key} className={`py-2 pr-3 text-ink-secondary ${i > 0 && c.format !== "text" ? "text-right tabular-nums" : ""}`}>
                  {formatCell(row[c.key], c.format)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
        {result.totals && (
          <tfoot>
            <tr className="border-t-2 border-border font-semibold text-ink-primary">
              {result.columns.map((c, i) => (
                <td key={c.key} className={`py-2 pr-3 ${i > 0 && c.format !== "text" ? "text-right tabular-nums" : ""}`}>
                  {i === 0 ? t("reports.workspace.total") : c.key in result.totals! ? formatCell(result.totals![c.key], c.format) : ""}
                </td>
              ))}
            </tr>
          </tfoot>
        )}
      </table>
    </div>
  );
}
