import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';
import { SearchPalette } from '@/components/search/SearchPalette';
import './globals.css';

// 8×8 pixel mascot (same grid as robo-ui/PixelMascotLogo) rendered as an inline SVG favicon.
const MASCOT_GRID = ['00011000', '00111100', '11111111', '10100101', '11111111', '11000011', '01111110', '01011010'];

const MASCOT_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="-1 -1 10 10" shape-rendering="crispEdges"><rect x="-1" y="-1" width="10" height="10" rx="2" fill="#0A0A0A"/>${MASCOT_GRID.flatMap(
  (row, y) =>
    row
      .split('')
      .map((c, x) => (c === '1' ? `<rect x="${x}" y="${y}" width="1" height="1" fill="#FF5500"/>` : '')),
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
  },
};

export const viewport: Viewport = {
  themeColor: '#0A0A0A',
  colorScheme: 'dark',
  width: 'device-width',
  initialScale: 1,
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body className="bg-obsidian text-paper antialiased">
        {children}
        {/* Global ⌘K / Ctrl+K search palette (client component; renders nothing until opened). */}
        <SearchPalette />
      </body>
    </html>
  );
}
