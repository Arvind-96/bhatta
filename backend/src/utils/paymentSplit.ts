import { z } from "zod";

// Shared by every zod schema that accepts a paymentMode of CASH_AND_ONLINE
// (dispatches, ledger entries, payment receipts) — the two split amounts
// are required exactly when that mode is chosen, and must sum to the
// entry's total, so a split payment's cash/online breakdown is always
// trustworthy wherever it gets reported on (e.g. Financial Overview).
export function validateCashOnlineSplit(
  data: { paymentMode?: string; cashAmount?: number; onlineAmount?: number },
  totalAmount: number,
  ctx: z.RefinementCtx
) {
  if (data.paymentMode !== "CASH_AND_ONLINE") return;
  if (data.cashAmount == null || data.onlineAmount == null) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "cashAmount and onlineAmount are both required when paymentMode is CASH_AND_ONLINE",
    });
    return;
  }
  const sum = Math.round((data.cashAmount + data.onlineAmount) * 100) / 100;
  const total = Math.round(totalAmount * 100) / 100;
  if (sum !== total) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: `cashAmount + onlineAmount (${sum}) must equal the total amount (${total})`,
    });
  }
}
