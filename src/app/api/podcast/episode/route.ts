import { HttpError, route } from '@/lib/server/route-helpers';
import { getEpisode, readText } from '@/lib/server/podcast/storage';
import { isDate } from '@/lib/server/podcast/util';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/** GET /api/podcast/episode?date=YYYY-MM-DD → { episode, notes, script } (localhost only) */
export const GET = route(async ({ url }) => {
  const date = url.searchParams.get('date') ?? '';
  if (!isDate(date)) throw new HttpError('`date` must be YYYY-MM-DD.', 400);
  const episode = await getEpisode(date);
  if (!episode) throw new HttpError(`No episode for ${date}.`, 404);
  if (episode.audioUrl) return { episode, notes: episode.description, script: '' };
  const [notes, script] = await Promise.all([readText(episode.notesFile), readText(episode.scriptFile)]);
  return { episode, notes: notes ?? '', script: script ?? '' };
});
