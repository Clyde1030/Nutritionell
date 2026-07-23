import { redirect } from 'next/navigation';
import AppShell from '@/components/AppShell';
import { normalizeTab } from '@/lib/tabs';

const ROUTES: Record<string, string> = {
  profile: '/profile',
  goals: '/goals',
  scan: '/scan',
  plan: '/plan',
  greenwashing: '/greenwashing',
  ingredients: '/ingredients',
  about: '/about',
  appearance: '/appearance',
};

type HomePageProps = {
  searchParams?: { tab?: string };
};

export default function HomePage({ searchParams }: HomePageProps) {
  const tab = normalizeTab(searchParams?.tab ?? null);
  const route = ROUTES[tab];

  if (route) {
    redirect(route);
  }

  return <AppShell initialTab="home" />;
}