import { useEffect, useRef, useState } from "react";
import { Camera, RotateCcw, Upload, X } from "lucide-react";
import { useTranslation } from "@/hooks/useTranslation";
import { cn } from "@/lib/utils";

interface PhotoCaptureInputProps {
  value: File | Blob | null;
  onChange: (file: File | Blob | null) => void;
}

type Mode = "upload" | "capture";

// Lets the admin either pick an existing image file or take one live via
// the device camera — the result is held as a plain File/Blob in the
// parent form's state either way, and only actually uploaded (via
// api.people.uploadPhoto) after the person itself is created, since the
// upload endpoint needs a real personId. No existing camera-access code
// exists anywhere else in this app to reuse (confirmed by research) — this
// is a from-scratch getUserMedia + <video> + <canvas> capture.
export function PhotoCaptureInput({ value, onChange }: PhotoCaptureInputProps) {
  const { t } = useTranslation();
  const [mode, setMode] = useState<Mode>("upload");
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [streaming, setStreaming] = useState(false);
  const [cameraError, setCameraError] = useState("");
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  useEffect(() => {
    if (!value) {
      setPreviewUrl(null);
      return;
    }
    const url = URL.createObjectURL(value);
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [value]);

  function stopCamera() {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    setStreaming(false);
  }

  async function startCamera() {
    setCameraError("");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "user" } });
      streamRef.current = stream;
      if (videoRef.current) videoRef.current.srcObject = stream;
      setStreaming(true);
    } catch {
      setCameraError(t("people.cameraAccessFailed"));
    }
  }

  function switchMode(next: Mode) {
    stopCamera();
    setMode(next);
    if (next === "capture") startCamera();
  }

  function capture() {
    const video = videoRef.current;
    if (!video) return;
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.drawImage(video, 0, 0);
    canvas.toBlob((blob) => {
      if (blob) onChange(blob);
      stopCamera();
    }, "image/jpeg", 0.9);
  }

  // Release the camera the moment this component leaves the tree (modal
  // closed mid-capture, etc.) — never leave the device's camera light on.
  useEffect(() => () => stopCamera(), []);

  return (
    <div className="flex flex-col gap-2">
      <div className="flex gap-1 rounded-lg border border-border bg-ink-primary/5 p-1">
        <button
          type="button"
          onClick={() => switchMode("upload")}
          className={cn(
            "flex flex-1 items-center justify-center gap-1.5 rounded-md py-1.5 text-xs font-medium transition-colors",
            mode === "upload" ? "bg-surface text-ink-primary shadow-sm" : "text-ink-muted"
          )}
        >
          <Upload className="h-3.5 w-3.5" /> {t("people.uploadPhoto")}
        </button>
        <button
          type="button"
          onClick={() => switchMode("capture")}
          className={cn(
            "flex flex-1 items-center justify-center gap-1.5 rounded-md py-1.5 text-xs font-medium transition-colors",
            mode === "capture" ? "bg-surface text-ink-primary shadow-sm" : "text-ink-muted"
          )}
        >
          <Camera className="h-3.5 w-3.5" /> {t("people.takePhoto")}
        </button>
      </div>

      {mode === "upload" && !previewUrl && (
        <label className="flex h-28 cursor-pointer items-center justify-center rounded-xl border border-dashed border-border text-sm text-ink-muted hover:border-series-1/40 hover:text-series-1">
          <input
            type="file"
            accept="image/jpeg,image/png,image/webp"
            className="hidden"
            onChange={(e) => onChange(e.target.files?.[0] ?? null)}
          />
          <span className="flex flex-col items-center gap-1">
            <Upload className="h-5 w-5" />
            {t("people.clickToUploadPhoto")}
          </span>
        </label>
      )}

      {mode === "capture" && !previewUrl && (
        <div className="flex flex-col items-center gap-2">
          <div className="relative flex h-40 w-full items-center justify-center overflow-hidden rounded-xl bg-ink-primary/10">
            {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
            <video ref={videoRef} autoPlay playsInline muted className="h-full w-full scale-x-[-1] object-cover" />
            {!streaming && !cameraError && (
              <p className="absolute text-sm text-ink-muted">{t("people.startingCamera")}</p>
            )}
            {cameraError && <p className="absolute px-4 text-center text-sm text-status-critical">{cameraError}</p>}
          </div>
          {streaming && (
            <button
              type="button"
              onClick={capture}
              className="flex items-center gap-1.5 rounded-full bg-series-1 px-4 py-2 text-xs font-semibold text-white shadow-glow-1"
            >
              <Camera className="h-3.5 w-3.5" /> {t("people.capture")}
            </button>
          )}
        </div>
      )}

      {previewUrl && (
        <div className="relative w-fit">
          <img src={previewUrl} alt="" className="h-28 w-28 rounded-xl object-cover" />
          <button
            type="button"
            onClick={() => {
              onChange(null);
              if (mode === "capture") startCamera();
            }}
            className="absolute -right-2 -top-2 flex h-6 w-6 items-center justify-center rounded-full bg-status-critical text-white shadow-sm"
            aria-label={t("common.remove")}
          >
            <X className="h-3.5 w-3.5" />
          </button>
          {mode === "capture" && (
            <button
              type="button"
              onClick={() => {
                onChange(null);
                startCamera();
              }}
              className="mt-2 flex items-center gap-1 text-xs font-medium text-series-1 hover:underline"
            >
              <RotateCcw className="h-3 w-3" /> {t("people.retake")}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
