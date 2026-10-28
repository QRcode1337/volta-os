// GET /api/editor/nle/peaks?id=<assetId>  → NlePeaks { rate: 50, peaks: 0..1[], duration }  (404 when no audio)
import { route } from '@/lib/server/route-helpers';
import { getPeaks } from '@/lib/server/editor/nle/peaks';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const GET = route(async ({ url }) => getPeaks(url.searchParams.get('id') ?? ''));
