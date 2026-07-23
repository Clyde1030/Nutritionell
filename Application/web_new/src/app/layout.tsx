import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Nutritionell',
  description: 'AI-powered grocery shelf analysis',
  icons: {
    icon: [{ url: '/icon.png', type: 'image/png' }],
    shortcut: '/icon.png',
    apple: '/apple-icon.png',
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
