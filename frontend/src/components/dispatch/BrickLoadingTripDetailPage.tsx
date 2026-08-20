import { useState } from "react";
import { ArrowLeft, Pencil, Trash2, Truck } from "lucide-react";
import { Card } from "@/components/ui/card";
import { api } from "@/lib/api";
import { useTranslation } from "@/hooks/useTranslation";
import { useUiStore } from "@/store/ui.store";
import { formatDateTime, formatINR } from "@/lib/utils";
import type { BrickLoadingEntry } from "@/types";

function Field({ label, value }: { label: string; value?: string | number | null }) {
  if (value === undefined || value === null || value === "") return null;
  return (
    <div>
      <p className="text-sm text-ink-muted">{label}</p>
      <p className="text-sm text-ink-primary">{value}</p>
    </div>
  );
}

interface BrickLoadingTripDetailPageProps {
  trip: BrickLoadingEntry;
  onBack: () => void;
  onEdit: () => void;
  onDelete: () => void;
}

// The profile-style page for a single brick loading trip -- reached by
// clicking a row on BrickLoading.tsx's Loading trips table. Displays every
// field the Log Trip form (and its Edit modal) collects; Edit reuses the
// existing EditBrickLoadingEntryModal (triggered by the parent page, same
// as before) rather than duplicating that form here.
export function BrickLoadingTripDetailPage({ trip, onBack, onEdit, onDelete }: BrickLoadingTripDetailPageProps) {
  const { t } = useTranslation();
  const navigateAndHighlight = useUiStore((s) => s.navigateAndHighlight);
  const category = typeof trip.categoryId === "object" ? trip.categoryId : null;
  const linkedDispatch = typeof trip.dispatchId === "object" ? trip.dispatchId : null;
  const [addingToDispatch, setAddingToDispatch] = useState(false);

  // Transfers this trip's customer/driver/vehicle/category/amount to a new
  // Dispatch entry via the existing loadingEntryId link (createDispatch
  // authoritatively overrides vehicle/category/bricks/amount from the trip
  // row itself -- see dispatch.service.ts), then jumps straight to viewing
  // it on the Dispatch page.
  async function handleAddToDispatch() {
    if (!confirm(t("dispatchDocs.confirmAddToDispatch"))) return;
    setAddingToDispatch(true);
    try {
      const newDispatch = await api.dispatch.create({
        customerName: trip.customerName || t("dispatch.walkInCustomer"),
        customerAddress: trip.customerAddress,
        customerPhone: trip.customerPhone,
        driverName: trip.driverName,
        driverPhone: trip.driverPhone,
        loadingEntryId: trip._id,
        dispatchedOn: trip.date,
      });
      navigateAndHighlight("dispatch", newDispatch._id);
    } finally {
      setAddingToDispatch(false);
    }
  }

  return (
    <div>
      <button onClick={onBack} className="mb-3 flex items-center gap-1.5 text-sm text-ink-secondary hover:text-ink-primary">
        <ArrowLeft className="h-4 w-4" /> {t("brickLoading.backToLoadingTrips")}
      </button>

      <Card className="mb-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h3 className="text-lg font-semibold text-ink-primary">
              {trip.tripNumber ? `#${trip.tripNumber}` : t("brickLoading.tripNumberHeader")} · {trip.vehicleNumber}
            </h3>
            <p className="text-sm text-ink-muted">
              {new Date(trip.date).toLocaleDateString("en-IN")} · {formatDateTime(trip.createdAt)}
            </p>
          </div>
          <div className="flex gap-2">
            {linkedDispatch ? (
              <button
                onClick={() => navigateAndHighlight("dispatch", linkedDispatch._id)}
                className="flex items-center gap-1 rounded-lg border border-series-1/30 bg-series-1/5 px-3 py-1.5 text-xs font-medium text-series-1 hover:bg-series-1/10"
              >
                <Truck className="h-3.5 w-3.5" /> {t("dispatchDocs.viewInDispatch")}
              </button>
            ) : (
              <button
                onClick={handleAddToDispatch}
                disabled={addingToDispatch}
                className="flex items-center gap-1 rounded-lg border border-series-1/30 bg-series-1/5 px-3 py-1.5 text-xs font-medium text-series-1 hover:bg-series-1/10 disabled:opacity-50"
              >
                <Truck className="h-3.5 w-3.5" /> {t("dispatchDocs.addToDispatchButton")}
              </button>
            )}
            <button
              onClick={onEdit}
              className="flex items-center gap-1 rounded-lg border border-border bg-ink-primary/5 px-3 py-1.5 text-xs font-medium text-ink-secondary hover:bg-ink-primary/10"
            >
              <Pencil className="h-3.5 w-3.5" /> {t("common.edit")}
            </button>
            <button
              onClick={onDelete}
              className="flex items-center gap-1 rounded-lg border border-status-critical/30 bg-status-critical/5 px-3 py-1.5 text-xs font-medium text-status-critical hover:bg-status-critical/10"
            >
              <Trash2 className="h-3.5 w-3.5" /> {t("common.delete")}
            </button>
          </div>
        </div>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-muted">{t("brickLoading.customerPartySection")}</h4>
          <div className="grid grid-cols-2 gap-3">
            <Field label={t("brickLoading.customerNamePlaceholder")} value={trip.customerName} />
            <Field label={t("brickLoading.customerPhonePlaceholder")} value={trip.customerPhone} />
            <Field label={t("brickLoading.customerAddressPlaceholder")} value={trip.customerAddress} />
          </div>
        </Card>

        <Card>
          <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-muted">{t("brickLoading.driverSection")}</h4>
          <div className="grid grid-cols-2 gap-3">
            <Field label={t("brickLoading.driverNamePlaceholder")} value={trip.driverName} />
            <Field label={t("brickLoading.driverPhonePlaceholder")} value={trip.driverPhone} />
            <Field label={t("brickLoading.driverRewardPlaceholder")} value={trip.tipAmount ? `₹${formatINR(trip.tipAmount)}` : undefined} />
          </div>
        </Card>

        <Card className="lg:col-span-2">
          <h4 className="mb-3 text-xs font-semibold uppercase tracking-wide text-ink-muted">{t("brickLoading.loadingSection")}</h4>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Field
              label={t("brickLoading.categoryHeader")}
              value={category ? (category.grade ? `${category.category} (${category.grade})` : category.category) : undefined}
            />
            <Field label={t("brickLoading.bricksLoadedPlaceholder")} value={trip.bricksCount.toLocaleString("en-IN")} />
            <Field label={t("brickLoading.pricePerBrickPlaceholder")} value={trip.pricePerBrick !== undefined ? `₹${trip.pricePerBrick}` : undefined} />
            <Field
              label={t("brickLoading.loadingRatePlaceholder")}
              value={trip.loadingRatePerThousand !== undefined ? `₹${trip.loadingRatePerThousand}` : undefined}
            />
            <Field label={t("brickLoading.loadingDateLabel")} value={new Date(trip.date).toLocaleDateString("en-IN")} />
            <Field label={t("brickLoading.totalAmountLabel")} value={trip.amount !== undefined ? `₹${formatINR(trip.amount)}` : undefined} />
            <Field
              label={t("brickLoading.totalLoadingChargeLabel")}
              value={trip.loadingCharge !== undefined ? `₹${formatINR(trip.loadingCharge)}` : undefined}
            />
          </div>
        </Card>

        <Card className="lg:col-span-2">
          <h4 className="mb-3 text-xs font-semibold uppercase tracking-wide text-ink-muted">{t("brickLoading.unloadingSection")}</h4>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Field label={t("brickLoading.bricksUnloadedPlaceholder")} value={trip.unloadedBricksCount?.toLocaleString("en-IN")} />
            <Field
              label={t("brickLoading.unloadingRatePlaceholder")}
              value={trip.unloadingRatePerThousand !== undefined ? `₹${trip.unloadingRatePerThousand}` : undefined}
            />
            <Field
              label={t("brickLoading.unloadingDateLabel")}
              value={trip.unloadingDate ? new Date(trip.unloadingDate).toLocaleDateString("en-IN") : undefined}
            />
            <Field
              label={t("brickLoading.totalUnloadingChargeLabel")}
              value={trip.unloadingCharge !== undefined ? `₹${formatINR(trip.unloadingCharge)}` : undefined}
            />
          </div>
        </Card>

        {linkedDispatch && (
          <Card className="lg:col-span-2">
            <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-muted">{t("brickLoading.dispatchHeader")}</h4>
            <button
              type="button"
              onClick={() => navigateAndHighlight("dispatch", linkedDispatch._id)}
              className="text-sm text-series-1 hover:underline"
            >
              {linkedDispatch.slipNumber}
            </button>
          </Card>
        )}

        {trip.notes && (
          <Card className="lg:col-span-2">
            <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-muted">{t("common.notes")}</h4>
            <p className="text-sm text-ink-primary">{trip.notes}</p>
          </Card>
        )}
      </div>
    </div>
  );
}
