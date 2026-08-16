import { useCallback } from "react";
import { useLocaleStore } from "@/store/locale.store";
import { translate } from "@/lib/i18n/translations";

export function useTranslation() {
  const locale = useLocaleStore((s) => s.locale);
  const t = useCallback(
    (key: string, params?: Record<string, string | number>) => translate(locale, key, params),
    [locale]
  );
  return { t, locale };
}
