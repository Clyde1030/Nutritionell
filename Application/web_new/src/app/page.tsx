'use client';
import { useEffect, useRef, useState } from 'react';
import styles from './page.module.css';
import HomeTab from '@/components/HomeTab';
import ProfileTab from '@/components/ProfileTab';
import GoalsTab from '@/components/GoalsTab';
import ScanTab from '@/components/ScanTab';
import PlanTab from '@/components/PlanTab';
import GreenwashingTab from '@/components/GreenwashingTab';
import IngredientAnalyticsTab from '@/components/IngredientAnalyticsTab';
import AboutTab from '@/components/AboutTab';
import SettingsTab from '@/components/SettingsTab';
import { initTheme } from '@/lib/theme';

type Tab = 'home' | 'profile' | 'goals' | 'scan' | 'plan' | 'greenwashing' | 'ingredients' | 'about' | 'settings';
const TABS: { key: Tab; label: string; icon: string }[] = [
  { key: 'home',          label: 'Home',          icon: '🏠' },
  { key: 'profile',       label: 'Profile',       icon: '👤' },
  { key: 'goals',         label: 'Goals',         icon: '🎯' },
  { key: 'scan',          label: 'Scan',          icon: '📷' },
  { key: 'plan',          label: 'My Plan',       icon: '📋' },
  { key: 'greenwashing',  label: 'Greenwashing',  icon: '🔍' },
  { key: 'ingredients',   label: 'Nutrition',     icon: '🧬' },
  { key: 'about',         label: 'Contact Us',    icon: '✉️' },
  { key: 'settings',      label: 'Settings',      icon: '⚙️' },
];

export default function Home() {
  const [tab, setTab] = useState<Tab>('home');
  const [menuOpen, setMenuOpen] = useState(false);
  const headerRef = useRef<HTMLElement | null>(null);
  // ScanTab / PlanTab stay mounted for within-session persistence, but read
  // localStorage during render — so only mount AFTER hydration to avoid a
  // server/client mismatch. Also apply the persisted color theme on mount.
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); initTheme(); }, []);

  useEffect(() => {
    if (!menuOpen) return;

    const handleDocumentClick = (event: MouseEvent) => {
      if (!headerRef.current) return;
      const target = event.target as Node | null;
      if (target && !headerRef.current.contains(target)) {
        setMenuOpen(false);
      }
    };

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setMenuOpen(false);
      }
    };

    document.addEventListener('mousedown', handleDocumentClick);
    document.addEventListener('keydown', handleEscape);

    return () => {
      document.removeEventListener('mousedown', handleDocumentClick);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [menuOpen]);

  const handleTabChange = (nextTab: Tab) => {
    setTab(nextTab);
    setMenuOpen(false);
  };

  return (
    <div className={styles.shell}>
      {/* Top nav */}
      <header ref={headerRef} className={styles.header}>
        <button className={styles.logo} onClick={() => handleTabChange('home')} aria-label="Nutritionell home">
          Nutritionell
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
          {TABS.map(t => (
            <button
              key={t.key}
              className={`${styles.navBtn} ${tab === t.key ? styles.navBtnActive : ''}`}
              onClick={() => handleTabChange(t.key)}
            >
              <span className={styles.navIcon}>{t.icon}</span>
              <span>{t.label}</span>
            </button>
          ))}
        </nav>
      </header>

      {/* Content */}
      <main className={styles.main}>
        {tab === 'home'         && <HomeTab onNavigate={(t) => handleTabChange(t as Tab)} />}
        {tab === 'profile'      && <ProfileTab />}
        {tab === 'goals'        && <GoalsTab />}
        {/* Scan stays mounted (just hidden) so an in-progress or completed scan
            persists when you switch tabs and come back within the session.
            Gated on `mounted` so it renders client-only (no SSR hydration mismatch). */}
        {mounted && <div style={{ display: tab === 'scan' ? 'block' : 'none' }}><ScanTab /></div>}
        {/* My Plan also stays mounted so a generated plan persists across tab switches. */}
        {mounted && <div style={{ display: tab === 'plan' ? 'block' : 'none' }}><PlanTab /></div>}
        {tab === 'greenwashing' && <GreenwashingTab />}
        {tab === 'ingredients'  && <IngredientAnalyticsTab />}
        {tab === 'about'        && <AboutTab />}
        {tab === 'settings'     && <SettingsTab />}
      </main>
    </div>
  );
}
