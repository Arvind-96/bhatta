import { formatINR } from "@/lib/utils";
import { amountInWords } from "@/lib/numberToWords";
import type { Challan, Expense, GatePassRecord, Invoice, LedgerEntry, PaymentReceipt, SandContract, SoilContract, VehicleDieselEntry } from "@/types";

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
export function printChallanRecord(challan: Challan, kiln: KilnPrintInfo, categoryLabel: string) {
  const logoLetter = kilnLogoLetter(kiln.name);
  const number = `CH-${challan.sequenceNumber}`;
  const date = challan.challanDate ?? challan.createdAt;

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
      <tr><td class="doc-table-label">Vehicle type</td><td class="doc-table-value">${escapeHtml(challan.vehicleType || "—")}</td></tr>
      <tr><td class="doc-table-label">Driver</td><td class="doc-table-value">${escapeHtml(challan.driverName || "—")}</td></tr>
      <tr><td class="doc-table-label">Driver mobile</td><td class="doc-table-value">${escapeHtml(challan.driverPhone || "—")}</td></tr>
      <tr><td class="doc-table-label">Brick type / grade</td><td class="doc-table-value">${escapeHtml(categoryLabel)}</td></tr>
      ${challan.notes ? `<tr><td class="doc-table-label">Notes</td><td class="doc-table-value">${escapeHtml(challan.notes)}</td></tr>` : ""}
    </table>

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
export function printGatePassRecord(gatePass: GatePassRecord, kiln: KilnPrintInfo, categoryLabel: string) {
  const logoLetter = kilnLogoLetter(kiln.name);
  const number = `GP-${gatePass.sequenceNumber}`;
  const date = gatePass.gatePassDate ?? gatePass.createdAt;

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
      <tr><td class="doc-table-label">Vehicle type</td><td class="doc-table-value">${escapeHtml(gatePass.vehicleType || "—")}</td></tr>
      <tr><td class="doc-table-label">Driver</td><td class="doc-table-value">${escapeHtml(gatePass.driverName || "—")}</td></tr>
      <tr><td class="doc-table-label">Driver mobile</td><td class="doc-table-value">${escapeHtml(gatePass.driverPhone || "—")}</td></tr>
      <tr><td class="doc-table-label">Brick type / grade</td><td class="doc-table-value">${escapeHtml(categoryLabel)}</td></tr>
      <tr><td class="doc-table-label">Bricks loaded</td><td class="doc-table-value">${gatePass.bricksCount.toLocaleString("en-IN")}</td></tr>
      ${gatePass.notes ? `<tr><td class="doc-table-label">Notes</td><td class="doc-table-value">${escapeHtml(gatePass.notes)}</td></tr>` : ""}
    </table>

    <p class="doc-digital-note">~ THIS IS A DIGITALLY CREATED GATE PASS ~</p>
    <div class="doc-sign-row">
      <div class="doc-sign-box">Gate / Chowkidar<br />(Stamp &amp; Signature)</div>
      <div class="doc-sign-box">Driver signature</div>
      <div class="doc-sign-box">Munim / Owner<br />(Stamp &amp; Signature)</div>
    </div>
  `;
  openPrintWindow(`Gate Pass ${number}`, body, GATE_PASS_ACCENT);
}

// The priced, GST-oriented commercial bill — its own editable/deletable
// record (see CreateInvoiceForm.tsx). Uses INVOICE_RECORD_ACCENT so it
// never looks like the delivery-note Challan above. `customerOverallDue`
// is the linked Customer's total remaining due AFTER this invoice/payment
// (i.e. already reflects it) — passed by callers that have a Customer
// loaded (CreateInvoiceForm, AddCustomerPaymentModal); omitted when
// printing an invoice with no linked Customer.
export function printInvoiceRecord(invoice: Invoice, kiln: KilnPrintInfo, categoryLabel: string, customerOverallDue?: number) {
  const logoLetter = kilnLogoLetter(kiln.name);
  const number = `INV-${invoice.sequenceNumber}`;
  const date = invoice.invoiceDate ?? invoice.createdAt;
  const gross = invoice.grossAmount ?? invoice.netAmount + (invoice.discountAmount ?? 0);
  const amountPaidNow = invoice.amountPaidNow ?? invoice.netAmount;
  const remainingOnThisInvoice = Math.max(0, Math.round((invoice.netAmount - amountPaidNow) * 100) / 100);

  const itemRows = `
    <tr>
      <td>01</td>
      <td>${escapeHtml(categoryLabel)}</td>
      <td>${invoice.ratePerBrick ? `₹${invoice.ratePerBrick.toLocaleString("en-IN", { maximumFractionDigits: 2 })}/NOS` : "—"}</td>
      <td class="num">${invoice.bricksCount.toLocaleString("en-IN")}</td>
      <td class="num">₹${formatINR(gross)}</td>
      <td class="num">₹${formatINR(gross)}</td>
    </tr>
    ${
      invoice.discountAmount
        ? `<tr><td></td><td>Discount</td><td>—</td><td class="num">—</td><td class="num">—</td><td class="num">− ₹${formatINR(invoice.discountAmount)}</td></tr>`
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
        <span class="doc-badge">Invoice</span>
        <p class="doc-number">${escapeHtml(number)}</p>
        <p class="doc-date">Invoice Date: ${new Date(date).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })}</p>
        ${invoice.paymentMode ? `<p class="doc-summary-line">${escapeHtml(paymentModeLabel(invoice))}: ₹${formatINR(invoice.netAmount)}</p>` : ""}
      </div>
    </div>

    <div class="doc-box">
      <div>
        <p class="doc-box-label">Bill and Ship To</p>
        <p class="doc-box-name">${escapeHtml(invoice.customerName)}</p>
        <p class="doc-box-detail">${escapeHtml(invoice.customerAddress || "—")}</p>
        <p class="doc-box-detail">Phone: ${escapeHtml(invoice.customerPhone || "—")}</p>
        <p class="doc-box-detail">GSTIN: ${invoice.customerGstNumber ? escapeHtml(invoice.customerGstNumber) : ""}</p>
      </div>
      <div class="doc-totalbox">
        <p class="doc-total-label">Total amount</p>
        <p class="doc-total-amount">₹${formatINR(invoice.netAmount)}</p>
        <p class="doc-amount-words">${escapeHtml(amountInWords(invoice.netAmount))}</p>
      </div>
    </div>

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

    <div class="doc-footer-total">
      <span>Total amount</span>
      <span class="big">₹${formatINR(invoice.netAmount)}</span>
      <p class="doc-footer-words">${escapeHtml(amountInWords(invoice.netAmount))}</p>
    </div>

    <table class="doc-table">
      <tr><td class="doc-table-label">Amount paying now</td><td class="doc-table-value">₹${formatINR(amountPaidNow)}</td></tr>
      ${
        remainingOnThisInvoice > 0
          ? `<tr><td class="doc-table-label">Remaining on this invoice</td><td class="doc-table-value">₹${formatINR(remainingOnThisInvoice)}</td></tr>`
          : ""
      }
      ${
        customerOverallDue != null
          ? `<tr><td class="doc-table-label">Customer's overall remaining due</td><td class="doc-table-value">₹${formatINR(Math.abs(customerOverallDue))}</td></tr>`
          : ""
      }
    </table>

    ${invoice.notes ? `<table class="doc-table"><tr><td class="doc-table-label">Notes</td><td class="doc-table-value">${escapeHtml(invoice.notes)}</td></tr></table>` : ""}

    <p class="doc-digital-note">~ THIS IS A DIGITALLY CREATED INVOICE ~</p>
    <div class="doc-sign-row doc-sign-row-single">
      <div class="doc-sign-box">AUTHORISED SIGNATURE</div>
    </div>
    <p class="doc-thanks">Thank you for the business.</p>
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
      <tr><td class="doc-table-label">Entered on</td><td class="doc-table-value">${new Date(entry.createdAt).toLocaleString("en-IN")}</td></tr>
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
      <tr><td class="doc-table-label">System entry date</td><td class="doc-table-value">${new Date(expense.createdAt).toLocaleString("en-IN")}</td></tr>
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
      <tr><td class="doc-table-label">Entered on</td><td class="doc-table-value">${new Date(entry.createdAt).toLocaleString("en-IN")}</td></tr>
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
