'use client';
import { useState } from 'react';
import styles from './page.module.css';
import HomeTab from '@/components/HomeTab';
import ProfileTab from '@/components/ProfileTab';
import GoalsTab from '@/components/GoalsTab';
import ScanTab from '@/components/ScanTab';
import PlanTab from '@/components/PlanTab';
import GreenwashingTab from '@/components/GreenwashingTab';
import IngredientAnalyticsTab from '@/components/IngredientAnalyticsTab';
import AboutTab from '@/components/AboutTab';

/* ============================================
   DEV ONLY — Comment out or remove this import
   and the <DevColorToolbar /> below for production.
   ============================================ */
import DevColorToolbar from '@/components/DevColorToolbar';

type Tab = 'home' | 'profile' | 'goals' | 'scan' | 'plan' | 'greenwashing' | 'ingredients' | 'about';
const TABS: { key: Tab; label: string; icon: string }[] = [
  { key: 'home',          label: 'Home',          icon: '⌂' },
  { key: 'profile',       label: 'Profile',       icon: '◎' },
  { key: 'goals',         label: 'Goals',         icon: '◈' },
  { key: 'scan',          label: 'Scan',          icon: '⊕' },
  { key: 'plan',          label: 'My Plan',       icon: '≡' },
  { key: 'greenwashing',  label: 'Greenwashing',  icon: '🔍' },
  { key: 'ingredients',   label: 'Nutrition',     icon: '🧬' },
  { key: 'about',         label: 'About',         icon: '✉' },
];

export default function Home() {
  const [tab, setTab] = useState<Tab>('home');
  return (
    <div className={styles.shell}>
      {/* Top nav */}
      <header className={styles.header}>
        <button className={styles.logo} onClick={() => setTab('home')} aria-label="Nutritionell home">
          Nutritionell
        </button>
        <nav className={styles.nav}>
          {TABS.map(t => (
            <button key={t.key} className={`${styles.navBtn} ${tab === t.key ? styles.navBtnActive : ''}`}
              onClick={() => setTab(t.key)}>
              <span className={styles.navIcon}>{t.icon}</span>
              <span>{t.label}</span>
            </button>
          ))}
        </nav>
      </header>

      {/* Content */}
      <main className={styles.main}>
        {tab === 'home'         && <HomeTab onNavigate={(t) => setTab(t as Tab)} />}
        {tab === 'profile'      && <ProfileTab />}
        {tab === 'goals'        && <GoalsTab />}
        {tab === 'scan'         && <ScanTab />}
        {tab === 'plan'         && <PlanTab />}
        {tab === 'greenwashing' && <GreenwashingTab />}
        {tab === 'ingredients'  && <IngredientAnalyticsTab />}
        {tab === 'about'        && <AboutTab />}
      </main>

      {/* DEV ONLY — Remove <DevColorToolbar /> for production */}
      <DevColorToolbar />
    </div>
  );
}
