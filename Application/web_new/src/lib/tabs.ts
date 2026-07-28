export type Tab = 'home' | 'profile' | 'goals' | 'scan' | 'plan' | 'greenwashing' | 'ingredients' | 'about' | 'appearance';

export const TABS: { key: Tab; label: string; icon: string; path: string }[] = [
  { key: 'home',         label: 'Home',         icon: '🏠', path: '/' },
  { key: 'profile',      label: 'Profile',      icon: '👤', path: '/profile' },
  { key: 'goals',        label: 'Goals',        icon: '🎯', path: '/goals' },
  { key: 'scan',         label: 'Scan',         icon: '📷', path: '/scan' },
  { key: 'plan',         label: 'My Plan',      icon: '📋', path: '/plan' },
  { key: 'greenwashing', label: 'Greenwashing', icon: '🔍', path: '/greenwashing' },
  { key: 'ingredients',  label: 'Nutrition',    icon: '🧬', path: '/ingredients' },
  { key: 'about',        label: 'About',        icon: '✉️', path: '/about' },
  { key: 'appearance',   label: 'Appearance',   icon: '🎨', path: '/appearance' },
];

const TAB_BY_PATH: Record<string, Tab> = TABS.reduce((acc, tab) => {
  acc[tab.path] = tab.key;
  return acc;
}, {} as Record<string, Tab>);

export function pathForTab(tab: Tab): string {
  return TABS.find((item) => item.key === tab)?.path ?? '/';
}

export function normalizeTab(value: string | null): Tab {
  if (value && TABS.some((tab) => tab.key === value)) {
    return value as Tab;
  }
  return 'home';
}

export function tabFromPath(pathname: string): Tab {
  return TAB_BY_PATH[pathname] ?? 'home';
}