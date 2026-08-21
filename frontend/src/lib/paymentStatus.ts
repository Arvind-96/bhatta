import { api } from "./api";

// Shown as a stamp on every Gate Pass/Challan/Invoice printout. "PARTIAL"
// only ever applies to a genuinely new/untracked party (no persistent
// balance relationship) who hasn't paid this specific document in full —
// an existing tracked customer with any due always reads as "DUE", even if
// they paid this particular bill in full but still owe from before.
export type PaymentStamp = "PAID" | "PARTIAL" | "DUE";

export interface ResolvedPaymentInfo {
  stamp: PaymentStamp;
  // The customer's live overall due, post-transaction — only meaningful
  // (and only ever set) when a tracked Customer was actually matched;
  // undefined for a walk-in/untracked party with no persistent balance.
  overallDue?: number;
}

// Gate Pass/Challan carry no pricing of their own, so `remainingOnThisDoc`
// is always 0 for them — only Invoice's own remaining-unpaid-amount feeds
// it. Resolves the customer either by an explicit id (Invoice, when
// linked) or by matching customerName against the Customer list (the same
// fallback listInvoicesForCustomer already uses server-side).
export async function resolvePaymentInfo(opts: { customerId?: string; customerName: string; remainingOnThisDoc: number }): Promise<ResolvedPaymentInfo> {
  let id = opts.customerId;
  if (!id) {
    try {
      const list = await api.customers.list();
      const match = list.find((c) => c.name.trim().toLowerCase() === opts.customerName.trim().toLowerCase());
      id = match?._id;
    } catch {
      id = undefined;
    }
  }
  if (!id) {
    return { stamp: opts.remainingOnThisDoc <= 0 ? "PAID" : "PARTIAL" };
  }
  try {
    const detail = await api.customers.detail(id);
    if (detail.isNewCustomer) {
      return { stamp: opts.remainingOnThisDoc <= 0 ? "PAID" : "PARTIAL", overallDue: detail.totalDue };
    }
    return { stamp: detail.totalDue <= 0 ? "PAID" : "DUE", overallDue: detail.totalDue };
  } catch {
    return { stamp: opts.remainingOnThisDoc <= 0 ? "PAID" : "PARTIAL" };
  }
}
