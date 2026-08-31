import { randomUUID } from "crypto";
import { and, desc, eq, gte, lte, sql } from "drizzle-orm";
import { db } from "../db/client";
import { purchaseOrders, type PurchaseOrderItem } from "../db/schema";
import { createSupplierInvoice, type SupplierInvoiceInput } from "./supplierInvoice.service";
import { emitToKiln } from "../config/socket";

export type PurchaseOrderStatus = (typeof purchaseOrders.$inferSelect)["status"];

export interface CreatePurchaseOrderInput {
  kilnId: string;
  seasonId: string;
  supplierId: string;
  items?: PurchaseOrderItem[];
  expectedAmount?: number;
  orderDate?: Date;
  expectedDeliveryDate?: Date;
  notes?: string;
}

// MAX-based, same reasoning as every other document sequence number in
// this app — see saleOrder.service.ts's nextSequenceNumber.
async function nextSequenceNumber(kilnId: string, seasonId: string) {
  const maxRow = (await db.select({ max: sql<number | null>`max(${purchaseOrders.sequenceNumber})` }).from(purchaseOrders).where(and(eq(purchaseOrders.kilnId, kilnId), eq(purchaseOrders.seasonId, seasonId))))[0];
  return (maxRow?.max ?? 0) + 1;
}

export async function createPurchaseOrder(input: CreatePurchaseOrderInput) {
  const _id = randomUUID();
  const sequenceNumber = await nextSequenceNumber(input.kilnId, input.seasonId);
  await db.insert(purchaseOrders).values({ ...input, _id, sequenceNumber });
  const row = (await db.select().from(purchaseOrders).where(eq(purchaseOrders._id, _id)))[0]!;
  emitToKiln(input.kilnId, "purchaseOrder:update", row);
  return row;
}

export interface ListPurchaseOrdersFilter {
  status?: string;
  supplierId?: string;
  from?: Date;
  to?: Date;
}

// seasonId is nullable — pass null for an all-time, every-season view, same
// convention as listSaleOrders.
export async function listPurchaseOrders(kilnId: string, seasonId: string | null, filter: ListPurchaseOrdersFilter = {}) {
  const conditions = [eq(purchaseOrders.kilnId, kilnId)];
  if (seasonId) conditions.push(eq(purchaseOrders.seasonId, seasonId));
  if (filter.status) conditions.push(eq(purchaseOrders.status, filter.status as PurchaseOrderStatus));
  if (filter.supplierId) conditions.push(eq(purchaseOrders.supplierId, filter.supplierId));
  if (filter.from) conditions.push(gte(purchaseOrders.orderDate, filter.from));
  if (filter.to) conditions.push(lte(purchaseOrders.orderDate, filter.to));
  return db.select().from(purchaseOrders).where(and(...conditions)).orderBy(desc(purchaseOrders.orderDate), desc(purchaseOrders.createdAt));
}

export async function getPurchaseOrder(kilnId: string, purchaseOrderId: string) {
  const row = (await db.select().from(purchaseOrders).where(and(eq(purchaseOrders._id, purchaseOrderId), eq(purchaseOrders.kilnId, kilnId))))[0];
  if (!row) throw new Error("Purchase order not found in this kiln");
  return row;
}

export async function updatePurchaseOrder(kilnId: string, purchaseOrderId: string, input: Partial<CreatePurchaseOrderInput>) {
  await getPurchaseOrder(kilnId, purchaseOrderId);
  await db.update(purchaseOrders).set(input).where(eq(purchaseOrders._id, purchaseOrderId));
  const updated = (await db.select().from(purchaseOrders).where(eq(purchaseOrders._id, purchaseOrderId)))[0]!;
  emitToKiln(kilnId, "purchaseOrder:update", updated);
  return updated;
}

export async function cancelPurchaseOrder(kilnId: string, purchaseOrderId: string) {
  const order = await getPurchaseOrder(kilnId, purchaseOrderId);
  if (order.status === "FULFILLED") throw new Error("Cannot cancel a fully fulfilled purchase order");
  await db.update(purchaseOrders).set({ status: "CANCELLED" }).where(eq(purchaseOrders._id, purchaseOrderId));
  const updated = (await db.select().from(purchaseOrders).where(eq(purchaseOrders._id, purchaseOrderId)))[0]!;
  emitToKiln(kilnId, "purchaseOrder:update", updated);
  return updated;
}

export interface FulfillPurchaseOrderInput {
  itemsReceived?: SupplierInvoiceInput["itemsReceived"];
  totalBillAmount: number;
  amountPaid?: number;
  paymentMode?: SupplierInvoiceInput["paymentMode"];
  cashAmount?: number;
  onlineAmount?: number;
  date?: Date;
}

// Delivers against a pending order by creating a real Supplier Invoice
// (same balance effect as any other supplier invoice — see
// supplierInvoice.service.ts). An order is considered fulfilled once any
// invoice has been booked against it — unlike Sale Orders, a purchase's
// "remaining quantity" isn't tracked per line item here (supplier invoice
// items are a loose received-goods list, not a priced-per-unit ledger), so
// the admin marks partial fulfillment as a status choice rather than the
// system inferring it from a quantity match.
export async function fulfillPurchaseOrder(kilnId: string, seasonId: string, purchaseOrderId: string, input: FulfillPurchaseOrderInput, markFulfilled: boolean) {
  const order = await getPurchaseOrder(kilnId, purchaseOrderId);
  if (order.status === "CANCELLED" || order.status === "FULFILLED") {
    throw new Error(`Cannot fulfill a purchase order that is already ${order.status}`);
  }

  const invoice = await createSupplierInvoice(kilnId, {
    supplierId: order.supplierId,
    seasonId: order.seasonId ?? seasonId,
    date: input.date,
    itemsReceived: input.itemsReceived,
    totalBillAmount: input.totalBillAmount,
    amountPaid: input.amountPaid,
    paymentMode: input.paymentMode,
    cashAmount: input.cashAmount,
    onlineAmount: input.onlineAmount,
    purchaseOrderId: order._id,
  });

  const status: PurchaseOrderStatus = markFulfilled ? "FULFILLED" : "PARTIALLY_FULFILLED";
  await db.update(purchaseOrders).set({ status }).where(eq(purchaseOrders._id, purchaseOrderId));
  const updatedOrder = (await db.select().from(purchaseOrders).where(eq(purchaseOrders._id, purchaseOrderId)))[0]!;
  emitToKiln(kilnId, "purchaseOrder:update", updatedOrder);

  return { order: updatedOrder, invoice };
}
