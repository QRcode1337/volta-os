import 'server-only';
import type { YouTubeChannel, YouTubeVideo } from '@/types/youtube';
import { HttpError } from './http-error';
import { redactSecrets } from './redact';
import { breaker, cached } from './sources/cache';

// Channel stats + recent uploads from the YouTube Data API v3 (YOUTUBE_API_KEY + YOUTUBE_CHANNEL_ID in .env.local).
// One refresh = 3 quota units (channels + playlistItems + videos) of the 10,000/day default; cached 15 min
// stale-while-revalidate, and a failing key/quota trips a breaker so the dashboard poll doesn't keep spending calls.

const API = 'https://www.googleapis.com/youtube/v3';
const TTL_MS = 15 * 60_000;
const MIN_FORCE_MS = 60_000;
const TIMEOUT_MS = 8_000;
const RECENT_UPLOADS = 10;
const gate = breaker('youtube', { failures: 2, coolMs: 10 * 60_000 });

export function youtubeConfig(): { key: string; channelId: string } | null {
  const key = process.env.YOUTUBE_API_KEY?.trim();
  const channelId = process.env.YOUTUBE_CHANNEL_ID?.trim();
  return key && channelId ? { key, channelId } : null;
}

const num = (v: unknown): number | null => (v === undefined || v === null || v === '' ? null : Number(v));

type Thumbs = Record<string, { url?: string } | undefined> | undefined;
const thumbOf = (t: Thumbs) => t?.medium?.url ?? t?.high?.url ?? t?.default?.url ?? null;

/** GET one Data API resource; the key travels in a header (never in a URL that could be logged). */
async function api<T>(path: string, params: Record<string, string>, key: string): Promise<T> {
  const res = await fetch(`${API}/${path}?${new URLSearchParams(params)}`, {
    headers: { 'X-goog-api-key': key, Accept: 'application/json' },
    signal: AbortSignal.timeout(TIMEOUT_MS),
    cache: 'no-store',
  });
  const body = (await res.json().catch(() => ({}))) as T & { error?: { message?: string; errors?: { reason?: string }[] } };
  if (!res.ok) {
    const reason = body.error?.errors?.[0]?.reason;
    const msg = redactSecrets(body.error?.message ?? res.statusText).slice(0, 200);
    throw new HttpError(`YouTube API ${res.status}${reason ? ` (${reason})` : ''}: ${msg}`, res.status === 403 || res.status === 401 ? 502 : 503);
  }
  return body;
}

interface ChannelsResp {
  items?: {
    id: string;
    snippet: { title: string; customUrl?: string; thumbnails?: Thumbs };
    statistics: { viewCount?: string; subscriberCount?: string; hiddenSubscriberCount?: boolean; videoCount?: string };
    contentDetails: { relatedPlaylists: { uploads?: string } };
  }[];
}
interface PlaylistResp {
  items?: { contentDetails: { videoId: string } }[];
}
interface VideosResp {
  items?: {
    id: string;
    snippet: { title: string; publishedAt: string; thumbnails?: Thumbs };
    statistics: { viewCount?: string; likeCount?: string; commentCount?: string };
    contentDetails: { duration: string };
  }[];
}

async function load(): Promise<YouTubeChannel> {
  const cfg = youtubeConfig();
  if (!cfg) throw new HttpError('YouTube not configured: add YOUTUBE_API_KEY and YOUTUBE_CHANNEL_ID to .env.local', 503);
  const ch = (await api<ChannelsResp>('channels', { part: 'snippet,statistics,contentDetails', id: cfg.channelId }, cfg.key)).items?.[0];
  if (!ch) throw new HttpError(`YouTube channel ${cfg.channelId} not found`, 404);

  const uploads = ch.contentDetails.relatedPlaylists.uploads;
  let recent: YouTubeVideo[] = [];
  if (uploads) {
    const ids = ((await api<PlaylistResp>('playlistItems', { part: 'contentDetails', playlistId: uploads, maxResults: String(RECENT_UPLOADS) }, cfg.key)).items ?? []).map(
      (i) => i.contentDetails.videoId,
    );
    if (ids.length) {
      const vids = (await api<VideosResp>('videos', { part: 'snippet,statistics,contentDetails', id: ids.join(',') }, cfg.key)).items ?? [];
      recent = vids
        .map((v) => ({
          id: v.id,
          title: v.snippet.title,
          publishedAt: v.snippet.publishedAt,
          views: Number(v.statistics.viewCount ?? 0),
          likes: num(v.statistics.likeCount),
          comments: num(v.statistics.commentCount),
          duration: v.contentDetails.duration,
          thumbnail: thumbOf(v.snippet.thumbnails),
          url: `https://www.youtube.com/watch?v=${v.id}`,
        }))
        .sort((a, b) => Date.parse(b.publishedAt) - Date.parse(a.publishedAt));
    }
  }

  const handle = ch.snippet.customUrl ?? null;
  return {
    id: ch.id,
    title: ch.snippet.title,
    handle,
    url: handle ? `https://www.youtube.com/${handle}` : `https://www.youtube.com/channel/${ch.id}`,
    thumbnail: thumbOf(ch.snippet.thumbnails),
    subscribers: ch.statistics.hiddenSubscriberCount ? null : num(ch.statistics.subscriberCount),
    views: Number(ch.statistics.viewCount ?? 0),
    videoCount: Number(ch.statistics.videoCount ?? 0),
    recent,
    fetchedAt: new Date().toISOString(),
  };
}

/** Cached channel snapshot. Throws HttpError when unconfigured, failing, or while the breaker is open. */
export async function getYouTubeChannel({ force = false } = {}): Promise<YouTubeChannel> {
  return cached(
    'youtube:channel',
    TTL_MS,
    async () => {
      const b = gate.state();
      if (b.open) throw new HttpError(`YouTube paused for ${Math.ceil(b.retryInMs / 60_000)}m after: ${b.reason}`, 503);
      try {
        const value = await load();
        gate.ok();
        return value;
      } catch (err) {
        gate.fail('', (err as Error).message);
        throw err;
      }
    },
    { force, minForceMs: MIN_FORCE_MS, maxStaleMs: 24 * 3_600_000 },
  );
}
