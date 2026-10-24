import { localJson } from '@/lib/server/route-helpers';
import { getActivity } from '@/lib/server/ltm';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const GET = localJson((req) => {
  const days = Math.min(Math.max(Number(new URL(req.url).searchParams.get('days')) || 14, 1), 60);
  return getActivity(days);
});
