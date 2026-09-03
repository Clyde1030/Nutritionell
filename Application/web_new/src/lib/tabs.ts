import type { NavIconKey } from '@/components/icons/NavIcons';

export type Tab = 'home' | 'profile' | 'goals' | 'scan' | 'plan' | 'greenwashing' | 'ingredients' | 'about' | 'settings';

export const TABS: { key: Tab; label: string; icon: NavIconKey; path: string }[] = [
  { key: 'home',         label: 'Home',         icon: 'home',         path: '/' },
  { key: 'profile',      label: 'Profile',      icon: 'profile',      path: '/profile' },
  { key: 'goals',        label: 'Goals',        icon: 'goals',        path: '/goals' },
  { key: 'scan',         label: 'Scan',         icon: 'scan',         path: '/scan' },
  { key: 'plan',         label: 'My Plan',      icon: 'plan',         path: '/plan' },
  { key: 'greenwashing', label: 'Greenwashing', icon: 'greenwashing', path: '/greenwashing' },
  { key: 'ingredients',  label: 'Nutrition',    icon: 'nutrition',    path: '/ingredients' },
  { key: 'about',        label: 'About',        icon: 'about',        path: '/about' },
  { key: 'settings',     label: 'Settings',     icon: 'settings',     path: '/settings' },
];

/** Tabs anyone can see without an account. Everything else needs a session —
 *  AppShell gates on this list, so adding a public tab is a one-line change. */
export const PUBLIC_TABS: Tab[] = ['home', 'about'];

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
