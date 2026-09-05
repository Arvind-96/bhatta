import type { ReportDefinitionMeta } from "@/types/reports";

// One entry per report type — the only per-report frontend config needed.
// Table rendering itself is fully generic off the backend's own `columns`;
// this just tells the filter bar which widgets to show (date range +
// groupBy are available to every report, so they're not listed here).
export const REPORT_DEFINITIONS: ReportDefinitionMeta[] = [
  // Production
  { key: "soil", group: "production", labelKey: "reports.title.soil", filters: ["person"] },
  { key: "sand", group: "production", labelKey: "reports.title.sand", filters: ["person"] },
  { key: "molding", group: "production", labelKey: "reports.title.molding", filters: ["person", "damageFault", "damageThreshold"] },
  { key: "stacking", group: "production", labelKey: "reports.title.stacking", filters: ["person", "damageFault", "damageThreshold"] },
  { key: "firing", group: "production", labelKey: "reports.title.firing", filters: ["person"] },
  { key: "nikasi", group: "production", labelKey: "reports.title.nikasi", filters: ["person", "damageFault", "damageThreshold"] },
  { key: "brickLoading", group: "production", labelKey: "reports.title.brickLoading", filters: ["driver"] },
  { key: "nikasiCrossCheck", group: "production", labelKey: "reports.title.nikasiCrossCheck", filters: [] },
  { key: "nikasiItemWisePercent", group: "production", labelKey: "reports.title.nikasiItemWisePercent", filters: ["person"] },

  // Trade & Billing
  { key: "customers", group: "trade", labelKey: "reports.title.customers", filters: ["customer"] },
  { key: "invoices", group: "trade", labelKey: "reports.title.invoices", filters: ["customer", "agent", "brickCategory"] },
  { key: "salesByCustomerCategory", group: "trade", labelKey: "reports.title.salesByCustomerCategory", filters: ["customer", "brickCategory"] },
  { key: "gatePasses", group: "trade", labelKey: "reports.title.gatePasses", filters: [] },
  { key: "challans", group: "trade", labelKey: "reports.title.challans", filters: [] },
  { key: "expenses", group: "trade", labelKey: "reports.title.expenses", filters: ["expenseCategory"] },
  { key: "itemWiseAvgSaleRate", group: "trade", labelKey: "reports.title.itemWiseAvgSaleRate", filters: ["customer"] },
  { key: "saleOrdersPendingDetail", group: "trade", labelKey: "reports.title.saleOrdersPendingDetail", filters: ["customer"] },
  { key: "saleOrdersPendingSummary", group: "trade", labelKey: "reports.title.saleOrdersPendingSummary", filters: ["customer"] },
  { key: "purchaseOrderDetail", group: "trade", labelKey: "reports.title.purchaseOrderDetail", filters: ["supplier"] },
  { key: "purchaseRegister", group: "trade", labelKey: "reports.title.purchaseRegister", filters: ["supplier"] },
  { key: "purchaseBySupplier", group: "trade", labelKey: "reports.title.purchaseBySupplier", filters: [] },
  { key: "purchaseByItem", group: "trade", labelKey: "reports.title.purchaseByItem", filters: [] },
  { key: "purchaseByItemGroup", group: "trade", labelKey: "reports.title.purchaseByItemGroup", filters: [] },

  // Resources
  { key: "vehicles", group: "resources", labelKey: "reports.title.vehicles", filters: ["vehicle"] },
  { key: "diesel", group: "resources", labelKey: "reports.title.diesel", filters: ["vehicle", "driver"] },
  { key: "fuel", group: "resources", labelKey: "reports.title.fuel", filters: ["supplier"] },
  { key: "stock", group: "resources", labelKey: "reports.title.stock", filters: [] },
  { key: "inventory", group: "resources", labelKey: "reports.title.inventory", filters: [] },
  { key: "vehicleWork", group: "resources", labelKey: "reports.title.vehicleWork", filters: [] },

  // Admin
  { key: "keyAverages", group: "admin", labelKey: "reports.title.keyAverages", filters: [] },
  { key: "labourLedger", group: "admin", labelKey: "reports.title.labourLedger", filters: ["personType", "workType", "status", "person", "contractor", "ledgerCategory"] },
  { key: "labourByContractor", group: "admin", labelKey: "reports.title.labourByContractor", filters: ["workType", "status", "contractor"] },
  { key: "salary", group: "admin", labelKey: "reports.title.salary", filters: ["person"] },
  { key: "doctorVisits", group: "admin", labelKey: "reports.title.doctorVisits", filters: ["doctor", "person"] },
  { key: "labourWorkReport", group: "admin", labelKey: "reports.title.labourWorkReport", filters: ["person", "personType"] },
  { key: "debtorsAndCreditors", group: "admin", labelKey: "reports.title.debtorsAndCreditors", filters: [] },
  { key: "trialBalance", group: "admin", labelKey: "reports.title.trialBalance", filters: [] },
  { key: "nilAccounts", group: "admin", labelKey: "reports.title.nilAccounts", filters: [] },
  { key: "dayBook", group: "admin", labelKey: "reports.title.dayBook", filters: [] },
  { key: "cashReturns", group: "admin", labelKey: "reports.title.cashReturns", filters: [] },
  { key: "extraCharges", group: "admin", labelKey: "reports.title.extraCharges", filters: [] },
];

export const REPORT_GROUP_LABEL_KEYS: Record<string, string> = {
  production: "nav.group.production",
  trade: "nav.group.trade",
  resources: "nav.group.resources",
  admin: "nav.group.admin",
};
