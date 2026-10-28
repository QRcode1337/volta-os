import { route } from '@/lib/server/route-helpers';
import { loadConfig, patchConfig } from '@/lib/server/podcast/config';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/** GET /api/podcast/config → the parsed config/podcast.json */
export const GET = route(() => loadConfig());

/** PUT /api/podcast/config  { weights?: {topicId: 0-5}, storyCount?: 6-10 }  (the only fields editable from the app) */
export const PUT = route(
  ({ body }) => patchConfig({ weights: body.weights as Record<string, number> | undefined, storyCount: body.storyCount as number | undefined }),
  { json: true },
);
