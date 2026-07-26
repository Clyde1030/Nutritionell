const STORAGE_KEY = 'nutritionell_profile_id';

export function getProfileId(): string | null {
  if (typeof window === 'undefined') return null;
  return window.localStorage.getItem(STORAGE_KEY);
}

export function setProfileId(id: string): void {
  window.localStorage.setItem(STORAGE_KEY, id);
}

export function clearProfileId(): void {
  window.localStorage.removeItem(STORAGE_KEY);
}

// ── Scan settings ─────────────────────────────────────────────────────────────
// Max products the scan will identify + score per photo. Fewer = faster scans;
// more = wider shelf coverage. Stored client-side (an app preference, not profile
// data) and sent with each scan so the backend caps YOLO detections to match.
const MAX_DETECTIONS_KEY = 'nutritionell_max_detections';
export const MAX_DETECTIONS_MIN = 5;
export const MAX_DETECTIONS_MAX = 60;
export const MAX_DETECTIONS_DEFAULT = 25;
export const MAX_DETECTIONS_OPTIONS = [10, 15, 20, 25, 30, 40, 50, 60] as const;

export function getMaxDetections(): number {
  if (typeof window === 'undefined') return MAX_DETECTIONS_DEFAULT;
  const raw = window.localStorage.getItem(MAX_DETECTIONS_KEY);
  const n = raw != null ? parseInt(raw, 10) : NaN;
  if (!Number.isFinite(n)) return MAX_DETECTIONS_DEFAULT;
  return Math.max(MAX_DETECTIONS_MIN, Math.min(n, MAX_DETECTIONS_MAX));
}

export function setMaxDetections(n: number): void {
  const clamped = Math.max(MAX_DETECTIONS_MIN, Math.min(Math.round(n), MAX_DETECTIONS_MAX));
  window.localStorage.setItem(MAX_DETECTIONS_KEY, String(clamped));
}
