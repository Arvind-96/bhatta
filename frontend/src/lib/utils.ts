import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// Plain `.toLocaleString("en-IN")` shows up to 3 fraction digits for any
// non-integer input (partial-rupee ledger sums, prorated splits, etc.),
// which is how amounts like "₹18,143.578" were slipping through next to
// whole-rupee amounts everywhere else. Every ₹ display should go through
// this instead so fractional paise always round to the nearest rupee.
export function formatINR(amount: number): string {
  return Math.round(amount).toLocaleString("en-IN");
}
