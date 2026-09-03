/**
 * Access-token storage.
 *
 * The backend returns a bearer token in the login/signup response body (not a
 * cookie — app.* and api.* are different subdomains, and the future mobile app
 * has no cookie jar). We keep it in localStorage and attach it to every request
 * as `Authorization: Bearer <token>`.
 */
const AUTH_TOKEN_KEY = 'nutritionell_auth_token';

export function getAuthToken(): string | null {
  if (typeof window === 'undefined') return null;
  try {
    return window.localStorage.getItem(AUTH_TOKEN_KEY);
  } catch {
    // Private mode / blocked site data — treat as signed out rather than throwing.
    return null;
  }
}

export function setAuthToken(token: string): void {
  try {
    window.localStorage.setItem(AUTH_TOKEN_KEY, token);
  } catch {
    /* nothing we can do; the session just won't survive a reload */
  }
}

export function clearAuthToken(): void {
  try {
    window.localStorage.removeItem(AUTH_TOKEN_KEY);
  } catch {
    /* ignore */
  }
}
