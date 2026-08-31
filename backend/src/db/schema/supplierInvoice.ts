import { double, int, json, mysqlTable, varchar, index } from "drizzle-orm/mysql-core";
import { idColumn, kilnIdColumn, createdAtColumn, dateColumn, SIMPLE_PAYMENT_MODES } from "./_helpers";

export interface SupplierInvoiceItem {
  itemName: string;
  unit: string;
  quantity: number;
}

// A single "goods received from this supplier" record — doubles as the
// data entry for a purchase and the source for its printable receipt
// (see printSupplierInvoiceRecord on the frontend), since both describe
// the exact same transaction. dueAmount is deliberately not a stored
// column — always totalBillAmount - amountPaid, computed on read so an
// edited amountPaid can never leave a stale due figure behind.
export const supplierInvoices = mysqlTable(
  "supplier_invoices",
  {
    _id: idColumn(),
    kilnId: kilnIdColumn(),
    seasonId: varchar("seasonId", { length: 64 }),
    supplierId: varchar("supplierId", { length: 64 }).notNull(),
    sequenceNumber: int("sequenceNumber"),
    date: dateColumn(),
    itemsReceived: json("itemsReceived").$type<SupplierInvoiceItem[]>().default([]),
    totalBillAmount: double("totalBillAmount").notNull(),
    amountPaid: double("amountPaid").notNull().default(0),
    paymentMode: varchar("paymentMode", { length: 20 }).$type<(typeof SIMPLE_PAYMENT_MODES)[number]>(),
    cashAmount: double("cashAmount"),
    onlineAmount: double("onlineAmount"),
    createdAt: createdAtColumn(),
  },
  (t) => ({
    kilnIdx: index("supplier_invoice_kiln_idx").on(t.kilnId),
    supplierIdx: index("supplier_invoice_supplier_idx").on(t.supplierId),
  })
);
