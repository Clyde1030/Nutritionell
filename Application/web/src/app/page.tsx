'use client';
import { useState } from 'react';
import styles from './page.module.css';
import ProfileTab from '@/components/ProfileTab';
import GoalsTab from '@/components/GoalsTab';
import ScanTab from '@/components/ScanTab';
import PlanTab from '@/components/PlanTab';

type Tab = 'profile' | 'goals' | 'scan' | 'plan';
const TABS: { key: Tab; label: string; icon: string }[] = [
  { key: 'profile', label: 'Profile',   icon: '◎' },
  { key: 'goals',   label: 'Goals',     icon: '◈' },
  { key: 'scan',    label: 'Scan',      icon: '⊕' },
  { key: 'plan',    label: 'My Plan',   icon: '≡' },
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
        {tab === 'profile' && <ProfileTab onSaved={() => setTab('scan')} />}
        {tab === 'goals'   && <GoalsTab />}
        {tab === 'scan'    && <ScanTab />}
        {tab === 'plan'    && <PlanTab />}
      </main>
    </div>
  );
}
