import type { MetadataRoute } from 'next';

// Web app manifest: lets "Add to Home Screen" (iPhone via the Tailscale URL) open VOLTA OS full-screen.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'VOLTA Agentic OS',
    short_name: 'VOLTA',
    description: 'Dark HUD command center for memory, agents, routines and the Second Brain.',
    start_url: '/',
    scope: '/',
    display: 'standalone',
    orientation: 'portrait',
    background_color: '#0A0A0A',
    theme_color: '#0A0A0A',
    icons: [
      { src: '/pwa-icon/192', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/pwa-icon/512', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/pwa-icon/512-maskable', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  };
}
