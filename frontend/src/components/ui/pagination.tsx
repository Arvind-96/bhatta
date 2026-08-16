import { useEffect, useMemo, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { useTranslation } from "@/hooks/useTranslation";

// Every list/table page in the app was rendering its full result set with
// no ceiling — fine at seed-data scale, unreadable once a kiln has months
// of history. This hook does the slicing; <Pagination> renders the control
// strip beneath the list. Pairing them keeps every page's "page 1 of N"
// math in one place instead of hand-rolled per page.
export function usePagination<T>(items: T[], pageSize = 10) {
  const [page, setPage] = useState(1);
  const pageCount = Math.max(1, Math.ceil(items.length / pageSize));

  // Reset to page 1 whenever the underlying list changes shape (a filter
  // changed, a refresh dropped the row you were looking at) so you never
  // land on a page that's silently empty.
  useEffect(() => {
    setPage(1);
  }, [items.length]);

  const clampedPage = Math.min(page, pageCount);
  const pageItems = useMemo(() => {
    const start = (clampedPage - 1) * pageSize;
    return items.slice(start, start + pageSize);
  }, [items, clampedPage, pageSize]);

  return { page: clampedPage, setPage, pageCount, pageItems, total: items.length };
}

export function Pagination({
  page,
  pageCount,
  onChange,
  total,
  pageSize,
  className,
}: {
  page: number;
  pageCount: number;
  onChange: (page: number) => void;
  total?: number;
  pageSize?: number;
  className?: string;
}) {
  const { t } = useTranslation();
  if (pageCount <= 1) return null;

  const rangeStart = total !== undefined && pageSize ? (page - 1) * pageSize + 1 : undefined;
  const rangeEnd = total !== undefined && pageSize ? Math.min(page * pageSize, total) : undefined;

  const pages = pageNumbersWithGaps(page, pageCount);

  return (
    <div className={cn("mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-border pt-3", className)}>
      {total !== undefined && rangeStart !== undefined && rangeEnd !== undefined && (
        <p className="text-xs text-ink-muted">{t("common.paginationRange", { start: rangeStart, end: rangeEnd, total })}</p>
      )}
      <div className="ml-auto flex items-center gap-1">
        <button
          type="button"
          disabled={page <= 1}
          onClick={() => onChange(page - 1)}
          className="flex h-8 w-8 items-center justify-center rounded-lg text-ink-secondary transition-colors hover:bg-ink-primary/5 hover:text-ink-primary disabled:pointer-events-none disabled:opacity-30"
          aria-label="Previous page"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
        {pages.map((p, i) =>
          p === "gap" ? (
            <span key={`gap-${i}`} className="px-1 text-xs text-ink-muted">
              …
            </span>
          ) : (
            <button
              key={p}
              type="button"
              onClick={() => onChange(p)}
              className={cn(
                "flex h-8 min-w-8 items-center justify-center rounded-lg px-2 text-xs font-medium tabular-nums transition-all",
                p === page ? "bg-series-1 text-white shadow-glow-1" : "text-ink-secondary hover:bg-ink-primary/5 hover:text-ink-primary"
              )}
            >
              {p}
            </button>
          )
        )}
        <button
          type="button"
          disabled={page >= pageCount}
          onClick={() => onChange(page + 1)}
          className="flex h-8 w-8 items-center justify-center rounded-lg text-ink-secondary transition-colors hover:bg-ink-primary/5 hover:text-ink-primary disabled:pointer-events-none disabled:opacity-30"
          aria-label="Next page"
        >
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}

// Collapses long page runs to "1 … 4 5 6 … 42" instead of a scrollbar's
// worth of number buttons.
function pageNumbersWithGaps(current: number, count: number): (number | "gap")[] {
  const windowSize = 1;
  const pages = new Set<number>([1, count, current]);
  for (let d = 1; d <= windowSize; d++) {
    if (current - d >= 1) pages.add(current - d);
    if (current + d <= count) pages.add(current + d);
  }
  const sorted = [...pages].sort((a, b) => a - b);
  const result: (number | "gap")[] = [];
  for (let i = 0; i < sorted.length; i++) {
    if (i > 0 && sorted[i] - sorted[i - 1] > 1) result.push("gap");
    result.push(sorted[i]);
  }
  return result;
}
