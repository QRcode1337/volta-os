// GET /api/launchpad            -> every section (services, netlify, repos, notion), each {ok,data}|{ok:false,error}
// GET /api/launchpad?section=X  -> one section (the page loads them in parallel so slow ones don't block fast ones)
// ?refresh=1 bypasses the caches (repo re-scans are rate-limited to once a minute).
// Never contains the Netlify token, remote credentials or other secrets (see src/lib/server/launchpad/*).
import { HttpError, route } from '@/lib/server/route-helpers';
import { SECTION_NAMES, loadAll, loadSection } from '@/lib/server/launchpad';
import type { LaunchpadSectionName } from '@/lib/server/launchpad/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const GET = route(({ url }) => {
  const force = url.searchParams.get('refresh') === '1';
  const name = url.searchParams.get('section');
  if (!name) return loadAll(force);
  if (!(SECTION_NAMES as readonly string[]).includes(name)) throw new HttpError(`Unknown section "${name}".`, 400);
  return loadSection(name as LaunchpadSectionName, force);
});
