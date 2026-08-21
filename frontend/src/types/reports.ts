// Kept separate from types/index.ts (already large) — the Reports feature's
// own response contract, matching backend/src/services/reports/types.ts
// exactly.

export type ReportColumnFormat = "date" | "currency" | "number" | "text";

export interface ReportColumn {
  key: string;
  labelKey: string;
  format: ReportColumnFormat;
}

export interface ProductionSummary {
  bricksCount: number;
  damagedCount: number;
  byModule: { module: string; bricksCount: number; damagedCount: number }[];
}

export interface ContractorRollupGroup {
  contractorId: string;
  contractorName: string;
  totalDue: number;
  totalPaid: number;
  netAmount: number;
  bricksCount: number;
  damagedCount: number;
  laborerCount: number;
  laborers: { personId: string; name: string; type: string; totalDue: number; totalPaid: number; netAmount: number; bricksCount: number; damagedCount: number }[];
}

export interface ReportResult {
  reportKey: string;
  titleKey: string;
  columns: ReportColumn[];
  rows: Record<string, string | number | null>[];
  totals?: Record<string, number>;
  productionSummary?: ProductionSummary;
  groups?: ContractorRollupGroup[];
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
  contractorId?: string;
  damageFault?: string;
  damageThreshold?: number;
  workType?: string;
  status?: string;
}

// The small closed set of filter widgets the generic filter bar knows how
// to render — each report definition declares which of these it needs;
// everything else (date range + groupBy) is available to every report.
export type ReportFilterKind =
  | "person"
  | "personType"
  | "customer"
  | "vehicle"
  | "driver"
  | "expenseCategory"
  | "ledgerCategory"
  | "contractor"
  | "workType"
  | "status"
  | "damageFault"
  | "damageThreshold";

export type ReportGroup = "production" | "trade" | "resources" | "admin";

export interface ReportDefinitionMeta {
  key: string;
  group: ReportGroup;
  labelKey: string;
  filters: ReportFilterKind[];
}

export interface DashboardSummary {
  totalPendingDues: number;
  totalOutstandingAdvances: number;
  categoryBreakdownThisMonth: { category: string; paid: number; due: number }[];
  bricksDamagedThisWeek: number;
  topPendingDues: { personId: string; name: string; type: string; amountDue: number }[];
  topOutstandingAdvances: { personId: string; name: string; type: string; outstandingAdvance: number }[];
  salaryStatusThisMonth: { totalStaff: number; generated: number; pending: number };
  totalCustomerDue: number;
}
