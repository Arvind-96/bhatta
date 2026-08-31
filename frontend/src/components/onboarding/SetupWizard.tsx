import { FormEvent, useState } from "react";
import { Building2, CheckCircle2, Flame, Loader2, Warehouse } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api";
import { useAuthStore } from "@/store/auth.store";
import { useTranslation } from "@/hooks/useTranslation";
import { LanguageSwitcher } from "@/components/layout/LanguageSwitcher";
import { cn } from "@/lib/utils";

const inputClass =
  "h-11 rounded-xl border border-border bg-ink-primary/5 px-3.5 text-sm text-ink-primary outline-none focus:ring-2 focus:ring-series-1";

const STEPS = ["profile", "chambers", "yard", "done"] as const;
type Step = (typeof STEPS)[number];

// Shown in place of the normal app shell (see Dashboard.tsx) for any kiln
// the backend flags needsSetup: true — a brand-new, genuinely empty kiln
// that's never had its basics entered. Each step saves immediately as the
// user moves past it (not just at the end), so a closed tab mid-wizard
// doesn't lose progress; only the final "done" step marks the kiln
// onboarded, which is what makes the wizard stop reappearing.
export function SetupWizard() {
  const { t } = useTranslation();
  const kilns = useAuthStore((s) => s.kilns);
  const activeKilnId = useAuthStore((s) => s.activeKilnId);
  const setKilns = useAuthStore((s) => s.setKilns);
  const activeKiln = kilns.find((k) => k.kilnId === activeKilnId);

  const [stepIndex, setStepIndex] = useState(0);
  const step = STEPS[stepIndex];
  const [saving, setSaving] = useState(false);

  const [name, setName] = useState(activeKiln?.name ?? "");
  const [location, setLocation] = useState(activeKiln?.location ?? "");
  const [phone, setPhone] = useState(activeKiln?.phone ?? "");
  const [chambers, setChambers] = useState("");
  const [yardCapacity, setYardCapacity] = useState("");

  function goNext() {
    setStepIndex((i) => Math.min(i + 1, STEPS.length - 1));
  }
  function goBack() {
    setStepIndex((i) => Math.max(i - 1, 0));
  }

  async function handleProfileSubmit(e: FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setSaving(true);
    try {
      const profile = { name: name.trim(), location: location.trim() || undefined, phone: phone.trim() || undefined };
      await api.kilns.updateProfile(profile);
      setKilns(kilns.map((k) => (k.kilnId === activeKilnId ? { ...k, ...profile } : k)));
      goNext();
    } finally {
      setSaving(false);
    }
  }

  async function handleChambersSubmit(e: FormEvent) {
    e.preventDefault();
    if (chambers.trim()) {
      setSaving(true);
      try {
        await api.ghers.setup(Number(chambers));
      } finally {
        setSaving(false);
      }
    }
    goNext();
  }

  async function handleYardSubmit(e: FormEvent) {
    e.preventDefault();
    if (yardCapacity.trim()) {
      setSaving(true);
      try {
        await api.kilns.updateYardCapacity(Number(yardCapacity));
      } finally {
        setSaving(false);
      }
    }
    goNext();
  }

  async function handleFinish() {
    setSaving(true);
    try {
      await api.kilns.completeOnboarding();
      setKilns(kilns.map((k) => (k.kilnId === activeKilnId ? { ...k, needsSetup: false } : k)));
    } finally {
      setSaving(false);
    }
  }

  const stepMeta: Record<Step, { icon: typeof Building2; title: string; subtitle: string }> = {
    profile: { icon: Building2, title: t("setup.stepProfileTitle"), subtitle: t("setup.stepProfileSubtitle") },
    chambers: { icon: Flame, title: t("setup.stepChambersTitle"), subtitle: t("setup.stepChambersSubtitle") },
    yard: { icon: Warehouse, title: t("setup.stepYardTitle"), subtitle: t("setup.stepYardSubtitle") },
    done: { icon: CheckCircle2, title: t("setup.stepDoneTitle"), subtitle: t("setup.stepDoneSubtitle") },
  };
  const { icon: StepIcon, title, subtitle } = stepMeta[step];

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-plane px-4 py-10">
      <div
        className="pointer-events-none absolute inset-0 opacity-70"
        style={{
          background:
            "radial-gradient(circle at 12% 15%, rgba(59,108,246,0.14), transparent 42%), radial-gradient(circle at 88% 12%, rgba(139,92,246,0.12), transparent 40%), radial-gradient(circle at 50% 105%, rgba(22,184,113,0.1), transparent 45%)",
        }}
      />
      <div className="absolute right-4 top-4">
        <LanguageSwitcher />
      </div>

      <Card className="relative w-full max-w-md">
        <div className="mb-6 flex flex-col items-center gap-2 text-center">
          <div className="gradient-brand flex h-12 w-12 items-center justify-center rounded-2xl shadow-glow-1-lg">
            <StepIcon className="h-6 w-6 text-white" />
          </div>
          {step !== "done" && (
            <p className="text-xs font-semibold uppercase tracking-wide text-series-1">
              {t("setup.stepOf", { current: stepIndex + 1, total: STEPS.length - 1 })}
            </p>
          )}
          <h1 className="font-display text-xl font-semibold text-ink-primary">{title}</h1>
          <p className="text-sm text-ink-muted">{subtitle}</p>
        </div>

        <div className="mb-6 flex items-center justify-center gap-1.5">
          {STEPS.map((s, i) => (
            <span
              key={s}
              className={cn(
                "h-1.5 rounded-full transition-all",
                i === stepIndex ? "w-6 gradient-brand" : i < stepIndex ? "w-1.5 bg-series-1" : "w-1.5 bg-ink-primary/10"
              )}
            />
          ))}
        </div>

        {step === "profile" && (
          <form onSubmit={handleProfileSubmit} className="flex flex-col gap-3">
            <input
              required
              placeholder={t("setup.kilnName")}
              value={name}
              onChange={(e) => setName(e.target.value)}
              className={inputClass}
            />
            <input
              placeholder={t("setup.kilnLocation")}
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              className={inputClass}
            />
            <input
              placeholder={t("setup.kilnPhone")}
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              className={inputClass}
            />
            <Button type="submit" disabled={saving} className="mt-1 w-full">
              {saving && <Loader2 className="h-4 w-4 animate-spin" />}
              {t("setup.next")}
            </Button>
          </form>
        )}

        {step === "chambers" && (
          <form onSubmit={handleChambersSubmit} className="flex flex-col gap-3">
            <input
              type="number"
              min={1}
              max={200}
              placeholder={t("settings.numberOfChambers")}
              value={chambers}
              onChange={(e) => setChambers(e.target.value)}
              className={inputClass}
            />
            <p className="text-xs text-ink-muted">{t("setup.chambersOptional")}</p>
            <div className="mt-1 flex gap-2">
              <Button type="button" variant="outline" onClick={goBack} className="flex-1">
                {t("setup.back")}
              </Button>
              <Button type="submit" disabled={saving} className="flex-1">
                {saving && <Loader2 className="h-4 w-4 animate-spin" />}
                {chambers.trim() ? t("setup.next") : t("setup.skipForNow")}
              </Button>
            </div>
          </form>
        )}

        {step === "yard" && (
          <form onSubmit={handleYardSubmit} className="flex flex-col gap-3">
            <input
              type="number"
              placeholder={t("settings.yardCapacityPlaceholder")}
              value={yardCapacity}
              onChange={(e) => setYardCapacity(e.target.value)}
              className={inputClass}
            />
            <div className="mt-1 flex gap-2">
              <Button type="button" variant="outline" onClick={goBack} className="flex-1">
                {t("setup.back")}
              </Button>
              <Button type="submit" disabled={saving} className="flex-1">
                {saving && <Loader2 className="h-4 w-4 animate-spin" />}
                {yardCapacity.trim() ? t("setup.next") : t("setup.skipForNow")}
              </Button>
            </div>
          </form>
        )}

        {step === "done" && (
          <Button onClick={handleFinish} disabled={saving} className="w-full">
            {saving && <Loader2 className="h-4 w-4 animate-spin" />}
            {t("setup.goToDashboard")}
          </Button>
        )}
      </Card>
    </div>
  );
}
