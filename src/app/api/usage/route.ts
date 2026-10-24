import { localJson } from '@/lib/server/route-helpers';
import { getUsageSummary } from '@/lib/server/sources/transcripts';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const GET = localJson(() => getUsageSummary());
