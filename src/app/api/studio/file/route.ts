// GET /api/studio/file?id=  stream a project output with Range support (video / audio seeking).
// The id comes from the project index; its path must resolve inside a known project folder or the Windsor studio root.
import { HttpError, route, streamFile } from '@/lib/server/route-helpers';
import { resolveOutputFile } from '@/lib/server/studio/index-projects';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Outputs can be overwritten in place, so they revalidate (ETag) instead of caching immutably.
export const GET = route(async ({ req, url }) => {
  const f = await resolveOutputFile(url.searchParams.get('id') ?? '');
  if (f.offline) throw new HttpError(`${f.name} is an iCloud placeholder (not downloaded). Open it in Finder first.`, 409);
  return streamFile(req, f.path, { mime: f.mime, name: f.name });
});
