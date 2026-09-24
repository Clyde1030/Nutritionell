import { notFound } from 'next/navigation';
import AppShell from '@/components/AppShell';
import { tabFromPath } from '@/lib/tabs';

type PageProps = {
  params: { tab: string };
};

// Every route except '/' (which app/page.tsx serves as Scan). Derived from the
// tab map so adding a route in one place is enough.
const VALID_TABS = new Set<string>([
  'claim-check', 'analytics', 'our-mission', 'settings', 'account',
  'profile', 'goals', 'plan', 'admin',
]);

export default function TabPage({ params }: PageProps) {
  const tab = tabFromPath(`/${params.tab}`);
  if (!VALID_TABS.has(tab)) {
    notFound();
  }
  return <AppShell initialTab={tab} />;
}
