import { randomUUID } from "crypto";
import { and, asc, desc, eq, gte, inArray, sql } from "drizzle-orm";
import { db } from "../db/client";
import { brickCategories, brickProductionEntries, stockLoadingEntries, brickLoadingEntries, dispatches, saleOrders, challans, gatePasses, invoices } from "../db/schema";
import { emitToKiln } from "../config/socket";

// Free-form name, admin-defined — not a fixed vocabulary. pricePerBrick
// defaults to 0 (unpriced) until the admin sets a real rate; see
// brickLoading.service.ts for how that price feeds the Dispatch auto-sync.
// `grade` is likewise free-form and optional (e.g. "A1", "Second Class").
export async function createBrickCategory(kilnId: string, category: string, pricePerBrick = 0, grade?: string) {
  try {
    const _id = randomUUID();
    await db.insert(brickCategories).values({ _id, kilnId, category, pricePerBrick, grade });
    const created = (await db.select().from(brickCategories).where(eq(brickCategories._id, _id)))[0]!;
    emitToKiln(kilnId, "brickCategory:update", created);
    return created;
  } catch (err: unknown) {
    if (err instanceof Error && err.message.includes("UNIQUE constraint failed")) {
      throw new Error("This brick category has already been added for this kiln");
    }
    throw err;
  }
}

export async function listBrickCategories(kilnId: string) {
  return db.select().from(brickCategories).where(eq(brickCategories.kilnId, kilnId)).orderBy(asc(brickCategories.category));
}

// The admin's direct manual override of a category's name/grade/stock/
// price — same "always available, never blocked" correction path
// InventoryItem.quantity gives for supply items. Renaming a category here
// doesn't touch its existing production/loading entries, since those
// reference it by categoryId, not by name — the new name/grade is simply
// what shows up everywhere that categoryId gets resolved for display.
export async function updateBrickCategory(
  kilnId: string,
  categoryId: string,
  updates: { category?: string; grade?: string | null; quantity?: number; pricePerBrick?: number }
) {
  const existing = (await db.select().from(brickCategories).where(and(eq(brickCategories._id, categoryId), eq(brickCategories.kilnId, kilnId))))[0];
  if (!existing) throw new Error("Brick category not found in this kiln");
  try {
    await db.update(brickCategories).set(updates).where(eq(brickCategories._id, categoryId));
  } catch (err: unknown) {
    if (err instanceof Error && err.message.includes("UNIQUE constraint failed")) {
      throw new Error("This brick category name is already used by another category in this kiln");
    }
    throw err;
  }
  const updated = (await db.select().from(brickCategories).where(eq(brickCategories._id, categoryId)))[0]!;
  emitToKiln(kilnId, "brickCategory:update", updated);
  return updated;
}

// No DB-level FK ties production/loading/dispatch/sale-order records back
// to brickCategories, so a hard delete here used to silently orphan them —
// the category's own `quantity` (real on-hand stock) vanished along with
// the row, and every historical record that referenced it (Stock,
// Production/Loading history, Brick Loading trips, Dispatch, Sale Orders)
// resolved its categoryId to a raw id string instead of a name. Guarded
// the same check-then-throw way as deleteCustomer/deleteVehicle: refuse
// instead of deleting when real stock or history still exists.
//
// Bug fix: the first version of this guard checked brickProductionEntries/
// stockLoadingEntries/brickLoadingEntries.categoryId only, on the theory
// that document items[] arrays (dispatches/invoices/challans/gatePasses)
// are display-only copies that never move brickCategories.quantity. That
// holds for invoices/challans/gatePasses' STOCK impact (confirmed: no code
// path deducts stock from any of those three), but they're still real
// historical documents that resolve categoryId to a name for display/print
// — deleting a category still referenced by one leaves it showing a raw id
// instead of a name, the exact failure mode this guard exists to prevent.
// NOT checked for dispatches — a manually created (non-trip-linked)
// dispatch deducts quantity directly (createDispatch, dispatch.service.ts)
// and is never hard-deleted (cancel keeps the row, categoryId included), so
// it's a real, reachable orphan path. Same for a booked-but-unfulfilled
// Sale Order (saleOrders.categoryId/items[]) — it hasn't touched quantity
// yet, so nothing else here would catch it, but fulfilling it after its
// category was deleted becomes a silent no-op deduction that never
// happens, quietly overstating every other category's stock from then on.
// Every one of these six checks (production/loading/trips/dispatches/
// challans/gatePasses/invoices/sale-orders) is applied through
// referencesCategory so a multi-category items[] entry is caught even when
// it's not that row's own aggregate/first-item categoryId — checking
// items[] JSON in application code (not a JSON SQL query) since category
// deletion is a rare admin action, not a hot path.
export async function deleteBrickCategory(kilnId: string, categoryId: string) {
  const existing = (await db.select().from(brickCategories).where(and(eq(brickCategories._id, categoryId), eq(brickCategories.kilnId, kilnId))))[0];
  if (!existing) throw new Error("Brick category not found in this kiln");

  const referencesCategory = (row: { categoryId: string | null; items?: { categoryId?: string }[] | null }) =>
    row.categoryId === categoryId || (row.items ?? []).some((i) => i.categoryId === categoryId);

  const [linkedProduction, linkedLoading, tripRows, dispatchRows, saleOrderRows, challanRows, gatePassRows, invoiceRows] = await Promise.all([
    db.select({ _id: brickProductionEntries._id }).from(brickProductionEntries).where(eq(brickProductionEntries.categoryId, categoryId)),
    db.select({ _id: stockLoadingEntries._id }).from(stockLoadingEntries).where(eq(stockLoadingEntries.categoryId, categoryId)),
    db.select({ _id: brickLoadingEntries._id, categoryId: brickLoadingEntries.categoryId, items: brickLoadingEntries.items }).from(brickLoadingEntries).where(eq(brickLoadingEntries.kilnId, kilnId)),
    db.select({ _id: dispatches._id, categoryId: dispatches.categoryId, items: dispatches.items }).from(dispatches).where(eq(dispatches.kilnId, kilnId)),
    db.select({ _id: saleOrders._id, categoryId: saleOrders.categoryId, items: saleOrders.items }).from(saleOrders).where(eq(saleOrders.kilnId, kilnId)),
    db.select({ _id: challans._id, categoryId: challans.categoryId, items: challans.items }).from(challans).where(eq(challans.kilnId, kilnId)),
    db.select({ _id: gatePasses._id, categoryId: gatePasses.categoryId, items: gatePasses.items }).from(gatePasses).where(eq(gatePasses.kilnId, kilnId)),
    db.select({ _id: invoices._id, categoryId: invoices.categoryId, items: invoices.items }).from(invoices).where(eq(invoices.kilnId, kilnId)),
  ]);
  const linkedTrips = tripRows.filter(referencesCategory);
  const linkedDispatches = dispatchRows.filter(referencesCategory);
  const linkedSaleOrders = saleOrderRows.filter(referencesCategory);
  const linkedChallans = challanRows.filter(referencesCategory);
  const linkedGatePasses = gatePassRows.filter(referencesCategory);
  const linkedInvoices = invoiceRows.filter(referencesCategory);

  if (
    (existing.quantity ?? 0) !== 0 ||
    linkedProduction.length > 0 ||
    linkedLoading.length > 0 ||
    linkedTrips.length > 0 ||
    linkedDispatches.length > 0 ||
    linkedSaleOrders.length > 0 ||
    linkedChallans.length > 0 ||
    linkedGatePasses.length > 0 ||
    linkedInvoices.length > 0
  ) {
    throw new Error(
      `Cannot delete this category — it has ${existing.quantity ?? 0} bricks in stock and is referenced by ${linkedProduction.length} production, ${linkedLoading.length} loading, ${linkedTrips.length} brick loading, ${linkedDispatches.length} dispatch, ${linkedSaleOrders.length} sale order, ${linkedChallans.length} challan, ${linkedGatePasses.length} gate pass, and ${linkedInvoices.length} invoice record(s). Bring its stock to 0 and clear its history first.`
    );
  }

  await db.delete(brickCategories).where(eq(brickCategories._id, categoryId));
  emitToKiln(kilnId, "brickCategory:update", { _id: categoryId, deleted: true });
  return existing;
}

async function assertCategoryInKiln(kilnId: string, categoryId: string) {
  const category = (await db.select().from(brickCategories).where(and(eq(brickCategories._id, categoryId), eq(brickCategories.kilnId, kilnId))))[0];
  if (!category) throw new Error("Brick category not found in this kiln");
  return category;
}

export interface CreateBrickProductionInput {
  kilnId: string;
  seasonId: string;
  categoryId: string;
  bricksCount: number;
  date?: Date;
  notes?: string;
}

// Today's production, logged against a category — adds straight onto that
// category's running stock the same moment it's recorded.
export async function createBrickProductionEntry(input: CreateBrickProductionInput) {
  await assertCategoryInKiln(input.kilnId, input.categoryId);
  const _id = randomUUID();
  await db.insert(brickProductionEntries).values({ ...input, _id });
  const entry = (await db.select().from(brickProductionEntries).where(eq(brickProductionEntries._id, _id)))[0]!;

  await db.update(brickCategories)
    .set({ quantity: sql`${brickCategories.quantity} + ${input.bricksCount}` })
    .where(and(eq(brickCategories._id, input.categoryId), eq(brickCategories.kilnId, input.kilnId)));
  const category = (await db.select().from(brickCategories).where(eq(brickCategories._id, input.categoryId)))[0];

  emitToKiln(input.kilnId, "brickProduction:update", entry);
  emitToKiln(input.kilnId, "brickCategory:update", category);
  return entry;
}

export async function listBrickProductionEntries(kilnId: string, seasonId: string, days = 60) {
  const since = new Date();
  since.setDate(since.getDate() - days);
  const rows = await db.select().from(brickProductionEntries).where(and(eq(brickProductionEntries.kilnId, kilnId), eq(brickProductionEntries.seasonId, seasonId), gte(brickProductionEntries.date, since))).orderBy(desc(brickProductionEntries.date));
  return withCategory(kilnId, rows);
}

// Striking off a mis-logged production entry reverses its stock effect —
// same "delete undoes the create" rule as SuppliedItem.
export async function deleteBrickProductionEntry(kilnId: string, entryId: string) {
  const deleted = (await db.select().from(brickProductionEntries).where(and(eq(brickProductionEntries._id, entryId), eq(brickProductionEntries.kilnId, kilnId))))[0];
  if (!deleted) throw new Error("Production entry not found in this kiln");
  await db.delete(brickProductionEntries).where(eq(brickProductionEntries._id, entryId));

  await db.update(brickCategories)
    .set({ quantity: sql`${brickCategories.quantity} - ${deleted.bricksCount}` })
    .where(and(eq(brickCategories._id, deleted.categoryId), eq(brickCategories.kilnId, kilnId)));
  const category = (await db.select().from(brickCategories).where(eq(brickCategories._id, deleted.categoryId)))[0];

  emitToKiln(kilnId, "brickProduction:update", { _id: entryId, deleted: true });
  if (category) emitToKiln(kilnId, "brickCategory:update", category);
  return deleted;
}

export interface CreateStockLoadingInput {
  kilnId: string;
  seasonId: string;
  categoryId: string;
  bricksCount: number;
  date?: Date;
  notes?: string;
}

// Loading bricks out deducts from that category's stock — allowed to go
// negative (flagged in the UI, never blocked), same "don't block on an
// overcommit, just show it" rule InventoryItem/adjustInventoryQuantity
// uses when more is handed out than's on hand.
export async function createStockLoadingEntry(input: CreateStockLoadingInput) {
  await assertCategoryInKiln(input.kilnId, input.categoryId);
  const _id = randomUUID();
  await db.insert(stockLoadingEntries).values({ ...input, _id });
  const entry = (await db.select().from(stockLoadingEntries).where(eq(stockLoadingEntries._id, _id)))[0]!;

  await db.update(brickCategories)
    .set({ quantity: sql`${brickCategories.quantity} - ${input.bricksCount}` })
    .where(and(eq(brickCategories._id, input.categoryId), eq(brickCategories.kilnId, input.kilnId)));
  const category = (await db.select().from(brickCategories).where(eq(brickCategories._id, input.categoryId)))[0];

  emitToKiln(input.kilnId, "stockLoading:update", entry);
  emitToKiln(input.kilnId, "brickCategory:update", category);
  return entry;
}

export async function listStockLoadingEntries(kilnId: string, seasonId: string, days = 60) {
  const since = new Date();
  since.setDate(since.getDate() - days);
  const rows = await db.select().from(stockLoadingEntries).where(and(eq(stockLoadingEntries.kilnId, kilnId), eq(stockLoadingEntries.seasonId, seasonId), gte(stockLoadingEntries.date, since))).orderBy(desc(stockLoadingEntries.date));
  return withCategory(kilnId, rows);
}

async function withCategory<T extends { categoryId: string }>(kilnId: string, rows: T[]) {
  const categoryIds = [...new Set(rows.map((r) => r.categoryId))];
  const categoryRows = categoryIds.length ? await db.select({ _id: brickCategories._id, category: brickCategories.category, grade: brickCategories.grade }).from(brickCategories).where(inArray(brickCategories._id, categoryIds)) : [];
  const categoryById = new Map(categoryRows.map((c) => [c._id, c]));
  return rows.map((r) => ({ ...r, categoryId: categoryById.get(r.categoryId) ?? r.categoryId }));
}

export async function deleteStockLoadingEntry(kilnId: string, entryId: string) {
  const deleted = (await db.select().from(stockLoadingEntries).where(and(eq(stockLoadingEntries._id, entryId), eq(stockLoadingEntries.kilnId, kilnId))))[0];
  if (!deleted) throw new Error("Loading entry not found in this kiln");
  await db.delete(stockLoadingEntries).where(eq(stockLoadingEntries._id, entryId));

  await db.update(brickCategories)
    .set({ quantity: sql`${brickCategories.quantity} + ${deleted.bricksCount}` })
    .where(and(eq(brickCategories._id, deleted.categoryId), eq(brickCategories.kilnId, kilnId)));
  const category = (await db.select().from(brickCategories).where(eq(brickCategories._id, deleted.categoryId)))[0];

  emitToKiln(kilnId, "stockLoading:update", { _id: entryId, deleted: true });
  if (category) emitToKiln(kilnId, "brickCategory:update", category);
  return deleted;
}
