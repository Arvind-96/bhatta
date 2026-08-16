// A small, consistent-but-varied color per person/entity id — same
// "colorful, not flat brand-blue" principle Sidebar.tsx and StatCard use,
// applied to list-of-people cards so a page of many cards doesn't read as
// one flat repeated shape. Deterministic on id, so the same person always
// gets the same tone across renders/pages.
const TONE_CLASSES = [
  "bg-series-1/10 text-series-1",
  "bg-series-2/10 text-series-2",
  "bg-series-3/10 text-series-3",
  "bg-series-4/10 text-series-4",
  "bg-series-5/10 text-series-5",
  "bg-series-6/10 text-series-6",
];

// Solid-fill counterpart to TONE_CLASSES (white text on a saturated series
// color instead of a tinted background) — used for the current user's own
// avatar chip, where it stands alone in the topbar rather than repeating
// down a list, so it can afford to be the boldest mark on the page.
const TONE_CLASSES_SOLID = [
  "bg-series-1 text-white",
  "bg-series-2 text-white",
  "bg-series-3 text-white",
  "bg-series-4 text-white",
  "bg-series-5 text-white",
  "bg-series-6 text-white",
];

function toneIndex(seed: string) {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) hash = (hash * 31 + seed.charCodeAt(i)) | 0;
  return Math.abs(hash) % TONE_CLASSES.length;
}

export function avatarToneClass(seed: string) {
  return TONE_CLASSES[toneIndex(seed)];
}

export function avatarToneSolidClass(seed: string) {
  return TONE_CLASSES_SOLID[toneIndex(seed)];
}

export function initialOf(name: string) {
  return name.trim().charAt(0).toUpperCase() || "?";
}

// Two-letter chip initials (e.g. "Demo Owner" -> "DO") for the current
// user's own avatar, where there's exactly one name to draw from and two
// letters reads as a proper monogram rather than a single stray letter.
export function initialsOf(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0].charAt(0) + parts[parts.length - 1].charAt(0)).toUpperCase();
}
