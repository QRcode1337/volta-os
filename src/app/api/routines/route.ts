import { route } from '@/lib/server/route-helpers';
import { getRoutines, routinesWarnings } from '@/lib/server/sources/routines';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// `warnings` says when a source failed, so pages never mistake a partial list for the whole one.
export const GET = route(async () => {
  const routines = await getRoutines();
  return { routines, warnings: routinesWarnings() };
});
