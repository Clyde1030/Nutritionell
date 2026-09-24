'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import styles from '@/app/page.module.css';
import { TABS, PUBLIC_TABS, type Tab, pathForTab } from '@/lib/tabs';
import { useAuth } from '@/lib/AuthContext';
import AuthModal, { type AuthMode } from '@/components/AuthModal';
import PendingApproval from '@/components/PendingApproval';
import AccountTab from '@/components/AccountTab';
import OurMissionTab from '@/components/OurMissionTab';
import ProfileTab from '@/components/ProfileTab';
import GoalsTab from '@/components/GoalsTab';
import ScanTab from '@/components/ScanTab';
import PlanTab from '@/components/PlanTab';
import GreenwashingTab from '@/components/GreenwashingTab';
import IngredientAnalyticsTab from '@/components/IngredientAnalyticsTab';
import SettingsTab from '@/components/SettingsTab';
import AdminTab from '@/components/AdminTab';
import { NAV_ICONS, NLogoMark } from '@/components/icons/NavIcons';
import { initTheme } from '@/lib/theme';

export default function AppShell({ initialTab }: { initialTab: Tab }) {
  const router = useRouter();
  const { status, user, logout, sessionExpired, clearSessionExpired } = useAuth();

  const [tab, setTab] = useState<Tab>(initialTab);
  const [accountOpen, setAccountOpen] = useState(false);
  const headerRef = useRef<HTMLElement | null>(null);

  // `pendingTab` remembers where the person was headed so a deep link still
  // lands correctly once they're signed in.
  const [authOpen, setAuthOpen] = useState(false);
  const [authMode, setAuthMode] = useState<AuthMode>('signin');
  const [pendingTab, setPendingTab] = useState<Tab | null>(null);
  const [resetToken, setResetToken] = useState<string | null>(null);

  const isPublic = useCallback((t: Tab) => PUBLIC_TABS.includes(t), []);
  const isAdminUser = user?.is_admin === true;
  // 'loading' is not "allowed": rendering a gated tab before the stored token is
  // verified would flash protected UI at someone who may not be signed in.
  const canView = useCallback(
    (t: Tab) => isPublic(t) || status === 'authenticated',
    [isPublic, status],
  );

  useEffect(() => { setTab(initialTab); }, [initialTab]);
  useEffect(() => { initTheme(); }, []);

  const openAuth = useCallback((mode: AuthMode = 'signin', headedTo: Tab | null = null) => {
    setAuthMode(mode);
    setPendingTab(headedTo);
    setAuthOpen(true);
  }, []);

  // A reset link lands on `/?reset_token=…`. Open straight into the set-password
  // step, then strip the token so it isn't left in history or the address bar.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const params = new URLSearchParams(window.location.search);
    const token = params.get('reset_token');
    if (!token) return;

    setResetToken(token);
    setAuthMode('reset');
    setAuthOpen(true);

    params.delete('reset_token');
    const query = params.toString();
    window.history.replaceState(
      {}, '',
      window.location.pathname + (query ? `?${query}` : '') + window.location.hash,
    );
  }, []);

  useEffect(() => {
    if (sessionExpired) {
      setAuthMode('signin');
      setAuthOpen(true);
    }
  }, [sessionExpired]);

  // Landing directly on a gated URL while signed out: don't redirect (that would
  // lose the destination), just don't render it and ask them to sign in.
  useEffect(() => {
    if (status === 'loading') return;
    if (!canView(tab)) {
      setPendingTab(tab);
      if (status === 'anonymous') {
        setAuthMode('signin');
        setAuthOpen(true);
      }
    }
  }, [status, tab, canView]);

  const handleTabChange = (nextTab: Tab) => {
    setAccountOpen(false);

    if (!canView(nextTab)) {
      // Pending users are already signed in — a login box would be nonsense.
      if (status === 'pending') {
        setTab(nextTab);
        router.push(pathForTab(nextTab), { scroll: false });
        return;
      }
      openAuth('signin', nextTab);
      return;
    }

    if (nextTab === tab) return;
    setTab(nextTab);
    router.push(pathForTab(nextTab), { scroll: false });
  };

  const handleAuthenticated = () => {
    clearSessionExpired();
    const destination = pendingTab;
    setPendingTab(null);
    if (destination && destination !== tab) {
      setTab(destination);
      router.push(pathForTab(destination), { scroll: false });
    }
  };

  const handleLogout = () => {
    setAccountOpen(false);
    logout();
    if (!isPublic(tab)) {
      setTab('scan');
      router.push(pathForTab('scan'), { scroll: false });
    }
  };

  useEffect(() => {
    if (!accountOpen) return;
    const onClick = (e: MouseEvent) => {
      const target = e.target as Node | null;
      if (headerRef.current && target && !headerRef.current.contains(target)) {
        setAccountOpen(false);
      }
    };
    const onEsc = (e: KeyboardEvent) => { if (e.key === 'Escape') setAccountOpen(false); };
    document.addEventListener('mousedown', onClick);
    document.addEventListener('keydown', onEsc);
    return () => {
      document.removeEventListener('mousedown', onClick);
      document.removeEventListener('keydown', onEsc);
    };
  }, [accountOpen]);

  /** Only Profile, Goals and My Plan go through this now. */
  const gated = (t: Tab, content: React.ReactNode) => {
    if (canView(t)) return content;
    if (status === 'pending') return <PendingApproval email={user?.email} onLogout={handleLogout} />;
    return <SignedOutNotice onSignIn={() => openAuth('signin', t)} />;
  };

  const adminPanel = () => {
    if (!canView('admin')) return gated('admin', <AdminTab />);
    if (!isAdminUser) return <NotAuthorizedNotice />;
    return <AdminTab />;
  };

  const signedIn = status === 'authenticated' || status === 'pending';

  return (
    <div className={styles.shell}>
      {/* ── Header: logo + wordmark, Sign In pill / account chip ───────────── */}
      <header ref={headerRef} className={styles.header}>
        <button
          className={styles.logo}
          onClick={() => handleTabChange('scan')}
          aria-label="Nutritionell home"
        >
          {/* The original logo mark stays; the pixel N stands in for the
              wordmark's own capital N. aria-label carries the whole word. */}
          <img src="/logo.png" alt="" className={styles.logoMark} width={28} height={28} />
          <span className={styles.wordmark}>
            <NLogoMark className={styles.logoN} />utritionell
          </span>
        </button>

        <div className={styles.account}>
          {status === 'loading' && <span className={styles.accountLoading} aria-hidden="true" />}

          {status === 'anonymous' && (
            <button className={styles.loginBtn} onClick={() => openAuth('signin', null)}>
              Sign In
            </button>
          )}

          {signedIn && (
            <>
              <button
                className={styles.accountBtn}
                onClick={() => setAccountOpen((o) => !o)}
                aria-expanded={accountOpen}
                aria-haspopup="menu"
                aria-label={`Account: ${user?.email ?? ''}`}
              >
                <span className={styles.accountAvatar} aria-hidden="true">
                  {(user?.email ?? '?').charAt(0).toUpperCase()}
                </span>
              </button>

              {accountOpen && (
                <div className={styles.accountMenu} role="menu">
                  <div className={styles.accountMenuEmail}>{user?.email}</div>
                  {status === 'pending' && (
                    <div className={styles.accountMenuBadge}>Pending approval</div>
                  )}
                  <button className={styles.accountMenuItem} role="menuitem"
                          onClick={() => handleTabChange('account')}>
                    Your account
                  </button>
                  {isAdminUser && (
                    <button className={styles.accountMenuItem} role="menuitem"
                            onClick={() => handleTabChange('admin')}>
                      Admin
                    </button>
                  )}
                  <button className={styles.accountMenuItem} role="menuitem" onClick={handleLogout}>
                    Log out
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      </header>

      <main className={styles.main}>
        <section className={styles.tabPanel} hidden={tab !== 'scan'} aria-hidden={tab !== 'scan'}>
          <ScanTab onSignIn={() => openAuth('signin', null)}
                   onNavigate={(t) => handleTabChange(t as Tab)} />
        </section>
        <section className={styles.tabPanel} hidden={tab !== 'claim-check'} aria-hidden={tab !== 'claim-check'}>
          <GreenwashingTab onNavigate={(t) => handleTabChange(t as Tab)} />
        </section>
        <section className={styles.tabPanel} hidden={tab !== 'analytics'} aria-hidden={tab !== 'analytics'}>
          <IngredientAnalyticsTab />
        </section>
        <section className={styles.tabPanel} hidden={tab !== 'our-mission'} aria-hidden={tab !== 'our-mission'}>
          <OurMissionTab
            onNavigate={(t) => handleTabChange(t as Tab)}
            onGetStarted={() => openAuth('signup', 'account')}
          />
        </section>
        <section className={styles.tabPanel} hidden={tab !== 'settings'} aria-hidden={tab !== 'settings'}>
          <SettingsTab />
        </section>
        <section className={styles.tabPanel} hidden={tab !== 'account'} aria-hidden={tab !== 'account'}>
          <AccountTab
            onNavigate={(t) => handleTabChange(t)}
            onSignIn={() => openAuth('signin', null)}
            onCreateAccount={() => openAuth('signup', null)}
          />
        </section>

        {/* Gated: reached from the account tab, not the nav. */}
        <section className={styles.tabPanel} hidden={tab !== 'profile'} aria-hidden={tab !== 'profile'}>
          {gated('profile', <ProfileTab />)}
        </section>
        <section className={styles.tabPanel} hidden={tab !== 'goals'} aria-hidden={tab !== 'goals'}>
          {gated('goals', <GoalsTab />)}
        </section>
        <section className={styles.tabPanel} hidden={tab !== 'plan'} aria-hidden={tab !== 'plan'}>
          {gated('plan', <PlanTab />)}
        </section>
        <section className={styles.tabPanel} hidden={tab !== 'admin'} aria-hidden={tab !== 'admin'}>
          {tab === 'admin' && adminPanel()}
        </section>
      </main>

      {/* ── Bottom tab bar ─────────────────────────────────────────────────────
          A bottom bar rather than a hamburger drawer: the app is used only on a
          phone, six items fit at 390px, and a drawer would hide the whole nav
          behind a tap on every screen. Keeps the filled-icon-chip treatment —
          the chip fills with the accent on the active tab, same as before. */}
      <nav className={styles.tabBar} aria-label="Main">
        {TABS.map((t) => {
          const Icon = NAV_ICONS[t.icon];
          const active = tab === t.key
            // The account sub-screens keep the account tab lit, so you can always
            // see where you are.
            || (t.key === 'account' && (tab === 'profile' || tab === 'goals' || tab === 'plan' || tab === 'admin'));
          const label = t.key === 'account' && signedIn ? 'Account' : t.label;
          return (
            <button
              key={t.key}
              className={`${styles.tabBarBtn} ${active ? styles.tabBarBtnActive : ''}`}
              aria-current={active ? 'page' : undefined}
              onClick={() => handleTabChange(t.key)}
            >
              <span className={styles.navIcon}><Icon className={styles.navIconSvg} /></span>
              <span className={styles.tabBarLabel}>{label}</span>
            </button>
          );
        })}
      </nav>

      <AuthModal
        open={authOpen}
        initialMode={authMode}
        resetToken={authMode === 'reset' ? resetToken : null}
        onClose={() => { setAuthOpen(false); setResetToken(null); clearSessionExpired(); }}
        onAuthenticated={handleAuthenticated}
      />
    </div>
  );
}

function NotAuthorizedNotice() {
  return (
    <div className={styles.gateNotice}>
      <h2>Not authorized</h2>
      <p>This screen is for administrators. If you think that&rsquo;s wrong, ask an admin to check your account.</p>
    </div>
  );
}

function SignedOutNotice({ onSignIn }: { onSignIn: () => void }) {
  return (
    <div className={styles.gateNotice}>
      <h2>Sign in to continue</h2>
      <p>Profile, Goals and My Plan need an account. Everything else works without one.</p>
      <button className={styles.gateBtn} onClick={onSignIn}>Sign in or create an account</button>
    </div>
  );
}
