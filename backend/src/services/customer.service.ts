import { randomUUID } from "crypto";
import { and, desc, eq } from "drizzle-orm";
import { db } from "../db/client";
import { customers } from "../db/schema";
import { listInvoicesForCustomer } from "./dispatchDocuments.service";
import { emitToKiln } from "../config/socket";

export interface CustomerDriverInput {
  name: string;
  phone: string;
  address: string;
}

export interface CustomerVehicleInput {
  vehicleType: string;
  vehicleNumber: string;
}

export interface CustomerInput {
  name: string;
  phones?: string[];
  addresses?: string[];
  drivers?: CustomerDriverInput[];
  vehicles?: CustomerVehicleInput[];
  openingPaid?: number;
  openingDue?: number;
}

export async function createCustomer(kilnId: string, input: CustomerInput) {
  const _id = randomUUID();
  await db.insert(customers).values({ ...input, _id, kilnId });
  const row = (await db.select().from(customers).where(eq(customers._id, _id)))[0]!;
  emitToKiln(kilnId, "customer:update", row);
  return row;
}

export async function listCustomers(kilnId: string) {
  return db.select().from(customers).where(eq(customers.kilnId, kilnId)).orderBy(desc(customers.createdAt));
}

// Every invoice "generated under this customer" (see
// listInvoicesForCustomer's own doc comment) plus the live paid/due
// balance derived from them — never stored or cached, so it can never
// drift out of sync with the invoices list it's computed from. An
// invoice's own contribution: amountPaidNow (or netAmount, when that
// field was never set — see the schema comment on
// invoices.amountPaidNow) counts toward paid. A real brick sale
// (bricksCount > 0) also charges its netAmount, so whatever's left
// unpaid adds to due. A bricksCount === 0 entry (the Add Amount /
// general-payment flow) charges nothing — it's a pure payment, so it
// only ever reduces due. openingPaid/openingDue are the customer's
// starting balances, added on top of every invoice's contribution.
export async function getCustomerDetail(kilnId: string, customerId: string) {
  const customer = (await db.select().from(customers).where(and(eq(customers._id, customerId), eq(customers.kilnId, kilnId))))[0];
  if (!customer) throw new Error("Customer not found in this kiln");

  const invoiceRows = await listInvoicesForCustomer(kilnId, customerId, customer.name);

  let totalPaid = customer.openingPaid;
  let totalDue = customer.openingDue;
  for (const inv of invoiceRows) {
    const paidNow = inv.amountPaidNow ?? inv.netAmount;
    const charge = inv.bricksCount > 0 ? inv.netAmount : 0;
    totalPaid += paidNow;
    totalDue += charge - paidNow;
  }
  totalPaid = Math.round(totalPaid * 100) / 100;
  totalDue = Math.round(totalDue * 100) / 100;

  return { customer, invoices: invoiceRows, totalPaid, totalDue };
}

export async function updateCustomer(kilnId: string, customerId: string, input: Partial<CustomerInput>) {
  const existing = (await db.select().from(customers).where(and(eq(customers._id, customerId), eq(customers.kilnId, kilnId))))[0];
  if (!existing) throw new Error("Customer not found in this kiln");
  await db.update(customers).set(input).where(eq(customers._id, customerId));
  const updated = (await db.select().from(customers).where(eq(customers._id, customerId)))[0]!;
  emitToKiln(kilnId, "customer:update", updated);
  return updated;
}

export async function deleteCustomer(kilnId: string, customerId: string) {
  const existing = (await db.select().from(customers).where(and(eq(customers._id, customerId), eq(customers.kilnId, kilnId))))[0];
  if (!existing) throw new Error("Customer not found in this kiln");
  await db.delete(customers).where(eq(customers._id, customerId));
  emitToKiln(kilnId, "customer:update", { _id: customerId, deleted: true });
}
