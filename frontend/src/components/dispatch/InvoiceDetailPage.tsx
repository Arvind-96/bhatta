import { useState } from "react";
import { ArrowLeft, Pencil, Printer, Trash2 } from "lucide-react";
import { Card } from "@/components/ui/card";
import { api } from "@/lib/api";
import { useTranslation } from "@/hooks/useTranslation";
import { useUiStore } from "@/store/ui.store";
import { useAuthStore } from "@/store/auth.store";
import { formatDateTime, formatINR } from "@/lib/utils";
import { formatInvoiceNumber, printInvoiceRecord, resolveItemRows } from "@/lib/printDocument";
import { resolvePaymentInfo } from "@/lib/paymentStatus";
import { LineItemsDetailTable } from "@/components/dispatch/BrickLineItemsEditor";
import { CreateInvoiceForm } from "./CreateInvoiceForm";
import type { BrickCategory, Invoice } from "@/types";

function Field({ label, value }: { label: string; value?: string | number | null }) {
  if (value === undefined || value === null || value === "") return null;
  return (
    <div>
      <p className="text-sm text-ink-muted">{label}</p>
      <p className="text-sm text-ink-primary">{value}</p>
    </div>
  );
}

interface InvoiceDetailPageProps {
  invoice: Invoice;
  categories: BrickCategory[];
  onBack: () => void;
  onDeleted: () => void;
}

// Profile-style page for a single Invoice record — see
// ChallanDetailPage.tsx's doc comment for the shared design (Edit reuses
// CreateInvoiceForm in-place with dispatch=null).
export function InvoiceDetailPage({ invoice, categories, onBack, onDeleted }: InvoiceDetailPageProps) {
  const { t } = useTranslation();
  const navigateAndHighlight = useUiStore((s) => s.navigateAndHighlight);
  const kilns = useAuthStore((s) => s.kilns);
  const activeKilnId = useAuthStore((s) => s.activeKilnId);
  const activeKiln = kilns.find((k) => k.kilnId === activeKilnId);
  const kilnInfo = {
    name: activeKiln?.name ?? "Bhatta Cloud",
    location: activeKiln?.location,
    phone: activeKiln?.phone,
    gstNumber: activeKiln?.gstNumber,
    stateCode: activeKiln?.stateCode,
    bankAccountNumber: activeKiln?.bankAccountNumber,
    bankName: activeKiln?.bankName,
    bankIfscCode: activeKiln?.bankIfscCode,
  };
  const [editing, setEditing] = useState(false);

  async function handleDelete() {
    if (!confirm(t("dispatchDocs.confirmDeleteInvoice", { number: formatInvoiceNumber(invoice, kilnInfo.name) }))) return;
    await api.invoices.remove(invoice._id);
    onDeleted();
  }

  async function handlePrint() {
    const remainingOnThisDoc = Math.max(0, Math.round((invoice.netAmount - (invoice.amountPaidNow ?? invoice.netAmount)) * 100) / 100);
    const [{ stamp }, signatureDataUri] = await Promise.all([
      resolvePaymentInfo({ customerId: invoice.customerId, customerName: invoice.customerName, remainingOnThisDoc }),
      api.kilns.fetchSignatureDataUri(),
    ]);
    printInvoiceRecord(invoice, { ...kilnInfo, signatureDataUri }, categories, stamp);
  }

  const invoiceGross = invoice.grossAmount ?? invoice.netAmount + (invoice.discountAmount ?? 0);
  const itemRows = resolveItemRows(invoice.items, categories, {
    categoryId: invoice.categoryId,
    bricksCount: invoice.bricksCount,
    pricePerBrick: invoice.ratePerBrick,
    amount: invoiceGross,
  });

  return (
    <div>
      <button onClick={onBack} className="mb-3 flex items-center gap-1.5 text-sm text-ink-secondary hover:text-ink-primary">
        <ArrowLeft className="h-4 w-4" /> {t("dispatchDocs.backToInvoices")}
      </button>

      <Card className="mb-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h3 className="text-lg font-semibold text-ink-primary">{formatInvoiceNumber(invoice, kilnInfo.name)} · {invoice.customerName}</h3>
            <p className="text-sm text-ink-muted">
              {invoice.invoiceDate ? new Date(invoice.invoiceDate).toLocaleDateString("en-IN") : "—"} · ₹{formatINR(invoice.netAmount)}
            </p>
            <p className="text-xs text-ink-muted/70">
              {t("common.entryDateTime")}: {formatDateTime(invoice.createdAt)}
            </p>
          </div>
          <div className="flex gap-2">
            <button
              onClick={handlePrint}
              className="flex items-center gap-1 rounded-lg border border-border bg-ink-primary/5 px-3 py-1.5 text-xs font-medium text-ink-secondary hover:bg-ink-primary/10"
            >
              <Printer className="h-3.5 w-3.5" /> {t("common.print")}
            </button>
            <button
              onClick={() => setEditing((e) => !e)}
              className="flex items-center gap-1 rounded-lg border border-border bg-ink-primary/5 px-3 py-1.5 text-xs font-medium text-ink-secondary hover:bg-ink-primary/10"
            >
              <Pencil className="h-3.5 w-3.5" /> {t("common.edit")}
            </button>
            <button
              onClick={handleDelete}
              className="flex items-center gap-1 rounded-lg border border-status-critical/30 bg-status-critical/5 px-3 py-1.5 text-xs font-medium text-status-critical hover:bg-status-critical/10"
            >
              <Trash2 className="h-3.5 w-3.5" /> {t("common.delete")}
            </button>
          </div>
        </div>
      </Card>

      {editing ? (
        <CreateInvoiceForm dispatch={null} categories={categories} existing={invoice} onClose={() => setEditing(false)} onSaved={() => setEditing(false)} />
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          <Card>
            <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-muted">{t("brickLoading.customerPartySection")}</h4>
            <div className="grid grid-cols-2 gap-3">
              <Field label={t("brickLoading.customerNamePlaceholder")} value={invoice.customerName} />
              <Field label={t("brickLoading.customerPhonePlaceholder")} value={invoice.customerPhone} />
              <Field label={t("brickLoading.customerAddressPlaceholder")} value={invoice.customerAddress} />
              <Field label={t("dispatchDocs.gstNumberPlaceholder")} value={invoice.customerGstNumber} />
            </div>
          </Card>

          <Card>
            <h4 className="mb-3 text-xs font-semibold uppercase tracking-wide text-ink-muted">{t("dispatchDocs.dispatchDetailsSection")}</h4>
            <div className="grid grid-cols-2 gap-3">
              {itemRows.length <= 1 && <Field label={t("brickLoading.categoryHeader")} value={itemRows[0]?.label ?? "—"} />}
              <Field label={t("brickLoading.bricksLoadedPlaceholder")} value={invoice.bricksCount.toLocaleString("en-IN")} />
              {itemRows.length <= 1 && (
                <Field label={t("dispatchDocs.ratePerBrickPlaceholder")} value={invoice.ratePerBrick != null ? `₹${invoice.ratePerBrick}` : undefined} />
              )}
              <Field label={t("dispatch.discountPlaceholder")} value={invoice.discountAmount ? `₹${formatINR(invoice.discountAmount)}` : undefined} />
              <Field label={t("dispatchDocs.placeOfSupplyPlaceholder")} value={invoice.placeOfSupply} />
            </div>
            {itemRows.length > 1 && (
              <div className="mt-3">
                <LineItemsDetailTable rows={itemRows} pricingEnabled />
              </div>
            )}
          </Card>

          <Card className="lg:col-span-2">
            <h4 className="mb-3 text-xs font-semibold uppercase tracking-wide text-ink-muted">{t("common.paymentMode")}</h4>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <Field label={t("common.paymentMode")} value={invoice.paymentMode ?? undefined} />
              <Field label={t("common.amount")} value={`₹${formatINR(invoice.netAmount)}`} />
              <Field label={t("customer.amountPayingNowPlaceholder")} value={`₹${formatINR(invoice.amountPaidNow ?? invoice.netAmount)}`} />
              <Field
                label={t("customer.remainingOnThisInvoiceLabel")}
                value={
                  invoice.netAmount - (invoice.amountPaidNow ?? invoice.netAmount) > 0
                    ? `₹${formatINR(invoice.netAmount - (invoice.amountPaidNow ?? invoice.netAmount))}`
                    : undefined
                }
              />
              {invoice.paymentMode === "CASH_AND_ONLINE" && (
                <>
                  <Field label="Cash" value={invoice.cashAmount != null ? `₹${formatINR(invoice.cashAmount)}` : undefined} />
                  <Field label="Online" value={invoice.onlineAmount != null ? `₹${formatINR(invoice.onlineAmount)}` : undefined} />
                </>
              )}
            </div>
          </Card>

          {(invoice.dispatchId || invoice.customerId) && (
            <Card className="lg:col-span-2">
              <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-muted">{t(invoice.dispatchId ? "dispatchDocs.originatingDispatchSection" : "dispatchDocs.linkedRecordsSection")}</h4>
              <div className="flex flex-wrap gap-4">
                {invoice.dispatchId && (
                  <button type="button" onClick={() => navigateAndHighlight("dispatch", invoice.dispatchId!)} className="text-sm text-series-1 hover:underline">
                    {t("dispatchDocs.viewInDispatch")}
                  </button>
                )}
                {invoice.customerId && (
                  <button type="button" onClick={() => navigateAndHighlight("customers", invoice.customerId!)} className="text-sm text-series-1 hover:underline">
                    {t("customer.viewCustomerProfile")}
                  </button>
                )}
              </div>
            </Card>
          )}

          {invoice.notes && (
            <Card className="lg:col-span-2">
              <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-muted">{t("common.notes")}</h4>
              <p className="text-sm text-ink-primary">{invoice.notes}</p>
            </Card>
          )}
        </div>
      )}
    </div>
  );
}
