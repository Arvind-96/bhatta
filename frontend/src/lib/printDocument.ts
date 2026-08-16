import { formatINR } from "@/lib/utils";
import type { Dispatch, PaymentReceipt } from "@/types";

// Both Gate Pass/Challan and Billing/Invoice print off the exact same
// Dispatch record — the vehicle-loaded-and-left event only happens once,
// so there's one source of truth for quantity/customer/amount and two
// different paper formats printed from it. Opened as a real new window
// (not an in-page @media print block) so the SPA's own layout never
// bleeds into the printed page.
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

function driverPhone(ref: Dispatch["driverId"]) {
  return ref && typeof ref === "object" ? ref.phone : undefined;
}

export interface KilnPrintInfo {
  name: string;
  location?: string;
  phone?: string;
  gstNumber?: string;
}

function openPrintWindow(title: string, bodyHtml: string) {
  const html = `<!doctype html>
<html>
<head>
<meta charset="utf-8" />
<title>${escapeHtml(title)}</title>
<style>
  * { box-sizing: border-box; }
  body { font-family: -apple-system, Segoe UI, Roboto, Arial, sans-serif; color: #1a1a1a; padding: 32px; max-width: 700px; margin: 0 auto; }
  h1 { font-size: 20px; margin: 0 0 4px; }
  .muted { color: #666; font-size: 13px; }
  .row { display: flex; justify-content: space-between; margin-top: 24px; padding-bottom: 12px; border-bottom: 2px solid #1a1a1a; }
  table { width: 100%; border-collapse: collapse; margin-top: 20px; }
  td, th { padding: 8px 4px; text-align: left; border-bottom: 1px solid #ddd; font-size: 14px; }
  th { color: #666; font-weight: 600; font-size: 12px; text-transform: uppercase; }
  .label { color: #666; font-size: 12px; }
  .value { font-size: 14px; font-weight: 500; }
  .amount { font-size: 22px; font-weight: 700; margin-top: 16px; text-align: right; }
  .footer { margin-top: 40px; display: flex; justify-content: space-between; font-size: 13px; }
  .sign { border-top: 1px solid #999; padding-top: 6px; width: 160px; text-align: center; color: #666; }
  @media print { body { padding: 0; } }
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
// yard. Focused on what a gate guard needs to check (vehicle, driver,
// bricks, quantity), not billing detail — that's the Challan's job.
export function printGatePass(dispatch: Dispatch, kiln: KilnPrintInfo) {
  const driver = personName(dispatch.driverId);
  const driverPh = driverPhone(dispatch.driverId);
  const clientAddress = customerAddress(dispatch.customerId);
  const body = `
    <div class="row">
      <div>
        <h1>Gate Pass</h1>
        <p class="muted">${escapeHtml(kiln.name)}</p>
        ${kiln.location ? `<p class="muted">${escapeHtml(kiln.location)}</p>` : ""}
        ${kiln.phone ? `<p class="muted">Ph: ${escapeHtml(kiln.phone)}</p>` : ""}
        ${kiln.gstNumber ? `<p class="muted">GSTIN: ${escapeHtml(kiln.gstNumber)}</p>` : ""}
      </div>
      <div style="text-align:right">
        <p class="value">${escapeHtml(dispatch.slipNumber)}</p>
        <p class="muted">${new Date(dispatch.dispatchedOn).toLocaleDateString("en-IN")}</p>
        <p class="muted">Printed: ${new Date().toLocaleDateString("en-IN")}</p>
      </div>
    </div>
    <table>
      <tr><td class="label">Issued to (vehicle owner / customer)</td><td class="value">${escapeHtml(dispatch.customerName)}</td></tr>
      ${clientAddress ? `<tr><td class="label">Client address</td><td class="value">${escapeHtml(clientAddress)}</td></tr>` : ""}
      <tr><td class="label">Vehicle number</td><td class="value">${escapeHtml(dispatch.vehicleNumber || "—")}</td></tr>
      <tr><td class="label">Vehicle type</td><td class="value">${escapeHtml(dispatch.vehicleType || "—")}</td></tr>
      <tr><td class="label">Driver</td><td class="value">${escapeHtml(driver || "—")}</td></tr>
      <tr><td class="label">Driver mobile</td><td class="value">${escapeHtml(driverPh || "—")}</td></tr>
      <tr><td class="label">Brick type / grade</td><td class="value">${escapeHtml(categoryGradeLabel(dispatch))}</td></tr>
      <tr><td class="label">Bricks loaded</td><td class="value">${dispatch.bricksCount.toLocaleString("en-IN")}</td></tr>
      ${dispatch.driverTipAmount ? `<tr><td class="label">Driver tip / inaam</td><td class="value">₹${formatINR(dispatch.driverTipAmount)}</td></tr>` : ""}
      ${dispatch.transportCost ? `<tr><td class="label">Transport cost</td><td class="value">₹${formatINR(dispatch.transportCost)} (paid by ${escapeHtml(dispatch.transportPaidBy ?? "—")})</td></tr>` : ""}
    </table>
    <div class="footer">
      <div class="sign">Gate / Chowkidar<br />(Stamp &amp; Signature)</div>
      <div class="sign">Driver signature</div>
      <div class="sign">Munim / Owner<br />(Stamp &amp; Signature)</div>
    </div>
  `;
  openPrintWindow(`Gate Pass ${dispatch.slipNumber}`, body);
}

// Billing/delivery document — the customer's copy of what they owe and
// what's been settled so far. `accountBalance` is the customer's current
// ledger balance (positive = still due to the kiln, negative = advance the
// kiln is holding), fetched live by the caller right before printing so the
// figure is never stale.
export function printInvoice(dispatch: Dispatch, kiln: KilnPrintInfo, accountBalance?: number) {
  const discount = dispatch.discountAmount ?? 0;
  const netAmount = dispatch.amount;
  const grossAmount = netAmount + discount;
  const rate = dispatch.bricksCount > 0 ? grossAmount / dispatch.bricksCount : 0;
  const clientAddress = customerAddress(dispatch.customerId);
  const driver = personName(dispatch.driverId);
  const driverPh = driverPhone(dispatch.driverId);
  const body = `
    <div class="row">
      <div>
        <h1>Challan</h1>
        <p class="muted">${escapeHtml(kiln.name)}</p>
        ${kiln.location ? `<p class="muted">${escapeHtml(kiln.location)}</p>` : ""}
        ${kiln.phone ? `<p class="muted">Ph: ${escapeHtml(kiln.phone)}</p>` : ""}
        ${kiln.gstNumber ? `<p class="muted">GSTIN: ${escapeHtml(kiln.gstNumber)}</p>` : ""}
      </div>
      <div style="text-align:right">
        <p class="value">${escapeHtml(dispatch.invoiceNumber ?? dispatch.slipNumber)}</p>
        <p class="muted">${new Date(dispatch.dispatchedOn).toLocaleDateString("en-IN")}</p>
        <p class="muted">Printed: ${new Date().toLocaleDateString("en-IN")}</p>
      </div>
    </div>
    <table>
      <tr><td class="label">Billed to</td><td class="value">${escapeHtml(dispatch.customerName)}</td></tr>
      ${clientAddress ? `<tr><td class="label">Client address</td><td class="value">${escapeHtml(clientAddress)}</td></tr>` : ""}
      <tr><td class="label">Payment mode</td><td class="value">${escapeHtml(paymentModeLabel(dispatch))}</td></tr>
      ${dispatch.vehicleNumber ? `<tr><td class="label">Vehicle number</td><td class="value">${escapeHtml(dispatch.vehicleNumber)}</td></tr>` : ""}
      ${dispatch.vehicleType ? `<tr><td class="label">Vehicle type</td><td class="value">${escapeHtml(dispatch.vehicleType)}</td></tr>` : ""}
      ${driver ? `<tr><td class="label">Driver</td><td class="value">${escapeHtml(driver)}</td></tr>` : ""}
      ${driverPh ? `<tr><td class="label">Driver mobile</td><td class="value">${escapeHtml(driverPh)}</td></tr>` : ""}
      ${dispatch.driverTipAmount ? `<tr><td class="label">Driver tip / inaam</td><td class="value">₹${formatINR(dispatch.driverTipAmount)}</td></tr>` : ""}
    </table>
    <table>
      <thead>
        <tr><th>Description</th><th>Qty</th><th>Rate</th><th style="text-align:right">Amount</th></tr>
      </thead>
      <tbody>
        <tr>
          <td>Bricks (${escapeHtml(categoryGradeLabel(dispatch))})</td>
          <td>${dispatch.bricksCount.toLocaleString("en-IN")}</td>
          <td>₹${rate.toLocaleString("en-IN", { maximumFractionDigits: 2 })}</td>
          <td style="text-align:right">₹${formatINR(grossAmount)}</td>
        </tr>
        ${
          discount > 0
            ? `<tr><td>Discount</td><td>—</td><td>—</td><td style="text-align:right">− ₹${formatINR(discount)}</td></tr>`
            : ""
        }
        ${
          dispatch.transportCost
            ? `<tr><td>Transport (paid by ${escapeHtml(dispatch.transportPaidBy ?? "—")})</td><td>—</td><td>—</td><td style="text-align:right">₹${formatINR(dispatch.transportCost)}</td></tr>`
            : ""
        }
      </tbody>
    </table>
    <p class="amount">Total: ₹${formatINR(netAmount)}</p>
    ${
      accountBalance != null
        ? `<table>
            <tr><td class="label">${accountBalance >= 0 ? "Remaining due (account balance)" : "Advance held (account balance)"}</td><td class="value">₹${formatINR(Math.abs(accountBalance))}</td></tr>
          </table>`
        : ""
    }
    <div class="footer">
      <div class="sign">Customer<br />(Stamp &amp; Signature)</div>
      <div class="sign">Authorised signatory<br />(Stamp &amp; Signature)</div>
    </div>
  `;
  openPrintWindow(`Challan ${dispatch.invoiceNumber ?? dispatch.slipNumber}`, body);
}

// A payment receipt can be issued to anyone in the People directory, not
// just dispatch customers — so unlike printInvoice/printGatePass, this
// takes the recipient's name directly instead of reading it off a Dispatch.
export function printPaymentReceipt(receipt: PaymentReceipt, recipientName: string, kilnName: string) {
  const balanceLabel = receipt.balanceAfter < 0 ? "Advance outstanding" : "Remaining due";
  const body = `
    <div class="row">
      <div>
        <h1>Payment Receipt</h1>
        <p class="muted">${escapeHtml(kilnName)}</p>
      </div>
      <div style="text-align:right">
        <p class="value">${escapeHtml(receipt.receiptNumber)}</p>
        <p class="muted">${new Date(receipt.date).toLocaleDateString("en-IN")}</p>
      </div>
    </div>
    <table>
      <tr><td class="label">Received from / issued to</td><td class="value">${escapeHtml(recipientName)}</td></tr>
      ${receipt.paymentMode ? `<tr><td class="label">Payment mode</td><td class="value">${escapeHtml(paymentModeLabel(receipt))}</td></tr>` : ""}
      ${
        receipt.totalAgreedAmount != null
          ? `<tr><td class="label">Total agreed amount</td><td class="value">₹${formatINR(receipt.totalAgreedAmount)}</td></tr>`
          : ""
      }
      <tr><td class="label">Amount paid now</td><td class="value">₹${formatINR(receipt.amountPaid)}</td></tr>
      <tr><td class="label">${balanceLabel}</td><td class="value">₹${formatINR(Math.abs(receipt.balanceAfter))}</td></tr>
      ${receipt.notes ? `<tr><td class="label">Notes</td><td class="value">${escapeHtml(receipt.notes)}</td></tr>` : ""}
    </table>
    <p class="amount">Paid: ₹${formatINR(receipt.amountPaid)}</p>
    <div class="footer">
      <div class="sign">Bhatta owner / Munim signature</div>
      <div class="sign">Recipient signature</div>
    </div>
  `;
  openPrintWindow(`Payment Receipt ${receipt.receiptNumber}`, body);
}
