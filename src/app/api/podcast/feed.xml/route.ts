import { NextResponse } from 'next/server';
import { authorizeFeedRequest, PRIVATE_HEADERS } from '@/lib/server/podcast/auth';
import { feedToken, loadConfig } from '@/lib/server/podcast/config';
import { buildFeedXml } from '@/lib/server/podcast/feed';
import { listEpisodes } from '@/lib/server/podcast/storage';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/**
 * GET /api/podcast/feed.xml?token=…  private podcast RSS. Reachable through the Tailscale serve URL by any client that
 * knows the token (Apple Podcasts does not send Tailscale-User-Login). Enclosures point at /api/podcast/file.
 */
export async function GET(req: Request) {
  const denied = authorizeFeedRequest(req);
  if (denied) return denied;
  const cfg = loadConfig();
  if (cfg.externalFeed) return NextResponse.redirect(cfg.externalFeed.url, 302);
  const token = feedToken();
  if (token.length < 32) return new Response('PODCAST_FEED_TOKEN is not configured', { status: 503 });
  const episodes = await listEpisodes().catch(() => []);
  return new Response(buildFeedXml(cfg, episodes, cfg.publicBaseUrl, token), {
    headers: { 'Content-Type': 'application/rss+xml; charset=utf-8', 'Cache-Control': 'private, max-age=60', ...PRIVATE_HEADERS },
  });
}
