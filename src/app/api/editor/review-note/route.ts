// POST /api/editor/review-note  { fileKey, pins, status }
// Writes <project>/review-notes/<file>-<date>.md for a file in a project listed in config/studio-projects.json.
// Never overwrites (a clash gets a time suffix). Refuses Generations files and anything outside the project.
import { studioPost } from '@/lib/server/studio/http';
import { requireFileKey, validatePins, validateStatus } from '@/lib/server/editor/feedback';
import { saveReviewNote } from '@/lib/server/editor/review-note';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const POST = studioPost(
  async (body) => saveReviewNote(requireFileKey(body.fileKey), validatePins(body.pins), validateStatus(body.status)),
  { maxBytes: 512 * 1024 },
);
