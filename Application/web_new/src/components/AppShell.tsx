'use client';
import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import styles from '@/app/page.module.css';
import { TABS, type Tab, pathForTab } from '@/lib/tabs';
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
  const [tab, setTab] = useState<Tab>(initialTab);
  const [menuOpen, setMenuOpen] = useState(false);
  const headerRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    setTab(initialTab);
  }, [initialTab]);

  // Apply the persisted color theme on mount.
  useEffect(() => { initTheme(); }, []);

  const handleTabChange = (nextTab: Tab) => {
    if (nextTab === tab) {
      setMenuOpen(false);
      return;
    }
    setTab(nextTab);
    setMenuOpen(false);
    router.push(pathForTab(nextTab), { scroll: false });
  };

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
            return (
            <button
              key={t.key}
              className={`${styles.navBtn} ${tab === t.key ? styles.navBtnActive : ''}`}
              aria-current={tab === t.key ? 'page' : undefined}
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
      </header>

      <main className={styles.main}>
        <section className={styles.tabPanel} hidden={tab !== 'home'} aria-hidden={tab !== 'home'}>
          <HomeTab onNavigate={(t) => handleTabChange(t as Tab)} />
        </section>
        <section className={styles.tabPanel} hidden={tab !== 'profile'} aria-hidden={tab !== 'profile'}>
          <ProfileTab />
        </section>
        <section className={styles.tabPanel} hidden={tab !== 'goals'} aria-hidden={tab !== 'goals'}>
          <GoalsTab />
        </section>
        <section className={styles.tabPanel} hidden={tab !== 'scan'} aria-hidden={tab !== 'scan'}>
          <ScanTab />
        </section>
        <section className={styles.tabPanel} hidden={tab !== 'plan'} aria-hidden={tab !== 'plan'}>
          <PlanTab />
        </section>
        <section className={styles.tabPanel} hidden={tab !== 'greenwashing'} aria-hidden={tab !== 'greenwashing'}>
          <GreenwashingTab />
        </section>
        <section className={styles.tabPanel} hidden={tab !== 'ingredients'} aria-hidden={tab !== 'ingredients'}>
          <IngredientAnalyticsTab />
        </section>
        <section className={styles.tabPanel} hidden={tab !== 'about'} aria-hidden={tab !== 'about'}>
          <AboutTab />
        </section>
        <section className={styles.tabPanel} hidden={tab !== 'settings'} aria-hidden={tab !== 'settings'}>
          <SettingsTab />
        </section>
      </main>
    </div>
  );
}