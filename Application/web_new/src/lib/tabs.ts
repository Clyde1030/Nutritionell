import type { NavIconKey } from '@/components/icons/NavIcons';

/**
 * Tab + route map.
 *
 * v2 put almost everything back in front of the login. The only screens that
 * still need a signed-in, approved account are Profile, Goals and My Plan, and
 * those three no longer have their own nav entries — they hang off the account
 * tab instead (see ACCOUNT_SUBTABS).
 */
export type Tab =
  // ── In the nav, in this order ──────────────────────────────────────────────
  | 'scan'          // also the landing page, at '/'
  | 'claim-check'   // formerly "Greenwashing" — display rename only
  | 'analytics'     // formerly "Nutrition" / IngredientAnalyticsTab
  | 'our-mission'   // Home's content merged with the old About/Contact Us
  | 'settings'
  | 'account'       // "Sign In" logged out; the Profile/Goals/Plan gateway once in
  // ── Routable, but reached from the account tab rather than the nav ─────────
  | 'profile'
  | 'goals'
  | 'plan'
  // ── Routable, admins only, reached from the account menu ───────────────────
  | 'admin';

export const TABS: { key: Tab; label: string; icon: NavIconKey; path: string }[] = [
  { key: 'scan',        label: 'Scan',        icon: 'scan',         path: '/' },
  { key: 'claim-check', label: 'Claim Check', icon: 'greenwashing', path: '/claim-check' },
  { key: 'analytics',   label: 'Analytics',   icon: 'nutrition',    path: '/analytics' },
  { key: 'our-mission', label: 'Our Mission', icon: 'home',         path: '/our-mission' },
  { key: 'settings',    label: 'Settings',    icon: 'settings',     path: '/settings' },
  { key: 'account',     label: 'Sign In',     icon: 'profile',      path: '/account' },
];

/**
 * The three screens that still require a signed-in, approved account. Everything
 * else is public. Reached from the account tab, not the nav.
 *
 * NOTE the icon assignment above is deliberate and was chosen this way: Claim
 * Check gets the LEAF and Analytics gets the MAGNIFYING GLASS. Don't "fix" it to
 * the more obvious pairing.
 */
export const ACCOUNT_SUBTABS: { key: Tab; label: string; icon: NavIconKey; path: string; blurb: string }[] = [
  { key: 'profile', label: 'Profile',  icon: 'profile', path: '/profile',
    blurb: 'Allergies, dietary philosophy, and ingredients to avoid.' },
  { key: 'goals',   label: 'Goals',    icon: 'goals',   path: '/goals',
    blurb: 'What you are trying to do, in your own words.' },
  { key: 'plan',    label: 'My Plan',  icon: 'plan',    path: '/plan',
    blurb: 'A nutrition plan built from your profile and goals.' },
];

/** Everything a signed-out visitor can open. */
export const PUBLIC_TABS: Tab[] = [
  'scan', 'claim-check', 'analytics', 'our-mission', 'settings', 'account',
];

/** Needs auth AND approval. Exactly the three account sub-screens. */
export const GATED_TABS: Tab[] = ['profile', 'goals', 'plan'];

export const ADMIN_TAB_PATH = '/admin';

const ALL_ROUTES: { key: Tab; path: string }[] = [
  ...TABS,
  ...ACCOUNT_SUBTABS,
  { key: 'admin', path: ADMIN_TAB_PATH },
];

const TAB_BY_PATH: Record<string, Tab> = ALL_ROUTES.reduce((acc, t) => {
  acc[t.path] = t.key;
  return acc;
}, {} as Record<string, Tab>);

export function pathForTab(tab: Tab): string {
  return ALL_ROUTES.find((item) => item.key === tab)?.path ?? '/';
}

export function normalizeTab(value: string | null): Tab {
  const hit = ALL_ROUTES.find((t) => t.key === value);
  return hit ? hit.key : 'scan';
}

export function tabFromPath(pathname: string): Tab {
  // '/' is Scan, the landing page.
  return TAB_BY_PATH[pathname] ?? 'scan';
}
