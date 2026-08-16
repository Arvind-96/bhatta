import { randomUUID } from "crypto";
import { and, desc, eq, gte, inArray } from "drizzle-orm";
import { db } from "../db/client";
import { kilnIncidents, ghers, INCIDENT_TYPES } from "../db/schema";
import { createExpense } from "./expense.service";
import { emitToKiln } from "../config/socket";

export type IncidentType = (typeof INCIDENT_TYPES)[number];

export interface CreateIncidentInput {
  kilnId: string;
  gherId?: string;
  type: IncidentType;
  description: string;
  repairCost?: number;
  bricksLost?: number;
  date?: Date;
  notes?: string;
}

// Logging the incident is what lets an owner later explain "why did coal
// consumption spike that week" or "why is there an unexplained repair
// cost" instead of it just vanishing into the general ledger — the repair
// cost still rolls into Expense (category MACHINERY_REPAIR) so it counts
// toward normal cost totals, but the incident record keeps the root cause.
export async function createKilnIncident(input: CreateIncidentInput) {
  const _id = randomUUID();
  db.insert(kilnIncidents).values({ ...input, _id }).run();
  const incident = db.select().from(kilnIncidents).where(eq(kilnIncidents._id, _id)).get()!;

  if (input.repairCost && input.repairCost > 0) {
    await createExpense({
      kilnId: input.kilnId,
      category: "MACHINERY_REPAIR",
      amount: input.repairCost,
      notes: `${input.type}: ${input.description}`,
      date: input.date,
      incidentId: incident._id,
    });
  }

  emitToKiln(input.kilnId, "incident:update", incident);
  return incident;
}

export async function listKilnIncidents(kilnId: string, days = 90) {
  const since = new Date();
  since.setDate(since.getDate() - days);
  const rows = await db.select().from(kilnIncidents).where(and(eq(kilnIncidents.kilnId, kilnId), gte(kilnIncidents.date, since))).orderBy(desc(kilnIncidents.date)).all();

  const gherIds = [...new Set(rows.map((r) => r.gherId).filter((v): v is string => !!v))];
  const gherRows = gherIds.length ? await db.select({ _id: ghers._id, number: ghers.number }).from(ghers).where(inArray(ghers._id, gherIds)).all() : [];
  const gherById = new Map(gherRows.map((g) => [g._id, g]));
  return rows.map((r) => ({ ...r, gherId: r.gherId ? gherById.get(r.gherId) ?? r.gherId : r.gherId }));
}
