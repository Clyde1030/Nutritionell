'use client';
/**
 * The "Sign In" nav tab.
 *
 * Three states, because this one position has to serve all of them:
 *  - signed out  → the sign-in / create-account entry point
 *  - pending     → the waiting notice (no partial access, same rule as before)
 *  - approved    → the gateway to Profile, Goals and My Plan, which are the only
 *                  screens still gated and no longer have their own nav entries
 *
 * Judgment call: a small dashboard rather than a redirect straight to Profile.
 * Three destinations don't fit in one redirect, and a signed-in person opening
 * "account" is as likely to want Goals or My Plan as Profile.
 */
import { ACCOUNT_SUBTABS, type Tab } from '@/lib/tabs';
import { useAuth } from '@/lib/AuthContext';
import { NAV_ICONS } from '@/components/icons/NavIcons';
import s from './AccountTab.module.css';

export default function AccountTab({
  onNavigate,
  onSignIn,
  onCreateAccount,
}: {
  onNavigate: (tab: Tab) => void;
  onSignIn: () => void;
  onCreateAccount: () => void;
}) {
  const { status, user, logout } = useAuth();

  if (status === 'loading') {
    return (
      <div className={s.wrap}>
        <p className={s.muted}>Checking your session…</p>
      </div>
    );
  }

  // ── Signed out ───────────────────────────────────────────────────────────
  if (status === 'anonymous') {
    return (
      <div className={s.wrap}>
        <div className={s.hero}>
          <h1 className={s.title}>Sign in</h1>
          <p className={s.subtitle}>
            Scanning, Claim Check and Analytics all work without an account. Sign in to
            add the part that needs to know you: a fit score for every product, against
            your own allergies, goals and dietary philosophy.
          </p>
        </div>

        <div className={s.card}>
          <button className={s.primaryBtn} onClick={onSignIn}>Sign in</button>
          <button className={s.secondaryBtn} onClick={onCreateAccount}>
            Create an account
          </button>
        </div>

        <div className={s.card}>
          <h2 className={s.cardTitle}>What an account adds</h2>
          <ul className={s.list}>
            {ACCOUNT_SUBTABS.map((t) => {
              const Icon = NAV_ICONS[t.icon];
              return (
                <li key={t.key} className={s.listRow}>
                  <span className={s.rowIcon}><Icon className={s.rowIconSvg} /></span>
                  <span className={s.rowMain}>
                    <span className={s.rowLabel}>{t.label}</span>
                    <span className={s.rowBlurb}>{t.blurb}</span>
                  </span>
                </li>
              );
            })}
          </ul>
        </div>
      </div>
    );
  }

  // ── Signed in, awaiting approval ─────────────────────────────────────────
  if (status === 'pending') {
    return (
      <div className={s.wrap}>
        <div className={s.hero}>
          <h1 className={s.title}>Your account is pending approval</h1>
          <p className={s.subtitle}>
            Thanks for signing up{user?.email ? ` as ${user.email}` : ''}. Nutritionell is
            being rebuilt right now, so new accounts are approved by hand. We&rsquo;ll
            notify you once you&rsquo;re approved — then Profile, Goals and My Plan unlock
            automatically, no need to sign up again.
          </p>
          <p className={s.muted}>
            Scan, Claim Check, Analytics and Our Mission all work in the meantime.
          </p>
        </div>
        <div className={s.card}>
          <button className={s.secondaryBtn} onClick={logout}>Log out</button>
        </div>
      </div>
    );
  }

  // ── Signed in and approved ───────────────────────────────────────────────
  return (
    <div className={s.wrap}>
      <div className={s.hero}>
        <h1 className={s.title}>Your account</h1>
        <p className={s.subtitle}>{user?.email}</p>
      </div>

      <div className={s.card}>
        <h2 className={s.cardTitle}>Your details</h2>
        <ul className={s.list}>
          {ACCOUNT_SUBTABS.map((t) => {
            const Icon = NAV_ICONS[t.icon];
            return (
              <li key={t.key}>
                <button className={s.linkRow} onClick={() => onNavigate(t.key)}>
                  <span className={s.rowIcon}><Icon className={s.rowIconSvg} /></span>
                  <span className={s.rowMain}>
                    <span className={s.rowLabel}>{t.label}</span>
                    <span className={s.rowBlurb}>{t.blurb}</span>
                  </span>
                  <span className={s.chevron} aria-hidden="true">›</span>
                </button>
              </li>
            );
          })}
        </ul>
      </div>

      <div className={s.card}>
        {user?.is_admin && (
          <button className={s.secondaryBtn} onClick={() => onNavigate('admin')}>
            Admin
          </button>
        )}
        <button className={s.secondaryBtn} onClick={logout}>Log out</button>
      </div>
    </div>
  );
}
