import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';
import { SearchPalette } from '@/components/search/SearchPalette';
import { MobileTabBar } from '@/components/mobile/MobileTabBar';
import { MobileMenu } from '@/components/mobile/MobileMenu';
import { MASCOT_BG, MASCOT_GRID, MASCOT_ORANGE } from '@/lib/mascot';
import './globals.css';

// 8×8 pixel mascot (same grid as robo-ui/PixelMascotLogo) rendered as an inline SVG favicon.
const MASCOT_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="-1 -1 10 10" shape-rendering="crispEdges"><rect x="-1" y="-1" width="10" height="10" rx="2" fill="${MASCOT_BG}"/>${MASCOT_GRID.flatMap(
  (row, y) =>
    row
      .split('')
      .map((c, x) => (c === '1' ? `<rect x="${x}" y="${y}" width="1" height="1" fill="${MASCOT_ORANGE}"/>` : '')),
).join('')}</svg>`;

const FAVICON = `data:image/svg+xml,${encodeURIComponent(MASCOT_SVG)}`;

export const metadata: Metadata = {
  title: {
    template: '%s · VOLTA OS',
    default: 'VOLTA Agentic OS',
  },
  description:
    'VOLTA Agentic OS — a dark HUD command center for agent skills, routines, the Second Brain, micro-apps and Claude Code usage telemetry.',
  applicationName: 'VOLTA Agentic OS',
  icons: {
    icon: [{ url: FAVICON, type: 'image/svg+xml' }],
    // Explicit `icons` disables Next's file-based apple-icon link, so point at app/apple-icon.tsx here.
    apple: [{ url: '/apple-icon', sizes: '180x180', type: 'image/png' }],
  },
  // Home-screen web app on iPhone: full-screen, status bar drawn over the dark HUD.
  appleWebApp: {
    capable: true,
    title: 'VOLTA',
    statusBarStyle: 'black-translucent',
  },
  formatDetection: { telephone: false },
};

export const viewport: Viewport = {
  themeColor: '#0A0A0A',
  colorScheme: 'dark',
  width: 'device-width',
  initialScale: 1,
  // Lets content reach under the notch/home bar; mobile chrome pads itself with env(safe-area-inset-*).
  viewportFit: 'cover',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    // Browser extensions inject attributes on <html> (e.g. __gcrremoteframetoken) before hydration.
    <html lang="en" suppressHydrationWarning>
      <body className="bg-obsidian text-paper antialiased">
        {children}
        {/* Global ⌘K / Ctrl+K search palette (client component; renders nothing until opened). */}
        <SearchPalette />
        {/* Phone-only (< md) navigation; renders nothing on iPad/desktop. */}
        <MobileTabBar />
        <MobileMenu />
      </body>
    </html>
  );
}
