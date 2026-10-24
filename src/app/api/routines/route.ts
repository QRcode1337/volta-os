import { localJson } from '@/lib/server/route-helpers';
import { getRoutines } from '@/lib/server/sources/routines';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const GET = localJson(async () => ({ routines: await getRoutines() }));
