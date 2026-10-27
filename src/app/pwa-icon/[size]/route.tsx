import { mascotIcon } from '@/lib/mascot-icon';

// PNG icons referenced by app/manifest.ts: /pwa-icon/192, /pwa-icon/512, /pwa-icon/512-maskable.
const SIZES: Record<string, { px: number; padding: number }> = {
  '192': { px: 192, padding: 0.18 },
  '512': { px: 512, padding: 0.18 },
  '512-maskable': { px: 512, padding: 0.26 },
};

export async function GET(_req: Request, { params }: { params: Promise<{ size: string }> }) {
  const spec = SIZES[(await params).size];
  if (!spec) return new Response('Not found', { status: 404 });
  const res = mascotIcon(spec.px, spec.padding);
  res.headers.set('Cache-Control', 'public, max-age=86400');
  return res;
}
