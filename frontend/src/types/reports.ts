// Kept separate from types/index.ts (already large) — the Reports feature's
// own response contract, matching backend/src/services/reports/types.ts
// exactly.

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

export type ReportGroupBy = "none" | "day" | "week" | "month" | "quarter" | "year";

export interface ReportRunParams {
  from?: string;
  to?: string;
  groupBy?: ReportGroupBy;
  personId?: string;
  personType?: string;
  customerId?: string;
  vehicleId?: string;
  driverId?: string;
  category?: string;
}

// The small closed set of filter widgets the generic filter bar knows how
// to render — each report definition declares which of these it needs;
// everything else (date range + groupBy) is available to every report.
export type ReportFilterKind = "person" | "personType" | "customer" | "vehicle" | "driver" | "expenseCategory";

export type ReportGroup = "production" | "trade" | "resources" | "admin";

export interface ReportDefinitionMeta {
  key: string;
  group: ReportGroup;
  labelKey: string;
  filters: ReportFilterKind[];
}
