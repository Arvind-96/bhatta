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

export function printGatePass(dispatch: Dispatch, kilnName: string) {
  const driver = personName(dispatch.driverId);
  const body = `
    <div class="row">
      <div>
        <h1>Gate Pass &amp; Challan</h1>
        <p class="muted">${escapeHtml(kilnName)}</p>
      </div>
      <div style="text-align:right">
        <p class="value">${escapeHtml(dispatch.slipNumber)}</p>
        <p class="muted">${new Date(dispatch.dispatchedOn).toLocaleDateString("en-IN")}</p>
      </div>
    </div>
    <table>
      <tr><td class="label">Issued to (vehicle owner / customer)</td><td class="value">${escapeHtml(dispatch.customerName)}</td></tr>
      <tr><td class="label">Driver</td><td class="value">${escapeHtml(driver || "—")}</td></tr>
      <tr><td class="label">Grade</td><td class="value">${escapeHtml(GRADE_LABELS[dispatch.grade] ?? dispatch.grade)}</td></tr>
      <tr><td class="label">Bricks loaded</td><td class="value">${dispatch.bricksCount.toLocaleString("en-IN")}</td></tr>
      ${dispatch.transportCost ? `<tr><td class="label">Transport cost</td><td class="value">₹${formatINR(dispatch.transportCost)} (paid by ${escapeHtml(dispatch.transportPaidBy ?? "—")})</td></tr>` : ""}
    </table>
    <div class="footer">
      <div class="sign">Gate / Chowkidar</div>
      <div class="sign">Driver signature</div>
      <div class="sign">Munim / Owner</div>
    </div>
  `;
  openPrintWindow(`Gate Pass ${dispatch.slipNumber}`, body);
}

export function printInvoice(dispatch: Dispatch, kilnName: string) {
  const rate = dispatch.bricksCount > 0 ? dispatch.amount / dispatch.bricksCount : 0;
  const body = `
    <div class="row">
      <div>
        <h1>Bill / Invoice</h1>
        <p class="muted">${escapeHtml(kilnName)}</p>
      </div>
      <div style="text-align:right">
        <p class="value">${escapeHtml(dispatch.invoiceNumber ?? dispatch.slipNumber)}</p>
        <p class="muted">${new Date(dispatch.dispatchedOn).toLocaleDateString("en-IN")}</p>
      </div>
    </div>
    <table>
      <tr><td class="label">Billed to</td><td class="value">${escapeHtml(dispatch.customerName)}</td></tr>
      <tr><td class="label">Payment mode</td><td class="value">${escapeHtml(paymentModeLabel(dispatch))}</td></tr>
    </table>
    <table>
      <thead>
        <tr><th>Description</th><th>Qty</th><th>Rate</th><th style="text-align:right">Amount</th></tr>
      </thead>
      <tbody>
        <tr>
          <td>Bricks (${escapeHtml(GRADE_LABELS[dispatch.grade] ?? dispatch.grade)})</td>
          <td>${dispatch.bricksCount.toLocaleString("en-IN")}</td>
          <td>₹${rate.toLocaleString("en-IN", { maximumFractionDigits: 2 })}</td>
          <td style="text-align:right">₹${formatINR(dispatch.amount)}</td>
        </tr>
        ${
          dispatch.transportCost
            ? `<tr><td>Transport (paid by ${escapeHtml(dispatch.transportPaidBy ?? "—")})</td><td>—</td><td>—</td><td style="text-align:right">₹${formatINR(dispatch.transportCost)}</td></tr>`
            : ""
        }
      </tbody>
    </table>
    <p class="amount">Total: ₹${formatINR(dispatch.amount)}</p>
    <div class="footer">
      <div class="sign">Customer signature</div>
      <div class="sign">Authorised signatory</div>
    </div>
  `;
  openPrintWindow(`Invoice ${dispatch.invoiceNumber ?? dispatch.slipNumber}`, body);
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
