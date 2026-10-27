// GET /api/editor/nle/peaks?id=<assetId>  → NlePeaks { rate: 50, peaks: 0..1[], duration }  (404 when no audio)
import { studioGet } from '@/lib/server/studio/http';
import { getPeaks } from '@/lib/server/editor/nle/peaks';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const GET = studioGet(async (req) => getPeaks(new URL(req.url).searchParams.get('id') ?? ''));
