'use client';
/**
 * Session state for the whole app.
 *
 * `status` is the single thing components should branch on:
 *   'loading'       — restoring a stored token; render nothing gated yet
 *   'anonymous'     — no usable session
 *   'authenticated' — signed in and allowed to use the app
 *   'pending'       — signed in, but the account is awaiting admin approval
 *
 * 'pending' exists because of the temporary admin-approval gate: signup is open,
 * but a new account can't reach any real feature until it's approved. A pending
 * user is genuinely authenticated — they just get a waiting notice instead of the
 * tab, not a login prompt.
 */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';

import {
  ApiError,
  ENDPOINTS,
  authJson,
  readDetail,
  setSessionExpiredHandler,
} from '@/lib/api';
import { clearAuthToken, getAuthToken, setAuthToken } from '@/lib/auth';

export type AuthStatus = 'loading' | 'anonymous' | 'authenticated' | 'pending';

export interface AuthUser {
  id: string;
  email: string;
  is_approved: boolean;
  is_admin: boolean;
}

interface AuthResponse {
  access_token: string;
  token_type: string;
  user: AuthUser;
  profile_id: string | null;
}

interface MeResponse {
  user: AuthUser;
  profile_id: string | null;
}

interface AuthContextValue {
  user: AuthUser | null;
  profileId: string | null;
  status: AuthStatus;
  /** Set when the session ended on its own (expired token) rather than by logout. */
  sessionExpired: boolean;
  login(email: string, password: string): Promise<void>;
  signup(email: string, password: string): Promise<void>;
  logout(): void;
  requestPasswordReset(email: string): Promise<void>;
  resetPassword(token: string, newPassword: string): Promise<void>;
  clearSessionExpired(): void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

/** An account has access if it's approved, or if it's an admin (admins are
 *  always treated as approved — matches the backend's `has_access`). */
function hasAccess(user: AuthUser): boolean {
  return Boolean(user.is_admin || user.is_approved);
}

function statusFor(user: AuthUser | null): AuthStatus {
  if (!user) return 'anonymous';
  return hasAccess(user) ? 'authenticated' : 'pending';
}

/** Unauthenticated POST — signup/login/forgot/reset have no token yet. */
async function publicPost<T>(url: string, body: unknown): Promise<T> {
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    throw new ApiError(response.status, await readDetail(response));
  }
  return response.json() as Promise<T>;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [profileId, setProfileId] = useState<string | null>(null);
  const [status, setStatus] = useState<AuthStatus>('loading');
  const [sessionExpired, setSessionExpired] = useState(false);

  // Restore a stored session on mount. A token that no longer works is cleared
  // rather than left to fail every subsequent request.
  useEffect(() => {
    let cancelled = false;

    (async () => {
      if (!getAuthToken()) {
        setStatus('anonymous');
        return;
      }
      try {
        const me = await authJson<MeResponse>(ENDPOINTS.me);
        if (cancelled) return;
        setUser(me.user);
        setProfileId(me.profile_id);
        setStatus(statusFor(me.user));
      } catch {
        if (cancelled) return;
        clearAuthToken();
        setUser(null);
        setProfileId(null);
        setStatus('anonymous');
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  // One place handles an expired token, for every call site (see api.ts).
  useEffect(() => {
    setSessionExpiredHandler(() => {
      setUser(null);
      setProfileId(null);
      setStatus('anonymous');
      setSessionExpired(true);
    });
    return () => setSessionExpiredHandler(null);
  }, []);

  const adopt = useCallback((data: AuthResponse) => {
    setAuthToken(data.access_token);
    setUser(data.user);
    setProfileId(data.profile_id);
    setStatus(statusFor(data.user));
    setSessionExpired(false);
  }, []);

  const login = useCallback(
    async (email: string, password: string) => {
      adopt(await publicPost<AuthResponse>(ENDPOINTS.login, { email, password }));
    },
    [adopt],
  );

  const signup = useCallback(
    async (email: string, password: string) => {
      adopt(await publicPost<AuthResponse>(ENDPOINTS.signup, { email, password }));
    },
    [adopt],
  );

  const logout = useCallback(() => {
    // No server call: the token is stateless, so signing out IS discarding it.
    clearAuthToken();
    setUser(null);
    setProfileId(null);
    setStatus('anonymous');
    setSessionExpired(false);
  }, []);

  const requestPasswordReset = useCallback(async (email: string) => {
    // Always succeeds server-side, whether or not the address is registered —
    // the UI copy has to match that so it doesn't leak account existence.
    await publicPost<{ message: string }>(ENDPOINTS.forgotPassword, { email });
  }, []);

  const resetPassword = useCallback(async (token: string, newPassword: string) => {
    await publicPost<{ message: string }>(ENDPOINTS.resetPassword, {
      token,
      new_password: newPassword,
    });
  }, []);

  const clearSessionExpired = useCallback(() => setSessionExpired(false), []);

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      profileId,
      status,
      sessionExpired,
      login,
      signup,
      logout,
      requestPasswordReset,
      resetPassword,
      clearSessionExpired,
    }),
    [
      user, profileId, status, sessionExpired,
      login, signup, logout, requestPasswordReset, resetPassword, clearSessionExpired,
    ],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
}
