import { notFound } from 'next/navigation';
import AppShell from '@/components/AppShell';
import { tabFromPath } from '@/lib/tabs';

type PageProps = {
  params: { tab: string };
};

const VALID_TABS = new Set(['profile', 'goals', 'scan', 'plan', 'greenwashing', 'ingredients', 'about', 'settings', 'admin']);

export default function TabPage({ params }: PageProps) {
  const tab = tabFromPath(`/${params.tab}`);
  if (!VALID_TABS.has(tab)) {
    notFound();
  }
  return <AppShell initialTab={tab} />;
}
