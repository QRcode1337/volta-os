// GET  /api/editor/feedback?fileKey=<id>   saved pins for one file
// POST /api/editor/feedback                { fileKey, pins, status, episode? } -> /Volumes/Windsor/VOLTA/editor/feedback/<fileKey>.json
// Localhost-only, same-origin, application/json only (route guards). fileKey must match a known file.
import { route } from '@/lib/server/route-helpers';
import { describeEditorMedia } from '@/lib/server/editor/media';
import { resolveEpisode } from '@/lib/server/editor/episode';
import { readFeedback, requireFileKey, validateEpisodeTag, validatePins, validateStatus, writeFeedback } from '@/lib/server/editor/feedback';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const GET = route(async ({ url }) => readFeedback(requireFileKey(url.searchParams.get('fileKey'))));

export const POST = route(
  async ({ body }) => {
    const fileKey = requireFileKey(body.fileKey);
    const pins = validatePins(body.pins);
    const status = validateStatus(body.status);
    const tag = validateEpisodeTag(body.episode); // undefined = keep what is stored, null = untag
    const item = await describeEditorMedia(fileKey); // resolves through the Studio / Generations registries: unknown ids are refused
    const stored = (await readFeedback(fileKey)).doc?.episode ?? null;
    const episode = tag === undefined ? stored : tag === null ? null : await resolveEpisode(tag, stored);
    const doc = await writeFeedback(item, pins, status, episode);
    return { ok: true, savedAt: doc.savedAt, pinCount: doc.pins.length, episode: doc.episode ?? null };
  },
  { json: true, maxBytes: 512 * 1024 },
);
