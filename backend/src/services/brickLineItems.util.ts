import type { BrickLineItem } from "../db/schema/_helpers";

// Recomputes each item's own `amount` (bricksCount x this item's price,
// never the category's own default) and the three aggregate figures every
// pre-existing read path (Reports, list pages, financial totals) still
// relies on: total bricksCount, total amount, and a single "representative"
// categoryId (the first item's — real per-category detail lives in
// `items`, this is only for callers that don't know about it yet).
// `priceField` lets a caller with a differently-named per-brick price
// column (invoices use `ratePerBrick`, everything else `pricePerBrick`)
// still reuse this — the returned aggregate always uses `pricePerBrick`,
// callers map it to their own column name.
export function summarizeItems(items: BrickLineItem[]) {
  const normalized: BrickLineItem[] = items.map((i) => ({
    categoryId: i.categoryId,
    bricksCount: i.bricksCount,
    pricePerBrick: i.pricePerBrick,
    amount: i.pricePerBrick != null ? Math.round(i.bricksCount * i.pricePerBrick * 100) / 100 : undefined,
  }));
  const totalBricksCount = normalized.reduce((s, i) => s + i.bricksCount, 0);
  const totalAmount = Math.round(normalized.reduce((s, i) => s + (i.amount ?? 0), 0) * 100) / 100;
  return {
    items: normalized,
    bricksCount: totalBricksCount,
    categoryId: normalized[0]?.categoryId,
    pricePerBrick: normalized.length === 1 ? normalized[0].pricePerBrick : undefined,
    amount: totalAmount,
  };
}

// A row created before multi-category support existed has `items` NULL —
// this reconstructs an equivalent one-item array from its legacy scalar
// fields, so stock-correction/diffing logic can treat every row uniformly
// regardless of when it was created.
export function itemsOrLegacyFallback(row: {
  items?: BrickLineItem[] | null;
  categoryId?: string | null;
  bricksCount: number;
  pricePerBrick?: number | null;
  amount?: number | null;
}): BrickLineItem[] {
  if (row.items && row.items.length > 0) return row.items;
  if (!row.categoryId) return [];
  return [{ categoryId: row.categoryId, bricksCount: row.bricksCount, pricePerBrick: row.pricePerBrick ?? undefined, amount: row.amount ?? undefined }];
}

// Sums each category's bricksCount across a list of items — used to diff
// an old items array against a new one per category (the stock-correction
// convention: delta-adjust only what actually changed, never re-deduct
// the full new total).
export function bricksByCategory(items: BrickLineItem[]): Map<string, number> {
  const m = new Map<string, number>();
  for (const it of items) if (it.categoryId) m.set(it.categoryId, (m.get(it.categoryId) ?? 0) + it.bricksCount);
  return m;
}
