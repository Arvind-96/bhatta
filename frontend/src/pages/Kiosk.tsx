import { useEffect, useRef, useState } from "react";
import { CheckCircle2, Loader2, ScanFace, XCircle } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api";
import { useTranslation } from "@/hooks/useTranslation";
import { translate, type Locale } from "@/lib/i18n/translations";
import { useLocaleStore } from "@/store/locale.store";

type ScanState = "loading-models" | "ready" | "locating" | "scanning" | "success" | "error";

function getGeolocation(locale: Locale): Promise<GeolocationPosition> {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error(translate(locale, "kiosk.geolocationNotSupported")));
      return;
    }
    navigator.geolocation.getCurrentPosition(resolve, reject, { enableHighAccuracy: true, timeout: 10000 });
  });
}

export function Kiosk() {
  const { t } = useTranslation();
  const locale = useLocaleStore((s) => s.locale);
  const videoRef = useRef<HTMLVideoElement>(null);
  const [state, setState] = useState<ScanState>("loading-models");
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    let stream: MediaStream | null = null;

    (async () => {
      try {
        const { loadFaceModels } = await import("@/lib/face");
        await loadFaceModels();
        stream = await navigator.mediaDevices.getUserMedia({ video: true });
        if (videoRef.current) videoRef.current.srcObject = stream;
        setState("ready");
      } catch (err) {
        setMessage((err as Error).message);
        setState("error");
      }
    })();

    return () => stream?.getTracks().forEach((t) => t.stop());
  }, []);

  async function handleScan() {
    if (!videoRef.current) return;
    setMessage(null);
    try {
      setState("locating");
      const position = await getGeolocation(locale);

      setState("scanning");
      const { detectFaceDescriptor } = await import("@/lib/face");
      const descriptor = await detectFaceDescriptor(videoRef.current);
      if (!descriptor) {
        setMessage(t("kiosk.noFaceDetected"));
        setState("ready");
        return;
      }

      const result = await api.attendance.faceCheckIn({
        descriptor,
        latitude: position.coords.latitude,
        longitude: position.coords.longitude,
      });

      setMessage(t("kiosk.markedPresent", { name: result.person.name }));
      setState("success");
      setTimeout(() => setState("ready"), 2500);
    } catch (err) {
      setMessage((err as Error).message);
      setState("error");
      setTimeout(() => setState("ready"), 2500);
    }
  }

  return (
    <div className="flex flex-col items-center gap-4">
      <Card className="w-full max-w-md">
        <div className="mb-4 flex items-center gap-2">
          <ScanFace className="h-5 w-5 text-series-1" />
          <h2 className="text-sm font-semibold text-ink-primary">{t("kiosk.title")}</h2>
        </div>

        <div className="relative aspect-video overflow-hidden rounded-xl bg-black">
          <video ref={videoRef} autoPlay muted playsInline className="h-full w-full object-cover" />
          {state === "loading-models" && (
            <div className="absolute inset-0 flex items-center justify-center bg-black/60 text-xs text-white">
              <Loader2 className="mr-2 h-4 w-4 animate-spin" /> {t("kiosk.loadingFaceModel")}
            </div>
          )}
          {state === "success" && (
            <div className="absolute inset-0 flex items-center justify-center bg-status-good/20">
              <CheckCircle2 className="h-16 w-16 text-status-good" />
            </div>
          )}
          {state === "error" && (
            <div className="absolute inset-0 flex items-center justify-center bg-status-critical/20">
              <XCircle className="h-16 w-16 text-status-critical" />
            </div>
          )}
        </div>

        {message && (
          <p className={`mt-3 text-center text-sm ${state === "success" ? "text-status-good" : "text-status-critical"}`}>
            {message}
          </p>
        )}

        <Button
          onClick={handleScan}
          disabled={state !== "ready"}
          className="mt-4 w-full"
        >
          {state === "locating" && t("kiosk.checkingLocation")}
          {state === "scanning" && t("kiosk.scanningFace")}
          {(state === "ready" || state === "success" || state === "error") && t("kiosk.scanToCheckIn")}
          {state === "loading-models" && t("kiosk.preparing")}
        </Button>
        <p className="mt-2 text-center text-sm text-ink-muted">
          {t("kiosk.radiusNotice")}
        </p>
      </Card>
    </div>
  );
}
