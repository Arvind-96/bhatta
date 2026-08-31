import { FormEvent, useEffect, useState } from "react";
import { ArrowLeft, Car, MapPin, Pencil, Phone, Plus, Trash2, Wallet } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ConfirmDialog } from "@/components/shared/ConfirmDialog";
import { LedgerModal } from "@/components/people/LedgerModal";
import { api } from "@/lib/api";
import { useKilnEvent } from "@/hooks/useKilnEvent";
import { useTranslation } from "@/hooks/useTranslation";
import { formatINR } from "@/lib/utils";
import type { PartnerAsset, PartnerAssetType, PartnerDetail } from "@/types";

const inputClass =
  "h-10 rounded-xl border border-border bg-ink-primary/5 px-3 text-sm text-ink-primary outline-none focus:ring-2 focus:ring-series-1";

const PERIOD_OPTIONS = [30, 90, 365];

function AddAssetForm({
  partnerId,
  existing,
  onClose,
  onSaved,
}: {
  partnerId: string;
  existing: PartnerAsset | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { t } = useTranslation();
  const [assetType, setAssetType] = useState<PartnerAssetType>(existing?.assetType ?? "VEHICLE");
  const [description, setDescription] = useState(existing?.description ?? "");
  const [landAreaBigha, setLandAreaBigha] = useState(existing?.landAreaBigha?.toString() ?? "");
  const [rentalRate, setRentalRate] = useState(existing?.rentalRate?.toString() ?? "");
  const [rentalRateUnit, setRentalRateUnit] = useState(existing?.rentalRateUnit ?? "");
  const [notes, setNotes] = useState(existing?.notes ?? "");
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!description.trim()) return;
    setSaving(true);
    try {
      const input = {
        assetType,
        description: description.trim(),
        landAreaBigha: assetType === "LAND" && landAreaBigha ? Number(landAreaBigha) : undefined,
        rentalRate: rentalRate ? Number(rentalRate) : undefined,
        rentalRateUnit: rentalRateUnit.trim() || undefined,
        notes: notes.trim() || undefined,
      };
      if (existing) await api.partnerAssets.update(existing._id, input);
      else await api.partnerAssets.create({ ...input, partnerId });
      onSaved();
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card className="mb-4">
      <h4 className="mb-3 text-sm font-semibold text-ink-primary">{existing ? t("partner.editAsset") : t("partner.addAssetButton")}</h4>
      <form onSubmit={handleSubmit} className="flex flex-col gap-3">
        <div className="flex gap-2">
          {(["VEHICLE", "LAND", "OTHER"] as PartnerAssetType[]).map((type) => (
            <button
              key={type}
              type="button"
              onClick={() => setAssetType(type)}
              className={`rounded-xl border px-3 py-2 text-sm font-medium ${assetType === type ? "border-series-1 bg-series-1/10 text-series-1" : "border-border text-ink-secondary"}`}
            >
              {type === "VEHICLE" ? t("partner.assetTypeVehicle") : type === "LAND" ? t("partner.assetTypeLand") : t("partner.assetTypeOther")}
            </button>
          ))}
        </div>
        <input required placeholder={t("partner.assetDescriptionPlaceholder")} value={description} onChange={(e) => setDescription(e.target.value)} className={inputClass} />
        {assetType === "LAND" && (
          <input
            type="number"
            min={0}
            step="0.01"
            placeholder={t("partner.landAreaBighaPlaceholder")}
            value={landAreaBigha}
            onChange={(e) => setLandAreaBigha(e.target.value)}
            className={inputClass}
          />
        )}
        <div className="flex gap-2">
          <input type="number" min={0} placeholder={t("partner.rentalRatePlaceholder")} value={rentalRate} onChange={(e) => setRentalRate(e.target.value)} className={inputClass + " flex-1"} />
          <input placeholder={t("partner.rentalRateUnitPlaceholder")} value={rentalRateUnit} onChange={(e) => setRentalRateUnit(e.target.value)} className={inputClass + " flex-1"} />
        </div>
        <input placeholder={t("common.notes")} value={notes} onChange={(e) => setNotes(e.target.value)} className={inputClass} />
        <div className="flex gap-2">
          <Button type="submit" size="sm" disabled={saving || !description.trim()}>
            {saving ? t("settings.savingEllipsis") : t("common.save")}
          </Button>
          <Button type="button" size="sm" variant="outline" onClick={onClose}>
            {t("common.cancel")}
          </Button>
        </div>
      </form>
    </Card>
  );
}

interface PartnerDetailPageProps {
  partnerId: string;
  onBack: () => void;
  onDeleted: () => void;
}

export function PartnerDetailPage({ partnerId, onBack, onDeleted }: PartnerDetailPageProps) {
  const { t } = useTranslation();
  const [detail, setDetail] = useState<PartnerDetail | null>(null);
  const [days, setDays] = useState(30);
  const [editingPartner, setEditingPartner] = useState(false);
  const [showAssetForm, setShowAssetForm] = useState(false);
  const [editingAsset, setEditingAsset] = useState<PartnerAsset | null>(null);
  const [pendingDeleteAssetId, setPendingDeleteAssetId] = useState<string | null>(null);
  const [ledgerOpen, setLedgerOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);

  async function refresh() {
    setDetail(await api.partners.detail(partnerId, days));
  }

  useEffect(() => {
    refresh().catch(console.error);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [partnerId, days]);

  useKilnEvent<{ _id: string; deleted?: boolean }>("person:update", (payload) => {
    if (payload._id === partnerId && payload.deleted) {
      onDeleted();
      return;
    }
    refresh().catch(console.error);
  });
  useKilnEvent("partnerAsset:update", () => refresh().catch(console.error));
  useKilnEvent("ledger:update", () => refresh().catch(console.error));
  useKilnEvent("invoice:update", () => refresh().catch(console.error));

  if (!detail) {
    return (
      <div>
        <button onClick={onBack} className="mb-3 flex items-center gap-1.5 text-sm text-ink-secondary hover:text-ink-primary">
          <ArrowLeft className="h-4 w-4" /> {t("nav.partners")}
        </button>
        <Card>
          <p className="py-8 text-center text-sm text-ink-muted">{t("common.loading")}</p>
        </Card>
      </div>
    );
  }

  const { partner, assets, balance, profitShare, invoicesThrough } = detail;
  const pendingDeleteAsset = assets.find((a) => a._id === pendingDeleteAssetId) ?? null;

  return (
    <div>
      <button onClick={onBack} className="mb-3 flex items-center gap-1.5 text-sm text-ink-secondary hover:text-ink-primary">
        <ArrowLeft className="h-4 w-4" /> {t("nav.partners")}
      </button>

      <Card className="mb-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h3 className="text-lg font-semibold text-ink-primary">{partner.name}</h3>
            {partner.phone && (
              <a href={`tel:${partner.phone}`} className="flex items-center gap-1.5 text-sm text-ink-secondary hover:text-series-1">
                <Phone className="h-3.5 w-3.5" /> {partner.phone}
              </a>
            )}
            {partner.address && <p className="mt-0.5 text-sm text-ink-muted">{partner.address}</p>}
            <div className="mt-2 flex flex-wrap gap-1.5">
              {partner.partnershipDate && <Badge variant="neutral">{t("partner.partnerSince", { date: new Date(partner.partnershipDate).toLocaleDateString("en-IN") })}</Badge>}
              {partner.profitSharePercent != null && <Badge variant="good">{t("partner.profitShareBadge", { percent: partner.profitSharePercent })}</Badge>}
            </div>
          </div>
          <div className="flex gap-2">
            <button onClick={() => setLedgerOpen(true)} className="flex items-center gap-1 rounded-lg border border-border bg-ink-primary/5 px-3 py-1.5 text-xs font-medium text-ink-secondary hover:bg-ink-primary/10">
              <Wallet className="h-3.5 w-3.5" /> {t("common.ledger")}
            </button>
            <button onClick={() => setEditingPartner(true)} className="flex items-center gap-1 rounded-lg border border-border bg-ink-primary/5 px-3 py-1.5 text-xs font-medium text-ink-secondary hover:bg-ink-primary/10">
              <Pencil className="h-3.5 w-3.5" /> {t("common.edit")}
            </button>
            <button
              onClick={async () => {
                if (!confirm(t("partner.confirmDeactivate", { name: partner.name }))) return;
                await api.people.update(partnerId, { active: false });
                onDeleted();
              }}
              className="flex items-center gap-1 rounded-lg border border-status-critical/30 bg-status-critical/5 px-3 py-1.5 text-xs font-medium text-status-critical hover:bg-status-critical/10"
            >
              <Trash2 className="h-3.5 w-3.5" /> {t("common.delete")}
            </button>
          </div>
        </div>
      </Card>

      {editingPartner && (
        <Card className="mb-4">
          <h4 className="mb-3 text-sm font-semibold text-ink-primary">{t("partner.editPartner")}</h4>
          <PartnerEditForm
            partnerId={partnerId}
            existing={detail.partner}
            onClose={() => setEditingPartner(false)}
            onSaved={() => {
              setEditingPartner(false);
              refresh();
            }}
          />
        </Card>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <div className="mb-3 flex items-center justify-between">
            <h4 className="text-xs font-semibold uppercase tracking-wide text-ink-muted">{t("partner.ledgerBalanceLabel")}</h4>
          </div>
          <div className="rounded-xl border border-border bg-ink-primary/[0.03] p-3 text-center">
            <p className={`text-xl font-semibold tabular-nums ${balance > 0 ? "text-status-critical" : balance < 0 ? "text-status-good" : "text-ink-primary"}`}>
              ₹{formatINR(Math.abs(balance))}
            </p>
            <p className="text-sm text-ink-muted">{balance > 0 ? t("partner.owedByPartner") : balance < 0 ? t("partner.owedToPartner") : t("partner.settledLabel")}</p>
          </div>
        </Card>

        <Card>
          <div className="mb-3 flex items-center justify-between">
            <h4 className="text-xs font-semibold uppercase tracking-wide text-ink-muted">{t("partner.profitShareCardTitle")}</h4>
            <div className="flex gap-1">
              {PERIOD_OPTIONS.map((d) => (
                <button
                  key={d}
                  onClick={() => setDays(d)}
                  className={`rounded-lg border px-2 py-1 text-xs font-medium ${days === d ? "border-series-1 bg-series-1/10 text-series-1" : "border-border text-ink-secondary"}`}
                >
                  {t("partner.daysLabel", { days: d })}
                </button>
              ))}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2 text-center">
            <div className="rounded-xl border border-border bg-ink-primary/[0.03] p-3">
              <p className="text-lg font-semibold tabular-nums text-ink-primary">₹{formatINR(profitShare.kilnNetProfit)}</p>
              <p className="text-sm text-ink-muted">{t("partner.kilnNetProfitLabel")}</p>
            </div>
            <div className="rounded-xl border border-series-1/30 bg-series-1/5 p-3">
              <p className="text-lg font-semibold tabular-nums text-series-1">₹{formatINR(profitShare.shareAmount)}</p>
              <p className="text-sm text-ink-muted">{t("partner.yourShareLabel", { percent: profitShare.sharePercent })}</p>
            </div>
          </div>
        </Card>

        <Card className="lg:col-span-2">
          <div className="mb-3 flex items-center justify-between">
            <h4 className="text-xs font-semibold uppercase tracking-wide text-ink-muted">{t("partner.assetsSection")}</h4>
            <Button
              size="sm"
              onClick={() => {
                setEditingAsset(null);
                setShowAssetForm(true);
              }}
            >
              <Plus className="h-4 w-4" /> {t("partner.addAssetButton")}
            </Button>
          </div>
          {(showAssetForm || editingAsset) && (
            <AddAssetForm
              partnerId={partnerId}
              existing={editingAsset}
              onClose={() => {
                setShowAssetForm(false);
                setEditingAsset(null);
              }}
              onSaved={() => {
                setShowAssetForm(false);
                setEditingAsset(null);
                refresh();
              }}
            />
          )}
          {assets.length === 0 ? (
            <p className="py-6 text-center text-sm text-ink-muted">{t("partner.noAssetsYet")}</p>
          ) : (
            <div className="flex flex-col gap-2">
              {assets.map((asset) => (
                <div key={asset._id} className="flex items-center justify-between rounded-xl border border-border bg-ink-primary/[0.03] p-3">
                  <div className="flex items-center gap-2.5">
                    {asset.assetType === "VEHICLE" ? <Car className="h-4 w-4 text-series-1" /> : asset.assetType === "LAND" ? <MapPin className="h-4 w-4 text-series-3" /> : null}
                    <div>
                      <p className="text-sm font-medium text-ink-primary">{asset.description}</p>
                      <p className="text-sm text-ink-muted">
                        {asset.assetType === "LAND" && asset.landAreaBigha != null ? t("partner.bighaLabel", { area: asset.landAreaBigha }) + " · " : ""}
                        {asset.rentalRate != null ? `₹${formatINR(asset.rentalRate)}${asset.rentalRateUnit ? ` / ${asset.rentalRateUnit}` : ""}` : t("partner.noRentLabel")}
                      </p>
                    </div>
                  </div>
                  <div className="flex gap-1.5">
                    <button
                      onClick={() => setEditingAsset(asset)}
                      className="flex h-7 w-7 items-center justify-center rounded-lg border border-border text-ink-secondary hover:border-series-1/50 hover:text-series-1"
                      aria-label={t("common.edit")}
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </button>
                    <button
                      onClick={() => setPendingDeleteAssetId(asset._id)}
                      className="flex h-7 w-7 items-center justify-center rounded-lg border border-status-critical/30 text-status-critical hover:bg-status-critical/10"
                      aria-label={t("common.delete")}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>

        <Card className="lg:col-span-2">
          <h4 className="mb-3 text-xs font-semibold uppercase tracking-wide text-ink-muted">{t("partner.salesThroughSection")}</h4>
          {invoicesThrough.length === 0 ? (
            <p className="py-6 text-center text-sm text-ink-muted">{t("partner.noSalesYet")}</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[560px] text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-sm text-ink-muted">
                    <th className="pb-2 font-medium">{t("common.date")}</th>
                    <th className="pb-2 font-medium">{t("partner.customerHeader")}</th>
                    <th className="pb-2 font-medium text-right">{t("partner.netAmountHeader")}</th>
                    <th className="pb-2 font-medium text-right">{t("partner.pendingHeader")}</th>
                  </tr>
                </thead>
                <tbody>
                  {invoicesThrough.map((inv) => {
                    const pending = Math.max(0, inv.netAmount - (inv.amountPaidNow ?? inv.netAmount));
                    return (
                      <tr key={inv._id} className="border-b border-border/60 last:border-0">
                        <td className="py-3 text-ink-secondary">{inv.invoiceDate ? new Date(inv.invoiceDate).toLocaleDateString("en-IN") : "—"}</td>
                        <td className="py-3 text-ink-primary">{inv.customerName}</td>
                        <td className="py-3 text-right tabular-nums font-medium text-ink-primary">₹{formatINR(inv.netAmount)}</td>
                        <td className={`py-3 text-right tabular-nums ${pending > 0 ? "text-status-critical" : "text-status-good"}`}>₹{formatINR(pending)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </div>

      {pendingDeleteAsset && (
        <ConfirmDialog
          title={t("common.delete")}
          detail={t("partner.confirmDeleteAsset")}
          confirmLabel={t("common.delete")}
          loading={deleting}
          onCancel={() => setPendingDeleteAssetId(null)}
          onConfirm={async () => {
            setDeleting(true);
            try {
              await api.partnerAssets.remove(pendingDeleteAsset._id);
              setPendingDeleteAssetId(null);
            } finally {
              setDeleting(false);
            }
          }}
        />
      )}

      {ledgerOpen && <LedgerModal person={partner} onClose={() => setLedgerOpen(false)} />}
    </div>
  );
}

function PartnerEditForm({ partnerId, existing, onClose, onSaved }: { partnerId: string; existing: PartnerDetail["partner"]; onClose: () => void; onSaved: () => void }) {
  const { t } = useTranslation();
  const [name, setName] = useState(existing.name);
  const [phone, setPhone] = useState(existing.phone ?? "");
  const [address, setAddress] = useState(existing.address ?? "");
  const [partnershipDate, setPartnershipDate] = useState(existing.partnershipDate?.slice(0, 10) ?? "");
  const [profitSharePercent, setProfitSharePercent] = useState(existing.profitSharePercent?.toString() ?? "");
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      await api.people.update(partnerId, {
        name: name.trim(),
        phone: phone.trim() || undefined,
        address: address.trim() || undefined,
        partnershipDate: partnershipDate || undefined,
        profitSharePercent: profitSharePercent ? Number(profitSharePercent) : undefined,
      });
      onSaved();
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex max-w-md flex-col gap-3">
      <input required value={name} onChange={(e) => setName(e.target.value)} className={inputClass} placeholder={t("partner.namePlaceholder")} />
      <input value={phone} onChange={(e) => setPhone(e.target.value)} className={inputClass} placeholder={t("partner.phonePlaceholder")} />
      <input value={address} onChange={(e) => setAddress(e.target.value)} className={inputClass} placeholder={t("partner.addressPlaceholder")} />
      <input type="date" value={partnershipDate} onChange={(e) => setPartnershipDate(e.target.value)} className={inputClass} />
      <input type="number" min={0} max={100} step="0.01" value={profitSharePercent} onChange={(e) => setProfitSharePercent(e.target.value)} className={inputClass} placeholder={t("partner.profitSharePlaceholder")} />
      <div className="flex gap-2">
        <Button type="submit" size="sm" disabled={saving}>
          {saving ? t("settings.savingEllipsis") : t("common.save")}
        </Button>
        <Button type="button" size="sm" variant="outline" onClick={onClose}>
          {t("common.cancel")}
        </Button>
      </div>
    </form>
  );
}
