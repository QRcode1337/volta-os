import 'server-only';
import { cached } from '../sources/cache';
import { readCodexBar, settlePending } from './codexbar';
import { readOmniRoute } from './omniroute';
import type { CodexBarSection, OmniSection, QuotaPayload } from './types';

export type * from './types';

const TTL_MS = 60_000;

async function build(): Promise<QuotaPayload> {
  // Independent sources: one failing never takes the other down.
  const [codexbar, omniroute] = await Promise.all([
    readCodexBar().catch((err: Error): CodexBarSection => ({ available: false, cli: null, providers: [], note: `CodexBar read failed: ${err.message.slice(0, 160)}` })),
    readOmniRoute().catch((err: Error): OmniSection => ({
      available: false,
      gateway: 'unknown',
      gatewayUrl: '',
      todayFrom: '',
      weekFrom: '',
      providers: [],
      breakers: [],
      cooldowns: [],
      volta: null,
      error: err.message.slice(0, 200),
    })),
  ]);
  return { generatedAt: new Date().toISOString(), cacheTtlSec: TTL_MS / 1000, codexbar, omniroute };
}

/** CodexBar limits + OmniRoute usage/health, cached 60 s (stale-while-revalidate; `refresh` forces a rebuild). */
export async function getQuota(opts: { refresh?: boolean } = {}): Promise<QuotaPayload> {
  const p = await cached('quota:all', TTL_MS, build, { force: opts.refresh, maxStaleMs: 10 * 60_000 });
  // A provider that was still reading when this payload was built may have finished since.
  return { ...p, codexbar: settlePending(p.codexbar) };
}
