import { double, int, mysqlTable, varchar, text, datetime, uniqueIndex, index } from "drizzle-orm/mysql-core";
import { idColumn, kilnIdColumn, createdAtColumn, dateColumn, itemsColumn } from "./_helpers";

export const SALE_ORDER_STATUSES = ["PENDING", "PARTIALLY_FULFILLED", "FULFILLED", "CANCELLED"] as const;

// An advance booking of a future sale — created before any bricks move,
// unlike a Dispatch (which always represents bricks that have already left
// the yard). Fulfilling an order creates a real Dispatch (see
// saleOrder.service.ts's fulfillSaleOrder, which calls the existing
// createDispatch with saleOrderId set) and reduces bricksFulfilled below;
// an order can be fulfilled across several dispatches, matching how a large
// booking is often delivered in batches.
export const saleOrders = mysqlTable("sale_orders", {
  _id: idColumn(),
  kilnId: kilnIdColumn(),
  seasonId: varchar("seasonId", { length: 64 }),
  customerId: varchar("customerId", { length: 64 }),
  customerName: varchar("customerName", { length: 255 }).notNull(),
  customerAddress: varchar("customerAddress", { length: 255 }),
  customerPhone: varchar("customerPhone", { length: 255 }),
  // Same multi-category shape Dispatch/Invoice already use — see
  // BrickLineItem's doc comment in _helpers.ts. categoryId/bricksCount stay
  // the aggregate for any read path that doesn't need the per-category
  // breakdown.
  categoryId: varchar("categoryId", { length: 64 }),
  items: itemsColumn(),
  bricksCount: int("bricksCount").notNull(),
  bricksFulfilled: int("bricksFulfilled").notNull().default(0),
  ratePerBrick: double("ratePerBrick"),
  estimatedAmount: double("estimatedAmount"),
  status: varchar("status", { length: 30, enum: SALE_ORDER_STATUSES }).notNull().default("PENDING"),
  sequenceNumber: int("sequenceNumber"),
  orderDate: dateColumn("orderDate"),
  // No $defaultFn — an admin-set, genuinely optional future date. Unlike
  // orderDate (defaults to "now", correct for "booked today"), silently
  // defaulting this to today would misleadingly claim delivery is expected
  // immediately whenever the admin leaves it blank (the exact bug already
  // fixed once this session for people.partnershipDate).
  expectedDeliveryDate: datetime("expectedDeliveryDate", { mode: "date" }),
  notes: text("notes"),
  createdAt: createdAtColumn(),
}, (t) => ({
  kilnStatusIdx: index("saleorder_kiln_status_idx").on(t.kilnId, t.status),
  sequenceUnique: uniqueIndex("saleorder_kiln_sequence_unique").on(t.kilnId, t.seasonId, t.sequenceNumber),
}));
