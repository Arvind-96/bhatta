import { peopleReports } from "./people.reports";
import { tradeReports } from "./trade.reports";
import { resourcesReports } from "./resources.reports";
import { productionReports } from "./production.reports";
import { ordersReports } from "./orders.reports";
import { purchaseReports } from "./purchase.reports";
import { accountingReports } from "./accounting.reports";
import { ReportDefinition } from "./types";

export * from "./types";

const ALL_REPORTS: ReportDefinition[] = [
  ...productionReports,
  ...tradeReports,
  ...resourcesReports,
  ...peopleReports,
  ...ordersReports,
  ...purchaseReports,
  ...accountingReports,
];

export const reportRegistry = new Map(ALL_REPORTS.map((r) => [r.key, r]));
