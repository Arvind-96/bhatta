import { FormEvent, useEffect, useState } from "react";
import { Handshake, Pencil, Phone, Plus, Search, Trash2 } from "lucide-react";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { DateInput } from "@/components/ui/date-input";
import { Pagination, usePagination } from "@/components/ui/pagination";
import { EmptyState } from "@/components/ui/empty-state";
import { ConfirmDialog } from "@/components/shared/ConfirmDialog";
import { PartnerDetailPage } from "@/components/partner/PartnerDetailPage";
import { api } from "@/lib/api";
import { useKilnEvent } from "@/hooks/useKilnEvent";
import { useAuthStore } from "@/store/auth.store";
import { useTranslation } from "@/hooks/useTranslation";
import { cn } from "@/lib/utils";
import type { Person } from "@/types";

const inputClass =
  "h-10 rounded-xl border border-border bg-ink-primary/5 px-3 text-sm text-ink-primary outline-none focus:ring-2 focus:ring-series-1";

function AddPartnerForm({ existing, onClose, onSaved }: { existing: Person | null; onClose: () => void; onSaved: () => void }) {
  const { t } = useTranslation();
  const [name, setName] = useState(existing?.name ?? "");
  const [phone, setPhone] = useState(existing?.phone ?? "");
  const [address, setAddress] = useState(existing?.address ?? "");
  const [partnershipDate, setPartnershipDate] = useState(existing?.partnershipDate?.slice(0, 10) ?? "");
  const [profitSharePercent, setProfitSharePercent] = useState(existing?.profitSharePercent?.toString() ?? "");
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setSaving(true);
    try {
      const input = {
        type: "PARTNER" as const,
        name: name.trim(),
        phone: phone.trim() || undefined,
        address: address.trim() || undefined,
        partnershipDate: partnershipDate || undefined,
        profitSharePercent: profitSharePercent ? Number(profitSharePercent) : undefined,
      };
      if (existing) await api.people.update(existing._id, input);
      else await api.people.create(input);
      onSaved();
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card className="max-w-md">
      <CardHeader>
        <CardTitle>{existing ? t("partner.editPartner") : t("partner.addPartnerButton")}</CardTitle>
      </CardHeader>
      <form onSubmit={handleSubmit} className="flex flex-col gap-3">
        <input required placeholder={t("partner.namePlaceholder")} value={name} onChange={(e) => setName(e.target.value)} className={inputClass} />
        <input placeholder={t("partner.phonePlaceholder")} value={phone} onChange={(e) => setPhone(e.target.value)} className={inputClass} />
        <input placeholder={t("partner.addressPlaceholder")} value={address} onChange={(e) => setAddress(e.target.value)} className={inputClass} />
        <div>
          <label className="mb-1 block text-xs font-medium text-ink-muted">{t("partner.partnershipDateLabel")}</label>
          <DateInput value={partnershipDate} onChange={(e) => setPartnershipDate(e.target.value)} className={inputClass + " w-full"} />
        </div>
        <input
          type="number"
          min={0}
          max={100}
          step="0.01"
          placeholder={t("partner.profitSharePlaceholder")}
          value={profitSharePercent}
          onChange={(e) => setProfitSharePercent(e.target.value)}
          className={inputClass}
        />
        <div className="flex gap-2">
          <Button type="submit" disabled={saving || !name.trim()}>
            {saving ? t("settings.savingEllipsis") : t("common.save")}
          </Button>
          <Button type="button" variant="outline" onClick={onClose}>
            {t("common.cancel")}
          </Button>
        </div>
      </form>
    </Card>
  );
}

export function Partners() {
  const [partners, setPartners] = useState<Person[]>([]);
  const [mode, setMode] = useState<"list" | "add">("list");
  const [editing, setEditing] = useState<Person | null>(null);
  const [search, setSearch] = useState("");
  const [openPartnerId, setOpenPartnerId] = useState<string | null>(null);
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const activeKilnId = useAuthStore((s) => s.activeKilnId);
  const { t } = useTranslation();

  async function refresh() {
    setPartners(await api.people.list("PARTNER"));
  }

  useEffect(() => {
    if (!activeKilnId) return;
    refresh().catch(console.error);
  }, [activeKilnId]);

  useKilnEvent("person:update", () => refresh());

  const filtered = partners.filter((p) => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return p.name.toLowerCase().includes(q) || (p.phone ?? "").includes(q);
  });
  const { page, setPage, pageCount, pageItems: paged, total } = usePagination(filtered, 10);
  const pendingDeletePartner = partners.find((p) => p._id === pendingDeleteId) ?? null;

  if (openPartnerId) {
    return <PartnerDetailPage partnerId={openPartnerId} onBack={() => setOpenPartnerId(null)} onDeleted={() => setOpenPartnerId(null)} />;
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap justify-end gap-2">
        <Button
          size="sm"
          variant={mode === "add" ? "primary" : "outline"}
          onClick={() => {
            setEditing(null);
            setMode("add");
          }}
        >
          <Plus className="h-4 w-4" /> {t("partner.addPartnerButton")}
        </Button>
        <Button size="sm" variant={mode === "list" ? "primary" : "outline"} onClick={() => setMode("list")}>
          <Handshake className="h-4 w-4" /> {t("nav.partners")}
        </Button>
      </div>

      {mode === "add" ? (
        <AddPartnerForm
          existing={editing}
          onClose={() => {
            setEditing(null);
            setMode("list");
          }}
          onSaved={() => {
            setEditing(null);
            setMode("list");
            refresh();
          }}
        />
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>{t("nav.partners")}</CardTitle>
          </CardHeader>
          <div className="relative mb-3">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-muted" />
            <input
              placeholder={t("partner.searchPlaceholder")}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className={cn(inputClass, "w-full max-w-sm pl-9")}
            />
          </div>
          {partners.length === 0 ? (
            <EmptyState icon={Handshake} title={t("partner.noPartnersYet")} />
          ) : filtered.length === 0 ? (
            <p className="py-8 text-center text-sm text-ink-muted">{t("dispatchDocs.noMatchSearch")}</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[560px] text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-sm text-ink-muted">
                    <th className="pb-2 font-medium">{t("partner.namePlaceholder")}</th>
                    <th className="pb-2 font-medium">{t("partner.phonePlaceholder")}</th>
                    <th className="pb-2 font-medium">{t("partner.partnershipDateLabel")}</th>
                    <th className="pb-2 font-medium text-right">{t("partner.profitShareLabel")}</th>
                    <th className="pb-2 font-medium text-right">{t("common.actions")}</th>
                  </tr>
                </thead>
                <tbody>
                  {paged.map((p) => (
                    <tr key={p._id} onClick={() => setOpenPartnerId(p._id)} className="cursor-pointer border-b border-border/60 last:border-0 hover:bg-ink-primary/5">
                      <td className="py-3 text-ink-primary hover:underline">{p.name}</td>
                      <td className="py-3 text-ink-secondary">
                        {p.phone ? (
                          <a href={`tel:${p.phone}`} onClick={(e) => e.stopPropagation()} className="flex items-center gap-1.5 hover:text-series-1">
                            <Phone className="h-3.5 w-3.5" /> {p.phone}
                          </a>
                        ) : (
                          "—"
                        )}
                      </td>
                      <td className="py-3 text-ink-secondary">{p.partnershipDate ? new Date(p.partnershipDate).toLocaleDateString("en-IN") : "—"}</td>
                      <td className="py-3 text-right tabular-nums text-ink-secondary">{p.profitSharePercent != null ? `${p.profitSharePercent}%` : "—"}</td>
                      <td className="py-3" onClick={(e) => e.stopPropagation()}>
                        <div className="flex justify-end gap-1.5">
                          <button
                            onClick={() => {
                              setEditing(p);
                              setMode("add");
                            }}
                            className="flex h-7 w-7 items-center justify-center rounded-lg border border-border text-ink-secondary hover:border-series-1/50 hover:text-series-1"
                            aria-label={t("common.edit")}
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </button>
                          <button
                            onClick={() => setPendingDeleteId(p._id)}
                            className="flex h-7 w-7 items-center justify-center rounded-lg border border-status-critical/30 text-status-critical hover:bg-status-critical/10"
                            aria-label={t("common.delete")}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <Pagination page={page} pageCount={pageCount} onChange={setPage} total={total} pageSize={10} />
            </div>
          )}
        </Card>
      )}

      {pendingDeletePartner && (
        <ConfirmDialog
          title={t("common.delete")}
          detail={t("partner.confirmDeactivate", { name: pendingDeletePartner.name })}
          confirmLabel={t("common.delete")}
          loading={deleting}
          onCancel={() => setPendingDeleteId(null)}
          onConfirm={async () => {
            setDeleting(true);
            try {
              await api.people.update(pendingDeletePartner._id, { active: false });
              setPendingDeleteId(null);
              refresh();
            } finally {
              setDeleting(false);
            }
          }}
        />
      )}
    </div>
  );
}
