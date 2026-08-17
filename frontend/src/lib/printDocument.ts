import { formatINR } from "@/lib/utils";
import { amountInWords } from "@/lib/numberToWords";
import type { Dispatch, PaymentReceipt } from "@/types";

// Gate Pass, Challan, and Payment Receipt all share one visual language
// (red accent bars, a logo mark, a colored "who this is for" box, a
// structured detail table, a signature row) so the three read as one
// consistent, professional paper trail instead of three differently
// designed printouts — even though Gate Pass/Challan print off the same
// Dispatch record and Payment Receipt off a different one. Each is opened
// as a real new window (not an in-page @media print block) so the SPA's
// own layout never bleeds into the printed page.
function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function personName(ref: { _id: string; name: string } | string | undefined) {
  if (!ref) return "";
  return typeof ref === "string" ? "" : ref.name;
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

const GRADE_LABELS: Record<string, string> = {
  A1: "A-1 Grade",
  JHAMA: "Jhama",
  PELA: "Pela / Seem",
};

// Prefer the free-form category+grade (e.g. "Second Class (A1)") when this
// dispatch is linked to one; fall back to the older fixed A1/JHAMA/PELA
// classification otherwise.
function categoryGradeLabel(dispatch: Dispatch) {
  const cat = dispatch.categoryId;
  if (cat && typeof cat === "object") {
    return cat.grade ? `${cat.category} (${cat.grade})` : cat.category;
  }
  return GRADE_LABELS[dispatch.grade] ?? dispatch.grade;
}

function customerAddress(ref: Dispatch["customerId"]) {
  return ref && typeof ref === "object" ? ref.address : undefined;
}

function customerPhone(ref: Dispatch["customerId"]) {
  return ref && typeof ref === "object" ? ref.phone : undefined;
}

function customerGstNumber(ref: Dispatch["customerId"]) {
  return ref && typeof ref === "object" ? ref.gstNumber : undefined;
}

function driverPhone(ref: Dispatch["driverId"]) {
  return ref && typeof ref === "object" ? ref.phone : undefined;
}

function kilnLogoLetter(kilnName: string) {
  return kilnName.trim().charAt(0).toUpperCase() || "B";
}

export interface KilnPrintInfo {
  name: string;
  location?: string;
  phone?: string;
  gstNumber?: string;
}

// Shared by all three documents — red accent bars top/bottom, a logo
// square + kiln header, a colored "who this is for" info box (with an
// optional stamp graphic and a big total), a colorful bordered/striped
// detail table (not the plain minimal table this app used to print), and
// a flexible signature row. `--doc-accent`/`--doc-accent-soft` are set per
// document type below so Gate Pass/Challan/Receipt each get their own
// distinct accent while sharing every other rule.
const DOCUMENT_STYLES = `
  .doc-topbar, .doc-bottombar { height: 7px; background: linear-gradient(90deg, var(--doc-accent), var(--doc-accent-soft)); margin: -32px -32px 20px; }
  .doc-bottombar { margin: 24px -32px -32px; }
  .doc-header { display: flex; justify-content: space-between; align-items: flex-start; gap: 16px; }
  .doc-brand { display: flex; gap: 10px; align-items: flex-start; }
  .doc-logo { display: flex; align-items: center; justify-content: center; width: 30px; height: 30px; border-radius: 6px; background: var(--doc-accent); color: #fff; font-weight: 800; font-size: 17px; flex-shrink: 0; box-shadow: 0 2px 6px color-mix(in srgb, var(--doc-accent) 45%, transparent); }
  .doc-kiln-name { font-size: 23px; font-weight: 800; margin: 0 0 2px; color: #1a1a1a; }
  .doc-address { font-size: 13px; color: #444; margin: 0; line-height: 1.4; }
  .doc-phone { font-size: 13px; color: #444; font-style: italic; margin: 4px 0 0; }
  .doc-gst { font-size: 13px; color: #444; margin: 2px 0 0; }
  .doc-meta { text-align: right; }
  .doc-badge { display: inline-block; padding: 4px 12px; border-radius: 999px; background: var(--doc-accent); color: #fff; font-size: 12px; font-weight: 800; letter-spacing: 0.06em; text-transform: uppercase; margin-bottom: 6px; }
  .doc-number { font-size: 21px; font-weight: 800; margin: 0 0 4px; color: #1a1a1a; }
  .doc-date, .doc-summary-line { font-size: 13px; color: #444; margin: 2px 0; }
  .doc-box { display: flex; justify-content: space-between; gap: 16px; margin-top: 20px; padding: 16px; border: 1px solid color-mix(in srgb, var(--doc-accent) 35%, #eee); border-radius: 12px; background: var(--doc-accent-tint); }
  .doc-box-label { font-size: 12px; color: #8a8a8a; text-transform: uppercase; letter-spacing: 0.05em; margin: 0 0 4px; }
  .doc-box-name { font-size: 16px; font-weight: 700; margin: 0; color: #1a1a1a; }
  .doc-box-detail { font-size: 13px; color: #444; margin: 2px 0 0; }
  .doc-totalbox { text-align: right; position: relative; min-width: 150px; }
  .doc-total-label { font-size: 13px; color: #444; margin: 0; }
  .doc-total-amount { font-size: 24px; font-weight: 800; margin: 2px 0; color: var(--doc-accent); }
  .doc-amount-words { font-size: 12px; font-style: italic; color: #666; margin: 0; }
  .doc-stamp { position: absolute; top: -10px; left: -12px; width: 66px; height: 66px; border-radius: 50%; border: 2.5px dashed #1f8a4c; color: #1f8a4c; display: flex; flex-direction: column; align-items: center; justify-content: center; transform: rotate(-14deg); font-weight: 800; text-align: center; line-height: 1.1; }
  .doc-stamp span:first-child { font-size: 8px; letter-spacing: 0.5px; }
  .doc-stamp span:last-child { font-size: 12px; }
  table.doc-table { width: 100%; border-collapse: separate; border-spacing: 0; margin-top: 18px; border: 1px solid #e5e0d8; border-radius: 10px; overflow: hidden; }
  table.doc-table td { padding: 9px 12px; font-size: 13.5px; border-bottom: 1px solid #efece5; }
  table.doc-table tr:last-child td { border-bottom: none; }
  table.doc-table tr:nth-child(even) { background: var(--doc-accent-tint); }
  table.doc-table td.doc-table-label { color: #777; width: 42%; }
  table.doc-table td.doc-table-value { font-weight: 600; color: #1a1a1a; }
  table.doc-items { width: 100%; border-collapse: collapse; margin-top: 18px; }
  table.doc-items th { background: var(--doc-accent); color: #fff; padding: 9px 8px; text-align: left; font-size: 11px; text-transform: uppercase; letter-spacing: 0.04em; }
  table.doc-items th:first-child { border-top-left-radius: 8px; }
  table.doc-items th:last-child { border-top-right-radius: 8px; }
  table.doc-items td { padding: 9px 8px; border-bottom: 1px solid #eee; font-size: 13.5px; }
  table.doc-items td.num, table.doc-items th.num { text-align: right; }
  table.doc-items tfoot td { font-weight: 700; border-top: 2px solid var(--doc-accent); border-bottom: none; }
  .doc-footer-total { text-align: right; margin-top: 18px; }
  .doc-footer-total .big { font-size: 24px; font-weight: 800; display: block; color: var(--doc-accent); }
  .doc-footer-words { text-align: right; font-size: 13px; font-style: italic; color: #666; margin: 2px 0 0; }
  .doc-digital-note { text-align: center; font-size: 12px; color: #888; margin-top: 26px; letter-spacing: 0.03em; }
  .doc-sign-row { margin-top: 34px; display: flex; justify-content: space-between; gap: 12px; }
  .doc-sign-row.doc-sign-row-single { justify-content: flex-end; }
  .doc-sign-box { flex: 1; text-align: center; border-top: 1.5px solid #bbb; padding-top: 6px; font-size: 12px; color: #555; font-weight: 600; }
  .doc-sign-row-single .doc-sign-box { flex: none; width: 220px; }
  .doc-thanks { font-size: 13px; color: #444; margin-top: 22px; text-align: center; }
  @media print { .doc-topbar, .doc-bottombar { -webkit-print-color-adjust: exact; print-color-adjust: exact; } table.doc-items th { -webkit-print-color-adjust: exact; print-color-adjust: exact; } table.doc-table tr:nth-child(even) { -webkit-print-color-adjust: exact; print-color-adjust: exact; } .doc-box { -webkit-print-color-adjust: exact; print-color-adjust: exact; } }
`;

const GATE_PASS_ACCENT = `:root { --doc-accent: #b8541f; --doc-accent-soft: #e08a3e; --doc-accent-tint: #fdf3ea; }`;
const CHALLAN_ACCENT = `:root { --doc-accent: #c0392b; --doc-accent-soft: #e0705f; --doc-accent-tint: #fdf6ee; }`;
const RECEIPT_ACCENT = `:root { --doc-accent: #1f7a4d; --doc-accent-soft: #4fae7c; --doc-accent-tint: #f0f8f3; }`;

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

// Exit-authorization slip — what the driver physically carries out of the
// yard. Every field the client asked for is a mandatory, always-shown row
// (never conditionally hidden) since a gate guard needs one consistent
// checklist regardless of which fields happen to be filled in.
export function printGatePass(dispatch: Dispatch, kiln: KilnPrintInfo) {
  const driver = personName(dispatch.driverId);
  const driverPh = driverPhone(dispatch.driverId);
  const clientAddress = customerAddress(dispatch.customerId);
  const clientPhone = customerPhone(dispatch.customerId);
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
          ${kiln.gstNumber ? `<p class="doc-gst">GSTIN: ${escapeHtml(kiln.gstNumber)}</p>` : ""}
        </div>
      </div>
      <div class="doc-meta">
        <span class="doc-badge">Gate Pass</span>
        <p class="doc-number">${escapeHtml(dispatch.slipNumber)}</p>
        <p class="doc-date">${new Date(dispatch.dispatchedOn).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })}</p>
        <p class="doc-date">Printed: ${new Date().toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })}</p>
      </div>
    </div>

    <div class="doc-box">
      <div>
        <p class="doc-box-label">Issued to (vehicle owner / customer)</p>
        <p class="doc-box-name">${escapeHtml(dispatch.customerName)}</p>
        <p class="doc-box-detail">${escapeHtml(clientAddress || "—")}</p>
        <p class="doc-box-detail">Phone: ${escapeHtml(clientPhone || "—")}</p>
      </div>
      <div class="doc-totalbox">
        <p class="doc-total-label">Bricks loaded</p>
        <p class="doc-total-amount">${dispatch.bricksCount.toLocaleString("en-IN")}</p>
        <p class="doc-amount-words">${escapeHtml(categoryGradeLabel(dispatch))}</p>
      </div>
    </div>

    <table class="doc-table">
      <tr><td class="doc-table-label">Vehicle number</td><td class="doc-table-value">${escapeHtml(dispatch.vehicleNumber || "—")}</td></tr>
      <tr><td class="doc-table-label">Vehicle type</td><td class="doc-table-value">${escapeHtml(dispatch.vehicleType || "—")}</td></tr>
      <tr><td class="doc-table-label">Driver</td><td class="doc-table-value">${escapeHtml(driver || "—")}</td></tr>
      <tr><td class="doc-table-label">Driver mobile</td><td class="doc-table-value">${escapeHtml(driverPh || "—")}</td></tr>
      <tr><td class="doc-table-label">Driver tip / inaam</td><td class="doc-table-value">${dispatch.driverTipAmount ? `₹${formatINR(dispatch.driverTipAmount)}` : "—"}</td></tr>
      <tr><td class="doc-table-label">Brick type / grade</td><td class="doc-table-value">${escapeHtml(categoryGradeLabel(dispatch))}</td></tr>
      <tr><td class="doc-table-label">Bricks loaded</td><td class="doc-table-value">${dispatch.bricksCount.toLocaleString("en-IN")}</td></tr>
      <tr><td class="doc-table-label">Transport cost</td><td class="doc-table-value">${dispatch.transportCost ? `₹${formatINR(dispatch.transportCost)} (paid by ${escapeHtml(dispatch.transportPaidBy ?? "—")})` : "—"}</td></tr>
    </table>

    <p class="doc-digital-note">~ THIS IS A DIGITALLY CREATED GATE PASS ~</p>
    <div class="doc-sign-row">
      <div class="doc-sign-box">Gate / Chowkidar<br />(Stamp &amp; Signature)</div>
      <div class="doc-sign-box">Driver signature</div>
      <div class="doc-sign-box">Munim / Owner<br />(Stamp &amp; Signature)</div>
    </div>
  `;
  openPrintWindow(`Gate Pass ${dispatch.slipNumber}`, body, GATE_PASS_ACCENT);
}

// Billing/delivery document — matches the kiln's own real paper invoice
// format (client-supplied sample): red accent bars, a "Bill and Ship To"
// box with a live account-balance figure, an item table, and the amount
// spelled out in words. Discount and transport-cost rows are additive
// extras beyond the sample (that particular invoice had neither) — they
// only appear when actually set, so a plain sale still prints exactly
// like the sample. Vehicle/driver/tip are mandatory, always-shown rows.
// `accountBalance` is the customer's current ledger balance (positive =
// still due, negative = advance held), fetched live by the caller right
// before printing.
export function printInvoice(dispatch: Dispatch, kiln: KilnPrintInfo, accountBalance?: number) {
  const discount = dispatch.discountAmount ?? 0;
  const netAmount = dispatch.amount;
  const grossAmount = netAmount + discount;
  const rate = dispatch.bricksCount > 0 ? grossAmount / dispatch.bricksCount : 0;
  const clientAddress = customerAddress(dispatch.customerId);
  const clientPhone = customerPhone(dispatch.customerId);
  const clientGst = customerGstNumber(dispatch.customerId);
  const isFullyPaid = accountBalance != null && accountBalance <= 0;
  const logoLetter = kilnLogoLetter(kiln.name);
  const driver = personName(dispatch.driverId);
  const driverPh = driverPhone(dispatch.driverId);

  const itemRows = `
    <tr>
      <td>01</td>
      <td>${escapeHtml(categoryGradeLabel(dispatch))}</td>
      <td>₹${rate.toLocaleString("en-IN", { maximumFractionDigits: 2 })}/NOS</td>
      <td class="num">${dispatch.bricksCount.toLocaleString("en-IN")}</td>
      <td class="num">₹${formatINR(grossAmount)}</td>
      <td class="num">₹${formatINR(grossAmount)}</td>
    </tr>
    ${
      discount > 0
        ? `<tr><td></td><td>Discount</td><td>—</td><td class="num">—</td><td class="num">—</td><td class="num">− ₹${formatINR(discount)}</td></tr>`
        : ""
    }
    ${
      dispatch.transportCost
        ? `<tr><td></td><td>Transport (paid by ${escapeHtml(dispatch.transportPaidBy ?? "—")})</td><td>—</td><td class="num">—</td><td class="num">—</td><td class="num">₹${formatINR(dispatch.transportCost)}</td></tr>`
        : ""
    }
  `;

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
        </div>
      </div>
      <div class="doc-meta">
        <span class="doc-badge">Challan</span>
        <p class="doc-number">Invoice No.${escapeHtml(dispatch.invoiceNumber ?? dispatch.slipNumber)}</p>
        <p class="doc-date">Invoice Date: ${new Date(dispatch.dispatchedOn).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })}</p>
        <p class="doc-summary-line">${escapeHtml(paymentModeLabel(dispatch))}: ₹${formatINR(netAmount)}</p>
      </div>
    </div>

    <div class="doc-box">
      <div>
        <p class="doc-box-label">Bill and Ship To</p>
        <p class="doc-box-name">${escapeHtml(dispatch.customerName)}</p>
        <p class="doc-box-detail">${escapeHtml(clientAddress || "—")}</p>
        <p class="doc-box-detail">Phone: ${escapeHtml(clientPhone || "—")}</p>
        <p class="doc-box-detail">GSTIN: ${clientGst ? escapeHtml(clientGst) : ""}</p>
      </div>
      <div class="doc-totalbox">
        ${isFullyPaid ? `<div class="doc-stamp"><span>THANK YOU</span><span>PAID</span></div>` : ""}
        <p class="doc-total-label">Total amount</p>
        <p class="doc-total-amount">₹${formatINR(netAmount)}</p>
        <p class="doc-amount-words">${escapeHtml(amountInWords(netAmount))}</p>
      </div>
    </div>

    <table class="doc-table">
      <tr><td class="doc-table-label">Vehicle number</td><td class="doc-table-value">${escapeHtml(dispatch.vehicleNumber || "—")}</td></tr>
      <tr><td class="doc-table-label">Vehicle type</td><td class="doc-table-value">${escapeHtml(dispatch.vehicleType || "—")}</td></tr>
      <tr><td class="doc-table-label">Driver</td><td class="doc-table-value">${escapeHtml(driver || "—")}</td></tr>
      <tr><td class="doc-table-label">Driver mobile</td><td class="doc-table-value">${escapeHtml(driverPh || "—")}</td></tr>
      <tr><td class="doc-table-label">Driver tip / inaam</td><td class="doc-table-value">${dispatch.driverTipAmount ? `₹${formatINR(dispatch.driverTipAmount)}` : "—"}</td></tr>
    </table>

    <table class="doc-items">
      <thead>
        <tr><th>#</th><th>Item Details</th><th>Price/Unit</th><th class="num">Qty</th><th class="num">Rate</th><th class="num">Total</th></tr>
      </thead>
      <tbody>
        ${itemRows}
      </tbody>
      <tfoot>
        <tr><td colspan="3">Sub-total Amount</td><td class="num">${dispatch.bricksCount.toLocaleString("en-IN")}</td><td class="num">₹${formatINR(grossAmount)}</td><td class="num">₹${formatINR(netAmount)}</td></tr>
      </tfoot>
    </table>

    <div class="doc-footer-total">
      <span>Total amount</span>
      <span class="big">₹${formatINR(netAmount)}</span>
      <p class="doc-footer-words">${escapeHtml(amountInWords(netAmount))}</p>
    </div>

    ${
      accountBalance != null
        ? `<table class="doc-table">
            <tr><td class="doc-table-label">${accountBalance >= 0 ? "Remaining due (account balance)" : "Advance held (account balance)"}</td><td class="doc-table-value">₹${formatINR(Math.abs(accountBalance))}</td></tr>
          </table>`
        : ""
    }

    <p class="doc-digital-note">~ THIS IS A DIGITALLY CREATED INVOICE ~</p>
    <div class="doc-sign-row doc-sign-row-single">
      <div class="doc-sign-box">AUTHORISED SIGNATURE</div>
    </div>
    <p class="doc-thanks">Thank you for the business.</p>
    <div class="doc-bottombar"></div>
  `;
  openPrintWindow(`Invoice ${dispatch.invoiceNumber ?? dispatch.slipNumber}`, body, CHALLAN_ACCENT);
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
        ${isFullySettled ? `<div class="doc-stamp"><span>THANK YOU</span><span>PAID</span></div>` : ""}
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
