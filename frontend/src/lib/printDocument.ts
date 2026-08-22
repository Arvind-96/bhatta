import { formatINR } from "@/lib/utils";
import { amountInWords } from "@/lib/numberToWords";
import type { BrickCategory, BrickLineItem, Challan, Expense, GatePassRecord, Invoice, LedgerEntry, Machine, MachineInstallmentPayment, PaymentReceipt, SandContract, SoilContract, VehicleDieselEntry } from "@/types";

// Gate Pass, Challan, Invoice, and Payment Receipt all share one visual
// language (accent bars, a logo mark, a colored "who this is for" box, a
// structured detail table, a signature row) so the four read as one
// consistent, professional paper trail. Each is opened as a real new
// window (not an in-page @media print block) so the SPA's own layout
// never bleeds into the printed page.
function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// A CASH_AND_ONLINE mode is meaningless on paper as just the label — the
// point of a split payment is which portion was which, so print both
// amounts instead of the bare mode name whenever it applies.
function paymentModeLabel(entry: { paymentMode?: string | null; cashAmount?: number | null; onlineAmount?: number | null }) {
  if (entry.paymentMode === "CASH_AND_ONLINE") {
    return `Cash ₹${formatINR(entry.cashAmount ?? 0)} + Online ₹${formatINR(entry.onlineAmount ?? 0)}`;
  }
  return entry.paymentMode ?? "—";
}

function kilnLogoLetter(kilnName: string) {
  return kilnName.trim().charAt(0).toUpperCase() || "B";
}

// "TRUCK" -> "Truck" — print-only formatting, never touches the stored
// value (still the free-form/enum string used everywhere else in the app).
function titleCase(value?: string | null) {
  if (!value) return value;
  return value.charAt(0).toUpperCase() + value.slice(1).toLowerCase();
}

export interface ResolvedLineItem {
  label: string;
  bricksCount: number;
  pricePerBrick?: number;
  amount?: number;
}

// Resolves a document's `items` array (or, for a record predating this
// feature, its single legacy categoryId/bricksCount/pricePerBrick scalars)
// into print-ready rows with the category label already looked up. Shared
// by all three documents so the "multi-category table vs. single legacy
// row" decision is made in one place. `categories` is the kiln's full
// brick-category list — Challan/Gate Pass/Invoice items only ever carry a
// plain categoryId string (unlike a Brick Loading trip's own items, which
// the backend enriches), so the label lookup always happens here.
export function resolveItemRows(
  items: BrickLineItem[] | undefined,
  categories: BrickCategory[],
  fallback: { categoryId?: { _id: string; category: string; grade?: string } | string; bricksCount: number; pricePerBrick?: number; amount?: number }
): ResolvedLineItem[] {
  const source = items && items.length > 0 ? items : fallback.categoryId || fallback.bricksCount > 0 ? [fallback] : [];
  return source.map((it) => {
    const id = typeof it.categoryId === "object" ? it.categoryId?._id : it.categoryId;
    const category = categories.find((c) => c._id === id);
    const label = category
      ? category.grade
        ? `${category.category} (${category.grade})`
        : category.category
      : typeof it.categoryId === "object" && it.categoryId
      ? it.categoryId.grade
        ? `${it.categoryId.category} (${it.categoryId.grade})`
        : it.categoryId.category
      : "—";
    return { label, bricksCount: it.bricksCount, pricePerBrick: it.pricePerBrick, amount: it.amount };
  });
}

export type PaymentStamp = "PAID" | "PARTIAL" | "DUE";

// The circular badge from the reference invoice layout — reused across
// Gate Pass/Challan/Invoice, just swapping color/label per status. Always
// rendered as the first child of a `.doc-totalbox` (position: relative),
// which anchors it to the box's top-left corner.
function stampHtml(status?: PaymentStamp) {
  if (!status) return "";
  if (status === "PAID") return `<div class="doc-stamp doc-stamp-paid"><span>THANK YOU</span><span>PAID</span></div>`;
  if (status === "PARTIAL") return `<div class="doc-stamp doc-stamp-partial"><span>PARTIAL</span><span>PAID</span></div>`;
  return `<div class="doc-stamp doc-stamp-due"><span>AMOUNT</span><span>DUE</span></div>`;
}

export interface KilnPrintInfo {
  name: string;
  location?: string;
  phone?: string;
  gstNumber?: string;
  stateCode?: string;
  bankAccountNumber?: string;
  bankName?: string;
  bankIfscCode?: string;
  // Already-resolved base64 data URI (see api.kilns.fetchSignatureBlob) —
  // the print window is a standalone blob document with no app auth
  // context, so it can't load an authenticated image URL directly; the
  // caller must resolve the bytes first.
  signatureDataUri?: string;
}

// Shared by all three documents — red accent bars top/bottom, a logo
// square + kiln header, a colored "who this is for" info box (with an
// optional stamp graphic and a big total), a colorful bordered/striped
// detail table (not the plain minimal table this app used to print), and
// a flexible signature row. `--doc-accent`/`--doc-accent-soft` are set per
// document type below so Gate Pass/Challan/Receipt each get their own
// distinct accent while sharing every other rule.
const DOCUMENT_STYLES = `
  @page { margin: 10mm 11mm; }
  /* Deliberately NOT bled past the page edge with a negative margin —
     that trick assumed a specific print margin, but the browser's own
     print dialog (margin: "None"/"Minimum"/"Default", entirely outside
     this app's control) can override @page, and with a zero print
     margin a negative margin here has nothing left to bleed into: it
     pushes this bar (and the header right after it) above the visible
     page entirely, cutting off the top of the invoice. A plain
     same-width bar inside the normal content flow can never do that,
     regardless of what margin the user's browser ends up printing with. */
  .doc-topbar, .doc-bottombar { height: 6px; background: linear-gradient(90deg, var(--doc-accent), var(--doc-accent-soft)); margin: 0 0 14px; border-radius: 3px; }
  .doc-bottombar { margin: 16px 0 0; }
  .doc-header { display: flex; justify-content: space-between; align-items: flex-start; gap: 16px; }
  .doc-brand { display: flex; gap: 10px; align-items: flex-start; }
  .doc-logo { display: flex; align-items: center; justify-content: center; width: 30px; height: 30px; border-radius: 6px; background: var(--doc-accent); color: #fff; font-weight: 800; font-size: 17px; flex-shrink: 0; box-shadow: 0 2px 6px color-mix(in srgb, var(--doc-accent) 45%, transparent); }
  .doc-kiln-name { font-size: 21px; font-weight: 800; margin: 0 0 2px; color: #1a1a1a; }
  .doc-address { font-size: 12.5px; color: #444; margin: 0; line-height: 1.35; }
  .doc-phone { font-size: 12.5px; color: #444; font-style: italic; margin: 3px 0 0; }
  .doc-gst { font-size: 12.5px; color: #444; margin: 1px 0 0; }
  .doc-meta { text-align: right; }
  .doc-badge { display: inline-block; padding: 3px 12px; border-radius: 999px; background: var(--doc-accent); color: #fff; font-size: 12px; font-weight: 800; letter-spacing: 0.06em; text-transform: uppercase; margin-bottom: 5px; }
  .doc-number { font-size: 19px; font-weight: 800; margin: 0 0 3px; color: #1a1a1a; }
  .doc-date, .doc-summary-line { font-size: 12.5px; color: #444; margin: 1px 0; }
  .doc-box { display: flex; justify-content: space-between; gap: 16px; margin-top: 12px; padding: 12px 14px; border: 1px solid color-mix(in srgb, var(--doc-accent) 35%, #eee); border-radius: 12px; background: var(--doc-accent-tint); break-inside: avoid; }
  .doc-box-label { font-size: 11px; color: #8a8a8a; text-transform: uppercase; letter-spacing: 0.05em; margin: 0 0 3px; }
  .doc-box-name { font-size: 15px; font-weight: 700; margin: 0; color: #1a1a1a; }
  .doc-box-detail { font-size: 12.5px; color: #444; margin: 2px 0 0; }
  .doc-totalbox { text-align: right; position: relative; min-width: 150px; }
  .doc-total-label { font-size: 12.5px; color: #444; margin: 0; }
  .doc-total-amount { font-size: 22px; font-weight: 800; margin: 2px 0; color: var(--doc-accent); }
  .doc-amount-words { font-size: 11.5px; font-style: italic; color: #666; margin: 0; }
  /* A classic two-ring rubber-stamp look (Invoice only — see printChallan/
     GatePassRecord, which no longer render one at all) — an outer solid
     ring plus a second outline ring with a gap, currentColor throughout so
     the three status variants below only need to set border/outline/text
     color once each. */
  .doc-stamp { position: absolute; top: -14px; left: -16px; width: 70px; height: 70px; border-radius: 50%; border: 2px solid; outline: 1.25px solid; outline-offset: 3px; outline-color: currentColor; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 2px; transform: rotate(-12deg); font-weight: 800; text-align: center; line-height: 1.15; box-shadow: 0 1px 4px rgba(0, 0, 0, 0.15); }
  .doc-stamp span:first-child { font-size: 7.5px; letter-spacing: 0.6px; text-transform: uppercase; }
  .doc-stamp span:last-child { font-size: 12px; letter-spacing: 0.8px; text-transform: uppercase; }
  .doc-stamp-paid { border-color: #1f8a4c; color: #1f8a4c; }
  .doc-stamp-partial { border-color: #b8860b; color: #b8860b; }
  .doc-stamp-due { border-color: #c0392b; color: #c0392b; }
  table.doc-table { width: 100%; border-collapse: separate; border-spacing: 0; margin-top: 12px; border: 1px solid #e5e0d8; border-radius: 10px; overflow: hidden; break-inside: avoid; }
  table.doc-table td { padding: 6px 12px; font-size: 13px; border-bottom: 1px solid #efece5; }
  table.doc-table tr:last-child td { border-bottom: none; }
  table.doc-table tr:nth-child(even) { background: var(--doc-accent-tint); }
  table.doc-table td.doc-table-label { color: #777; width: 42%; }
  table.doc-table td.doc-table-value { font-weight: 600; color: #1a1a1a; }
  table.doc-items { width: 100%; border-collapse: collapse; margin-top: 12px; break-inside: avoid; }
  table.doc-items th { background: var(--doc-accent); color: #fff; padding: 7px 8px; text-align: left; font-size: 11px; text-transform: uppercase; letter-spacing: 0.04em; }
  table.doc-items th:first-child { border-top-left-radius: 8px; }
  table.doc-items th:last-child { border-top-right-radius: 8px; }
  table.doc-items td { padding: 7px 8px; border-bottom: 1px solid #eee; font-size: 13px; }
  table.doc-items td.num, table.doc-items th.num { text-align: right; }
  table.doc-items tfoot td { font-weight: 700; border-top: 2px solid var(--doc-accent); border-bottom: none; }
  .doc-footer-total { text-align: right; margin-top: 12px; }
  .doc-footer-total .big { font-size: 22px; font-weight: 800; display: block; color: var(--doc-accent); }
  .doc-footer-words { text-align: right; font-size: 13px; font-style: italic; color: #666; margin: 2px 0 0; }
  .doc-digital-note { text-align: center; font-size: 11.5px; color: #888; margin-top: 14px; letter-spacing: 0.03em; }
  .doc-sign-row { margin-top: 22px; display: flex; justify-content: space-between; gap: 12px; break-inside: avoid; }
  .doc-sign-row.doc-sign-row-single { justify-content: flex-end; }
  .doc-sign-box { flex: 1; text-align: center; border-top: 1.5px solid #bbb; padding-top: 6px; font-size: 12px; color: #555; font-weight: 600; }
  .doc-sign-row-single .doc-sign-box { flex: none; width: 220px; }
  .doc-thanks { font-size: 12.5px; color: #444; margin-top: 12px; text-align: center; }
  /* GST invoice bottom section (printInvoiceRecord, only when the admin
     has set a GST rate on the invoice — see its own doc comment) —
     replicates the reference paper invoice book's layout: Amount in
     Words + Bank Details on the left, the tax breakdown table on the
     right, then Terms & Conditions + signature block below. A plain HTML
     table (not flex) for both rows below — Chromium's print-to-PDF engine
     mis-lays-out a flex row that straddles a page break (each flex child's
     text collapses word-by-word into a sliver of its own track, visibly
     overlapping the sibling column); a <table> row breaks far more
     predictably, and break-inside:avoid plus the tighter spacing above
     keeps this whole section on one page in the first place. */
  table.doc-gst-bottom { width: 100%; border-collapse: collapse; table-layout: fixed; margin-top: 12px; break-inside: avoid; }
  table.doc-gst-bottom td { vertical-align: top; padding: 0; }
  td.doc-gst-bottom-left { width: 60%; padding-right: 18px; }
  td.doc-gst-bottom-right { width: 40%; }
  .doc-words-label { font-size: 11px; color: #8a8a8a; text-transform: uppercase; letter-spacing: 0.05em; margin: 0 0 3px; }
  .doc-words-value { font-size: 13px; font-weight: 700; color: #1a1a1a; margin: 0 0 8px; }
  .doc-bank-details p { font-size: 11.5px; color: #444; margin: 1px 0; }
  table.doc-tax-table { width: 100%; border-collapse: collapse; font-size: 12.5px; }
  table.doc-tax-table td { padding: 4px 8px; border-bottom: 1px solid #eee; }
  table.doc-tax-table td:last-child { text-align: right; font-weight: 600; white-space: nowrap; }
  table.doc-tax-table tr.doc-tax-total td { font-weight: 800; border-top: 2px solid var(--doc-accent); border-bottom: none; font-size: 13.5px; }
  .doc-certify { text-align: right; font-size: 11px; color: #888; margin: 6px 0 0; font-style: italic; }
  table.doc-terms-signature { width: 100%; border-collapse: collapse; table-layout: fixed; margin-top: 14px; break-inside: avoid; }
  table.doc-terms-signature td { vertical-align: top; padding: 0; }
  td.doc-terms { width: 60%; padding-right: 18px; font-size: 11px; color: #555; }
  .doc-terms p.doc-terms-title { margin: 0 0 4px; font-weight: 700; color: #1a1a1a; }
  .doc-terms-body { margin: 0; white-space: pre-line; line-height: 1.45; }
  td.doc-signature-block { width: 40%; text-align: center; }
  .doc-for-kiln { font-weight: 700; margin: 0 0 4px; color: #1a1a1a; }
  .doc-signature-img { display: block; height: 46px; max-width: 170px; object-fit: contain; margin: 4px auto; }
  @media print { .doc-topbar, .doc-bottombar { -webkit-print-color-adjust: exact; print-color-adjust: exact; } table.doc-items th { -webkit-print-color-adjust: exact; print-color-adjust: exact; } table.doc-table tr:nth-child(even) { -webkit-print-color-adjust: exact; print-color-adjust: exact; } .doc-box { -webkit-print-color-adjust: exact; print-color-adjust: exact; } }
`;

const GATE_PASS_ACCENT = `:root { --doc-accent: #b8541f; --doc-accent-soft: #e08a3e; --doc-accent-tint: #fdf3ea; }`;
const CHALLAN_ACCENT = `:root { --doc-accent: #c0392b; --doc-accent-soft: #e0705f; --doc-accent-tint: #fdf6ee; }`;
const RECEIPT_ACCENT = `:root { --doc-accent: #1f7a4d; --doc-accent-soft: #4fae7c; --doc-accent-tint: #f0f8f3; }`;
const CONTRACT_ACCENT = `:root { --doc-accent: #8a5a2b; --doc-accent-soft: #c08a4f; --doc-accent-tint: #f8f2e9; }`;
// Distinct from CHALLAN_ACCENT above (the delivery-note Challan record) —
// this blue accent is only for the priced Invoice record below, so the
// two stay visually distinguishable.
const INVOICE_RECORD_ACCENT = `:root { --doc-accent: #2a4d8f; --doc-accent-soft: #5b7dc0; --doc-accent-tint: #eef3fb; }`;
const EXPENSE_ACCENT = `:root { --doc-accent: #6b4c9a; --doc-accent-soft: #9a7dc0; --doc-accent-tint: #f4f0fa; }`;
const DIESEL_ACCENT = `:root { --doc-accent: #b8860b; --doc-accent-soft: #d4a836; --doc-accent-tint: #faf5e6; }`;

function openPrintWindow(title: string, bodyHtml: string, extraStyles = "") {
  const html = `<!doctype html>
<html>
<head>
<meta charset="utf-8" />
<title>${escapeHtml(title)}</title>
<style>
  * { box-sizing: border-box; }
  body { font-family: -apple-system, Segoe UI, Roboto, Arial, sans-serif; color: #1a1a1a; padding: 32px; max-width: 700px; margin: 0 auto; }
  @media print { body { padding: 0; } }
  ${DOCUMENT_STYLES}
  ${extraStyles}
</style>
</head>
<body>
${bodyHtml}
<script>window.onload = function() { window.print(); };</script>
</body>
</html>`;

  const blob = new Blob([html], { type: "text/html" });
  const url = URL.createObjectURL(blob);
  const win = window.open(url, "_blank");
  if (win) {
    win.addEventListener("unload", () => URL.revokeObjectURL(url));
  }
}

// A pure delivery note — no pricing anywhere on it, deliberately distinct
// from the priced Invoice record below. Created from a Dispatch's own
// detail page (see CreateChallanForm.tsx) as its own editable/deletable
// record, not a live view of the dispatch.
export function printChallanRecord(challan: Challan, kiln: KilnPrintInfo, categories: BrickCategory[], paymentStamp?: PaymentStamp) {
  const logoLetter = kilnLogoLetter(kiln.name);
  const number = `CH-${challan.sequenceNumber ?? "—"}`;
  const date = challan.challanDate ?? challan.createdAt;
  const rows = resolveItemRows(challan.items, categories, { categoryId: challan.categoryId, bricksCount: challan.bricksCount });
  const categoryLabel = rows.length > 1 ? `${rows.length} categories` : rows[0]?.label ?? "—";
  const itemsTable =
    rows.length > 1
      ? `<table class="doc-items">
          <thead><tr><th>#</th><th>Brick Category</th><th class="num">Bricks</th></tr></thead>
          <tbody>${rows.map((r, i) => `<tr><td>${i + 1}</td><td>${escapeHtml(r.label)}</td><td class="num">${r.bricksCount.toLocaleString("en-IN")}</td></tr>`).join("")}</tbody>
        </table>`
      : "";

  const body = `
    <div class="doc-topbar"></div>
    <div class="doc-header">
      <div class="doc-brand">
        <span class="doc-logo">${escapeHtml(logoLetter)}</span>
        <div>
          <h1 class="doc-kiln-name">${escapeHtml(kiln.name)}</h1>
          ${kiln.location ? `<p class="doc-address">${escapeHtml(kiln.location)}</p>` : ""}
          ${kiln.phone ? `<p class="doc-phone">Phone: ${escapeHtml(kiln.phone)}</p>` : ""}
        </div>
      </div>
      <div class="doc-meta">
        <span class="doc-badge">Delivery Challan</span>
        <p class="doc-number">${escapeHtml(number)}</p>
        <p class="doc-date">${new Date(date).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })}</p>
      </div>
    </div>

    <div class="doc-box">
      <div>
        <p class="doc-box-label">Delivered to</p>
        <p class="doc-box-name">${escapeHtml(challan.customerName)}</p>
        <p class="doc-box-detail">${escapeHtml(challan.customerAddress || "—")}</p>
        <p class="doc-box-detail">Phone: ${escapeHtml(challan.customerPhone || "—")}</p>
      </div>
      <div class="doc-totalbox">
        <p class="doc-total-label">Bricks</p>
        <p class="doc-total-amount">${challan.bricksCount.toLocaleString("en-IN")}</p>
        <p class="doc-amount-words">${escapeHtml(categoryLabel)}</p>
      </div>
    </div>

    <table class="doc-table">
      <tr><td class="doc-table-label">Vehicle number</td><td class="doc-table-value">${escapeHtml(challan.vehicleNumber || "—")}</td></tr>
      <tr><td class="doc-table-label">Vehicle type</td><td class="doc-table-value">${escapeHtml(titleCase(challan.vehicleType) || "—")}</td></tr>
      <tr><td class="doc-table-label">Driver</td><td class="doc-table-value">${escapeHtml(challan.driverName || "—")}</td></tr>
      <tr><td class="doc-table-label">Driver mobile</td><td class="doc-table-value">${escapeHtml(challan.driverPhone || "—")}</td></tr>
      ${rows.length > 1 ? "" : `<tr><td class="doc-table-label">Brick type / grade</td><td class="doc-table-value">${escapeHtml(categoryLabel)}</td></tr>`}
      ${challan.placeOfSupply ? `<tr><td class="doc-table-label">Place of supply</td><td class="doc-table-value">${escapeHtml(challan.placeOfSupply)}</td></tr>` : ""}
      ${challan.notes ? `<tr><td class="doc-table-label">Notes</td><td class="doc-table-value">${escapeHtml(challan.notes)}</td></tr>` : ""}
    </table>
    ${itemsTable}

    <p class="doc-digital-note">~ THIS IS A DIGITALLY CREATED DELIVERY CHALLAN — NO PRICING ~</p>
    <div class="doc-sign-row">
      <div class="doc-sign-box">Dispatch clerk<br />(Stamp &amp; Signature)</div>
      <div class="doc-sign-box">Driver signature</div>
      <div class="doc-sign-box">Received by</div>
    </div>
  `;
  openPrintWindow(`Challan ${number}`, body, CHALLAN_ACCENT);
}

// Exit-authorization slip — its own editable/deletable record, distinct
// from the ad-hoc printGatePass above (which reads straight off a
// Dispatch with nothing saved). Same visual language, same accent.
export function printGatePassRecord(gatePass: GatePassRecord, kiln: KilnPrintInfo, categories: BrickCategory[], paymentStamp?: PaymentStamp) {
  const logoLetter = kilnLogoLetter(kiln.name);
  const number = `GP-${gatePass.sequenceNumber ?? "—"}`;
  const date = gatePass.gatePassDate ?? gatePass.createdAt;
  const rows = resolveItemRows(gatePass.items, categories, { categoryId: gatePass.categoryId, bricksCount: gatePass.bricksCount });
  const categoryLabel = rows.length > 1 ? `${rows.length} categories` : rows[0]?.label ?? "—";
  const itemsTable =
    rows.length > 1
      ? `<table class="doc-items">
          <thead><tr><th>#</th><th>Brick Category</th><th class="num">Bricks</th></tr></thead>
          <tbody>${rows.map((r, i) => `<tr><td>${i + 1}</td><td>${escapeHtml(r.label)}</td><td class="num">${r.bricksCount.toLocaleString("en-IN")}</td></tr>`).join("")}</tbody>
        </table>`
      : "";

  const body = `
    <div class="doc-topbar"></div>
    <div class="doc-header">
      <div class="doc-brand">
        <span class="doc-logo">${escapeHtml(logoLetter)}</span>
        <div>
          <h1 class="doc-kiln-name">${escapeHtml(kiln.name)}</h1>
          ${kiln.location ? `<p class="doc-address">${escapeHtml(kiln.location)}</p>` : ""}
          ${kiln.phone ? `<p class="doc-phone">Phone: ${escapeHtml(kiln.phone)}</p>` : ""}
        </div>
      </div>
      <div class="doc-meta">
        <span class="doc-badge">Gate Pass</span>
        <p class="doc-number">${escapeHtml(number)}</p>
        <p class="doc-date">${new Date(date).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })}</p>
        <p class="doc-date">Printed: ${new Date().toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })}</p>
      </div>
    </div>

    <div class="doc-box">
      <div>
        <p class="doc-box-label">Issued to (vehicle owner / customer)</p>
        <p class="doc-box-name">${escapeHtml(gatePass.customerName)}</p>
      </div>
      <div class="doc-totalbox">
        <p class="doc-total-label">Bricks loaded</p>
        <p class="doc-total-amount">${gatePass.bricksCount.toLocaleString("en-IN")}</p>
        <p class="doc-amount-words">${escapeHtml(categoryLabel)}</p>
      </div>
    </div>

    <table class="doc-table">
      <tr><td class="doc-table-label">Vehicle number</td><td class="doc-table-value">${escapeHtml(gatePass.vehicleNumber || "—")}</td></tr>
      <tr><td class="doc-table-label">Vehicle type</td><td class="doc-table-value">${escapeHtml(titleCase(gatePass.vehicleType) || "—")}</td></tr>
      <tr><td class="doc-table-label">Driver</td><td class="doc-table-value">${escapeHtml(gatePass.driverName || "—")}</td></tr>
      <tr><td class="doc-table-label">Driver mobile</td><td class="doc-table-value">${escapeHtml(gatePass.driverPhone || "—")}</td></tr>
      ${rows.length > 1 ? "" : `<tr><td class="doc-table-label">Brick type / grade</td><td class="doc-table-value">${escapeHtml(categoryLabel)}</td></tr>`}
      <tr><td class="doc-table-label">Bricks loaded</td><td class="doc-table-value">${gatePass.bricksCount.toLocaleString("en-IN")}</td></tr>
      ${gatePass.placeOfSupply ? `<tr><td class="doc-table-label">Place of supply</td><td class="doc-table-value">${escapeHtml(gatePass.placeOfSupply)}</td></tr>` : ""}
      ${gatePass.notes ? `<tr><td class="doc-table-label">Notes</td><td class="doc-table-value">${escapeHtml(gatePass.notes)}</td></tr>` : ""}
    </table>
    ${itemsTable}

    <p class="doc-digital-note">~ THIS IS A DIGITALLY CREATED GATE PASS ~</p>
    <div class="doc-sign-row">
      <div class="doc-sign-box">Gate / Chowkidar<br />(Stamp &amp; Signature)</div>
      <div class="doc-sign-box">Driver signature</div>
      <div class="doc-sign-box">Munim / Owner<br />(Stamp &amp; Signature)</div>
    </div>
  `;
  openPrintWindow(`Gate Pass ${number}`, body, GATE_PASS_ACCENT);
}

// e.g. "JVS Bricks" -> "JVS" — mirrors dispatch.service.ts's own
// kilnPrefix (used for slip numbers) exactly. Duplicated here rather than
// imported since this is frontend code and that one's a backend service
// function; kept in sync deliberately, same short pure rule either side.
function invoiceKilnPrefix(kilnName: string) {
  const firstWord = kilnName.trim().split(/\s+/)[0] ?? "";
  const alnum = firstWord.replace(/[^a-zA-Z0-9]/g, "").toUpperCase();
  return alnum || "KILN";
}

// The priced, GST-oriented commercial bill — its own editable/deletable
// record (see CreateInvoiceForm.tsx). Uses INVOICE_RECORD_ACCENT so it
// never looks like the delivery-note Challan above. `customerOverallDue`
// is the linked Customer's total remaining due AFTER this invoice/payment
// (i.e. already reflects it) — passed by callers that have a Customer
// loaded; omitted when printing an invoice with no linked Customer.
// `paymentStamp` is always shown — if the caller doesn't pass one (no
// Customer resolvable), it falls back to a status computed purely from
// this invoice's own paid/remaining amount.
export function printInvoiceRecord(invoice: Invoice, kiln: KilnPrintInfo, categories: BrickCategory[], customerOverallDue?: number, paymentStamp?: PaymentStamp, fallbackLabel = "—") {
  const logoLetter = kilnLogoLetter(kiln.name);
  // {kilnPrefix}/{session}/{sessionSerialNumber} (e.g. "JVS/26-27/04") once
  // an invoice has both (every invoice created after this feature shipped)
  // — falls back to the pre-existing INV-{sequenceNumber} format for any
  // older invoice being reprinted, so a historical reprint never breaks or
  // silently shows a wrong/missing number.
  const number =
    invoice.session && invoice.sessionSerialNumber != null
      ? `${invoiceKilnPrefix(kiln.name)}/${invoice.session}/${invoice.sessionSerialNumber}`
      : `INV-${invoice.sequenceNumber ?? "—"}`;
  const date = invoice.invoiceDate ?? invoice.createdAt;
  const gross = invoice.grossAmount ?? invoice.netAmount + (invoice.discountAmount ?? 0);
  const amountPaidNow = invoice.amountPaidNow ?? invoice.netAmount;
  const remainingOnThisInvoice = Math.max(0, Math.round((invoice.netAmount - amountPaidNow) * 100) / 100);
  const resolvedStamp: PaymentStamp = paymentStamp ?? (remainingOnThisInvoice <= 0 ? "PAID" : "PARTIAL");

  const rawRows = resolveItemRows(invoice.items, categories, {
    categoryId: invoice.categoryId,
    bricksCount: invoice.bricksCount,
    pricePerBrick: invoice.ratePerBrick,
    amount: gross,
  });
  // A bricksCount=0 "Add Amount" invoice (see AddCustomerPaymentModal) has
  // no real line item at all — falls back to one labeled placeholder row
  // showing the full gross rather than an empty items table.
  const rows = rawRows.length > 0 ? rawRows : [{ label: fallbackLabel, bricksCount: 0, amount: gross }];

  const itemRows = `
    ${rows
      .map((r, i) => {
        // Falls back to 0 (not `gross`) when a row has neither a stored
        // `amount` nor its own `pricePerBrick` — that only happens for a
        // genuinely price-less row within a real multi-item array (the
        // admin left that category's price blank), where `gross` would
        // wrongly duplicate the whole invoice's total onto one row. The
        // legitimate single-legacy-row case never hits this branch: its
        // `amount` is already set to `gross` by resolveItemRows's own
        // fallback parameter above.
        const rowAmount = r.amount ?? (r.pricePerBrick != null ? r.bricksCount * r.pricePerBrick : 0);
        return `
    <tr>
      <td>${String(i + 1).padStart(2, "0")}</td>
      <td>${escapeHtml(r.label)}</td>
      <td>${r.pricePerBrick ? `₹${r.pricePerBrick.toLocaleString("en-IN", { maximumFractionDigits: 2 })}/NOS` : "—"}</td>
      <td class="num">${r.bricksCount.toLocaleString("en-IN")}</td>
      <td class="num">₹${formatINR(rowAmount)}</td>
      <td class="num">₹${formatINR(rowAmount)}</td>
    </tr>`;
      })
      .join("")}
    ${
      invoice.discountAmount
        ? `<tr><td></td><td>Discount</td><td>—</td><td class="num">—</td><td class="num">—</td><td class="num">− ₹${formatINR(invoice.discountAmount)}</td></tr>`
        : ""
    }
  `;

  // GST breakdown — print-only (never touches netAmount/ledger math), and
  // entirely opt-in: the admin sets a rate directly on the invoice (see
  // CreateInvoiceForm.tsx), CGST+SGST for a same-state sale or the full
  // rate as IGST for an inter-state one. Computed on `invoice.netAmount`
  // (the existing post-discount figure) — "Amount Before Tax" in the
  // reference invoice book this replicates.
  const hasGst = invoice.gstRatePercent != null && invoice.gstRatePercent > 0;
  const gstRate = invoice.gstRatePercent ?? 0;
  const isIgst = invoice.gstType === "IGST";
  const cgstRate = isIgst ? 0 : gstRate / 2;
  const sgstRate = isIgst ? 0 : gstRate / 2;
  const igstRate = isIgst ? gstRate : 0;
  const cgstAmount = Math.round((invoice.netAmount * cgstRate) / 100 * 100) / 100;
  const sgstAmount = Math.round((invoice.netAmount * sgstRate) / 100 * 100) / 100;
  const igstAmount = Math.round((invoice.netAmount * igstRate) / 100 * 100) / 100;
  const totalAfterTax = Math.round((invoice.netAmount + cgstAmount + sgstAmount + igstAmount) * 100) / 100;
  const invoiceTotalRounded = Math.round(totalAfterTax);
  const hasBankDetails = !!(kiln.bankAccountNumber || kiln.bankName || kiln.bankIfscCode);

  const body = `
    <div class="doc-topbar"></div>
    <div class="doc-header">
      <div class="doc-brand">
        <span class="doc-logo">${escapeHtml(logoLetter)}</span>
        <div>
          <h1 class="doc-kiln-name">${escapeHtml(kiln.name)}</h1>
          ${kiln.location ? `<p class="doc-address">${escapeHtml(kiln.location)}</p>` : ""}
          ${kiln.phone ? `<p class="doc-phone">Phone: ${escapeHtml(kiln.phone)}</p>` : ""}
          ${kiln.gstNumber ? `<p class="doc-gst">GSTIN: ${escapeHtml(kiln.gstNumber)}</p>` : ""}
          ${kiln.gstNumber && kiln.stateCode ? `<p class="doc-gst">State Code: ${escapeHtml(kiln.stateCode)}</p>` : ""}
        </div>
      </div>
      <div class="doc-meta">
        <span class="doc-badge">${kiln.gstNumber ? "GST Invoice" : "Invoice"}</span>
        <p class="doc-number">${escapeHtml(number)}</p>
        <p class="doc-date">Invoice Date: ${new Date(date).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })}</p>
      </div>
    </div>

    <div class="doc-box">
      <div>
        <p class="doc-box-label">Bill and Ship To</p>
        <p class="doc-box-name">${escapeHtml(invoice.customerName)}</p>
        <p class="doc-box-detail">${escapeHtml(invoice.customerAddress || "—")}</p>
        <p class="doc-box-detail">Phone: ${escapeHtml(invoice.customerPhone || "—")}</p>
        ${invoice.customerGstNumber ? `<p class="doc-box-detail">GSTIN: ${escapeHtml(invoice.customerGstNumber)}</p>` : ""}
        ${invoice.customerStateCode ? `<p class="doc-box-detail">State Code: ${escapeHtml(invoice.customerStateCode)}</p>` : ""}
      </div>
      <div class="doc-totalbox">
        ${stampHtml(resolvedStamp)}
        <p class="doc-total-label">Total amount</p>
        <p class="doc-total-amount">₹${formatINR(invoice.netAmount)}</p>
        <p class="doc-amount-words">${escapeHtml(amountInWords(invoice.netAmount))}</p>
      </div>
    </div>

    <table class="doc-table">
      ${invoice.vehicleNumber ? `<tr><td class="doc-table-label">Vehicle number</td><td class="doc-table-value">${escapeHtml(invoice.vehicleNumber)}</td></tr>` : ""}
      ${invoice.paymentMode ? `<tr><td class="doc-table-label">Payment mode</td><td class="doc-table-value">${escapeHtml(paymentModeLabel(invoice))}</td></tr>` : ""}
      <tr><td class="doc-table-label">Amount paying now</td><td class="doc-table-value">₹${formatINR(amountPaidNow)}</td></tr>
      ${
        remainingOnThisInvoice > 0
          ? `<tr><td class="doc-table-label">Remaining on this invoice</td><td class="doc-table-value">₹${formatINR(remainingOnThisInvoice)}</td></tr>`
          : ""
      }
      ${
        customerOverallDue != null && customerOverallDue > 0
          ? `<tr><td class="doc-table-label">Customer's overall remaining due</td><td class="doc-table-value">₹${formatINR(customerOverallDue)}</td></tr>`
          : ""
      }
      ${invoice.placeOfSupply ? `<tr><td class="doc-table-label">Place of supply</td><td class="doc-table-value">${escapeHtml(invoice.placeOfSupply)}</td></tr>` : ""}
    </table>

    ${invoice.notes ? `<table class="doc-table"><tr><td class="doc-table-label">Notes</td><td class="doc-table-value">${escapeHtml(invoice.notes)}</td></tr></table>` : ""}

    <table class="doc-items">
      <thead>
        <tr><th>#</th><th>Item Details</th><th>Price/Unit</th><th class="num">Qty</th><th class="num">Rate</th><th class="num">Total</th></tr>
      </thead>
      <tbody>
        ${itemRows}
      </tbody>
      <tfoot>
        <tr><td colspan="3">Sub-total Amount</td><td class="num">${invoice.bricksCount.toLocaleString("en-IN")}</td><td class="num">₹${formatINR(gross)}</td><td class="num">₹${formatINR(invoice.netAmount)}</td></tr>
      </tfoot>
    </table>

    ${
      hasGst
        ? ""
        : `<div class="doc-footer-total">
      <span>Total amount</span>
      <span class="big">₹${formatINR(invoice.netAmount)}</span>
      <p class="doc-footer-words">${escapeHtml(amountInWords(invoice.netAmount))}</p>
    </div>`
    }

    ${
      hasGst
        ? `
    <table class="doc-gst-bottom"><tr>
      <td class="doc-gst-bottom-left">
        <p class="doc-words-label">Amount in Words</p>
        <p class="doc-words-value">${escapeHtml(amountInWords(invoice.netAmount))}</p>
        ${
          hasBankDetails
            ? `<div class="doc-bank-details">
                ${kiln.bankAccountNumber ? `<p>Bank Details: ${escapeHtml(kiln.name)}, A/c ${escapeHtml(kiln.bankAccountNumber)}</p>` : ""}
                ${kiln.bankName ? `<p>Bank Name: ${escapeHtml(kiln.bankName)}</p>` : ""}
                ${kiln.bankIfscCode ? `<p>Bank IFSC Code: ${escapeHtml(kiln.bankIfscCode)}</p>` : ""}
              </div>`
            : ""
        }
      </td>
      <td class="doc-gst-bottom-right">
      <table class="doc-tax-table">
        <tr><td>Amount Before Tax</td><td>₹${formatINR(invoice.netAmount)}</td></tr>
        <tr><td>Add: CGST @ ${cgstRate}%</td><td>₹${formatINR(cgstAmount)}</td></tr>
        <tr><td>Add: SGST @ ${sgstRate}%</td><td>₹${formatINR(sgstAmount)}</td></tr>
        <tr><td>Add: IGST @ ${igstRate}%</td><td>₹${formatINR(igstAmount)}</td></tr>
        <tr class="doc-tax-total"><td>Total Amount After Tax</td><td>₹${formatINR(totalAfterTax)}</td></tr>
        <tr class="doc-tax-total"><td>Invoice Total (Round off)</td><td>₹${invoiceTotalRounded.toLocaleString("en-IN")}</td></tr>
      </table>
      </td>
    </tr></table>
    <p class="doc-certify">Certified that the particulars given above are true &amp; correct</p>

    <table class="doc-terms-signature"><tr>
      <td class="doc-terms">
        ${
          invoice.termsAndConditions
            ? `<p class="doc-terms-title">Terms &amp; Conditions:</p>
              <p class="doc-terms-body">${escapeHtml(invoice.termsAndConditions)}</p>`
            : ""
        }
      </td>
      <td class="doc-signature-block">
        <p class="doc-for-kiln">For ${escapeHtml(kiln.name)}</p>
        ${kiln.signatureDataUri ? `<img class="doc-signature-img" src="${kiln.signatureDataUri}" alt="" />` : ""}
        <p>Authorised Signatory</p>
      </td>
    </tr></table>
    `
        : `
    <div class="doc-sign-row doc-sign-row-single">
      <div class="doc-sign-box">AUTHORISED SIGNATURE</div>
    </div>
    `
    }

    <p class="doc-thanks">Thank you for the business.</p>
    <p class="doc-digital-note">~ THIS IS A DIGITALLY CREATED INVOICE ~</p>
    <div class="doc-bottombar"></div>
  `;
  openPrintWindow(`Invoice ${number}`, body, INVOICE_RECORD_ACCENT);
}

// A payment receipt can be issued to anyone in the People directory, not
// just dispatch customers — so unlike printInvoice/printGatePass, this
// takes the recipient's name directly instead of reading it off a
// Dispatch. Same shared visual language (accent bars, colored recipient
// box with a PAID-style stamp, structured table, amount in words) as the
// Challan, in its own green accent so the two remain visually distinct.
export function printPaymentReceipt(receipt: PaymentReceipt, recipientName: string, kilnName: string) {
  const isAdvance = receipt.balanceAfter < 0;
  const balanceLabel = isAdvance ? "Advance outstanding" : "Remaining due";
  const logoLetter = kilnLogoLetter(kilnName);
  const isFullySettled = receipt.balanceAfter <= 0;

  const body = `
    <div class="doc-topbar"></div>
    <div class="doc-header">
      <div class="doc-brand">
        <span class="doc-logo">${escapeHtml(logoLetter)}</span>
        <div>
          <h1 class="doc-kiln-name">${escapeHtml(kilnName)}</h1>
        </div>
      </div>
      <div class="doc-meta">
        <span class="doc-badge">Payment Receipt</span>
        <p class="doc-number">${escapeHtml(receipt.receiptNumber)}</p>
        <p class="doc-date">${new Date(receipt.date).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })}</p>
      </div>
    </div>

    <div class="doc-box">
      <div>
        <p class="doc-box-label">Received from / Issued to</p>
        <p class="doc-box-name">${escapeHtml(recipientName)}</p>
        ${receipt.paymentMode ? `<p class="doc-box-detail">${escapeHtml(paymentModeLabel(receipt))}</p>` : ""}
      </div>
      <div class="doc-totalbox">
        ${isFullySettled ? stampHtml("PAID") : ""}
        <p class="doc-total-label">Amount paid</p>
        <p class="doc-total-amount">₹${formatINR(receipt.amountPaid)}</p>
        <p class="doc-amount-words">${escapeHtml(amountInWords(receipt.amountPaid))}</p>
      </div>
    </div>

    <table class="doc-table">
      ${
        receipt.totalAgreedAmount != null
          ? `<tr><td class="doc-table-label">Total agreed amount</td><td class="doc-table-value">₹${formatINR(receipt.totalAgreedAmount)}</td></tr>`
          : ""
      }
      <tr><td class="doc-table-label">Amount paid now</td><td class="doc-table-value">₹${formatINR(receipt.amountPaid)}</td></tr>
      <tr><td class="doc-table-label">${balanceLabel}</td><td class="doc-table-value">₹${formatINR(Math.abs(receipt.balanceAfter))}</td></tr>
      <tr><td class="doc-table-label">Notes</td><td class="doc-table-value">${receipt.notes ? escapeHtml(receipt.notes) : "—"}</td></tr>
    </table>

    <p class="doc-digital-note">~ THIS IS A DIGITALLY CREATED RECEIPT ~</p>
    <div class="doc-sign-row">
      <div class="doc-sign-box">Bhatta owner / Munim<br />(Stamp &amp; Signature)</div>
      <div class="doc-sign-box">Recipient signature</div>
    </div>
    <div class="doc-bottombar"></div>
  `;
  openPrintWindow(`Payment Receipt ${receipt.receiptNumber}`, body, RECEIPT_ACCENT);
}

const LEDGER_CATEGORY_LABELS: Record<string, string> = {
  WAGE: "Wage",
  COMMISSION: "Commission",
  SALARY: "Salary",
  TIP: "Tip",
  ADVANCE: "Advance",
  KHARCHI: "Kharchi",
  MEDICAL: "Medical",
  FESTIVAL: "Festival",
  SALE: "Sale",
  SOIL: "Soil",
  SAND: "Sand",
  FUEL: "Fuel",
  FARE: "Fare (Bhada)",
  OTHER: "Other",
};

// A single ledger row's own printout — for any person type, any category,
// either direction — unlike printPaymentReceipt (tied to the dedicated
// PaymentReceipt/Billing entity) this reads straight off the LedgerEntry
// every person's profile already lists, so any Advance/Kharchi/Salary/Wage
// line item on a Staff, Labour, Thekedar, etc. profile can be handed to the
// recipient as a paper slip. Same shared visual language as the other print
// documents in this file.
export function printLedgerEntry(entry: LedgerEntry, recipientName: string, kiln: KilnPrintInfo) {
  const logoLetter = kilnLogoLetter(kiln.name);
  const isPaid = entry.direction === "PAID";
  const categoryLabel = entry.category ? LEDGER_CATEGORY_LABELS[entry.category] ?? entry.category : "—";

  const body = `
    <div class="doc-topbar"></div>
    <div class="doc-header">
      <div class="doc-brand">
        <span class="doc-logo">${escapeHtml(logoLetter)}</span>
        <div>
          <h1 class="doc-kiln-name">${escapeHtml(kiln.name)}</h1>
          ${kiln.location ? `<p class="doc-address">${escapeHtml(kiln.location)}</p>` : ""}
          ${kiln.phone ? `<p class="doc-phone">Phone: ${escapeHtml(kiln.phone)}</p>` : ""}
        </div>
      </div>
      <div class="doc-meta">
        <span class="doc-badge">${isPaid ? "Payment Slip" : "Due Entry"}</span>
        <p class="doc-date">${new Date(entry.date).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })}</p>
      </div>
    </div>

    <div class="doc-box">
      <div>
        <p class="doc-box-label">${isPaid ? "Paid to" : "Due from / to"}</p>
        <p class="doc-box-name">${escapeHtml(recipientName)}</p>
        ${entry.paymentMode ? `<p class="doc-box-detail">${escapeHtml(paymentModeLabel(entry))}</p>` : ""}
      </div>
      <div class="doc-totalbox">
        <p class="doc-total-label">${isPaid ? "Amount paid" : "Amount due"}</p>
        <p class="doc-total-amount">₹${formatINR(entry.amount)}</p>
        <p class="doc-amount-words">${escapeHtml(amountInWords(entry.amount))}</p>
      </div>
    </div>

    <table class="doc-table">
      <tr><td class="doc-table-label">Category</td><td class="doc-table-value">${escapeHtml(categoryLabel)}</td></tr>
      <tr><td class="doc-table-label">Reason</td><td class="doc-table-value">${escapeHtml(entry.reason)}</td></tr>
    </table>

    <p class="doc-digital-note">~ THIS IS A DIGITALLY CREATED SLIP ~</p>
    <div class="doc-sign-row">
      <div class="doc-sign-box">Bhatta owner / Munim<br />(Stamp &amp; Signature)</div>
      <div class="doc-sign-box">Recipient signature</div>
    </div>
    <div class="doc-bottombar"></div>
  `;
  openPrintWindow(`${isPaid ? "Payment Slip" : "Due Entry"} — ${recipientName}`, body, RECEIPT_ACCENT);
}

// A Machine/Vehicle's own profile printout — purchase details plus its
// full installment payment history, so a paper copy carries the same
// payment-summary numbers the profile page itself shows.
export function printMachineRecord(machine: Machine, installments: MachineInstallmentPayment[], kiln: KilnPrintInfo, typeLabel: string) {
  const logoLetter = kilnLogoLetter(kiln.name);
  const remainingDue = machine.remainingDue ?? 0;

  const installmentRows = installments
    .map(
      (i, idx) => `
    <tr>
      <td>${idx + 1}</td>
      <td>${new Date(i.date).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })}</td>
      <td>${escapeHtml(i.notes || "—")}</td>
      <td class="num">₹${formatINR(i.amount)}</td>
    </tr>`
    )
    .join("");

  const body = `
    <div class="doc-topbar"></div>
    <div class="doc-header">
      <div class="doc-brand">
        <span class="doc-logo">${escapeHtml(logoLetter)}</span>
        <div>
          <h1 class="doc-kiln-name">${escapeHtml(kiln.name)}</h1>
          ${kiln.location ? `<p class="doc-address">${escapeHtml(kiln.location)}</p>` : ""}
          ${kiln.phone ? `<p class="doc-phone">Phone: ${escapeHtml(kiln.phone)}</p>` : ""}
        </div>
      </div>
      <div class="doc-meta">
        <span class="doc-badge">Machine / Vehicle Record</span>
        <p class="doc-number">${escapeHtml(machine.name)}</p>
        <p class="doc-date">${escapeHtml(typeLabel)}</p>
      </div>
    </div>

    <div class="doc-box">
      <div>
        <p class="doc-box-label">Purchased by</p>
        <p class="doc-box-name">${escapeHtml(machine.purchasedByName || "—")}</p>
        <p class="doc-box-detail">Phone: ${escapeHtml(machine.purchasedByPhone || "—")}</p>
      </div>
      <div class="doc-totalbox">
        <p class="doc-total-label">Remaining Due</p>
        <p class="doc-total-amount">₹${formatINR(remainingDue)}</p>
        <p class="doc-amount-words">Total Paid: ₹${formatINR(machine.totalPaid ?? 0)}</p>
      </div>
    </div>

    <table class="doc-table">
      <tr><td class="doc-table-label">Registration / identifier</td><td class="doc-table-value">${escapeHtml(machine.identifier || "—")}</td></tr>
      <tr><td class="doc-table-label">Date of purchase</td><td class="doc-table-value">${machine.purchaseDate ? new Date(machine.purchaseDate).toLocaleDateString("en-IN") : "—"}</td></tr>
      <tr><td class="doc-table-label">Price</td><td class="doc-table-value">${machine.price != null ? `₹${formatINR(machine.price)}` : "—"}</td></tr>
      <tr><td class="doc-table-label">Guarantee / warranty</td><td class="doc-table-value">${escapeHtml(machine.warrantyDetails || "—")}</td></tr>
      <tr><td class="doc-table-label">Installment tenure</td><td class="doc-table-value">${machine.tenureMonths ? `${machine.tenureMonths} months` : "—"}</td></tr>
      ${machine.notes ? `<tr><td class="doc-table-label">Notes</td><td class="doc-table-value">${escapeHtml(machine.notes)}</td></tr>` : ""}
    </table>

    ${
      installments.length > 0
        ? `<table class="doc-items">
            <thead><tr><th>#</th><th>Date</th><th>Notes</th><th class="num">Amount</th></tr></thead>
            <tbody>${installmentRows}</tbody>
            <tfoot><tr><td colspan="3">Total Paid</td><td class="num">₹${formatINR(machine.totalPaid ?? 0)}</td></tr></tfoot>
          </table>`
        : ""
    }

    <p class="doc-digital-note">~ THIS IS A DIGITALLY CREATED RECORD ~</p>
    <div class="doc-sign-row doc-sign-row-single">
      <div class="doc-sign-box">AUTHORISED SIGNATURE</div>
    </div>
    <div class="doc-bottombar"></div>
  `;
  openPrintWindow(`Machine — ${machine.name}`, body, DIESEL_ACCENT);
}

// A single Expense record's own printout, from the Expense feature's
// per-type detail/profile page (see expenseType.service.ts's paid/due
// model this mirrors — every expense is a pure payment, so "remaining due"
// here is the expense TYPE's own running due after this entry, not this
// entry's own).
export function printExpenseRecord(expense: Expense, expenseTypeName: string, kiln: KilnPrintInfo, dueAfter?: number) {
  const logoLetter = kilnLogoLetter(kiln.name);

  const body = `
    <div class="doc-topbar"></div>
    <div class="doc-header">
      <div class="doc-brand">
        <span class="doc-logo">${escapeHtml(logoLetter)}</span>
        <div>
          <h1 class="doc-kiln-name">${escapeHtml(kiln.name)}</h1>
          ${kiln.location ? `<p class="doc-address">${escapeHtml(kiln.location)}</p>` : ""}
          ${kiln.phone ? `<p class="doc-phone">Phone: ${escapeHtml(kiln.phone)}</p>` : ""}
        </div>
      </div>
      <div class="doc-meta">
        <span class="doc-badge">Expense</span>
        <p class="doc-date">${new Date(expense.date).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })}</p>
      </div>
    </div>

    <div class="doc-box">
      <div>
        <p class="doc-box-label">Expense type</p>
        <p class="doc-box-name">${escapeHtml(expenseTypeName)}</p>
        ${expense.paymentMode ? `<p class="doc-box-detail">${escapeHtml(paymentModeLabel(expense))}</p>` : ""}
      </div>
      <div class="doc-totalbox">
        <p class="doc-total-label">Amount paying</p>
        <p class="doc-total-amount">₹${formatINR(expense.amount)}</p>
        <p class="doc-amount-words">${escapeHtml(amountInWords(expense.amount))}</p>
      </div>
    </div>

    <table class="doc-table">
      ${expense.quantity != null ? `<tr><td class="doc-table-label">Quantity</td><td class="doc-table-value">${expense.quantity.toLocaleString("en-IN")}</td></tr>` : ""}
      <tr><td class="doc-table-label">Transaction date</td><td class="doc-table-value">${new Date(expense.date).toLocaleDateString("en-IN")}</td></tr>
      ${dueAfter != null ? `<tr><td class="doc-table-label">${expenseTypeName} — remaining due</td><td class="doc-table-value">₹${formatINR(Math.max(0, dueAfter))}</td></tr>` : ""}
      ${expense.notes ? `<tr><td class="doc-table-label">Notes</td><td class="doc-table-value">${escapeHtml(expense.notes)}</td></tr>` : ""}
    </table>

    <p class="doc-digital-note">~ THIS IS A DIGITALLY CREATED RECORD ~</p>
    <div class="doc-sign-row doc-sign-row-single">
      <div class="doc-sign-box">Bhatta owner / Munim<br />(Stamp &amp; Signature)</div>
    </div>
    <div class="doc-bottombar"></div>
  `;
  openPrintWindow(`Expense — ${expenseTypeName}`, body, EXPENSE_ACCENT);
}

// A single diesel fill-up record's own printout — from the Stock page's
// Diesel section or a driver's own Staff profile (both reuse this).
export function printDieselEntry(entry: VehicleDieselEntry, vehicleName: string, driverName: string | undefined, kiln: KilnPrintInfo) {
  const logoLetter = kilnLogoLetter(kiln.name);
  const distanceSinceLastFill =
    entry.initialMeterReading != null && entry.lastMeterReading != null
      ? Math.max(0, Math.round((entry.initialMeterReading - entry.lastMeterReading) * 100) / 100)
      : undefined;

  const body = `
    <div class="doc-topbar"></div>
    <div class="doc-header">
      <div class="doc-brand">
        <span class="doc-logo">${escapeHtml(logoLetter)}</span>
        <div>
          <h1 class="doc-kiln-name">${escapeHtml(kiln.name)}</h1>
          ${kiln.location ? `<p class="doc-address">${escapeHtml(kiln.location)}</p>` : ""}
          ${kiln.phone ? `<p class="doc-phone">Phone: ${escapeHtml(kiln.phone)}</p>` : ""}
        </div>
      </div>
      <div class="doc-meta">
        <span class="doc-badge">Diesel Fill-up</span>
        <p class="doc-date">${new Date(entry.date).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })}</p>
      </div>
    </div>

    <div class="doc-box">
      <div>
        <p class="doc-box-label">Vehicle</p>
        <p class="doc-box-name">${escapeHtml(vehicleName)}${entry.vehicleType ? ` (${escapeHtml(entry.vehicleType)})` : ""}</p>
        ${driverName ? `<p class="doc-box-detail">Driver: ${escapeHtml(driverName)}</p>` : ""}
      </div>
      <div class="doc-totalbox">
        <p class="doc-total-label">Quantity</p>
        <p class="doc-total-amount">${entry.quantityLiters.toLocaleString("en-IN")} L</p>
      </div>
    </div>

    <table class="doc-table">
      ${entry.initialMeterReading != null ? `<tr><td class="doc-table-label">Today's initial meter reading</td><td class="doc-table-value">${entry.initialMeterReading.toLocaleString("en-IN")}</td></tr>` : ""}
      ${entry.lastMeterReading != null ? `<tr><td class="doc-table-label">Today's last meter reading</td><td class="doc-table-value">${entry.lastMeterReading.toLocaleString("en-IN")}</td></tr>` : ""}
      ${distanceSinceLastFill != null ? `<tr><td class="doc-table-label">Distance since last fill</td><td class="doc-table-value">${distanceSinceLastFill.toLocaleString("en-IN")}</td></tr>` : ""}
      ${entry.costAmount != null ? `<tr><td class="doc-table-label">Cost</td><td class="doc-table-value">₹${formatINR(entry.costAmount)}</td></tr>` : ""}
      ${entry.notes ? `<tr><td class="doc-table-label">Notes</td><td class="doc-table-value">${escapeHtml(entry.notes)}</td></tr>` : ""}
    </table>

    <p class="doc-digital-note">~ THIS IS A DIGITALLY CREATED RECORD ~</p>
    <div class="doc-sign-row doc-sign-row-single">
      <div class="doc-sign-box">Bhatta owner / Munim<br />(Stamp &amp; Signature)</div>
    </div>
    <div class="doc-bottombar"></div>
  `;
  openPrintWindow(`Diesel Fill-up — ${vehicleName}`, body, DIESEL_ACCENT);
}

function contractRateBasisText(contract: SoilContract) {
  if (contract.rateType === "BOTH") {
    return `${contract.contractedAreaBigha ?? "—"} bigha + ${contract.contractedDepth ?? "—"} ${contract.depthUnit ?? "feet"}`;
  }
  if (contract.rateType === "PER_BIGHA") {
    return `${contract.contractedAreaBigha ?? "—"} bigha`;
  }
  if (contract.rateType === "PER_DEPTH") {
    return `${contract.contractedDepth ?? "—"} ${contract.depthUnit ?? "feet"}`;
  }
  return `${contract.contractedQuantity ?? "—"} trolleys`;
}

// The landowner contract "bill" — terms plus the payment log. The log
// intentionally shows only actual payments (direction PAID), not the
// underlying Advance/Kharchi ledger framing — just when each payment was
// made, how (payment mode), and the exact cash-vs-online breakdown when
// split, since that's what a landowner wants to see reflected back to them
// on a receipt-style printout, not internal ledger bookkeeping detail.
export function printLandownerContract(contract: SoilContract, landownerName: string, kiln: KilnPrintInfo, ledgerEntries: LedgerEntry[]) {
  const logoLetter = kilnLogoLetter(kiln.name);
  const payments = [...ledgerEntries]
    .filter((e) => e.direction === "PAID")
    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

  const runningDue = ledgerEntries.filter((e) => e.direction === "DUE").reduce((sum, e) => sum + e.amount, 0);
  const runningPaid = payments.reduce((sum, e) => sum + e.amount, 0);

  const rows = payments.map((entry) => {
    const isSplit = entry.paymentMode === "CASH_AND_ONLINE";
    return `
      <tr>
        <td>${new Date(entry.date).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })}</td>
        <td>${entry.paymentMode ? escapeHtml(entry.paymentMode) : "—"}</td>
        <td class="num">${isSplit ? `₹${formatINR(entry.cashAmount ?? 0)}` : entry.paymentMode === "CASH" ? `₹${formatINR(entry.amount)}` : "—"}</td>
        <td class="num">${isSplit ? `₹${formatINR(entry.onlineAmount ?? 0)}` : entry.paymentMode && entry.paymentMode !== "CASH" ? `₹${formatINR(entry.amount)}` : "—"}</td>
        <td class="num">₹${formatINR(entry.amount)}</td>
      </tr>`;
  });

  const finalRemaining = Math.max(0, runningDue - runningPaid);

  const body = `
    <div class="doc-topbar"></div>
    <div class="doc-header">
      <div class="doc-brand">
        <span class="doc-logo">${escapeHtml(logoLetter)}</span>
        <div>
          <h1 class="doc-kiln-name">${escapeHtml(kiln.name)}</h1>
          ${kiln.location ? `<p class="doc-address">${escapeHtml(kiln.location)}</p>` : ""}
          ${kiln.phone ? `<p class="doc-phone">Phone: ${escapeHtml(kiln.phone)}</p>` : ""}
        </div>
      </div>
      <div class="doc-meta">
        <span class="doc-badge">Land Contract</span>
        <p class="doc-number">${escapeHtml(contract.contractNumber)}</p>
        <p class="doc-date">Created: ${new Date(contract.startDate ?? Date.now()).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })}</p>
      </div>
    </div>

    <div class="doc-box">
      <div>
        <p class="doc-box-label">Landowner</p>
        <p class="doc-box-name">${escapeHtml(landownerName)}</p>
        <p class="doc-box-detail">${escapeHtml(contractRateBasisText(contract))}</p>
      </div>
      <div class="doc-totalbox">
        <p class="doc-total-label">Total contract amount</p>
        <p class="doc-total-amount">₹${formatINR(contract.totalContractValue)}</p>
        <p class="doc-amount-words">${escapeHtml(amountInWords(contract.totalContractValue))}</p>
      </div>
    </div>

    <table class="doc-table">
      <tr><td class="doc-table-label">Contract period</td><td class="doc-table-value">${contract.startDate ? new Date(contract.startDate).toLocaleDateString("en-IN") : "—"} to ${contract.endDate ? new Date(contract.endDate).toLocaleDateString("en-IN") : "—"}</td></tr>
      <tr><td class="doc-table-label">Advance paid</td><td class="doc-table-value">₹${formatINR(contract.advanceAmount ?? 0)}</td></tr>
      <tr><td class="doc-table-label">Remaining / due</td><td class="doc-table-value">₹${formatINR(finalRemaining)}</td></tr>
      <tr><td class="doc-table-label">Status</td><td class="doc-table-value">${escapeHtml(contract.status)}</td></tr>
    </table>

    <table class="doc-items">
      <thead>
        <tr><th>Payment date</th><th>Payment mode</th><th class="num">Cash</th><th class="num">Online</th><th class="num">Amount paid</th></tr>
      </thead>
      <tbody>
        ${rows.join("") || `<tr><td colspan="5">No payments recorded yet.</td></tr>`}
      </tbody>
    </table>

    <div class="doc-footer-total">
      <span>Remaining due</span>
      <span class="big">₹${formatINR(finalRemaining)}</span>
    </div>

    <p class="doc-digital-note">~ THIS IS A DIGITALLY CREATED CONTRACT STATEMENT ~</p>
    <div class="doc-sign-row">
      <div class="doc-sign-box">Bhatta owner / Munim<br />(Stamp &amp; Signature)</div>
      <div class="doc-sign-box">Landowner signature</div>
    </div>
    <div class="doc-bottombar"></div>
  `;
  openPrintWindow(`Land Contract ${contract.contractNumber}`, body, CONTRACT_ACCENT);
}

function sandContractRateBasisText(contract: SandContract) {
  if (contract.rateType === "PER_THOUSAND_BRICKS") return "Per 1000 bricks";
  return contract.contractedTrolleys != null ? `${contract.contractedTrolleys} trolleys` : "Per trolley";
}

// The sand contractor "bill" — same shape/intent as printLandownerContract:
// terms plus only the actual payment log (direction PAID), never the
// underlying Advance/Kharchi ledger framing.
export function printSandContract(contract: SandContract, contractorName: string, kiln: KilnPrintInfo, ledgerEntries: LedgerEntry[]) {
  const logoLetter = kilnLogoLetter(kiln.name);
  const payments = [...ledgerEntries]
    .filter((e) => e.direction === "PAID")
    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

  const runningDue = ledgerEntries.filter((e) => e.direction === "DUE").reduce((sum, e) => sum + e.amount, 0);
  const runningPaid = payments.reduce((sum, e) => sum + e.amount, 0);

  const rows = payments.map((entry) => {
    const isSplit = entry.paymentMode === "CASH_AND_ONLINE";
    return `
      <tr>
        <td>${new Date(entry.date).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })}</td>
        <td>${entry.paymentMode ? escapeHtml(entry.paymentMode) : "—"}</td>
        <td class="num">${isSplit ? `₹${formatINR(entry.cashAmount ?? 0)}` : entry.paymentMode === "CASH" ? `₹${formatINR(entry.amount)}` : "—"}</td>
        <td class="num">${isSplit ? `₹${formatINR(entry.onlineAmount ?? 0)}` : entry.paymentMode && entry.paymentMode !== "CASH" ? `₹${formatINR(entry.amount)}` : "—"}</td>
        <td class="num">₹${formatINR(entry.amount)}</td>
      </tr>`;
  });

  const finalRemaining = Math.max(0, runningDue - runningPaid);

  const body = `
    <div class="doc-topbar"></div>
    <div class="doc-header">
      <div class="doc-brand">
        <span class="doc-logo">${escapeHtml(logoLetter)}</span>
        <div>
          <h1 class="doc-kiln-name">${escapeHtml(kiln.name)}</h1>
          ${kiln.location ? `<p class="doc-address">${escapeHtml(kiln.location)}</p>` : ""}
          ${kiln.phone ? `<p class="doc-phone">Phone: ${escapeHtml(kiln.phone)}</p>` : ""}
        </div>
      </div>
      <div class="doc-meta">
        <span class="doc-badge">Sand Contract</span>
        <p class="doc-number">${escapeHtml(contract.contractNumber)}</p>
        <p class="doc-date">Created: ${new Date(contract.startDate ?? Date.now()).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })}</p>
      </div>
    </div>

    <div class="doc-box">
      <div>
        <p class="doc-box-label">Sand Contractor</p>
        <p class="doc-box-name">${escapeHtml(contractorName)}</p>
        <p class="doc-box-detail">${escapeHtml(sandContractRateBasisText(contract))}</p>
      </div>
      <div class="doc-totalbox">
        <p class="doc-total-label">Total contract amount</p>
        <p class="doc-total-amount">₹${formatINR(contract.totalContractValue)}</p>
        <p class="doc-amount-words">${escapeHtml(amountInWords(contract.totalContractValue))}</p>
      </div>
    </div>

    <table class="doc-table">
      <tr><td class="doc-table-label">Contract period</td><td class="doc-table-value">${contract.startDate ? new Date(contract.startDate).toLocaleDateString("en-IN") : "—"} to ${contract.endDate ? new Date(contract.endDate).toLocaleDateString("en-IN") : "—"}</td></tr>
      <tr><td class="doc-table-label">Advance paid</td><td class="doc-table-value">₹${formatINR(contract.advanceAmount ?? 0)}</td></tr>
      <tr><td class="doc-table-label">Remaining / due</td><td class="doc-table-value">₹${formatINR(finalRemaining)}</td></tr>
    </table>

    <table class="doc-items">
      <thead>
        <tr><th>Payment date</th><th>Payment mode</th><th class="num">Cash</th><th class="num">Online</th><th class="num">Amount paid</th></tr>
      </thead>
      <tbody>
        ${rows.join("") || `<tr><td colspan="5">No payments recorded yet.</td></tr>`}
      </tbody>
    </table>

    <div class="doc-footer-total">
      <span>Remaining due</span>
      <span class="big">₹${formatINR(finalRemaining)}</span>
    </div>

    <p class="doc-digital-note">~ THIS IS A DIGITALLY CREATED CONTRACT STATEMENT ~</p>
    <div class="doc-sign-row">
      <div class="doc-sign-box">Bhatta owner / Munim<br />(Stamp &amp; Signature)</div>
      <div class="doc-sign-box">Sand contractor signature</div>
    </div>
    <div class="doc-bottombar"></div>
  `;
  openPrintWindow(`Sand Contract ${contract.contractNumber}`, body, CONTRACT_ACCENT);
}

const REPORT_ACCENT = `:root { --doc-accent: #2f6f5e; --doc-accent-soft: #5fa38f; --doc-accent-tint: #eef7f4; }`;

export interface PrintableReportColumn {
  key: string;
  label: string;
  format: "date" | "currency" | "number" | "text";
}

function formatReportCell(value: string | number | null, format: PrintableReportColumn["format"]) {
  if (value == null || value === "") return "—";
  if (format === "date" && typeof value === "string") {
    return new Date(value).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
  }
  if (format === "currency" && typeof value === "number") return `₹${formatINR(value)}`;
  if (format === "number" && typeof value === "number") return value.toLocaleString("en-IN");
  return escapeHtml(String(value));
}

// A generic tabular report printout — variable columns/rows, unlike every
// other function in this file which prints one fixed-shape business
// document. Reuses the same table/box CSS classes as the rest of
// DOCUMENT_STYLES so it reads as part of the same visual family.
export function printReportTable(
  kiln: KilnPrintInfo,
  title: string,
  filterSummaryLines: string[],
  columns: PrintableReportColumn[],
  rows: Record<string, string | number | null>[],
  totals?: Record<string, number>
) {
  const logoLetter = kilnLogoLetter(kiln.name);
  const headerCells = columns.map((c) => `<th${c.format === "currency" || c.format === "number" ? ' class="num"' : ""}>${escapeHtml(c.label)}</th>`).join("");
  const bodyRows =
    rows
      .map((row) => `<tr>${columns.map((c) => `<td${c.format === "currency" || c.format === "number" ? ' class="num"' : ""}>${formatReportCell(row[c.key], c.format)}</td>`).join("")}</tr>`)
      .join("") || `<tr><td colspan="${columns.length}">No records for this filter.</td></tr>`;
  const totalsRow = totals
    ? `<tfoot><tr>${columns
        .map((c, i) => {
          if (i === 0) return `<td>Total</td>`;
          const v = totals[c.key];
          return `<td class="num">${v != null ? formatReportCell(v, c.format === "text" ? "number" : c.format) : ""}</td>`;
        })
        .join("")}</tr></tfoot>`
    : "";

  const body = `
    <div class="doc-topbar"></div>
    <div class="doc-header">
      <div class="doc-brand">
        <span class="doc-logo">${escapeHtml(logoLetter)}</span>
        <div>
          <h1 class="doc-kiln-name">${escapeHtml(kiln.name)}</h1>
          ${kiln.location ? `<p class="doc-address">${escapeHtml(kiln.location)}</p>` : ""}
        </div>
      </div>
      <div class="doc-meta">
        <span class="doc-badge">Report</span>
        <p class="doc-number">${escapeHtml(title)}</p>
        <p class="doc-date">Generated: ${new Date().toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })}</p>
      </div>
    </div>

    ${filterSummaryLines.length ? `<p class="doc-summary-line">${filterSummaryLines.map(escapeHtml).join(" &middot; ")}</p>` : ""}

    <table class="doc-items">
      <thead><tr>${headerCells}</tr></thead>
      <tbody>${bodyRows}</tbody>
      ${totalsRow}
    </table>

    <p class="doc-digital-note">~ THIS IS A DIGITALLY CREATED REPORT ~</p>
    <div class="doc-bottombar"></div>
  `;
  openPrintWindow(title, body, REPORT_ACCENT);
}
