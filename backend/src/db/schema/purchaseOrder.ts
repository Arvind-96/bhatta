import { double, int, json, mysqlTable, varchar, text, uniqueIndex, index } from "drizzle-orm/mysql-core";
import { idColumn, kilnIdColumn, createdAtColumn, dateColumn } from "./_helpers";

export const PURCHASE_ORDER_STATUSES = ["PENDING", "PARTIALLY_FULFILLED", "FULFILLED", "CANCELLED"] as const;

export interface PurchaseOrderItem {
  itemName: string;
  unit: string;
  quantity: number;
  itemGroup?: string;
}

// The buying-side mirror of saleOrders — a commitment to a supplier before
// goods actually arrive. Fulfilling an order creates a real
// SupplierInvoice (see purchaseOrder.service.ts's fulfillPurchaseOrder,
// which extends the existing createSupplierInvoice with purchaseOrderId
// set), same partial-fulfillment-across-several-invoices allowance as
// saleOrders.
export const purchaseOrders = mysqlTable("purchase_orders", {
  _id: idColumn(),
  kilnId: kilnIdColumn(),
  seasonId: varchar("seasonId", { length: 64 }),
  supplierId: varchar("supplierId", { length: 64 }).notNull(),
  items: json("items").$type<PurchaseOrderItem[]>().default([]),
  expectedAmount: double("expectedAmount"),
  status: varchar("status", { length: 30, enum: PURCHASE_ORDER_STATUSES }).notNull().default("PENDING"),
  sequenceNumber: int("sequenceNumber"),
  orderDate: dateColumn("orderDate"),
  expectedDeliveryDate: dateColumn("expectedDeliveryDate"),
  notes: text("notes"),
  createdAt: createdAtColumn(),
}, (t) => ({
  kilnStatusIdx: index("purchaseorder_kiln_status_idx").on(t.kilnId, t.status),
  sequenceUnique: uniqueIndex("purchaseorder_kiln_sequence_unique").on(t.kilnId, t.seasonId, t.sequenceNumber),
}));
