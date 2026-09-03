'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import styles from '@/app/page.module.css';
import { TABS, PUBLIC_TABS, type Tab, pathForTab } from '@/lib/tabs';
import { useAuth } from '@/lib/AuthContext';
import AuthModal, { type AuthMode } from '@/components/AuthModal';
import PendingApproval from '@/components/PendingApproval';
import HomeTab from '@/components/HomeTab';
import ProfileTab from '@/components/ProfileTab';
import GoalsTab from '@/components/GoalsTab';
import ScanTab from '@/components/ScanTab';
import PlanTab from '@/components/PlanTab';
import GreenwashingTab from '@/components/GreenwashingTab';
import IngredientAnalyticsTab from '@/components/IngredientAnalyticsTab';
import AboutTab from '@/components/AboutTab';
import SettingsTab from '@/components/SettingsTab';
import { NAV_ICONS } from '@/components/icons/NavIcons';
import { initTheme } from '@/lib/theme';

export default function AppShell({ initialTab }: { initialTab: Tab }) {
  const router = useRouter();
  const { status, user, logout, sessionExpired, clearSessionExpired } = useAuth();

  const [tab, setTab] = useState<Tab>(initialTab);
  const [menuOpen, setMenuOpen] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);
  const headerRef = useRef<HTMLElement | null>(null);

  // Auth modal state. `pendingTab` remembers where the person was headed so a
  // deep link still lands correctly once they're signed in — the alternative
  // (redirecting to /) would silently lose their intent.
  const [authOpen, setAuthOpen] = useState(false);
  const [authMode, setAuthMode] = useState<AuthMode>('signin');
  const [pendingTab, setPendingTab] = useState<Tab | null>(null);
  const [resetToken, setResetToken] = useState<string | null>(null);

  const isPublic = useCallback((t: Tab) => PUBLIC_TABS.includes(t), []);
  // 'loading' is not "allowed": rendering a gated tab before the stored token is
  // verified would flash protected UI at someone who may not be signed in.
  const canView = useCallback(
    (t: Tab) => isPublic(t) || status === 'authenticated',
    [isPublic, status],
  );

  useEffect(() => {
    setTab(initialTab);
  }, [initialTab]);

  // Apply the persisted color theme on mount.
  useEffect(() => { initTheme(); }, []);

  const openAuth = useCallback((mode: AuthMode = 'signin', headedTo: Tab | null = null) => {
    setAuthMode(mode);
    setPendingTab(headedTo);
    setAuthOpen(true);
  }, []);

  // A reset link lands on `/?reset_token=…` (the param name the backend's email
  // builds). Open straight into the set-password step, then strip the token from
  // the URL so it isn't left in history or copied out of the address bar.
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
      {},
      '',
      window.location.pathname + (query ? `?${query}` : '') + window.location.hash,
    );
  }, []);

  // An expired token surfaces here rather than as a raw fetch error in whichever
  // tab happened to be making a request.
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
    setMenuOpen(false);
    setAccountOpen(false);

    if (!canView(nextTab)) {
      // Pending users are already signed in — showing them a login box would be
      // nonsense. Route them to the waiting notice instead.
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
    // Drop back to Home, since whatever they were on is now gated.
    if (!isPublic(tab)) {
      setTab('home');
      router.push(pathForTab('home'), { scroll: false });
    }
  };

  useEffect(() => {
    if (!menuOpen && !accountOpen) return;

    const handleDocumentClick = (event: MouseEvent) => {
      if (!headerRef.current) return;
      const target = event.target as Node | null;
      if (target && !headerRef.current.contains(target)) {
        setMenuOpen(false);
        setAccountOpen(false);
      }
    };

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setMenuOpen(false);
        setAccountOpen(false);
      }
    };

    document.addEventListener('mousedown', handleDocumentClick);
    document.addEventListener('keydown', handleEscape);

    return () => {
      document.removeEventListener('mousedown', handleDocumentClick);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [menuOpen, accountOpen]);

  /** A gated tab renders its real content only when allowed; otherwise the
   *  pending notice (signed in, awaiting approval) or nothing at all (signed
   *  out — the modal is what they see). */
  const gated = (t: Tab, content: React.ReactNode) => {
    if (canView(t)) return content;
    if (status === 'pending') return <PendingApproval email={user?.email} onLogout={handleLogout} />;
    return <SignedOutNotice onSignIn={() => openAuth('signin', t)} />;
  };

  return (
    <div className={styles.shell}>
      <header ref={headerRef} className={styles.header}>
        <button
          className={`${styles.logo} ${tab === 'home' ? styles.logoActive : ''}`}
          onClick={() => handleTabChange('home')}
          aria-label="Nutritionell home"
          aria-current={tab === 'home' ? 'page' : undefined}
        >
          {/* alt="" on purpose: the button already carries aria-label="Nutritionell
              home", so a described image would be announced twice. */}
          <img src="/logo.png" alt="" className={styles.logoMark} width={26} height={26} />
          <span>Nutritionell</span>
        </button>

        <button
          className={`${styles.menuToggle} ${menuOpen ? styles.menuToggleOpen : ''}`}
          aria-label={menuOpen ? 'Close menu' : 'Open menu'}
          aria-expanded={menuOpen}
          aria-controls="top-nav"
          onClick={() => setMenuOpen((open) => !open)}
        >
          <span className={styles.menuBar} />
          <span className={styles.menuBar} />
          <span className={styles.menuBar} />
        </button>

        <nav id="top-nav" className={`${styles.nav} ${menuOpen ? styles.navOpen : ''}`}>
          {TABS.map((t) => {
            const TabIcon = NAV_ICONS[t.icon];
            const locked = !canView(t.key) && status !== 'loading';
            return (
              <button
                key={t.key}
                className={`${styles.navBtn} ${tab === t.key ? styles.navBtnActive : ''} ${locked ? styles.navBtnLocked : ''}`}
                aria-current={tab === t.key ? 'page' : undefined}
                title={locked ? 'Sign in to use this' : undefined}
                onClick={() => handleTabChange(t.key)}
              >
                <span className={styles.navIcon}>
                  <TabIcon className={styles.navIconSvg} />
                </span>
                <span>{t.label}</span>
              </button>
            );
          })}
        </nav>

        <div className={styles.account}>
          {status === 'loading' && <span className={styles.accountLoading} aria-hidden="true" />}

          {status === 'anonymous' && (
            <button className={styles.loginBtn} onClick={() => openAuth('signin', null)}>
              Log In
            </button>
          )}

          {(status === 'authenticated' || status === 'pending') && (
            <>
              <button
                className={styles.accountBtn}
                onClick={() => setAccountOpen((o) => !o)}
                aria-expanded={accountOpen}
                aria-haspopup="menu"
                title={user?.email}
              >
                <span className={styles.accountAvatar} aria-hidden="true">
                  {(user?.email ?? '?').charAt(0).toUpperCase()}
                </span>
                <span className={styles.accountEmail}>{user?.email}</span>
              </button>

              {accountOpen && (
                <div className={styles.accountMenu} role="menu">
                  <div className={styles.accountMenuEmail}>{user?.email}</div>
                  {status === 'pending' && (
                    <div className={styles.accountMenuBadge}>Pending approval</div>
                  )}
                  <button className={styles.accountMenuItem} onClick={handleLogout} role="menuitem">
                    Log out
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      </header>

      <main className={styles.main}>
        <section className={styles.tabPanel} hidden={tab !== 'home'} aria-hidden={tab !== 'home'}>
          <HomeTab
            onNavigate={(t) => handleTabChange(t as Tab)}
            onGetStarted={() => openAuth('signup', 'profile')}
          />
        </section>
        <section className={styles.tabPanel} hidden={tab !== 'profile'} aria-hidden={tab !== 'profile'}>
          {gated('profile', <ProfileTab />)}
        </section>
        <section className={styles.tabPanel} hidden={tab !== 'goals'} aria-hidden={tab !== 'goals'}>
          {gated('goals', <GoalsTab />)}
        </section>
        <section className={styles.tabPanel} hidden={tab !== 'scan'} aria-hidden={tab !== 'scan'}>
          {gated('scan', <ScanTab />)}
        </section>
        <section className={styles.tabPanel} hidden={tab !== 'plan'} aria-hidden={tab !== 'plan'}>
          {gated('plan', <PlanTab />)}
        </section>
        <section className={styles.tabPanel} hidden={tab !== 'greenwashing'} aria-hidden={tab !== 'greenwashing'}>
          {gated('greenwashing', <GreenwashingTab />)}
        </section>
        <section className={styles.tabPanel} hidden={tab !== 'ingredients'} aria-hidden={tab !== 'ingredients'}>
          {gated('ingredients', <IngredientAnalyticsTab />)}
        </section>
        <section className={styles.tabPanel} hidden={tab !== 'about'} aria-hidden={tab !== 'about'}>
          <AboutTab />
        </section>
        <section className={styles.tabPanel} hidden={tab !== 'settings'} aria-hidden={tab !== 'settings'}>
          {gated('settings', <SettingsTab />)}
        </section>
      </main>

      <AuthModal
        open={authOpen}
        initialMode={authMode}
        resetToken={authMode === 'reset' ? resetToken : null}
        onClose={() => {
          setAuthOpen(false);
          setResetToken(null);
          clearSessionExpired();
        }}
        onAuthenticated={handleAuthenticated}
      />
    </div>
  );
}

function SignedOutNotice({ onSignIn }: { onSignIn: () => void }) {
  return (
    <div className={styles.gateNotice}>
      <h2>Sign in to continue</h2>
      <p>This part of Nutritionell needs an account. Home and Contact Us stay open to everyone.</p>
      <button className={styles.gateBtn} onClick={onSignIn}>
        Sign in or create an account
      </button>
    </div>
  );
}
