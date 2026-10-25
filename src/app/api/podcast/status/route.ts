import { localJson } from '@/lib/server/route-helpers';
import { loadConfig, feedToken, geminiKey } from '@/lib/server/podcast/config';
import { claudeBin } from '@/lib/server/podcast/llm';
import { currentJob } from '@/lib/server/podcast/pipeline';
import { checkStorage, getEpisode } from '@/lib/server/podcast/storage';
import { estimate, ffmpegAvailable } from '@/lib/server/podcast/tts';
import { localDate } from '@/lib/server/podcast/util';
import { notionConfigured } from '@/lib/server/notion/client';
import { jevConfigured } from '@/lib/server/jev';
import type { PodcastStatus } from '@/lib/server/podcast/types';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/** GET /api/podcast/status  (localhost only) */
export const GET = localJson(async (): Promise<PodcastStatus> => {
  const config = loadConfig();
  const today = localDate();
  const [storage, ffmpeg, ep] = await Promise.all([checkStorage(), ffmpegAvailable(), getEpisode(today).catch(() => null)]);
  return {
    storage: storage.ok ? { ok: true, root: storage.root, freeBytes: storage.freeBytes } : { ok: false, root: storage.root, reason: storage.reason },
    keys: { gemini: !!geminiKey(), feedToken: feedToken().length >= 32, notion: notionConfigured(), jev: jevConfigured() },
    ffmpeg,
    claudeBin: claudeBin() ? 'found' : null,
    config,
    estimate: estimate(config, today),
    job: currentJob(),
    today,
    hasToday: !!ep,
    publicBaseUrl: config.publicBaseUrl,
  };
});
