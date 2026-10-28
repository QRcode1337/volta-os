import { route } from '@/lib/server/route-helpers';
import { getUsageSummary } from '@/lib/server/sources/transcripts';
import type { UsageSummary } from '@/types/sources';
import { jevTelemetry } from '../jev-router/jev';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface CacheStatus {
  /** Plan limits are not exposed locally → always null (unknowable), never invented. */
  weeklyPctLeft: null;
  fiveHourPctLeft: null;
  /** Prompt-cache state derived from the newest Claude Code transcript message (same as /api/usage). */
  cache: UsageSummary['cache'];
  lastMessageAt: string | null;
  /** In-memory Jev classifier telemetry: a simulated router whose counters start from a seeded baseline. */
  jev: { simulated: true; routes: number; totalUsd: number; haikuPct: number };
}

/** GET /api/cache-status → CacheStatus (no client reads this today; /api/usage is the real-data source). */
export const GET = route(async (): Promise<CacheStatus> => {
  const usage = await getUsageSummary();
  const t = jevTelemetry();
  return {
    weeklyPctLeft: null,
    fiveHourPctLeft: null,
    cache: usage.cache,
    lastMessageAt: usage.lastMessageAt,
    jev: { simulated: true, routes: t.calls, totalUsd: Math.round(t.totalUsd * 100) / 100, haikuPct: t.haikuPct },
  };
});
