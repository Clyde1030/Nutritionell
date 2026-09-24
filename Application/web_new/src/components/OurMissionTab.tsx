'use client';
/**
 * Our Mission — Home's content merged with the old Contact Us / About tab.
 *
 * v2 removed Home as a tab. Rather than rebuilding its copy, this renders
 * HomeTab's existing (already redesigned) sections and then AboutTab's team +
 * contact sections beneath them, so nothing that was written and approved is
 * lost in the merge.
 */
import AboutTab from '@/components/AboutTab';
import HomeTab from '@/components/HomeTab';

export default function OurMissionTab({
  onNavigate,
  onGetStarted,
}: {
  onNavigate: (tab: string) => void;
  onGetStarted: () => void;
}) {
  return (
    <>
      <HomeTab onNavigate={onNavigate} onGetStarted={onGetStarted} />
      <AboutTab />
    </>
  );
}
