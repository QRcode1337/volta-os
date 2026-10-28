import { route } from '@/lib/server/route-helpers';
import { feedToken, loadConfig } from '@/lib/server/podcast/config';
import { feedUrl } from '@/lib/server/podcast/feed';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/** GET /api/podcast/subscribe → the full private feed URL incl. token (localhost only; used by the Copy button) */
export const GET = route(async () => {
  const ext = loadConfig().externalFeed?.url;
  if (ext) return { configured: true, url: ext };
  const token = feedToken();
  if (token.length < 32) return { configured: false, url: null };
  return { configured: true, url: feedUrl(loadConfig().publicBaseUrl, token) };
});
