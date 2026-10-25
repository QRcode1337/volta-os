// GET  /api/editor/feedback?fileKey=<id>   saved pins for one file
// POST /api/editor/feedback                { fileKey, pins, status } -> /Volumes/Windsor/VOLTA/editor/feedback/<fileKey>.json
// Localhost-only, same-origin, application/json only (studioGet / studioPost). fileKey must match a known file.
import { studioGet, studioPost } from '@/lib/server/studio/http';
import { describeEditorMedia } from '@/lib/server/editor/media';
import { readFeedback, requireFileKey, validatePins, validateStatus, writeFeedback } from '@/lib/server/editor/feedback';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const GET = studioGet(async (req) => readFeedback(requireFileKey(new URL(req.url).searchParams.get('fileKey'))));

export const POST = studioPost(
  async (body) => {
    const fileKey = requireFileKey(body.fileKey);
    const pins = validatePins(body.pins);
    const status = validateStatus(body.status);
    const item = await describeEditorMedia(fileKey); // resolves through the Studio / Generations registries: unknown ids are refused
    const doc = await writeFeedback(item, pins, status);
    return { ok: true, savedAt: doc.savedAt, pinCount: doc.pins.length };
  },
  { maxBytes: 512 * 1024 },
);
