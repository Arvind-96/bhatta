import { json, mysqlTable, varchar, index } from "drizzle-orm/mysql-core";
import { idColumn, kilnIdColumn, createdAtColumn, dateColumn } from "./_helpers";

export const SUPPLY_UNITS = ["KG", "PIECE", "METER"] as const;

export interface SupplyListItem {
  itemName: string;
  unit: (typeof SUPPLY_UNITS)[number];
}

// External vendors the kiln buys raw materials from (coal, gas, wood,
// salt, ...) — distinct from suppliedItems (kiln → labourer, tools/
// materials handed out from Inventory) and from Person (kiln staff/
// contractors), neither of which represents an outside supplier.
export const suppliers = mysqlTable(
  "suppliers",
  {
    _id: idColumn(),
    kilnId: kilnIdColumn(),
    name: varchar("name", { length: 255 }).notNull(),
    phone: varchar("phone", { length: 32 }),
    address: varchar("address", { length: 500 }),
    suppliesList: json("suppliesList").$type<SupplyListItem[]>().default([]),
    // The date this supplier relationship actually started, editable by
    // the admin — distinct from createdAt (when the record was entered
    // into the software), same convention every transaction-date field
    // in this app already uses.
    dateAdded: dateColumn("dateAdded"),
    createdAt: createdAtColumn(),
  },
  (t) => ({
    kilnIdx: index("supplier_kiln_idx").on(t.kilnId),
  })
);
