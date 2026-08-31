import { Response } from "express";
import { z } from "zod";
import { AuthedRequest } from "../middleware/auth.middleware";
import { reportRegistry, ReportFilters, ReportResult } from "../services/reports";
import { dashboardSummary } from "../services/reports/dashboard";
import { ReportGroupBy } from "../utils/reportPeriod";
import { isWhatsAppConfigured, sendWhatsAppText } from "../services/whatsapp.service";

const GROUP_BY_VALUES: ReportGroupBy[] = ["none", "day", "week", "month", "quarter", "year"];

function str(v: unknown): string | undefined {
  return typeof v === "string" && v.length > 0 ? v : undefined;
}

function dateParam(v: unknown, endOfDay = false): Date | undefined {
  const s = str(v);
  if (!s) return undefined;
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return undefined;
  // A plain "YYYY-MM-DD" `to` value parses as that day's UTC midnight —
  // push it to the end of the day so same-day entries (which carry a real
  // time-of-day, not midnight) aren't silently excluded by the lte() filter.
  if (endOfDay) d.setUTCHours(23, 59, 59, 999);
  return d;
}

function filtersFromQuery(query: AuthedRequest["query"]): ReportFilters {
  const groupByParam = str(query.groupBy);
  return {
    from: dateParam(query.from),
    to: dateParam(query.to, true),
    groupBy: groupByParam && (GROUP_BY_VALUES as string[]).includes(groupByParam) ? (groupByParam as ReportGroupBy) : "none",
    personId: str(query.personId),
    personType: str(query.personType),
    customerId: str(query.customerId),
    supplierId: str(query.supplierId),
    agentId: str(query.agentId),
    vehicleId: str(query.vehicleId),
    driverId: str(query.driverId),
    category: str(query.category),
    contractorId: str(query.contractorId),
    damageFault: str(query.damageFault),
    damageThreshold: query.damageThreshold ? Number(query.damageThreshold) : undefined,
    workType: str(query.workType),
    status: str(query.status),
  };
}

export async function runReport(req: AuthedRequest, res: Response) {
  const key = req.params.key;
  const definition = reportRegistry.get(key);
  if (!definition) {
    return res.status(404).json({ error: `Unknown report: ${key}` });
  }
  const result = await definition.run(req.kiln!.id, filtersFromQuery(req.query));
  res.json(result);
}

// Formats a report's top rows + totals as a plain WhatsApp text message —
// reuses the exact ReportResult shape every report already returns, no
// per-report formatting logic needed.
function formatReportAsText(result: ReportResult, maxRows = 15): string {
  const lines = [result.titleKey];
  const cols = result.columns;
  for (const row of result.rows.slice(0, maxRows)) {
    lines.push(cols.map((c) => `${c.key}: ${row[c.key] ?? ""}`).join(", "));
  }
  if (result.rows.length > maxRows) lines.push(`... and ${result.rows.length - maxRows} more rows`);
  if (result.totals) {
    lines.push("Totals: " + Object.entries(result.totals).map(([k, v]) => `${k}: ${v}`).join(", "));
  }
  return lines.join("\n");
}

const sendTextSchema = z.object({ to: z.string().min(1) });

export async function sendReportText(req: AuthedRequest, res: Response) {
  if (!isWhatsAppConfigured()) {
    return res.status(501).json({ error: "WhatsApp is not configured for this kiln yet — add WHATSAPP_PHONE_NUMBER_ID and WHATSAPP_ACCESS_TOKEN on the server." });
  }
  const key = req.params.key;
  const definition = reportRegistry.get(key);
  if (!definition) return res.status(404).json({ error: `Unknown report: ${key}` });

  const { to } = sendTextSchema.parse(req.body);
  const result = await definition.run(req.kiln!.id, filtersFromQuery(req.query));
  await sendWhatsAppText(to, formatReportAsText(result));
  res.json({ sent: true });
}

export async function listReportKeys(_req: AuthedRequest, res: Response) {
  res.json(Array.from(reportRegistry.keys()));
}

export async function dashboardSummaryHandler(req: AuthedRequest, res: Response) {
  const result = await dashboardSummary(req.kiln!.id, req.season!.id);
  res.json(result);
}
