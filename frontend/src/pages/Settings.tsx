import { FormEvent, useEffect, useState } from "react";
import { LocateFixed, Loader2, Plus } from "lucide-react";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { DateInput } from "@/components/ui/date-input";
import { api } from "@/lib/api";
import { useKilnEvent } from "@/hooks/useKilnEvent";
import { useAuthStore } from "@/store/auth.store";
import { useTranslation } from "@/hooks/useTranslation";
import { PhotoCaptureInput } from "@/components/people/PhotoCaptureInput";
import { ConfirmDialog } from "@/components/shared/ConfirmDialog";
import { cn } from "@/lib/utils";
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
          max={200}
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

// "YYYY-MM-DD" in LOCAL time — what <input type="date"> expects/emits, same
// helper Compare.tsx uses for its own date pickers.
function pad2(n: number) {
  return String(n).padStart(2, "0");
}
function toDateInputValue(d: Date) {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

function BhattaSeasonSettings() {
  const { t } = useTranslation();
  const seasons = useAuthStore((s) => s.seasons);
  const activeSeasonId = useAuthStore((s) => s.activeSeasonId);
  const setSeasons = useAuthStore((s) => s.setSeasons);
  const setActiveSeason = useAuthStore((s) => s.setActiveSeason);

  const [label, setLabel] = useState("");
  const [startDate, setStartDate] = useState(() => toDateInputValue(new Date()));
  const [confirming, setConfirming] = useState(false);
  const [saving, setSaving] = useState(false);

  async function handleStart() {
    setSaving(true);
    try {
      const created = await api.seasons.create({ label: label.trim(), startDate });
      const refreshed = await api.seasons.list();
      setSeasons(refreshed);
      setActiveSeason(created._id);
      setLabel("");
      setStartDate(toDateInputValue(new Date()));
      setConfirming(false);
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

      <div className="flex flex-col gap-2">
        {seasons.map((s) => {
          const active = s._id === activeSeasonId;
          return (
            <button
              key={s._id}
              type="button"
              onClick={() => setActiveSeason(s._id)}
              className={cn(
                "flex items-center justify-between rounded-xl border px-3 py-2 text-left text-sm transition-colors",
                active ? "border-series-1 bg-series-1/10" : "border-border hover:border-ink-primary/15"
              )}
            >
              <div className="min-w-0">
                <p className="truncate font-medium text-ink-primary">{s.label}</p>
                <p className="truncate text-sm text-ink-muted">
                  {new Date(s.startDate).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })}
                </p>
              </div>
              <Badge variant={s.isCurrent ? "good" : "neutral"}>
                {s.isCurrent ? t("settings.currentSeason") : t("settings.archivedSeason")}
              </Badge>
            </button>
          );
        })}
      </div>

      <div className="my-4 h-px bg-border" />

      <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-muted">{t("settings.startNewSeason")}</p>
      <div className="flex flex-col gap-3">
        <input
          placeholder={t("settings.newSeasonLabelPlaceholder")}
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          className={inputClass}
        />
        <DateInput value={startDate} onChange={(e) => setStartDate(e.target.value)} className={inputClass} />
        <Button type="button" variant="outline" disabled={!label.trim() || !startDate} onClick={() => setConfirming(true)}>
          {t("settings.startSeasonButton")}
        </Button>
      </div>

      {confirming && (
        <ConfirmDialog
          title={t("settings.startSeasonConfirmTitle")}
          detail={t("settings.startSeasonConfirmDetail")}
          confirmLabel={saving ? t("settings.savingEllipsis") : t("settings.startSeasonButton")}
          onConfirm={handleStart}
          onCancel={() => setConfirming(false)}
          loading={saving}
        />
      )}
    </Card>
  );
}

function ShiftSettings() {
  const { t } = useTranslation();
  const kilns = useAuthStore((s) => s.kilns);
  const activeKilnId = useAuthStore((s) => s.activeKilnId);
  const setKilns = useAuthStore((s) => s.setKilns);
  const activeKiln = kilns.find((k) => k.kilnId === activeKilnId);

  const [start, setStart] = useState(activeKiln?.dayShiftStart ?? "08:00");
  const [end, setEnd] = useState(activeKiln?.dayShiftEnd ?? "18:00");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    setStart(activeKiln?.dayShiftStart ?? "08:00");
    setEnd(activeKiln?.dayShiftEnd ?? "18:00");
  }, [activeKilnId]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      await api.kilns.updateShiftTimes(start, end);
      setKilns(kilns.map((k) => (k.kilnId === activeKilnId ? { ...k, dayShiftStart: start, dayShiftEnd: end } : k)));
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card className="max-w-md">
      <CardHeader>
        <CardTitle>{t("settings.shiftTimings")}</CardTitle>
      </CardHeader>
      <p className="mb-4 text-sm text-ink-muted">{t("settings.shiftTimingsDescription")}</p>

      <form onSubmit={handleSubmit} className="flex flex-col gap-3">
        <div className="flex gap-2">
          <div className="flex-1">
            <label className="mb-1 block text-sm text-ink-muted">{t("settings.shiftStart")}</label>
            <input type="time" required value={start} onChange={(e) => setStart(e.target.value)} className={inputClass} />
          </div>
          <div className="flex-1">
            <label className="mb-1 block text-sm text-ink-muted">{t("settings.shiftEnd")}</label>
            <input type="time" required value={end} onChange={(e) => setEnd(e.target.value)} className={inputClass} />
          </div>
        </div>
        <Button type="submit" disabled={saving}>
          {saved ? t("settings.saved") : saving ? t("settings.savingEllipsis") : t("settings.saveShiftTimings")}
        </Button>
      </form>
    </Card>
  );
}

function GstSettings() {
  const { t } = useTranslation();
  const kilns = useAuthStore((s) => s.kilns);
  const activeKilnId = useAuthStore((s) => s.activeKilnId);
  const setKilns = useAuthStore((s) => s.setKilns);
  const activeKiln = kilns.find((k) => k.kilnId === activeKilnId);

  const [gstNumber, setGstNumber] = useState(activeKiln?.gstNumber ?? "");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    setGstNumber(activeKiln?.gstNumber ?? "");
  }, [activeKilnId]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      const trimmed = gstNumber.trim();
      await api.kilns.updateGst(trimmed || null);
      setKilns(kilns.map((k) => (k.kilnId === activeKilnId ? { ...k, gstNumber: trimmed || undefined } : k)));
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card className="max-w-md">
      <CardHeader>
        <CardTitle>{t("settings.gstNumber")}</CardTitle>
      </CardHeader>
      <p className="mb-4 text-sm text-ink-muted">{t("settings.gstNumberDescription")}</p>

      <form onSubmit={handleSubmit} className="flex flex-col gap-3">
        <input
          placeholder={t("settings.gstNumberPlaceholder")}
          value={gstNumber}
          onChange={(e) => setGstNumber(e.target.value)}
          className={inputClass}
        />
        <Button type="submit" disabled={saving}>
          {saved ? t("settings.saved") : saving ? t("settings.savingEllipsis") : t("settings.saveGstNumber")}
        </Button>
      </form>
    </Card>
  );
}

// GST invoice billing details (State Code, Bank details, default Terms &
// Conditions) — separate card/save action from GstSettings above since
// it's a distinct set of fields with its own PATCH endpoint
// (api.kilns.updateBilling), all print-only on the Invoice (see
// printDocument.ts's printInvoiceRecord).
function BillingDetailsSettings() {
  const { t } = useTranslation();
  const kilns = useAuthStore((s) => s.kilns);
  const activeKilnId = useAuthStore((s) => s.activeKilnId);
  const setKilns = useAuthStore((s) => s.setKilns);
  const activeKiln = kilns.find((k) => k.kilnId === activeKilnId);

  const [stateCode, setStateCode] = useState(activeKiln?.stateCode ?? "");
  const [bankAccountNumber, setBankAccountNumber] = useState(activeKiln?.bankAccountNumber ?? "");
  const [bankName, setBankName] = useState(activeKiln?.bankName ?? "");
  const [bankIfscCode, setBankIfscCode] = useState(activeKiln?.bankIfscCode ?? "");
  const [defaultTermsAndConditions, setDefaultTermsAndConditions] = useState(activeKiln?.defaultTermsAndConditions ?? "");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    setStateCode(activeKiln?.stateCode ?? "");
    setBankAccountNumber(activeKiln?.bankAccountNumber ?? "");
    setBankName(activeKiln?.bankName ?? "");
    setBankIfscCode(activeKiln?.bankIfscCode ?? "");
    setDefaultTermsAndConditions(activeKiln?.defaultTermsAndConditions ?? "");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeKilnId]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      const patch = {
        stateCode: stateCode.trim() || null,
        bankAccountNumber: bankAccountNumber.trim() || null,
        bankName: bankName.trim() || null,
        bankIfscCode: bankIfscCode.trim() || null,
        defaultTermsAndConditions: defaultTermsAndConditions.trim() || null,
      };
      await api.kilns.updateBilling(patch);
      setKilns(kilns.map((k) => (k.kilnId === activeKilnId ? { ...k, ...Object.fromEntries(Object.entries(patch).map(([key, v]) => [key, v ?? undefined])) } : k)));
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card className="max-w-md">
      <CardHeader>
        <CardTitle>{t("settings.billingDetails")}</CardTitle>
      </CardHeader>
      <p className="mb-4 text-sm text-ink-muted">{t("settings.billingDetailsDescription")}</p>

      <form onSubmit={handleSubmit} className="flex flex-col gap-3">
        <input placeholder={t("settings.stateCodePlaceholder")} value={stateCode} onChange={(e) => setStateCode(e.target.value)} className={inputClass} />
        <input placeholder={t("settings.bankAccountNumberPlaceholder")} value={bankAccountNumber} onChange={(e) => setBankAccountNumber(e.target.value)} className={inputClass} />
        <input placeholder={t("settings.bankNamePlaceholder")} value={bankName} onChange={(e) => setBankName(e.target.value)} className={inputClass} />
        <input placeholder={t("settings.bankIfscPlaceholder")} value={bankIfscCode} onChange={(e) => setBankIfscCode(e.target.value)} className={inputClass} />
        <textarea
          placeholder={t("settings.termsAndConditionsPlaceholder")}
          value={defaultTermsAndConditions}
          onChange={(e) => setDefaultTermsAndConditions(e.target.value)}
          rows={4}
          className="rounded-xl border border-border bg-ink-primary/5 px-3 py-2 text-sm text-ink-primary outline-none focus:ring-2 focus:ring-series-1"
        />
        <Button type="submit" disabled={saving}>
          {saved ? t("settings.saved") : saving ? t("settings.savingEllipsis") : t("settings.saveBillingDetails")}
        </Button>
      </form>
    </Card>
  );
}

// Shown above "AUTHORISED SIGNATURE" on the printed Invoice when set (see
// printInvoiceRecord) — uploaded once here, unlike PhotoCaptureInput's
// usual "hold the file, upload after the parent record is created" use on
// a person's own profile: the kiln already exists, so this uploads
// immediately on pick rather than deferring to a later form submit.
function SignatureSettings() {
  const { t } = useTranslation();
  const kilns = useAuthStore((s) => s.kilns);
  const activeKilnId = useAuthStore((s) => s.activeKilnId);
  const setKilns = useAuthStore((s) => s.setKilns);
  const activeKiln = kilns.find((k) => k.kilnId === activeKilnId);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    let objectUrl: string | null = null;
    if (activeKiln?.signaturePath) {
      api.kilns.fetchSignatureBlob().then((blob) => {
        if (cancelled || !blob) return;
        objectUrl = URL.createObjectURL(blob);
        setPreviewUrl(objectUrl);
      });
    } else {
      setPreviewUrl(null);
    }
    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [activeKilnId, activeKiln?.signaturePath]);

  async function handleChange(file: File | Blob | null) {
    if (!file) return;
    setUploading(true);
    try {
      const updated = await api.kilns.uploadSignature(file);
      setKilns(kilns.map((k) => (k.kilnId === activeKilnId ? { ...k, signaturePath: updated.signaturePath } : k)));
    } finally {
      setUploading(false);
    }
  }

  return (
    <Card className="max-w-md">
      <CardHeader>
        <CardTitle>{t("settings.authorisedSignature")}</CardTitle>
      </CardHeader>
      <p className="mb-4 text-sm text-ink-muted">{t("settings.authorisedSignatureDescription")}</p>
      {previewUrl && (
        <img src={previewUrl} alt="" className="mb-3 h-20 max-w-full rounded-xl border border-border bg-white object-contain p-2" />
      )}
      <PhotoCaptureInput value={null} onChange={handleChange} />
      {uploading && <p className="mt-2 text-sm text-ink-muted">{t("settings.savingEllipsis")}</p>}
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
          <DateInput
            required
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
      <BhattaSeasonSettings />
      <ShiftSettings />
      <GstSettings />
      <BillingDetailsSettings />
      <SignatureSettings />
      <ComplianceSettings />
      <StockAuditSettings />
    </div>
  );
}
