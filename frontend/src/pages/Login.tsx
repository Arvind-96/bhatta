import { FormEvent, useState } from "react";
import { Flame, Loader2 } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api";
import { useAuthStore } from "@/store/auth.store";
import { useTranslation } from "@/hooks/useTranslation";
import { LanguageSwitcher } from "@/components/layout/LanguageSwitcher";

export function Login() {
  const setSession = useAuthStore((s) => s.setSession);
  const [mode, setMode] = useState<"login" | "register">("login");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { t } = useTranslation();

  const [form, setForm] = useState({ name: "", email: "", password: "", kilnName: "" });

  function update(key: keyof typeof form) {
    return (e: React.ChangeEvent<HTMLInputElement>) =>
      setForm((f) => ({ ...f, [key]: e.target.value }));
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const result =
        mode === "login"
          ? await api.login(form.email, form.password)
          : await api.register({
              name: form.name,
              email: form.email,
              password: form.password,
              kilnName: form.kilnName,
            });
      setSession(result.token, result.user, result.kilns);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-plane px-4">
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

      <Card className="relative w-full max-w-sm">
        <div className="mb-6 flex flex-col items-center gap-2 text-center">
          <div className="gradient-brand flex h-12 w-12 items-center justify-center rounded-2xl shadow-glow-1-lg">
            <Flame className="h-6 w-6 text-white" />
          </div>
          <h1 className="font-display text-xl font-semibold text-ink-primary">{t("app.name")}</h1>
          <p className="text-sm text-ink-muted">
            {mode === "login" ? t("auth.signInSubtitle") : t("auth.setupSubtitle")}
          </p>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-3">
          {mode === "register" && (
            <>
              <input
                required
                placeholder={t("auth.yourName")}
                value={form.name}
                onChange={update("name")}
                className="h-10 rounded-xl border border-border bg-ink-primary/5 px-3 text-sm text-ink-primary outline-none focus:ring-2 focus:ring-series-1"
              />
              <input
                required
                placeholder={t("auth.kilnName")}
                value={form.kilnName}
                onChange={update("kilnName")}
                className="h-10 rounded-xl border border-border bg-ink-primary/5 px-3 text-sm text-ink-primary outline-none focus:ring-2 focus:ring-series-1"
              />
            </>
          )}
          <input
            required
            type="email"
            placeholder={t("auth.email")}
            value={form.email}
            onChange={update("email")}
            className="h-10 rounded-xl border border-border bg-ink-primary/5 px-3 text-sm text-ink-primary outline-none focus:ring-2 focus:ring-series-1"
          />
          <input
            required
            type="password"
            minLength={6}
            placeholder={t("auth.password")}
            value={form.password}
            onChange={update("password")}
            className="h-10 rounded-xl border border-border bg-ink-primary/5 px-3 text-sm text-ink-primary outline-none focus:ring-2 focus:ring-series-1"
          />

          {error && <p className="text-xs text-status-critical">{error}</p>}

          <Button type="submit" disabled={loading} className="mt-1 w-full">
            {loading && <Loader2 className="h-4 w-4 animate-spin" />}
            {mode === "login" ? t("auth.signIn") : t("auth.createKiln")}
          </Button>
        </form>

        <button
          onClick={() => setMode(mode === "login" ? "register" : "login")}
          className="mt-4 w-full text-center text-sm text-ink-muted hover:text-ink-primary"
        >
          {mode === "login" ? t("auth.newBhatta") : t("auth.haveAccount")}
        </button>
      </Card>
    </div>
  );
}
