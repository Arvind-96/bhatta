// face-api.js and its model weights (~6-7MB) are only pulled in when this
// module is actually imported — Kiosk.tsx and the "enroll face" flow use a
// dynamic import() so this never lands in the main dashboard bundle. Model
// weight files must be placed in `frontend/public/models` (see README).
const MODELS_URL = import.meta.env.VITE_FACE_MODELS_URL ?? "/models";

let modelsLoaded = false;

export async function loadFaceModels() {
  if (modelsLoaded) return;
  const faceapi = await import("face-api.js");
  await Promise.all([
    faceapi.nets.tinyFaceDetector.loadFromUri(MODELS_URL),
    faceapi.nets.faceLandmark68Net.loadFromUri(MODELS_URL),
    faceapi.nets.faceRecognitionNet.loadFromUri(MODELS_URL),
  ]);
  modelsLoaded = true;
}

export async function detectFaceDescriptor(video: HTMLVideoElement): Promise<number[] | null> {
  const faceapi = await import("face-api.js");
  const result = await faceapi
    .detectSingleFace(video, new faceapi.TinyFaceDetectorOptions())
    .withFaceLandmarks()
    .withFaceDescriptor();

  if (!result) return null;
  return Array.from(result.descriptor);
}
