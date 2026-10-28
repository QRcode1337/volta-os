import type { JevRouteRequest, JevRouteResult } from '@/types/os';
import { HttpError, route } from '@/lib/server/route-helpers';
import { jevCircuit, jevConfigured, readTelemetry } from '@/lib/server/jev';
import { jevTelemetry, routeAndRecord, type JevRouteOutput } from './jev';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const MAX_PROMPT_CHARS = 20_000;

/**
 * GET → real telemetry only (no call recorded).
 * `telemetry` keeps the UI shape; `detail` has measured spend, latency percentiles, cache hits, fallbacks and persistence status.
 */
export const GET = route(() => {
  const { latencyMs: lat, ...rest } = readTelemetry();
  const { samples: _s, ...latencyMs } = lat;
  return { telemetry: jevTelemetry(), detail: { ...rest, latencyMs }, status: { configured: jevConfigured(), circuit: jevCircuit() } };
});

/** POST { prompt, command? } → JevRouteResult. */
export const POST = route(
  async ({ body }) => {
    const { prompt, command } = body as Partial<JevRouteRequest>;
    if (typeof prompt !== 'string') throw new HttpError('`prompt` must be a string', 400);
    if (prompt.length > MAX_PROMPT_CHARS) throw new HttpError(`\`prompt\` exceeds ${MAX_PROMPT_CHARS} characters`, 400);
    if (command !== undefined && (typeof command !== 'string' || !/^\/[a-z0-9][a-z0-9-]{0,47}$/.test(command))) {
      throw new HttpError('`command` must look like "/skill-name"', 400);
    }
    if (!prompt.trim() && !command) throw new HttpError('Provide a non-empty `prompt` or a `command`', 400);

    const result: JevRouteResult & Partial<JevRouteOutput> = await routeAndRecord(prompt.trim() || command!, command);
    return result;
  },
  { json: true, maxBytes: 256 * 1024 },
);
