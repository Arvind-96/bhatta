// Pure (no i18n dependency, callable from a submit handler and from a live
// preview alike) — same shape as isPaymentSplitMismatched in
// components/shared/PaymentSplitFields.tsx. Sums every OTHER active
// partner's profitSharePercent plus a candidate new value, so a caller can
// fail fast before submit instead of only finding out from a 500 after a
// round trip. The server (person.service.ts's assertPartnerShareWithinLimit)
// enforces the identical ceiling authoritatively — this is fail-fast UX on
// top of that, not the only place it's checked.
export function totalPartnerShareWith(otherPartners: { profitSharePercent?: number | null }[], newSharePercent: number): number {
  const othersTotal = otherPartners.reduce((sum, p) => sum + (p.profitSharePercent ?? 0), 0);
  return Math.round((othersTotal + newSharePercent) * 100) / 100;
}
