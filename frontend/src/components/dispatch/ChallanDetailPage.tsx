import { useState } from "react";
import { ArrowLeft, Ban, Pencil, Printer } from "lucide-react";
import { Card } from "@/components/ui/card";
import { api } from "@/lib/api";
import { useTranslation } from "@/hooks/useTranslation";
import { useUiStore } from "@/store/ui.store";
import { useAuthStore } from "@/store/auth.store";
import { formatDateTime } from "@/lib/utils";
import { printChallanRecord, resolveItemRows } from "@/lib/printDocument";
import { resolvePaymentInfo } from "@/lib/paymentStatus";
import { LineItemsDetailTable } from "@/components/dispatch/BrickLineItemsEditor";
import { CreateChallanForm } from "./CreateChallanForm";
import type { BrickCategory, Challan } from "@/types";

function Field({ label, value }: { label: string; value?: string | number | null }) {
  if (value === undefined || value === null || value === "") return null;
  return (
    <div>
      <p className="text-sm text-ink-muted">{label}</p>
      <p className="text-sm text-ink-primary">{value}</p>
    </div>
  );
}

// Same muted "stays visible, marked Cancelled" tone SaleOrders.tsx's own
// STATUS_TONE.CANCELLED uses — not the shared Badge component, which has
// no cancelled variant.
function CancelledBadge({ label }: { label: string }) {
  return <span className="rounded-full bg-ink-primary/10 px-2 py-0.5 text-xs font-semibold text-ink-muted">{label}</span>;
}

interface ChallanDetailPageProps {
  challan: Challan;
  categories: BrickCategory[];
  onBack: () => void;
  onDeleted: () => void;
}

// Profile-style page for a single Challan record — reached by clicking a
// row on the Challan list page. Edit reuses CreateChallanForm in-place
// (dispatch=null since this page never loads the originating Dispatch,
// just its id for the "view dispatch" link) so a saved edit here fires
// the same challan:update socket event DispatchDetailPage already listens
// for, keeping both pages in sync automatically.
export function ChallanDetailPage({ challan, categories, onBack, onDeleted }: ChallanDetailPageProps) {
  const { t } = useTranslation();
  const navigateAndHighlight = useUiStore((s) => s.navigateAndHighlight);
  const kilns = useAuthStore((s) => s.kilns);
  const activeKilnId = useAuthStore((s) => s.activeKilnId);
  const activeKiln = kilns.find((k) => k.kilnId === activeKilnId);
  const kilnInfo = { name: activeKiln?.name ?? "Bhatta Cloud", location: activeKiln?.location, phone: activeKiln?.phone, gstNumber: activeKiln?.gstNumber };
  const [editing, setEditing] = useState(false);

  async function handleDelete() {
    if (!confirm(t("dispatchDocs.confirmDeleteChallan", { number: challan.sequenceNumber ?? "—" }))) return;
    await api.challans.remove(challan._id);
    onDeleted();
  }

  async function handlePrint() {
    const { stamp } = await resolvePaymentInfo({ customerName: challan.customerName, remainingOnThisDoc: 0 });
    printChallanRecord(challan, kilnInfo, categories, stamp);
  }

  const itemRows = resolveItemRows(challan.items, categories, { categoryId: challan.categoryId, bricksCount: challan.bricksCount });

  return (
    <div>
      <button onClick={onBack} className="mb-3 flex items-center gap-1.5 text-sm text-ink-secondary hover:text-ink-primary">
        <ArrowLeft className="h-4 w-4" /> {t("dispatchDocs.backToChallans")}
      </button>

      <Card className="mb-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h3 className="flex items-center gap-2 text-lg font-semibold text-ink-primary">
              CH-{challan.sequenceNumber ?? "—"} · {challan.customerName}
              {challan.cancelled && <CancelledBadge label={t("common.cancelledBadge")} />}
            </h3>
            <p className="text-sm text-ink-muted">
              {challan.challanDate ? new Date(challan.challanDate).toLocaleDateString("en-IN") : "—"}
            </p>
            <p className="text-xs text-ink-muted/70">
              {t("common.entryDateTime")}: {formatDateTime(challan.createdAt)}
            </p>
          </div>
          <div className="flex gap-2">
            <button
              onClick={handlePrint}
              className="flex items-center gap-1 rounded-lg border border-border bg-ink-primary/5 px-3 py-1.5 text-xs font-medium text-ink-secondary hover:bg-ink-primary/10"
            >
              <Printer className="h-3.5 w-3.5" /> {t("common.print")}
            </button>
            {!challan.cancelled && (
              <>
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
                  <Ban className="h-3.5 w-3.5" /> {t("common.cancel")}
                </button>
              </>
            )}
          </div>
        </div>
      </Card>

      {editing ? (
        <CreateChallanForm dispatch={null} categories={categories} existing={challan} onClose={() => setEditing(false)} onSaved={() => setEditing(false)} />
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          <Card>
            <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-muted">{t("brickLoading.customerPartySection")}</h4>
            <div className="grid grid-cols-2 gap-3">
              <Field label={t("brickLoading.customerNamePlaceholder")} value={challan.customerName} />
              <Field label={t("brickLoading.customerPhonePlaceholder")} value={challan.customerPhone} />
              <Field label={t("brickLoading.customerAddressPlaceholder")} value={challan.customerAddress} />
            </div>
          </Card>

          <Card>
            <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-muted">{t("brickLoading.driverSection")}</h4>
            <div className="grid grid-cols-2 gap-3">
              <Field label={t("brickLoading.driverNamePlaceholder")} value={challan.driverName} />
              <Field label={t("brickLoading.driverPhonePlaceholder")} value={challan.driverPhone} />
              <Field label={t("dispatch.vehicleNumberPlaceholder")} value={challan.vehicleNumber} />
            </div>
          </Card>

          <Card className="lg:col-span-2">
            <h4 className="mb-3 text-xs font-semibold uppercase tracking-wide text-ink-muted">{t("dispatchDocs.dispatchDetailsSection")}</h4>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {itemRows.length <= 1 && <Field label={t("brickLoading.categoryHeader")} value={itemRows[0]?.label ?? "—"} />}
              <Field label={t("brickLoading.bricksLoadedPlaceholder")} value={challan.bricksCount.toLocaleString("en-IN")} />
              <Field label={t("dispatch.vehicleNumberPlaceholder")} value={challan.vehicleNumber} />
              <Field label={t("dispatchDocs.placeOfSupplyPlaceholder")} value={challan.placeOfSupply} />
            </div>
            {itemRows.length > 1 && (
              <div className="mt-3">
                <LineItemsDetailTable rows={itemRows} />
              </div>
            )}
          </Card>

          <Card className="lg:col-span-2">
            <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-muted">{t("dispatchDocs.originatingDispatchSection")}</h4>
            <button type="button" onClick={() => navigateAndHighlight("dispatch", challan.dispatchId)} className="text-sm text-series-1 hover:underline">
              {t("dispatchDocs.viewInDispatch")}
            </button>
          </Card>

          {challan.notes && (
            <Card className="lg:col-span-2">
              <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-muted">{t("common.notes")}</h4>
              <p className="text-sm text-ink-primary">{challan.notes}</p>
            </Card>
          )}
        </div>
      )}
    </div>
  );
}
