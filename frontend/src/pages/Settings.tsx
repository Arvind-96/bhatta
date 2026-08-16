import { FormEvent, useEffect, useState } from "react";
import { LocateFixed, Loader2, Plus } from "lucide-react";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { api } from "@/lib/api";
import { useKilnEvent } from "@/hooks/useKilnEvent";
import { useAuthStore } from "@/store/auth.store";
import { useTranslation } from "@/hooks/useTranslation";
import type { ComplianceDocument, ComplianceDocumentType, StockAudit } from "@/types";

const inputClass =
  "h-10 rounded-xl border border-border bg-ink-primary/5 px-3 text-sm text-ink-primary outline-none focus:ring-2 focus:ring-series-1";

function KilnProfileSettings() {
  const { t } = useTranslation();
  const kilns = useAuthStore((s) => s.kilns);
  const activeKilnId = useAuthStore((s) => s.activeKilnId);
  const setKilns = useAuthStore((s) => s.setKilns);
  const activeKiln = kilns.find((k) => k.kilnId === activeKilnId);

  const [name, setName] = useState(activeKiln?.name ?? "");
  const [location, setLocation] = useState(activeKiln?.location ?? "");
  const [phone, setPhone] = useState(activeKiln?.phone ?? "");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    setName(activeKiln?.name ?? "");
    setLocation(activeKiln?.location ?? "");
    setPhone(activeKiln?.phone ?? "");
  }, [activeKilnId]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setSaving(true);
    try {
      const profile = { name: name.trim(), location: location.trim() || undefined, phone: phone.trim() || undefined };
      await api.kilns.updateProfile(profile);
      setKilns(kilns.map((k) => (k.kilnId === activeKilnId ? { ...k, ...profile } : k)));
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card className="max-w-md">
      <CardHeader>
        <CardTitle>{t("settings.kilnProfile")}</CardTitle>
      </CardHeader>
      <p className="mb-4 text-sm text-ink-muted">{t("settings.kilnProfileDescription")}</p>

      <form onSubmit={handleSubmit} className="flex flex-col gap-3">
        <input required placeholder={t("setup.kilnName")} value={name} onChange={(e) => setName(e.target.value)} className={inputClass} />
        <input placeholder={t("setup.kilnLocation")} value={location} onChange={(e) => setLocation(e.target.value)} className={inputClass} />
        <input placeholder={t("setup.kilnPhone")} value={phone} onChange={(e) => setPhone(e.target.value)} className={inputClass} />
        <Button type="submit" disabled={saving}>
          {saved ? t("settings.saved") : saving ? t("settings.savingEllipsis") : t("settings.saveProfile")}
        </Button>
      </form>
    </Card>
  );
}

function GeofenceSettings() {
  const { t } = useTranslation();
  const [latitude, setLatitude] = useState("");
  const [longitude, setLongitude] = useState("");
  const [radiusMeters, setRadiusMeters] = useState("200");
  const [locating, setLocating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  function useCurrentLocation() {
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLatitude(pos.coords.latitude.toFixed(6));
        setLongitude(pos.coords.longitude.toFixed(6));
        setLocating(false);
      },
      () => setLocating(false),
      { enableHighAccuracy: true }
    );
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!latitude || !longitude) return;
    setSaving(true);
    try {
      await api.kilns.updateGeofence(Number(latitude), Number(longitude), Number(radiusMeters));
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card className="max-w-md">
      <CardHeader>
        <CardTitle>{t("settings.attendanceGeofence")}</CardTitle>
      </CardHeader>
      <p className="mb-4 text-sm text-ink-muted">
        {t("settings.geofenceDescription")}
      </p>

      <form onSubmit={handleSubmit} className="flex flex-col gap-3">
        <Button type="button" variant="outline" onClick={useCurrentLocation} disabled={locating}>
          {locating ? <Loader2 className="h-4 w-4 animate-spin" /> : <LocateFixed className="h-4 w-4" />}
          {t("settings.useCurrentLocation")}
        </Button>

        <div className="flex gap-2">
          <input
            required
            placeholder={t("settings.latitude")}
            value={latitude}
            onChange={(e) => setLatitude(e.target.value)}
            className={inputClass}
          />
          <input
            required
            placeholder={t("settings.longitude")}
            value={longitude}
            onChange={(e) => setLongitude(e.target.value)}
            className={inputClass}
          />
        </div>
        <input
          type="number"
          placeholder={t("settings.radiusMeters")}
          value={radiusMeters}
          onChange={(e) => setRadiusMeters(e.target.value)}
          className={inputClass}
        />

        <Button type="submit" disabled={saving}>
          {saved ? t("settings.saved") : saving ? t("settings.savingEllipsis") : t("settings.saveGeofence")}
        </Button>
      </form>
    </Card>
  );
}

function ChamberSettings() {
  const { t } = useTranslation();
  const [count, setCount] = useState("24");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!count) return;
    setSaving(true);
    try {
      await api.ghers.setup(Number(count));
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card className="max-w-md">
      <CardHeader>
        <CardTitle>{t("settings.kilnChambers")}</CardTitle>
      </CardHeader>
      <p className="mb-4 text-sm text-ink-muted">
        {t("settings.chambersDescription")}
      </p>

      <form onSubmit={handleSubmit} className="flex flex-col gap-3">
        <input
          type="number"
          min={1}
          max={60}
          placeholder={t("settings.numberOfChambers")}
          value={count}
          onChange={(e) => setCount(e.target.value)}
          className={inputClass}
        />
        <Button type="submit" disabled={saving}>
          {saved ? t("settings.saved") : saving ? t("settings.savingEllipsis") : t("settings.saveChamberCount")}
        </Button>
      </form>
    </Card>
  );
}

function YardCapacitySettings() {
  const { t } = useTranslation();
  const [capacity, setCapacity] = useState("");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!capacity) return;
    setSaving(true);
    try {
      await api.kilns.updateYardCapacity(Number(capacity));
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card className="max-w-md">
      <CardHeader>
        <CardTitle>{t("settings.dryingYardCapacity")}</CardTitle>
      </CardHeader>
      <p className="mb-4 text-sm text-ink-muted">
        {t("settings.yardCapacityDescription")}
      </p>

      <form onSubmit={handleSubmit} className="flex flex-col gap-3">
        <input
          type="number"
          placeholder={t("settings.yardCapacityPlaceholder")}
          value={capacity}
          onChange={(e) => setCapacity(e.target.value)}
          className={inputClass}
        />
        <Button type="submit" disabled={saving}>
          {saved ? t("settings.saved") : saving ? t("settings.savingEllipsis") : t("settings.saveCapacity")}
        </Button>
      </form>
    </Card>
  );
}

const MONTH_OPTIONS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

// A fixed non-leap reference year (2023) — this is a recurring annual
// anchor day, not tied to any specific year, so Feb is always capped at
// 28 rather than sometimes allowing a Feb 29 that won't exist most years.
function daysInMonth(month: number) {
  return new Date(2023, month, 0).getDate();
}

function SeasonSettings() {
  const { t } = useTranslation();
  const kilns = useAuthStore((s) => s.kilns);
  const activeKilnId = useAuthStore((s) => s.activeKilnId);
  const setKilns = useAuthStore((s) => s.setKilns);
  const activeKiln = kilns.find((k) => k.kilnId === activeKilnId);

  const [startMonth, setStartMonth] = useState(activeKiln?.seasonStartMonth ?? 8);
  const [startDay, setStartDay] = useState(activeKiln?.seasonStartDay ?? 1);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    setStartMonth(activeKiln?.seasonStartMonth ?? 8);
    setStartDay(activeKiln?.seasonStartDay ?? 1);
  }, [activeKilnId]);

  // Clamp the day whenever the month changes so e.g. picking February never
  // leaves a previously-selected "31" sitting there as an invalid value.
  function changeMonth(month: number) {
    setStartMonth(month);
    setStartDay((day) => Math.min(day, daysInMonth(month)));
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      await api.kilns.updateSeason(startMonth, startDay);
      setKilns(kilns.map((k) => (k.kilnId === activeKilnId ? { ...k, seasonStartMonth: startMonth, seasonStartDay: startDay } : k)));
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card className="max-w-md">
      <CardHeader>
        <CardTitle>{t("settings.bhattaSeason")}</CardTitle>
      </CardHeader>
      <p className="mb-4 text-sm text-ink-muted">{t("settings.bhattaSeasonDescription")}</p>

      <form onSubmit={handleSubmit} className="flex flex-col gap-3">
        <div className="flex gap-2">
          <select value={startMonth} onChange={(e) => changeMonth(Number(e.target.value))} className={inputClass + " flex-1"}>
            {MONTH_OPTIONS.map((name, i) => (
              <option key={name} value={i + 1}>
                {name}
              </option>
            ))}
          </select>
          <input
            type="number"
            min={1}
            max={daysInMonth(startMonth)}
            value={startDay}
            onChange={(e) => setStartDay(Math.max(1, Math.min(Number(e.target.value), daysInMonth(startMonth))))}
            className={inputClass + " w-20"}
          />
        </div>
        <Button type="submit" disabled={saving}>
          {saved ? t("settings.saved") : saving ? t("settings.savingEllipsis") : t("settings.saveSeason")}
        </Button>
      </form>
    </Card>
  );
}

const COMPLIANCE_LABEL_KEYS: Record<ComplianceDocumentType, string> = {
  PCB_CONSENT_TO_OPERATE: "settings.pcbConsent",
  MINING_ROYALTY_LICENSE: "settings.miningRoyaltyLicense",
  ZIG_ZAG_CERTIFICATE: "settings.zigZagCertificate",
  ENVIRONMENTAL_CLEARANCE: "settings.environmentalClearance",
  OTHER: "settings.complianceOther",
};

function ComplianceSettings() {
  const { t } = useTranslation();
  const [docs, setDocs] = useState<ComplianceDocument[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({
    documentType: "PCB_CONSENT_TO_OPERATE" as ComplianceDocumentType,
    title: "",
    expiryDate: "",
  });
  const [loading, setLoading] = useState(false);
  const activeKilnId = useAuthStore((s) => s.activeKilnId);

  async function refresh() {
    setDocs(await api.compliance.list());
  }

  useEffect(() => {
    if (!activeKilnId) return;
    refresh().catch(console.error);
  }, [activeKilnId]);

  useKilnEvent("compliance:update", () => refresh());

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!form.title || !form.expiryDate) return;
    setLoading(true);
    try {
      await api.compliance.create(form);
      setForm({ documentType: "PCB_CONSENT_TO_OPERATE", title: "", expiryDate: "" });
      setShowForm(false);
      await refresh();
    } finally {
      setLoading(false);
    }
  }

  function daysUntil(expiryDate: string) {
    return Math.ceil((new Date(expiryDate).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
  }

  return (
    <Card className="max-w-md">
      <CardHeader>
        <CardTitle>{t("settings.legalComplianceDocuments")}</CardTitle>
        <Button size="sm" variant="ghost" onClick={() => setShowForm((s) => !s)}>
          <Plus className="h-4 w-4" />
        </Button>
      </CardHeader>
      <p className="mb-4 text-sm text-ink-muted">
        {t("settings.complianceDescription")}
      </p>

      {showForm && (
        <form onSubmit={handleSubmit} className="mb-4 flex flex-col gap-2">
          <select
            value={form.documentType}
            onChange={(e) => setForm((f) => ({ ...f, documentType: e.target.value as ComplianceDocumentType }))}
            className={inputClass}
          >
            {Object.entries(COMPLIANCE_LABEL_KEYS).map(([value, labelKey]) => (
              <option key={value} value={value}>
                {t(labelKey)}
              </option>
            ))}
          </select>
          <input
            required
            placeholder={t("settings.titleReferenceNumber")}
            value={form.title}
            onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
            className={inputClass}
          />
          <input
            required
            type="date"
            value={form.expiryDate}
            onChange={(e) => setForm((f) => ({ ...f, expiryDate: e.target.value }))}
            className={inputClass}
          />
          <Button type="submit" disabled={loading}>
            {t("settings.saveDocument")}
          </Button>
        </form>
      )}

      <div className="space-y-1">
        {docs.length === 0 && <p className="py-4 text-center text-sm text-ink-muted">{t("settings.noDocumentsYet")}</p>}
        {docs.map((doc) => {
          const days = daysUntil(doc.expiryDate);
          return (
            <div key={doc._id} className="flex items-center justify-between rounded-lg border border-border px-3 py-2 text-sm">
              <div>
                <p className="text-ink-primary">{doc.title}</p>
                <p className="text-sm text-ink-muted">{t(COMPLIANCE_LABEL_KEYS[doc.documentType])}</p>
              </div>
              <Badge variant={days < 0 ? "critical" : days <= 30 ? "warning" : "good"}>
                {days < 0 ? t("settings.expired") : t("settings.daysLeft", { days })}
              </Badge>
            </div>
          );
        })}
      </div>
    </Card>
  );
}

function StockAuditSettings() {
  const { t } = useTranslation();
  const [audits, setAudits] = useState<StockAudit[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ itemName: "", physicalCount: "", notes: "" });
  const [loading, setLoading] = useState(false);
  const activeKilnId = useAuthStore((s) => s.activeKilnId);

  async function refresh() {
    setAudits(await api.stockAudits.list());
  }

  useEffect(() => {
    if (!activeKilnId) return;
    refresh().catch(console.error);
  }, [activeKilnId]);

  useKilnEvent("stockAudit:update", () => refresh());

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!form.itemName || !form.physicalCount) return;
    setLoading(true);
    try {
      await api.stockAudits.create({
        itemName: form.itemName,
        physicalCount: Number(form.physicalCount),
        notes: form.notes || undefined,
      });
      setForm({ itemName: "", physicalCount: "", notes: "" });
      setShowForm(false);
      await refresh();
    } finally {
      setLoading(false);
    }
  }

  return (
    <Card className="max-w-md">
      <CardHeader>
        <CardTitle>{t("settings.physicalStockAudit")}</CardTitle>
        <Button size="sm" variant="ghost" onClick={() => setShowForm((s) => !s)}>
          <Plus className="h-4 w-4" />
        </Button>
      </CardHeader>
      <p className="mb-4 text-sm text-ink-muted">
        {t("settings.stockAuditDescription")}
      </p>

      {showForm && (
        <form onSubmit={handleSubmit} className="mb-4 flex flex-col gap-2">
          <input
            required
            placeholder={t("settings.itemPlaceholder")}
            value={form.itemName}
            onChange={(e) => setForm((f) => ({ ...f, itemName: e.target.value }))}
            className={inputClass}
          />
          <input
            required
            type="number"
            placeholder={t("settings.physicalCountPlaceholder")}
            value={form.physicalCount}
            onChange={(e) => setForm((f) => ({ ...f, physicalCount: e.target.value }))}
            className={inputClass}
          />
          <input
            placeholder={t("common.notesOptional")}
            value={form.notes}
            onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
            className={inputClass}
          />
          <Button type="submit" disabled={loading}>
            {t("settings.saveAuditButton")}
          </Button>
        </form>
      )}

      <div className="space-y-1">
        {audits.length === 0 && <p className="py-4 text-center text-sm text-ink-muted">{t("settings.noAuditsYet")}</p>}
        {audits.map((a) => (
          <div key={a._id} className="flex items-center justify-between rounded-lg border border-border px-3 py-2 text-sm">
            <div>
              <p className="text-ink-primary">{a.itemName}</p>
              <p className="text-sm text-ink-muted">
                {t("settings.registerPhysicalDate", {
                  register: a.registerCount.toLocaleString("en-IN"),
                  physical: a.physicalCount.toLocaleString("en-IN"),
                  date: new Date(a.date).toLocaleDateString("en-IN"),
                })}
              </p>
            </div>
            <Badge variant={a.variance === 0 ? "good" : Math.abs(a.variance) <= a.registerCount * 0.02 ? "warning" : "critical"}>
              {a.variance > 0 ? "+" : ""}
              {a.variance.toLocaleString("en-IN")}
            </Badge>
          </div>
        ))}
      </div>
    </Card>
  );
}

export function Settings() {
  return (
    <div className="flex flex-wrap gap-4">
      <KilnProfileSettings />
      <GeofenceSettings />
      <ChamberSettings />
      <YardCapacitySettings />
      <SeasonSettings />
      <ComplianceSettings />
      <StockAuditSettings />
    </div>
  );
}
