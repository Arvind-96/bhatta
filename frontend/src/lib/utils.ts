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

// Enforces the required XX-XX-XX-XXXX vehicle-number format (e.g.
// "MH-12-AB-1234") as the admin types: uppercases, strips anything that
// isn't a letter/digit, then re-inserts dashes every 2 characters (capped
// at 10 alphanumeric characters total, matching the format's 4 groups).
export function formatVehicleNumber(raw: string): string {
  const clean = raw.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 10);
  const groups = [clean.slice(0, 2), clean.slice(2, 4), clean.slice(4, 6), clean.slice(6, 10)];
  return groups.filter(Boolean).join("-");
}

// The "System Entry Date" shown next to a record's own (admin-editable)
// transaction date — always includes the time, since it's meant to show
// exactly when the entry was created, not just which day.
export function formatDateTime(value: string): string {
  return new Date(value).toLocaleString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}
