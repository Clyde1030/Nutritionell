'use client';
/**
 * Sign in / create account / forgot password / set new password, in one modal.
 *
 * A modal rather than a page so people stay on Home while signing in instead of
 * being bounced to a blank screen and back.
 */
import { useEffect, useState } from 'react';

import { ApiError } from '@/lib/api';
import { useAuth } from '@/lib/AuthContext';
import s from './AuthModal.module.css';

export type AuthMode = 'signin' | 'signup' | 'forgot' | 'reset';

const MIN_PASSWORD_LENGTH = 8;   // matches the backend's rule

export default function AuthModal({
  open,
  initialMode = 'signin',
  resetToken = null,
  onClose,
  onAuthenticated,
}: {
  open: boolean;
  initialMode?: AuthMode;
  /** When present the modal opens straight into the "set a new password" step. */
  resetToken?: string | null;
  onClose: () => void;
  onAuthenticated?: () => void;
}) {
  const { login, signup, requestPasswordReset, resetPassword } = useAuth();

  const [mode, setMode] = useState<AuthMode>(initialMode);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Re-sync when the opener asks for a different starting mode (e.g. Home's
  // "Create your account" CTA vs the header's "Log In").
  useEffect(() => {
    if (!open) return;
    setMode(resetToken ? 'reset' : initialMode);
    setError(null);
    setNotice(null);
    setBusy(false);
  }, [open, initialMode, resetToken]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  const switchMode = (next: AuthMode) => {
    setMode(next);
    setError(null);
    setNotice(null);
    setPassword('');
    setConfirm('');
  };

  /** Client-side checks, so obvious mistakes don't cost a round trip. The
   *  backend enforces the same rules regardless — this is convenience, not the
   *  security boundary. */
  const validate = (): string | null => {
    if (mode !== 'reset' && !email.trim()) return 'Enter your email address.';
    if (mode !== 'reset' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      return 'That doesn’t look like a valid email address.';
    }
    if (mode === 'forgot') return null;
    if (!password) return 'Enter a password.';
    if (mode !== 'signin' && password.length < MIN_PASSWORD_LENGTH) {
      return `Password must be at least ${MIN_PASSWORD_LENGTH} characters.`;
    }
    if (mode !== 'signin' && password !== confirm) return 'The passwords don’t match.';
    return null;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const problem = validate();
    if (problem) {
      setError(problem);
      return;
    }

    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      if (mode === 'signin') {
        await login(email.trim(), password);
        onAuthenticated?.();
        onClose();
      } else if (mode === 'signup') {
        await signup(email.trim(), password);
        onAuthenticated?.();
        onClose();
      } else if (mode === 'forgot') {
        await requestPasswordReset(email.trim());
        // Deliberately non-committal: the backend answers the same way for a
        // registered and an unregistered address, and the copy has to match or
        // it would leak which addresses have accounts.
        setNotice(
          'If an account exists for that email, we’ve sent a reset link. ' +
            'It expires in 30 minutes.',
        );
      } else {
        await resetPassword(resetToken ?? '', password);
        setNotice('Your password has been reset. You can sign in now.');
        setMode('signin');
        setPassword('');
        setConfirm('');
      }
    } catch (err) {
      setError(err instanceof ApiError ? err.detail : 'Something went wrong. Please try again.');
    } finally {
      setBusy(false);
    }
  };

  const title = {
    signin: 'Sign in',
    signup: 'Create your account',
    forgot: 'Reset your password',
    reset: 'Choose a new password',
  }[mode];

  const submitLabel = {
    signin: busy ? 'Signing in…' : 'Sign in',
    signup: busy ? 'Creating account…' : 'Create account',
    forgot: busy ? 'Sending…' : 'Send reset link',
    reset: busy ? 'Saving…' : 'Set new password',
  }[mode];

  return (
    <div
      className={s.overlay}
      role="dialog"
      aria-modal="true"
      aria-labelledby="auth-modal-title"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className={s.modal}>
        <button className={s.close} onClick={onClose} aria-label="Close">
          ×
        </button>

        <h2 id="auth-modal-title" className={s.title}>{title}</h2>

        {mode === 'signup' && (
          <p className={s.sub}>
            One account, one profile. Your dietary profile and scans stay private to you.
          </p>
        )}
        {mode === 'forgot' && (
          <p className={s.sub}>
            Enter the email you signed up with and we’ll send a link to reset your password.
          </p>
        )}
        {mode === 'reset' && (
          <p className={s.sub}>Pick a new password for your account.</p>
        )}

        <form onSubmit={handleSubmit} noValidate>
          {mode !== 'reset' && (
            <label className={s.field}>
              <span>Email</span>
              <input
                type="email"
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                disabled={busy}
                autoFocus
              />
            </label>
          )}

          {mode !== 'forgot' && (
            <label className={s.field}>
              <span>{mode === 'reset' ? 'New password' : 'Password'}</span>
              <input
                type="password"
                autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder={mode === 'signin' ? '' : `At least ${MIN_PASSWORD_LENGTH} characters`}
                disabled={busy}
                autoFocus={mode === 'reset'}
              />
            </label>
          )}

          {(mode === 'signup' || mode === 'reset') && (
            <label className={s.field}>
              <span>Confirm password</span>
              <input
                type="password"
                autoComplete="new-password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                disabled={busy}
              />
            </label>
          )}

          {error && <p className={s.error} role="alert">{error}</p>}
          {notice && <p className={s.notice} role="status">{notice}</p>}

          <button type="submit" className={s.submit} disabled={busy}>
            {submitLabel}
          </button>
        </form>

        <div className={s.links}>
          {mode === 'signin' && (
            <>
              <button className={s.link} onClick={() => switchMode('signup')}>
                Create an account
              </button>
              <button className={s.link} onClick={() => switchMode('forgot')}>
                Forgot password?
              </button>
            </>
          )}
          {mode === 'signup' && (
            <button className={s.link} onClick={() => switchMode('signin')}>
              Already have an account? Sign in
            </button>
          )}
          {(mode === 'forgot' || mode === 'reset') && (
            <button className={s.link} onClick={() => switchMode('signin')}>
              Back to sign in
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
