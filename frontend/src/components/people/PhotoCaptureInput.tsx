import { useEffect, useRef, useState } from "react";
import { Camera, FolderOpen, RotateCcw, Upload, X } from "lucide-react";
import { useTranslation } from "@/hooks/useTranslation";

interface PhotoCaptureInputProps {
  value: File | Blob | null;
  onChange: (file: File | Blob | null) => void;
}

type Stage = "idle" | "choosing" | "capturing";

// A single "Upload Photo" action — clicking it reveals the two ways to
// supply one (pick a file, or use the webcam) instead of two permanently
// visible tabs competing for space. The result is held as a plain
// File/Blob in the parent form's state either way, and only actually
// uploaded (via api.people.uploadPhoto) after the person itself is
// created, since the upload endpoint needs a real personId. No existing
// camera-access code exists anywhere else in this app to reuse — this is a
// from-scratch getUserMedia + <video> + <canvas> capture.
export function PhotoCaptureInput({ value, onChange }: PhotoCaptureInputProps) {
  const { t } = useTranslation();
  const [stage, setStage] = useState<Stage>("idle");
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [streaming, setStreaming] = useState(false);
  const [cameraError, setCameraError] = useState("");
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

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
    setStage("capturing");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "user" } });
      streamRef.current = stream;
      if (videoRef.current) videoRef.current.srcObject = stream;
      setStreaming(true);
    } catch {
      setCameraError(t("people.cameraAccessFailed"));
    }
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
      setStage("idle");
    }, "image/jpeg", 0.9);
  }

  // Release the camera the moment this component leaves the tree (modal
  // closed mid-capture, etc.) — never leave the device's camera light on.
  useEffect(() => () => stopCamera(), []);

  if (previewUrl) {
    return (
      <div className="relative w-fit">
        <img src={previewUrl} alt="" className="h-28 w-28 rounded-xl object-cover" />
        <button
          type="button"
          onClick={() => onChange(null)}
          className="absolute -right-2 -top-2 flex h-6 w-6 items-center justify-center rounded-full bg-status-critical text-white shadow-sm"
          aria-label={t("common.remove")}
        >
          <X className="h-3.5 w-3.5" />
        </button>
        <button
          type="button"
          onClick={() => {
            onChange(null);
            setStage("choosing");
          }}
          className="mt-2 flex items-center gap-1 text-xs font-medium text-series-1 hover:underline"
        >
          <RotateCcw className="h-3 w-3" /> {t("people.retake")}
        </button>
      </div>
    );
  }

  if (stage === "capturing") {
    return (
      <div className="flex flex-col items-center gap-2">
        <div className="relative flex h-40 w-full items-center justify-center overflow-hidden rounded-xl bg-ink-primary/10">
          {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
          <video ref={videoRef} autoPlay playsInline muted className="h-full w-full scale-x-[-1] object-cover" />
          {!streaming && !cameraError && <p className="absolute text-sm text-ink-muted">{t("people.startingCamera")}</p>}
          {cameraError && <p className="absolute px-4 text-center text-sm text-status-critical">{cameraError}</p>}
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => {
              stopCamera();
              setStage("idle");
            }}
            className="rounded-full border border-border px-4 py-2 text-xs font-medium text-ink-secondary hover:bg-ink-primary/5"
          >
            {t("common.cancel")}
          </button>
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
      </div>
    );
  }

  if (stage === "choosing") {
    return (
      <div className="flex gap-2">
        <input
          ref={fileInputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          className="hidden"
          onChange={(e) => {
            onChange(e.target.files?.[0] ?? null);
            setStage("idle");
          }}
        />
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          className="flex flex-1 flex-col items-center justify-center gap-1.5 rounded-xl border border-dashed border-border py-4 text-xs font-medium text-ink-secondary hover:border-series-1/40 hover:text-series-1"
        >
          <FolderOpen className="h-5 w-5" />
          {t("people.chooseFromDevice")}
        </button>
        <button
          type="button"
          onClick={startCamera}
          className="flex flex-1 flex-col items-center justify-center gap-1.5 rounded-xl border border-dashed border-border py-4 text-xs font-medium text-ink-secondary hover:border-series-1/40 hover:text-series-1"
        >
          <Camera className="h-5 w-5" />
          {t("people.useWebcam")}
        </button>
        <button
          type="button"
          onClick={() => setStage("idle")}
          className="shrink-0 self-start text-ink-muted hover:text-ink-primary"
          aria-label={t("common.cancel")}
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={() => setStage("choosing")}
      className="flex h-11 w-full items-center justify-center gap-2 rounded-xl border border-dashed border-border text-sm font-medium text-ink-secondary hover:border-series-1/40 hover:text-series-1"
    >
      <Upload className="h-4 w-4" /> {t("people.uploadPhotoCta")}
    </button>
  );
}
