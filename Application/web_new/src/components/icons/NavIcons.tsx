// Inline stroke icons for the tab nav. Each renders at whatever size its wrapper
// gives it (the nav chip sets 14x14) and inherits color via currentColor.
import type { SVGProps } from 'react';

type IconProps = { className?: string };

function Icon({ children, ...rest }: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden="true" {...rest}>
      {children}
    </svg>
  );
}

export function HomeIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M4 11.5 12 4l8 7.5" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M6 10v9a1 1 0 0 0 1 1h3v-6h4v6h3a1 1 0 0 0 1-1v-9" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </Icon>
  );
}

export function ProfileIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <circle cx="12" cy="8.5" r="3.3" strokeWidth="1.8" />
      <path d="M5 20c1.2-3.8 4-5.6 7-5.6s5.8 1.8 7 5.6" strokeWidth="1.8" strokeLinecap="round" />
    </Icon>
  );
}

export function GoalsIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <circle cx="12" cy="12" r="8" strokeWidth="1.6" />
      <circle cx="12" cy="12" r="4.3" strokeWidth="1.6" />
      <circle cx="12" cy="12" r="1" fill="currentColor" />
    </Icon>
  );
}

export function ScanIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M4 9a2 2 0 0 1 2-2h1.6l1-1.6h6.8l1 1.6H18a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V9z" strokeWidth="1.7" strokeLinejoin="round" />
      <circle cx="12" cy="13" r="3.1" strokeWidth="1.7" />
    </Icon>
  );
}

export function PlanIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <rect x="6" y="4.5" width="12" height="16" rx="1.6" strokeWidth="1.7" />
      <path d="M9 4.5V4a1.5 1.5 0 0 1 1.5-1.5h3A1.5 1.5 0 0 1 15 4v.5" strokeWidth="1.7" />
      <path d="M9 12.5l2 2 4-4.3" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
    </Icon>
  );
}

export function GreenwashingIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M5 19c-1-7 3-13 14-14 1 10-4 15-14 14z" strokeWidth="1.7" strokeLinejoin="round" />
      <path d="M6 18c3-4 6-7 12-11.5" strokeWidth="1.7" strokeLinecap="round" />
    </Icon>
  );
}

export function NutritionIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <circle cx="10.5" cy="10.5" r="6" strokeWidth="1.8" />
      <path d="M15 15l5 5" strokeWidth="1.8" strokeLinecap="round" />
    </Icon>
  );
}

export function AboutIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <rect x="3.5" y="5.5" width="17" height="13" rx="1.8" strokeWidth="1.7" />
      <path d="M4.5 7l7.5 6 7.5-6" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
    </Icon>
  );
}

export function SettingsIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M12 8.5a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7z" strokeWidth="1.6" />
      <path d="M12 2.5v2.2M12 19.3v2.2M4.2 12H2M22 12h-2.2M5.6 5.6l1.5 1.5M16.9 16.9l1.5 1.5M18.4 5.6l-1.5 1.5M7.1 16.9l-1.5 1.5" strokeWidth="1.6" strokeLinecap="round" />
    </Icon>
  );
}

export type NavIconKey =
  | 'home' | 'profile' | 'goals' | 'scan' | 'plan'
  | 'greenwashing' | 'nutrition' | 'about' | 'settings';

export const NAV_ICONS: Record<NavIconKey, (props: IconProps) => JSX.Element> = {
  home: HomeIcon,
  profile: ProfileIcon,
  goals: GoalsIcon,
  scan: ScanIcon,
  plan: PlanIcon,
  greenwashing: GreenwashingIcon,
  nutrition: NutritionIcon,
  about: AboutIcon,
  settings: SettingsIcon,
};
