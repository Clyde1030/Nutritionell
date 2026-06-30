'use client';
import { useState } from 'react';
import styles from './page.module.css';
import ProfileTab from '@/components/ProfileTab';
import GoalsTab from '@/components/GoalsTab';
import ScanTab from '@/components/ScanTab';
import PlanTab from '@/components/PlanTab';
import GreenwashingTab from '@/components/GreenwashingTab';
import IngredientAnalyticsTab from '@/components/IngredientAnalyticsTab';

/* ============================================
   DEV ONLY — Comment out or remove this import
   and the <DevColorToolbar /> below for production.
   ============================================ */
import DevColorToolbar from '@/components/DevColorToolbar';

type Tab = 'profile' | 'goals' | 'scan' | 'plan' | 'greenwashing' | 'ingredients';
const TABS: { key: Tab; label: string; icon: string }[] = [
  { key: 'profile',       label: 'Profile',       icon: '◎' },
  { key: 'goals',         label: 'Goals',         icon: '◈' },
  { key: 'scan',          label: 'Scan',          icon: '⊕' },
  { key: 'plan',          label: 'My Plan',       icon: '≡' },
  { key: 'greenwashing',  label: 'Greenwashing',  icon: '🔍' },
  { key: 'ingredients',   label: 'Nutrition',     icon: '🧬' },
];

export default function Home() {
  const [tab, setTab] = useState<Tab>('profile');
  return (
    <div className={styles.shell}>
      {/* Top nav */}
      <header className={styles.header}>
        <span className={styles.logo}>Nutritionell</span>
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
        {tab === 'profile'      && <ProfileTab onSaved={() => setTab('scan')} />}
        {tab === 'goals'        && <GoalsTab />}
        {tab === 'scan'         && <ScanTab />}
        {tab === 'plan'         && <PlanTab />}
        {tab === 'greenwashing' && <GreenwashingTab />}
        {tab === 'ingredients'  && <IngredientAnalyticsTab />}
      </main>

      {/* DEV ONLY — Remove <DevColorToolbar /> for production */}
      <DevColorToolbar />
    </div>
  );
}
