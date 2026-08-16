import { useEffect, useRef, useState } from "react";
import { Camera, Loader2, X } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api";
import { useTranslation } from "@/hooks/useTranslation";

interface EnrollFaceModalProps {
  personId: string;
  personName: string;
  onClose: () => void;
  onEnrolled: () => void;
}

export function EnrollFaceModal({ personId, personName, onClose, onEnrolled }: EnrollFaceModalProps) {
  const { t } = useTranslation();
  const videoRef = useRef<HTMLVideoElement>(null);
  const [status, setStatus] = useState<"loading-models" | "ready" | "capturing" | "error">("loading-models");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let stream: MediaStream | null = null;

    (async () => {
      try {
        const { loadFaceModels } = await import("@/lib/face");
        await loadFaceModels();
        stream = await navigator.mediaDevices.getUserMedia({ video: true });
        if (videoRef.current) videoRef.current.srcObject = stream;
        setStatus("ready");
      } catch (err) {
        setError((err as Error).message);
        setStatus("error");
      }
    })();

    return () => stream?.getTracks().forEach((t) => t.stop());
  }, []);

  async function handleCapture() {
    if (!videoRef.current) return;
    setStatus("capturing");
    try {
      const { detectFaceDescriptor } = await import("@/lib/face");
      const descriptor = await detectFaceDescriptor(videoRef.current);
      if (!descriptor) {
        setError(t("people.noFaceDetected"));
        setStatus("ready");
        return;
      }
      await api.people.enrollFace(personId, descriptor);
      onEnrolled();
      onClose();
    } catch (err) {
      setError((err as Error).message);
      setStatus("ready");
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <Card className="w-full max-w-sm">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-ink-primary">{t("people.enrollFaceTitle", { name: personName })}</h3>
          <button onClick={onClose} className="text-ink-muted hover:text-ink-primary">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="relative aspect-video overflow-hidden rounded-xl bg-black">
          <video ref={videoRef} autoPlay muted playsInline className="h-full w-full object-cover" />
          {status === "loading-models" && (
            <div className="absolute inset-0 flex items-center justify-center bg-black/60 text-xs text-white">
              <Loader2 className="mr-2 h-4 w-4 animate-spin" /> {t("people.loadingFaceModel")}
            </div>
          )}
        </div>

        {error && <p className="mt-2 text-xs text-status-critical">{error}</p>}

        <Button
          onClick={handleCapture}
          disabled={status !== "ready"}
          className="mt-4 w-full"
        >
          {status === "capturing" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Camera className="h-4 w-4" />}
          {t("people.captureFace")}
        </Button>
      </Card>
    </div>
  );
}
