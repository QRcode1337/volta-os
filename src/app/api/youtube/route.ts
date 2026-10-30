import { route } from '@/lib/server/route-helpers';
import { getYouTubeChannel } from '@/lib/server/youtube';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** The Strangest Times channel stats + recent uploads. `?refresh=1` refetches (at most once a minute). */
export const GET = route(async ({ url }) => ({ channel: await getYouTubeChannel({ force: url.searchParams.get('refresh') === '1' }) }));
