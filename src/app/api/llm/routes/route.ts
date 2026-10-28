import { route } from '@/lib/server/route-helpers';
import { loadRoutes, chainFor, recentUsage } from '@/lib/server/llm';
import type { UsageEntry } from '@/lib/server/llm/usage-log';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function summarise(entries: UsageEntry[]) {
  const by: Record<string, { calls: number; ok: number; tokensIn: number; tokensOut: number; avgMs: number; lastTarget: string | null; lastModel: string | null; lastAt: string }> = {};
  for (const e of entries) {
    if (e.skipped) continue;
    const s = (by[e.task] ??= { calls: 0, ok: 0, tokensIn: 0, tokensOut: 0, avgMs: 0, lastTarget: null, lastModel: null, lastAt: e.ts });
    s.calls++;
    if (e.ok) {
      s.ok++;
      s.lastTarget = e.target;
      s.lastModel = e.model ?? null;
    }
    s.tokensIn += e.tokensIn ?? 0;
    s.tokensOut += e.tokensOut ?? 0;
    s.avgMs += e.ms;
    s.lastAt = e.ts;
  }
  for (const s of Object.values(by)) s.avgMs = s.calls ? Math.round(s.avgMs / s.calls) : 0;
  return by;
}

/** GET /api/llm/routes: the task -> combo table (no secrets), whether a gateway key is set, and recent per-task usage. */
export const GET = route(async () => {
  const cfg = loadRoutes();
  const usage = recentUsage(200);
  return {
    tasks: Object.fromEntries(Object.entries(cfg.tasks).map(([k, t]) => [k, { ...t, chain: chainFor(t) }])),
    gateway: { baseUrl: process.env[cfg.gateway.baseUrlEnv]?.trim() || cfg.gateway.baseUrl, keyConfigured: Boolean(process.env[cfg.gateway.keyEnv]?.trim()) },
    local: { baseUrl: cfg.local.baseUrl, model: cfg.local.model },
    verified: cfg.verified,
    configErrors: cfg.errors,
    usage: { path: usage.path, persisted: usage.persisted, lastError: usage.lastError, byTask: summarise(usage.entries), recent: usage.entries.slice(-20).reverse() },
  };
});
