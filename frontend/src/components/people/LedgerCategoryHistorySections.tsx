import { useState } from "react";
import { Card } from "@/components/ui/card";
import type { LedgerCategory, LedgerEntry } from "@/types";
import { formatDateTime, formatINR } from "@/lib/utils";
import { useTranslation } from "@/hooks/useTranslation";

const PAGE_SIZE = 10;

function PaginatedLedgerSection({ titleKey, entries }: { titleKey: string; entries: LedgerEntry[] }) {
  const { t } = useTranslation();
  const title = t(titleKey);
  const [page, setPage] = useState(1);
  const total = entries.reduce((sum, e) => sum + e.amount, 0);
  const pageCount = Math.max(1, Math.ceil(entries.length / PAGE_SIZE));
  const clampedPage = Math.min(page, pageCount);
  const pageEntries = entries.slice((clampedPage - 1) * PAGE_SIZE, clampedPage * PAGE_SIZE);

  return (
    <Card>
      <div className="mb-3 flex items-center justify-between">
        <h4 className="text-xs font-semibold uppercase tracking-wide text-ink-muted">{title}</h4>
        <p className="text-sm font-semibold tabular-nums text-ink-primary">₹{formatINR(total)}</p>
      </div>

      {entries.length === 0 ? (
        <p className="py-6 text-center text-sm text-ink-muted">{t("people.noCategoryEntriesYet", { title })}</p>
      ) : (
        <>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-sm">
              <thead>
                <tr className="border-b border-border text-left text-sm text-ink-muted">
                  <th className="pb-2 font-medium">{t("common.transactionDate")}</th>
                  <th className="pb-2 font-medium">{t("people.reason")}</th>
                  <th className="pb-2 font-medium">{t("people.mode")}</th>
                  <th className="pb-2 font-medium">{t("common.entryDateTime")}</th>
                  <th className="pb-2 font-medium text-right">{t("common.amount")}</th>
                </tr>
              </thead>
              <tbody>
                {pageEntries.map((entry) => (
                  <tr key={entry._id} className="border-b border-border/60 last:border-0">
                    <td className="py-3 text-ink-secondary">{new Date(entry.date).toLocaleDateString("en-IN")}</td>
                    <td className="py-3 text-ink-primary">{entry.reason}</td>
                    <td className="py-3 text-ink-secondary">{entry.paymentMode ?? "—"}</td>
                    <td className="py-3 text-xs text-ink-muted">{formatDateTime(entry.createdAt)}</td>
                    <td className="py-3 text-right tabular-nums font-medium text-ink-primary">
                      ₹{formatINR(entry.amount)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {pageCount > 1 && (
            <div className="mt-3 flex items-center justify-between border-t border-border pt-3">
              <p className="text-sm text-ink-muted">
                {t("people.pageOfEntries", { page: clampedPage, pageCount, count: entries.length })}
              </p>
              <div className="flex gap-2">
                <button
                  disabled={clampedPage <= 1}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  className="rounded-lg border border-border bg-ink-primary/5 px-2.5 py-1 text-xs font-medium text-ink-secondary hover:bg-ink-primary/10 disabled:opacity-40 disabled:hover:bg-ink-primary/5"
                >
                  {t("people.previous")}
                </button>
                <button
                  disabled={clampedPage >= pageCount}
                  onClick={() => setPage((p) => Math.min(pageCount, p + 1))}
                  className="rounded-lg border border-border bg-ink-primary/5 px-2.5 py-1 text-xs font-medium text-ink-secondary hover:bg-ink-primary/10 disabled:opacity-40 disabled:hover:bg-ink-primary/5"
                >
                  {t("people.next")}
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </Card>
  );
}

const SECTION_DEFS: { category: LedgerCategory; titleKey: string }[] = [
  { category: "ADVANCE", titleKey: "people.advance" },
  { category: "KHARCHI", titleKey: "people.kharchiFull" },
  { category: "MEDICAL", titleKey: "people.medical" },
  { category: "FESTIVAL", titleKey: "people.festival" },
];

// The four requested category sections at the bottom of a contractor/labor
// profile, each with its own subtotal and 10-per-page pagination — plus a
// catch-all "Other entries" section so wage/salary/settlement entries
// (anything not in these four categories) stay visible instead of quietly
// disappearing once the combined history table was split up.
export function LedgerCategoryHistorySections({ entries }: { entries: LedgerEntry[] }) {
  const categorized = new Set(SECTION_DEFS.map((s) => s.category));
  const otherEntries = entries.filter((e) => !e.category || !categorized.has(e.category));

  return (
    <>
      {SECTION_DEFS.map((section) => (
        <PaginatedLedgerSection
          key={section.category}
          titleKey={section.titleKey}
          entries={entries.filter((e) => e.category === section.category)}
        />
      ))}
      <PaginatedLedgerSection titleKey="people.otherEntries" entries={otherEntries} />
    </>
  );
}
