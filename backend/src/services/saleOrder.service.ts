import { randomUUID } from "crypto";
import { and, desc, eq, gte, lte, sql } from "drizzle-orm";
import { db } from "../db/client";
import { saleOrders } from "../db/schema";
import type { BrickLineItem } from "../db/schema/_helpers";
import { summarizeItems } from "./brickLineItems.util";
import { createDispatch, type CreateDispatchInput } from "./dispatch.service";
import { emitToKiln } from "../config/socket";

export type SaleOrderStatus = (typeof saleOrders.$inferSelect)["status"];

export interface CreateSaleOrderInput {
  kilnId: string;
  seasonId: string;
  customerId?: string;
  customerName: string;
  customerAddress?: string;
  customerPhone?: string;
  categoryId?: string;
  items?: BrickLineItem[];
  bricksCount?: number;
  ratePerBrick?: number;
  estimatedAmount?: number;
  orderDate?: Date;
  expectedDeliveryDate?: Date;
  notes?: string;
}

// MAX-based (not COUNT-based) — same reasoning as every other document
// sequence number in this app (see dispatchDocuments.service.ts's
// generateSequenceNumber): a deleted/cancelled order's number is never
// reissued to a different real order. Scoped to the season so numbering
// resets each new Bhatta Season.
async function nextSequenceNumber(kilnId: string, seasonId: string) {
  const maxRow = (await db.select({ max: sql<number | null>`max(${saleOrders.sequenceNumber})` }).from(saleOrders).where(and(eq(saleOrders.kilnId, kilnId), eq(saleOrders.seasonId, seasonId))))[0];
  return (maxRow?.max ?? 0) + 1;
}

export async function createSaleOrder(input: CreateSaleOrderInput) {
  let bricksCount = input.bricksCount ?? 0;
  let categoryId = input.categoryId;
  let items: BrickLineItem[] | undefined = input.items;
  // Bug fix: the create form computes a rate per brick and a total amount
  // from its line items but never sent either to the backend — `summary`
  // was computed here only for bricksCount/categoryId, and its own
  // pricePerBrick/amount were silently discarded. That left
  // ratePerBrick permanently null, so the Fulfill modal's amount pre-fill
  // (which reads order.ratePerBrick) never fired — an admin who didn't
  // notice the blank amount field could submit a ₹0 dispatch that then
  // flowed into every revenue report as-is. Now falls back to the
  // items-derived rate/amount whenever the admin didn't type one
  // explicitly (ratePerBrick only when the order is single-category,
  // matching summarizeItems' own "only meaningful for one item" rule;
  // estimatedAmount always has a real per-order total to fall back to).
  let ratePerBrick = input.ratePerBrick;
  let estimatedAmount = input.estimatedAmount;
  if (input.items && input.items.length > 0) {
    const summary = summarizeItems(input.items);
    items = summary.items;
    bricksCount = summary.bricksCount;
    categoryId = summary.categoryId ?? categoryId;
    ratePerBrick = ratePerBrick ?? summary.pricePerBrick;
    estimatedAmount = estimatedAmount ?? (summary.amount > 0 ? summary.amount : undefined);
  }
  if (bricksCount <= 0) throw new Error("Sale order must have a positive bricks count");

  const _id = randomUUID();
  const sequenceNumber = await nextSequenceNumber(input.kilnId, input.seasonId);
  await db.insert(saleOrders).values({
    _id,
    kilnId: input.kilnId,
    seasonId: input.seasonId,
    customerId: input.customerId,
    customerName: input.customerName,
    customerAddress: input.customerAddress,
    customerPhone: input.customerPhone,
    categoryId,
    items,
    bricksCount,
    ratePerBrick,
    estimatedAmount,
    orderDate: input.orderDate,
    expectedDeliveryDate: input.expectedDeliveryDate,
    notes: input.notes,
    sequenceNumber,
  });
  const row = (await db.select().from(saleOrders).where(eq(saleOrders._id, _id)))[0]!;
  emitToKiln(input.kilnId, "saleOrder:update", row);
  return row;
}

export interface ListSaleOrdersFilter {
  status?: string;
  customerId?: string;
  from?: Date;
  to?: Date;
}

// seasonId is nullable — pass null for an all-time, every-season view (see
// dispatchDocuments.service.ts's listInvoices for the same convention),
// used by the report-engine's pending-orders reports since an open order
// stays relevant regardless of which season it was booked in.
export async function listSaleOrders(kilnId: string, seasonId: string | null, filter: ListSaleOrdersFilter = {}) {
  const conditions = [eq(saleOrders.kilnId, kilnId)];
  if (seasonId) conditions.push(eq(saleOrders.seasonId, seasonId));
  if (filter.status) conditions.push(eq(saleOrders.status, filter.status as SaleOrderStatus));
  if (filter.customerId) conditions.push(eq(saleOrders.customerId, filter.customerId));
  if (filter.from) conditions.push(gte(saleOrders.orderDate, filter.from));
  if (filter.to) conditions.push(lte(saleOrders.orderDate, filter.to));
  return db.select().from(saleOrders).where(and(...conditions)).orderBy(desc(saleOrders.orderDate), desc(saleOrders.createdAt));
}

export async function getSaleOrder(kilnId: string, saleOrderId: string) {
  const row = (await db.select().from(saleOrders).where(and(eq(saleOrders._id, saleOrderId), eq(saleOrders.kilnId, kilnId))))[0];
  if (!row) throw new Error("Sale order not found in this kiln");
  return row;
}

// Bug fix: no UI reaches this endpoint today, but it's a live, callable
// API with no guard at all — a direct call could silently rewrite items/
// bricksCount on an order that's already PARTIALLY_FULFILLED/FULFILLED
// (desyncing it from the Dispatches fulfillment already created against
// its *original* items), or set bricksCount below bricksFulfilled
// (making "pending" negative). Editing a still-open (PENDING) order is
// unaffected.
export async function updateSaleOrder(kilnId: string, saleOrderId: string, input: Partial<CreateSaleOrderInput>) {
  const existing = await getSaleOrder(kilnId, saleOrderId);
  if (existing.status === "PARTIALLY_FULFILLED" || existing.status === "FULFILLED") {
    throw new Error(`Cannot edit this sale order — it's already ${existing.status.toLowerCase().replace("_", " ")}. Cancel or fulfill it instead.`);
  }
  if (input.bricksCount !== undefined && input.bricksCount < existing.bricksFulfilled) {
    throw new Error(`Cannot set bricks count below ${existing.bricksFulfilled} already fulfilled.`);
  }
  await db.update(saleOrders).set(input).where(eq(saleOrders._id, saleOrderId));
  const updated = (await db.select().from(saleOrders).where(eq(saleOrders._id, saleOrderId)))[0]!;
  emitToKiln(kilnId, "saleOrder:update", updated);
  return updated;
}

export async function cancelSaleOrder(kilnId: string, saleOrderId: string) {
  const order = await getSaleOrder(kilnId, saleOrderId);
  if (order.status === "FULFILLED") throw new Error("Cannot cancel a fully fulfilled sale order");
  await db.update(saleOrders).set({ status: "CANCELLED" }).where(eq(saleOrders._id, saleOrderId));
  const updated = (await db.select().from(saleOrders).where(eq(saleOrders._id, saleOrderId)))[0]!;
  emitToKiln(kilnId, "saleOrder:update", updated);
  return updated;
}

export interface FulfillSaleOrderInput {
  bricksCount: number;
  amount: number;
  driverId?: string;
  driverName?: string;
  driverPhone?: string;
  vehicleNumber?: string;
  vehicleType?: string;
  paymentMode?: CreateDispatchInput["paymentMode"];
  cashAmount?: number;
  onlineAmount?: number;
  dispatchedOn?: Date;
  notes?: string;
}

// Delivers against a pending order by creating a real Dispatch (same stock
// deduction / customer ledger effects as any other dispatch — see
// dispatch.service.ts's createDispatch) and advancing this order's own
// bricksFulfilled/status. An order can be fulfilled across several
// dispatches — the admin isn't forced to deliver the whole booking at once.
export async function fulfillSaleOrder(kilnId: string, seasonId: string, saleOrderId: string, input: FulfillSaleOrderInput) {
  const order = await getSaleOrder(kilnId, saleOrderId);
  if (order.status === "CANCELLED" || order.status === "FULFILLED") {
    throw new Error(`Cannot fulfill a sale order that is already ${order.status}`);
  }
  const remaining = order.bricksCount - order.bricksFulfilled;
  if (input.bricksCount > remaining) {
    throw new Error(`Only ${remaining} bricks remain pending on this order`);
  }

  // Bug fix: this used to pass only the order's single aggregate
  // categoryId into createDispatch, never `items` — for a multi-category
  // order, createDispatch's own stock deduction then took the entire
  // fulfilled quantity out of just that first/aggregate category,
  // permanently overstating every OTHER category the order actually
  // covered. Distribute this fulfillment batch across the order's real
  // per-category breakdown, proportional to each category's own share of
  // the order — correct both for fulfilling the whole remaining order in
  // one shot and for a partial fulfillment, without needing the admin to
  // type a per-category split themselves (the Fulfill form only collects
  // one flat bricksCount). The last item absorbs the rounding remainder so
  // the parts always sum to exactly input.bricksCount.
  const fulfillItems =
    order.items && order.items.length > 1
      ? (() => {
          const orderTotal = order.items!.reduce((s, i) => s + i.bricksCount, 0);
          if (orderTotal <= 0) return undefined;
          const parts = order.items!.map((i) => ({ categoryId: i.categoryId, bricksCount: Math.round((i.bricksCount / orderTotal) * input.bricksCount) }));
          const allocated = parts.reduce((s, p) => s + p.bricksCount, 0);
          parts[parts.length - 1].bricksCount += input.bricksCount - allocated;
          return parts.filter((p) => p.bricksCount > 0);
        })()
      : undefined;

  const dispatch = await createDispatch({
    kilnId,
    seasonId: order.seasonId ?? seasonId,
    customerName: order.customerName,
    customerId: order.customerId ?? undefined,
    customerAddress: order.customerAddress ?? undefined,
    customerPhone: order.customerPhone ?? undefined,
    bricksCount: input.bricksCount,
    amount: input.amount,
    categoryId: order.categoryId ?? undefined,
    items: fulfillItems,
    driverId: input.driverId,
    driverName: input.driverName,
    driverPhone: input.driverPhone,
    vehicleNumber: input.vehicleNumber,
    vehicleType: input.vehicleType,
    paymentMode: input.paymentMode,
    cashAmount: input.cashAmount,
    onlineAmount: input.onlineAmount,
    dispatchedOn: input.dispatchedOn,
    notes: input.notes,
    saleOrderId: order._id,
  });

  const bricksFulfilled = order.bricksFulfilled + input.bricksCount;
  const status: SaleOrderStatus = bricksFulfilled >= order.bricksCount ? "FULFILLED" : "PARTIALLY_FULFILLED";
  await db.update(saleOrders).set({ bricksFulfilled, status }).where(eq(saleOrders._id, saleOrderId));
  const updatedOrder = (await db.select().from(saleOrders).where(eq(saleOrders._id, saleOrderId)))[0]!;
  emitToKiln(kilnId, "saleOrder:update", updatedOrder);

  return { order: updatedOrder, dispatch };
}

