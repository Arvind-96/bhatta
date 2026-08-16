import { AnimatePresence, motion } from "framer-motion";
import { Flame } from "lucide-react";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useDashboardStore } from "@/store/dashboard.store";
import { useTranslation } from "@/hooks/useTranslation";

function timeAgo(iso: string, t: (key: string, params?: Record<string, string | number>) => string) {
  const seconds = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 1000));
  if (seconds < 60) return t("overview.justNow");
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return t("overview.minutesAgo", { minutes });
  return t("overview.hoursAgo", { hours: Math.floor(minutes / 60) });
}

export function LiveFeed() {
  const activity = useDashboardStore((s) => s.recentActivity);
  const { t } = useTranslation();

  return (
    <Card className="flex flex-col">
      <CardHeader>
        <CardTitle>{t("overview.liveActivity")}</CardTitle>
        <span className="text-sm text-ink-muted">{t("overview.realTimeFromSite")}</span>
      </CardHeader>

      <div className="flex flex-col gap-2 overflow-y-auto">
        <AnimatePresence initial={false}>
          {activity.length === 0 && (
            <p className="py-6 text-center text-sm text-ink-muted">
              {t("overview.waitingForProductionUpdates")}
            </p>
          )}
          {activity.map((log) => (
            <motion.div
              key={log._id}
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className="flex items-center justify-between rounded-xl border border-border px-3 py-2"
            >
              <div className="flex items-center gap-3">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-ink-primary/5">
                  <Flame className="h-4 w-4 text-series-2" />
                </div>
                <div>
                  <p className="text-sm font-medium text-ink-primary">
                    {t("overview.batchBricks", { batchNumber: log.batchNumber, count: log.bricksCount.toLocaleString("en-IN") })}
                  </p>
                  <p className="text-sm text-ink-muted">{timeAgo(log.producedOn, t)}</p>
                </div>
              </div>
              <Badge variant={log.qualityGrade === "A" ? "good" : "neutral"}>
                {t("overview.gradeLabel", { grade: log.qualityGrade })}
              </Badge>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </Card>
  );
}
