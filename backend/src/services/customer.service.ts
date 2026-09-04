import { randomUUID } from "crypto";
import { and, desc, eq, ne, sql } from "drizzle-orm";
import { db } from "../db/client";
import { customers, invoices, dispatches, saleOrders } from "../db/schema";
import { listInvoicesForCustomer } from "./dispatchDocuments.service";
import { seasonIdsThrough } from "./season.util";
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

// A second customer with the same name (case-insensitive) would make
// listInvoicesForCustomer's customerId-IS-NULL name-fallback match
// ambiguous — a legacy invoice with no customerId would match both
// profiles and double-count its paid/due on each. Checked here (not just
// left to the DB's own unique index below) so the admin gets a clear
// message instead of a raw constraint-violation error.
export async function createCustomer(kilnId: string, input: CustomerInput) {
  const existing = await findCustomerByName(kilnId, input.name);
  if (existing) throw new Error(`A customer named "${input.name.trim()}" already exists in this kiln — use that profile instead of creating a duplicate.`);

  const _id = randomUUID();
  await db.insert(customers).values({ ...input, _id, kilnId });
  const row = (await db.select().from(customers).where(eq(customers._id, _id)))[0]!;
  emitToKiln(kilnId, "customer:update", row);
  return row;
}

export async function listCustomers(kilnId: string) {
  return db.select().from(customers).where(eq(customers.kilnId, kilnId)).orderBy(desc(customers.createdAt));
}

// Case-insensitive exact-name lookup — used by createDispatch's Brick
// Loading auto-sync to decide whether a trip's typed customer name already
// has a profile (link, don't duplicate) or is genuinely new (auto-create).
export async function findCustomerByName(kilnId: string, name: string) {
  const trimmed = name.trim();
  if (!trimmed) return undefined;
  return (
    await db
      .select()
      .from(customers)
      .where(and(eq(customers.kilnId, kilnId), eq(sql`lower(${customers.name})`, trimmed.toLowerCase())))
  )[0];
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
// Bug fix: the Customer page's own per-invoice "Due" column used to show
// each invoice's raw, unresolved (charge − paid) — while the Reports
// "Invoices" report resolves the same customer's dues via a FIFO
// settlement (a later top-up payment can fully clear an earlier invoice's
// shortfall, not just its own). The two could disagree, invoice-row for
// invoice-row, for the identical data. reports/types.ts's own
// fifoResolveCustomerDues is keyed by dispatchId (it needs one, to
// attribute a credit's cash/online split back to a specific dispatch for
// the report's own columns) — a Customer-page-originated invoice (Add
// Amount) has no dispatchId at all, so that function can't be reused
// as-is here. This is the same FIFO settlement logic, keyed by invoice id
// instead, without the cash/online-split bookkeeping this page doesn't
// need.
function fifoResolveInvoiceDues(invoiceRows: { _id: string; invoiceDate: Date | null; createdAt: Date | null; bricksCount: number; netAmount: number; amountPaidNow: number | null }[]): Map<string, number> {
  const sorted = [...invoiceRows].sort(
    (a, b) => (a.invoiceDate ?? a.createdAt ?? new Date(0)).getTime() - (b.invoiceDate ?? b.createdAt ?? new Date(0)).getTime()
  );
  const openStack: { invoiceId: string; remaining: number }[] = [];
  const remainingDue = new Map<string, number>();

  function applyCredit(amount: number) {
    let left = Math.round(amount * 100) / 100;
    while (left > 0.005 && openStack.length > 0) {
      const top = openStack[openStack.length - 1];
      const applied = Math.min(top.remaining, left);
      if (applied <= 0) break;
      top.remaining = Math.round((top.remaining - applied) * 100) / 100;
      left = Math.round((left - applied) * 100) / 100;
      remainingDue.set(top.invoiceId, top.remaining);
      if (top.remaining <= 0.005) openStack.pop();
    }
  }

  for (const inv of sorted) {
    const charge = inv.bricksCount > 0 ? inv.netAmount : 0;
    const paidNow = inv.amountPaidNow ?? inv.netAmount;
    if (charge > 0) {
      const shortfall = Math.round((charge - paidNow) * 100) / 100;
      if (shortfall > 0.005) {
        openStack.push({ invoiceId: inv._id, remaining: shortfall });
        remainingDue.set(inv._id, shortfall);
      } else if (shortfall < -0.005) {
        applyCredit(-shortfall);
      }
    } else {
      applyCredit(paidNow);
    }
  }
  return remainingDue;
}

export async function getCustomerDetail(kilnId: string, customerId: string, seasonId: string) {
  const customer = (await db.select().from(customers).where(and(eq(customers._id, customerId), eq(customers.kilnId, kilnId))))[0];
  if (!customer) throw new Error("Customer not found in this kiln");

  const seasonIds = await seasonIdsThrough(kilnId, seasonId);
  const invoiceRowsRaw = await listInvoicesForCustomer(kilnId, customerId, customer.name, seasonIds);

  let totalPaid = customer.openingPaid;
  let totalDue = customer.openingDue;
  for (const inv of invoiceRowsRaw) {
    const paidNow = inv.amountPaidNow ?? inv.netAmount;
    const charge = inv.bricksCount > 0 ? inv.netAmount : 0;
    totalPaid += paidNow;
    totalDue += charge - paidNow;
  }
  totalPaid = Math.round(totalPaid * 100) / 100;
  totalDue = Math.round(totalDue * 100) / 100;

  const fifoDueByInvoice = fifoResolveInvoiceDues(invoiceRowsRaw);
  const invoiceRows = invoiceRowsRaw.map((inv) => ({ ...inv, fifoDue: Math.max(0, fifoDueByInvoice.get(inv._id) ?? 0) }));

  // "New" = no history at all before/aside from whatever's being printed
  // right now — no opening balance, and at most the one invoice currently
  // being generated (an invoice already saved by the time this is called
  // for a print). Used to choose between the "Partial Paid"/"Amount Due"
  // print stamps: a genuinely new customer who under-pays reads as
  // "Partial Paid", while an existing tracked customer with any due reads
  // as "Amount Due" even if this specific bill was paid in full.
  const isNewCustomer = customer.openingPaid === 0 && customer.openingDue === 0 && invoiceRows.length <= 1;

  return { customer, invoices: invoiceRows, totalPaid, totalDue, isNewCustomer };
}

export async function updateCustomer(kilnId: string, customerId: string, input: Partial<CustomerInput>) {
  const existing = (await db.select().from(customers).where(and(eq(customers._id, customerId), eq(customers.kilnId, kilnId))))[0];
  if (!existing) throw new Error("Customer not found in this kiln");
  await db.update(customers).set(input).where(eq(customers._id, customerId));
  const updated = (await db.select().from(customers).where(eq(customers._id, customerId)))[0]!;
  emitToKiln(kilnId, "customer:update", updated);
  return updated;
}

// No DB-level FK ties invoices.customerId/dispatches.customerId back to
// customers, so a hard delete here would silently orphan them — their
// customerId would point at nothing, and (for invoices) getCustomerDetail
// would stop finding them at all, quietly dropping real sale/payment
// history off this customer's balance. Guarded the same check-then-throw
// way as deleteExpense's linked-source check in expense.service.ts:
// refuse instead of deleting when linked records still exist, and tell
// the admin why. Only non-cancelled rows count — a cancelled invoice/
// dispatch is already excluded from every balance/ledger read, so it's
// not a real linkage worth blocking on.
export async function deleteCustomer(kilnId: string, customerId: string) {
  const existing = (await db.select().from(customers).where(and(eq(customers._id, customerId), eq(customers.kilnId, kilnId))))[0];
  if (!existing) throw new Error("Customer not found in this kiln");

  const [linkedInvoices, linkedDispatches, linkedSaleOrders] = await Promise.all([
    db.select({ _id: invoices._id }).from(invoices).where(and(eq(invoices.kilnId, kilnId), eq(invoices.customerId, customerId), eq(invoices.cancelled, false))),
    db.select({ _id: dispatches._id }).from(dispatches).where(and(eq(dispatches.kilnId, kilnId), eq(dispatches.customerId, customerId), eq(dispatches.cancelled, false))),
    // Bug fix: a PENDING/PARTIALLY_FULFILLED sale order (no dispatch/
    // invoice yet, so the two checks above miss it) wasn't checked either
    // — deleting its customer left it with a dangling customerId, and
    // fulfilling it afterward threw ("Referenced customer not found in
    // this kiln") from inside createDispatch, permanently stuck.
    db.select({ _id: saleOrders._id }).from(saleOrders).where(and(eq(saleOrders.kilnId, kilnId), eq(saleOrders.customerId, customerId), ne(saleOrders.status, "CANCELLED"))),
  ]);
  if (linkedInvoices.length > 0 || linkedDispatches.length > 0 || linkedSaleOrders.length > 0) {
    throw new Error(
      `Cannot delete this customer — ${linkedInvoices.length} invoice(s), ${linkedDispatches.length} dispatch(es), and ${linkedSaleOrders.length} sale order(s) are linked to them. Cancel or reassign those first.`
    );
  }

  await db.delete(customers).where(eq(customers._id, customerId));
  emitToKiln(kilnId, "customer:update", { _id: customerId, deleted: true });
}
