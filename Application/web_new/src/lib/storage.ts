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
export const MAX_DETECTIONS_MAX = 100;
export const MAX_DETECTIONS_DEFAULT = 25;
export const MAX_DETECTIONS_OPTIONS = [10, 15, 20, 25, 30, 40, 50, 60, 80, 100] as const;

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

// ── Detection model (which YOLO detector the scan runs) ──────────────────────
// The selected key is sent with each scan as `yolo_model`; the backend maps it to
// the matching weights (see backend app/services/yolo_service.py MODEL_REGISTRY).
const YOLO_MODEL_KEY = 'nutritionell_yolo_model';
export type YoloModelKey = 'yolo11n' | 'yolo26s' | 'yolo26s_p2';
export const YOLO_MODEL_DEFAULT: YoloModelKey = 'yolo11n';
export const YOLO_MODEL_OPTIONS: { key: YoloModelKey; label: string; desc: string }[] = [
  { key: 'yolo11n',    label: 'YOLO11n',    desc: 'Light & fast' },
  { key: 'yolo26s',    label: 'YOLO26s',    desc: 'More powerful, slightly slower' },
  { key: 'yolo26s_p2', label: 'YOLO26s-P2', desc: 'Tuned for small / dense products' },
];

export function getYoloModel(): YoloModelKey {
  if (typeof window === 'undefined') return YOLO_MODEL_DEFAULT;
  const raw = window.localStorage.getItem(YOLO_MODEL_KEY);
  return YOLO_MODEL_OPTIONS.some(o => o.key === raw) ? (raw as YoloModelKey) : YOLO_MODEL_DEFAULT;
}

export function setYoloModel(key: YoloModelKey): void {
  window.localStorage.setItem(YOLO_MODEL_KEY, key);
}
