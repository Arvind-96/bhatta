import { Languages } from "lucide-react";
import { useLocaleStore } from "@/store/locale.store";
import { LOCALE_LABELS, SUPPORTED_LOCALES } from "@/lib/i18n/translations";
import { cn } from "@/lib/utils";

export function LanguageSwitcher() {
  const locale = useLocaleStore((s) => s.locale);
  const setLocale = useLocaleStore((s) => s.setLocale);

  return (
    <div className="flex items-center gap-1 rounded-lg border border-border bg-surface p-1 shadow-sm">
      <Languages className="ml-1 h-3.5 w-3.5 text-ink-muted" />
      {SUPPORTED_LOCALES.map((l) => (
        <button
          key={l}
          onClick={() => setLocale(l)}
          className={cn(
            "rounded-md px-2 py-1 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-series-1 focus-visible:ring-offset-2 focus-visible:ring-offset-surface",
            locale === l ? "bg-series-1 text-white" : "text-ink-muted hover:text-ink-primary"
          )}
        >
          {LOCALE_LABELS[l]}
        </button>
      ))}
    </div>
  );
}
