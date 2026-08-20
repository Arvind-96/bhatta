import { useState } from "react";
import { ArrowLeft, Pencil, Printer, Trash2 } from "lucide-react";
import { Card } from "@/components/ui/card";
import { api } from "@/lib/api";
import { useTranslation } from "@/hooks/useTranslation";
import { useUiStore } from "@/store/ui.store";
import { useAuthStore } from "@/store/auth.store";
import { printChallanRecord } from "@/lib/printDocument";
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

function categoryLabelFor(categoryId: string | undefined, categories: BrickCategory[]) {
  if (!categoryId) return "—";
  const c = categories.find((cat) => cat._id === categoryId);
  if (!c) return "—";
  return c.grade ? `${c.category} (${c.grade})` : c.category;
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
    if (!confirm(t("dispatchDocs.confirmDeleteChallan", { number: challan.sequenceNumber }))) return;
    await api.challans.remove(challan._id);
    onDeleted();
  }

  return (
    <div>
      <button onClick={onBack} className="mb-3 flex items-center gap-1.5 text-sm text-ink-secondary hover:text-ink-primary">
        <ArrowLeft className="h-4 w-4" /> {t("dispatchDocs.backToChallans")}
      </button>

      <Card className="mb-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h3 className="text-lg font-semibold text-ink-primary">CH-{challan.sequenceNumber} · {challan.customerName}</h3>
            <p className="text-sm text-ink-muted">
              {challan.challanDate ? new Date(challan.challanDate).toLocaleDateString("en-IN") : "—"}
            </p>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => printChallanRecord(challan, kilnInfo, categoryLabelFor(challan.categoryId, categories))}
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
              <Field label={t("brickLoading.categoryHeader")} value={categoryLabelFor(challan.categoryId, categories)} />
              <Field label={t("brickLoading.bricksLoadedPlaceholder")} value={challan.bricksCount.toLocaleString("en-IN")} />
              <Field label={t("dispatch.vehicleNumberPlaceholder")} value={challan.vehicleNumber} />
            </div>
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
