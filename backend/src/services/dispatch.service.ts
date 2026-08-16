import { randomUUID } from "crypto";
import { and, desc, eq, gte, inArray } from "drizzle-orm";
import { db } from "../db/client";
import { dispatches, people, BRICK_GRADES, DISPATCH_PAYMENT_MODES } from "../db/schema";
import { assertPersonOfType } from "./person.service";
import { addLedgerEntry } from "./ledger.service";
import { recordStockEntry } from "./stock.service";
import { emitToKiln } from "../config/socket";

export type BrickGrade = (typeof BRICK_GRADES)[number];
export type PaymentMode = (typeof DISPATCH_PAYMENT_MODES)[number];

const GRADE_STOCK_ITEM: Record<BrickGrade, string> = {
  A1: "Bricks (A-1 Grade)",
  JHAMA: "Bricks (Jhama)",
  PELA: "Bricks (Pela/Seem)",
};

function generateSlipNumber() {
  return `GP-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
}

function generateInvoiceNumber() {
  return `INV-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
}

export interface CreateDispatchInput {
  kilnId: string;
  customerName: string;
  customerId?: string;
  grade?: BrickGrade;
  bricksCount: number;
  amount: number;
  driverId?: string;
  transportCost?: number;
  transportPaidBy?: "OWNER" | "CUSTOMER";
  paymentMode?: PaymentMode;
  cashAmount?: number;
  onlineAmount?: number;
  dispatchedOn?: Date;
}

// Every dispatch gets a slip number the moment it's created — the point
// isn't gate hardware (out of scope here), it's that "no record, no
// number" makes an un-logged truck exit the exception a munim would have
// to actively avoid creating, not the default. If it's on credit
// (customerId given, no full payment recorded elsewhere), the sale posts
// as a DUE against the customer — see Person.ts for why DUE/PAID mean the
// opposite of what they mean for a worker.
export async function createDispatch(input: CreateDispatchInput) {
  if (input.driverId) {
    await assertPersonOfType(input.kilnId, input.driverId, ["DRIVER"]);
  }
  if (input.customerId) {
    await assertPersonOfType(input.kilnId, input.customerId, ["CUSTOMER"]);
  }

  const slipNumber = generateSlipNumber();
  const invoiceNumber = generateInvoiceNumber();
  const _id = randomUUID();
  db.insert(dispatches).values({ ...input, _id, slipNumber, invoiceNumber }).run();
  const dispatch = db.select().from(dispatches).where(eq(dispatches._id, _id)).get()!;

  if (input.customerId) {
    await addLedgerEntry({
      kilnId: input.kilnId,
      personId: input.customerId,
      direction: "DUE",
      amount: input.amount,
      reason: `Sale: ${input.bricksCount.toLocaleString()} bricks (${slipNumber})`,
      date: input.dispatchedOn,
    });
  }

  // Bricks leaving on this truck have to come back out of finished-goods
  // stock the same way a return puts them back in (see
  // recordDeliveryAdjustment below) — without this, stock only ever grows
  // from chamber grading and never shrinks from a sale, which is exactly
  // the kind of gap reconcileFinishedGoods exists to catch.
  await recordStockEntry({
    kilnId: input.kilnId,
    type: "FINISHED_GOODS",
    itemName: GRADE_STOCK_ITEM[(input.grade ?? "A1") as BrickGrade],
    quantity: -input.bricksCount,
  });

  emitToKiln(input.kilnId, "dispatch:update", dispatch);
  return dispatch;
}

export interface DeliveryAdjustmentInput {
  breakageCount?: number;
  returnedCount?: number;
  returnReason?: string;
}

// Applied after the truck comes back — breakage/return counts aren't known
// at booking time. A return also reverses part of the customer's debt and
// puts the (undamaged) returned bricks back in finished-goods stock; the
// broken portion is just recorded, not reversed, since it's gone either way.
export async function recordDeliveryAdjustment(kilnId: string, dispatchId: string, input: DeliveryAdjustmentInput) {
  const dispatch = db.select().from(dispatches).where(and(eq(dispatches._id, dispatchId), eq(dispatches.kilnId, kilnId))).get();
  if (!dispatch) throw new Error("Dispatch not found in this kiln");

  const update: Record<string, unknown> = {};
  if (input.breakageCount != null) update.breakageCount = input.breakageCount;
  if (input.returnedCount != null) update.returnedCount = input.returnedCount;
  if (input.returnReason != null) update.returnReason = input.returnReason;

  if (Object.keys(update).length > 0) {
    db.update(dispatches).set(update).where(eq(dispatches._id, dispatchId)).run();
  }
  const updated = db.select().from(dispatches).where(eq(dispatches._id, dispatchId)).get()!;

  if (input.returnedCount && input.returnedCount > 0) {
    const unitPrice = dispatch.bricksCount > 0 ? dispatch.amount / dispatch.bricksCount : 0;
    const refundAmount = Math.round(unitPrice * input.returnedCount);

    if (dispatch.customerId && refundAmount > 0) {
      await addLedgerEntry({
        kilnId,
        personId: dispatch.customerId,
        direction: "PAID",
        amount: refundAmount,
        reason: `Return adjustment: ${input.returnedCount} bricks (${dispatch.slipNumber})`,
      });
    }

    await recordStockEntry({
      kilnId,
      type: "FINISHED_GOODS",
      itemName: GRADE_STOCK_ITEM[dispatch.grade as BrickGrade] ?? GRADE_STOCK_ITEM.A1,
      quantity: input.returnedCount,
    });
  }

  emitToKiln(kilnId, "dispatch:update", updated);
  return updated;
}

export async function listDispatches(kilnId: string, days = 30) {
  const since = new Date();
  since.setDate(since.getDate() - days);
  const rows = await db.select().from(dispatches).where(and(eq(dispatches.kilnId, kilnId), gte(dispatches.dispatchedOn, since))).orderBy(desc(dispatches.dispatchedOn)).all();

  const driverIds = [...new Set(rows.map((r) => r.driverId).filter((v): v is string => !!v))];
  const customerIds = [...new Set(rows.map((r) => r.customerId).filter((v): v is string => !!v))];
  const ids = [...new Set([...driverIds, ...customerIds])];
  const peopleRows = ids.length ? await db.select({ _id: people._id, name: people.name }).from(people).where(inArray(people._id, ids)).all() : [];
  const personById = new Map(peopleRows.map((p) => [p._id, p]));

  return rows.map((r) => ({
    ...r,
    driverId: r.driverId ? personById.get(r.driverId) ?? r.driverId : r.driverId,
    customerId: r.customerId ? personById.get(r.customerId) ?? r.customerId : r.customerId,
  }));
}

export async function totalDispatchedSince(kilnId: string, since: Date) {
  const rows = await db.select().from(dispatches).where(and(eq(dispatches.kilnId, kilnId), gte(dispatches.dispatchedOn, since))).all();
  return rows.reduce((sum, d) => sum + d.bricksCount, 0);
}

export async function dispatchTotals(kilnId: string, days = 7) {
  const since = new Date();
  since.setDate(since.getDate() - days);
  const rows = await db.select().from(dispatches).where(and(eq(dispatches.kilnId, kilnId), gte(dispatches.dispatchedOn, since))).all();

  return {
    days,
    bricksCount: rows.reduce((sum, d) => sum + d.bricksCount, 0),
    amount: rows.reduce((sum, d) => sum + d.amount, 0),
    dispatchCount: rows.length,
  };
}
