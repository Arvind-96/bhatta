import { AlertTriangle } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useTranslation } from "@/hooks/useTranslation";

// The centered "are you sure?" pattern — deliberately a different shape
// from the left-aligned Edit/Add modals (icon-centered, short text, two
// buttons) since a destructive confirmation is a different kind of
// decision than filling out a form. Used in place of the browser's native
// confirm() where a delete cascades into other records the admin should
// be told about explicitly (see `detail`).
export function ConfirmDialog({
  title,
  detail,
  confirmLabel,
  onConfirm,
  onCancel,
  loading,
}: {
  title: string;
  detail: string;
  confirmLabel: string;
  onConfirm: () => void;
  onCancel: () => void;
  loading?: boolean;
}) {
  const { t } = useTranslation();
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink-primary/50 p-4 backdrop-blur-sm" onClick={onCancel}>
      <Card className="w-full max-w-sm text-center" onClick={(e) => e.stopPropagation()}>
        <span className="mx-auto flex h-14 w-14 animate-float items-center justify-center rounded-full bg-status-critical/12 text-status-critical">
          <AlertTriangle className="h-6 w-6" />
        </span>
        <h3 className="mt-3 text-sm font-semibold text-ink-primary">{title}</h3>
        <p className="mt-1.5 text-sm leading-relaxed text-ink-muted">{detail}</p>
        <div className="mt-5 flex justify-center gap-2">
          <Button variant="ghost" size="sm" onClick={onCancel} disabled={loading}>
            {t("common.cancel")}
          </Button>
          <Button
            size="sm"
            onClick={onConfirm}
            disabled={loading}
            className="bg-status-critical text-white shadow-[0_6px_20px_-6px_rgba(239,74,99,0.5)] hover:-translate-y-0.5 hover:shadow-[0_10px_26px_-6px_rgba(239,74,99,0.5)]"
          >
            {confirmLabel}
          </Button>
        </div>
      </Card>
    </div>
  );
}
