import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Nutritionell',
  description: 'AI-powered grocery shelf analysis',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        {/* Loaded as a plain stylesheet (not next/font/google) so the literal
            family names in the theme tokens --f-display/--f-body resolve. */}
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Fredoka:wght@500;600;700&display=swap&family=Karla:wght@400;500;600;700&display=swap&family=Space+Grotesk:wght@500;600;700&display=swap&family=Work+Sans:wght@400;500;600;700;800&display=swap"
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
