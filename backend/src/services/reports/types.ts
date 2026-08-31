import { ReportGroupBy } from "../../utils/reportPeriod";

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
  // "Every brick" alongside "every penny" — attached only when a report is
  // scoped to exactly one person or one contractor's gang (see
  // productionTotals.ts). Additive/optional so the flat-table contract
  // every other report relies on is unaffected.
  productionSummary?: ProductionSummary;
  // The hierarchical contractor->laborers view (labourByContractor only) —
  // `rows` above is a flattened version of the same data for Print/Excel;
  // the on-screen collapsible view reads this instead.
  groups?: ContractorRollupGroup[];
}

export interface ReportFilters {
  from?: Date;
  to?: Date;
  groupBy?: ReportGroupBy;
  personId?: string;
  personType?: string;
  customerId?: string;
  supplierId?: string;
  agentId?: string;
  vehicleId?: string;
  driverId?: string;
  category?: string;
  contractorId?: string;
  damageFault?: string;
  damageThreshold?: number;
  workType?: string;
  status?: string;
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
