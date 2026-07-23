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
  const appearanceBootstrap = `(function(){try{var key='nutritionell_appearance_palette_v1';var saved=localStorage.getItem(key)||'Default Dark';var palettes={'Default Dark':{'--bg':'#09090f','--card':'#111118','--surface':'#16161f','--border':'#1f1f2e','--text':'#f1f0ff','--sub':'#9896b0','--accent':'#7c6aff','--accent-glow':'rgba(124,106,255,0.15)','--green':'#22d3a5','--red':'#ff5c7a','--yellow':'#f59e0b'},'Light Mode':{'--bg':'#e8f6f4','--card':'#ffffff','--surface':'#f1faf8','--border':'#cfe8e2','--text':'#17356f','--sub':'#516585','--accent':'#20d6a4','--accent-glow':'rgba(32,214,164,0.2)','--green':'#1ebc90','--red':'#d94f5c','--yellow':'#efbf4c'},'Light Mode Classic':{'--bg':'#f5f5f7','--card':'#ffffff','--surface':'#eeeef2','--border':'#d4d4d8','--text':'#18181b','--sub':'#71717a','--accent':'#6d28d9','--accent-glow':'rgba(109,40,217,0.1)','--green':'#16a34a','--red':'#dc2626','--yellow':'#ca8a04'},'High Contrast':{'--bg':'#000000','--card':'#0a0a0a','--surface':'#141414','--border':'#333333','--text':'#ffffff','--sub':'#b0b0b0','--accent':'#a78bfa','--accent-glow':'rgba(167,139,250,0.2)','--green':'#4ade80','--red':'#f87171','--yellow':'#fbbf24'},'Ocean':{'--bg':'#0b1426','--card':'#0f1d35','--surface':'#132744','--border':'#1e3a5f','--text':'#e0f2fe','--sub':'#7dd3fc','--accent':'#38bdf8','--accent-glow':'rgba(56,189,248,0.15)','--green':'#2dd4bf','--red':'#fb7185','--yellow':'#fbbf24'},'Warm Earth':{'--bg':'#1a1210','--card':'#231a16','--surface':'#2d211c','--border':'#3d2e26','--text':'#fdf2e9','--sub':'#c4a882','--accent':'#e07c3e','--accent-glow':'rgba(224,124,62,0.15)','--green':'#65a30d','--red':'#ef4444','--yellow':'#eab308'},'Cyberpunk':{'--bg':'#0a0014','--card':'#12001f','--surface':'#1a0030','--border':'#2d0052','--text':'#f0e6ff','--sub':'#c084fc','--accent':'#e879f9','--accent-glow':'rgba(232,121,249,0.2)','--green':'#00ff88','--red':'#ff2d55','--yellow':'#ffea00'}};var p=palettes[saved]||palettes['Default Dark'];var root=document.documentElement;Object.keys(p).forEach(function(k){root.style.setProperty(k,p[k]);});root.dataset.appearance=saved;}catch(e){}})();`;

  return (
    <html lang="en">
      <head>
        <script dangerouslySetInnerHTML={{ __html: appearanceBootstrap }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
