import { route } from '@/lib/server/route-helpers';
import { getUsageSummary } from '@/lib/server/sources/transcripts';
import type { UsageSummary } from '@/types/sources';
import { jevCircuit, jevConfigured, jevTelemetry, readTelemetry } from '@/lib/server/jev';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface CacheStatus {
  /** Plan limits are not exposed locally → always null (unknowable), never invented. */
  weeklyPctLeft: null;
  fiveHourPctLeft: null;
  /** Prompt-cache state derived from the newest Claude Code transcript message (same as /api/usage). */
  cache: UsageSummary['cache'];
  lastMessageAt: string | null;
  /**
   * Real JEV counters (src/lib/server/jev/telemetry.ts, persisted on Windsor). `routes` = skill tier decisions,
   * `requests` = all paid JEV calls (route + feeds triage + podcast/research rank), `totalUsd` = measured spend.
   */
  jev: { simulated: false; configured: boolean; circuitOpen: boolean; routes: number; requests: number; totalUsd: number; haikuPct: number; since: string };
}

/** GET /api/cache-status → CacheStatus (no client reads this today; /api/usage is the real-data source). */
export const GET = route(async (): Promise<CacheStatus> => {
  const usage = await getUsageSummary();
  const t = jevTelemetry();
  const d = readTelemetry();
  return {
    weeklyPctLeft: null,
    fiveHourPctLeft: null,
    cache: usage.cache,
    lastMessageAt: usage.lastMessageAt,
    jev: {
      simulated: false,
      configured: jevConfigured(),
      circuitOpen: jevCircuit().open,
      routes: t.calls,
      requests: d.requests,
      totalUsd: Math.round(d.totalUsd * 1e6) / 1e6, // JEV spend is fractions of a cent: 2 dp would read $0.00
      haikuPct: t.haikuPct,
      since: d.since,
    },
  };
});
