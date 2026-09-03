import { clearAuthToken, getAuthToken } from '@/lib/auth';

export const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8000';

export const ENDPOINTS = {
  health: `${API_BASE_URL}/health`,
  profileOptions: `${API_BASE_URL}/api/profile/options`,
  // The backend derives the profile from the bearer token — these routes take no
  // id at all any more, which is what makes one account unable to reach another's.
  profile: `${API_BASE_URL}/api/profile/me`,
  analyze: `${API_BASE_URL}/api/analyze`,
  analyzeStream: `${API_BASE_URL}/api/analyze/stream`,
  analyzeMock: `${API_BASE_URL}/api/analyze/mock`,
  nutritionPlan: `${API_BASE_URL}/api/profile/nutrition-plan`,

  // ── Auth ───────────────────────────────────────────────────────────────────
  signup: `${API_BASE_URL}/api/auth/signup`,
  login: `${API_BASE_URL}/api/auth/login`,
  me: `${API_BASE_URL}/api/auth/me`,
  forgotPassword: `${API_BASE_URL}/api/auth/forgot-password`,
  resetPassword: `${API_BASE_URL}/api/auth/reset-password`,
} as const;

/** Flip to true to hit /api/analyze/mock instead of the real Gemini+YOLO pipeline. */
export const USE_MOCK_ANALYZE = false;

/** Thrown when the backend rejects the request; carries the status for callers
 *  that need to distinguish 401/403 from a real failure. */
export class ApiError extends Error {
  status: number;
  detail: string;
  constructor(status: number, detail: string) {
    super(detail);
    this.name = 'ApiError';
    this.status = status;
    this.detail = detail;
  }
}

// ── Central session-expiry handling ──────────────────────────────────────────
// A 401 means the stored token is dead (expired, or the account is gone). Rather
// than every component inventing its own recovery, authFetch clears the token
// once and notifies AuthContext, which drops to 'anonymous' and reopens the login
// modal. Components just see the ApiError.
type SessionExpiredHandler = () => void;
let onSessionExpired: SessionExpiredHandler | null = null;

export function setSessionExpiredHandler(fn: SessionExpiredHandler | null): void {
  onSessionExpired = fn;
}

/**
 * fetch() with the bearer token attached and 401 handled centrally.
 *
 * Does NOT set Content-Type — callers pass their own (JSON vs FormData, where
 * setting it manually would break the multipart boundary).
 */
export async function authFetch(url: string, init: RequestInit = {}): Promise<Response> {
  const token = getAuthToken();
  const headers = new Headers(init.headers);
  if (token) headers.set('Authorization', `Bearer ${token}`);

  const response = await fetch(url, { ...init, headers });

  if (response.status === 401) {
    clearAuthToken();
    onSessionExpired?.();
    throw new ApiError(401, 'Your session has expired. Please sign in again.');
  }
  return response;
}

/** authFetch + JSON parse + error normalisation. Use for JSON endpoints. */
export async function authJson<T>(url: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  if (init.body && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }
  const response = await authFetch(url, { ...init, headers });
  if (!response.ok) {
    throw new ApiError(response.status, await readDetail(response));
  }
  return response.json() as Promise<T>;
}

/** Pull a human-readable message out of a FastAPI error body. */
export async function readDetail(response: Response): Promise<string> {
  try {
    const body = await response.json();
    const detail = body?.detail;
    if (typeof detail === 'string') return detail;
    // 422 from pydantic is a list of {loc, msg, ...}
    if (Array.isArray(detail) && detail.length) {
      return detail.map((d: any) => d?.msg).filter(Boolean).join('; ') || `Server error ${response.status}`;
    }
  } catch {
    /* not JSON */
  }
  return `Server error ${response.status}`;
}
