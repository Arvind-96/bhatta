import { ReportGroupBy } from "../../utils/reportPeriod";

export type ReportColumnFormat = "date" | "currency" | "number" | "text";

export interface ReportColumn {
  key: string;
  labelKey: string;
  format: ReportColumnFormat;
}

export interface ReportResult {
  reportKey: string;
  titleKey: string;
  columns: ReportColumn[];
  rows: Record<string, string | number | null>[];
  totals?: Record<string, number>;
}

export interface ReportFilters {
  from?: Date;
  to?: Date;
  groupBy?: ReportGroupBy;
  personId?: string;
  personType?: string;
  customerId?: string;
  vehicleId?: string;
  driverId?: string;
  category?: string;
}

export type ReportRunner = (kilnId: string, filters: ReportFilters) => Promise<ReportResult>;

export interface ReportDefinition {
  key: string;
  titleKey: string;
  run: ReportRunner;
}

// Every list function in this codebase that resolves a foreign id enriches
// it in place with the referenced row (see e.g. workEntry.service.ts's
// listWorkEntries) — this pulls a display name back out of that shape (or
// passes through a plain string/null unresolved id) so report rows can stay
// flat strings, per the ReportResult contract.
export function refName(ref: unknown): string | null {
  if (ref == null) return null;
  if (typeof ref === "string") return ref;
  if (typeof ref === "object" && "name" in (ref as Record<string, unknown>)) {
    return ((ref as Record<string, unknown>).name as string) ?? null;
  }
  return null;
}

export function round2(n: number) {
  return Math.round(n * 100) / 100;
}
