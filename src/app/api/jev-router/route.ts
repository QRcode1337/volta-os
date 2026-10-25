import { NextResponse } from 'next/server';
import type { JevRouteRequest, JevRouteResult } from '@/types/os';
import { rejectNonLocalMutation, rejectNonLocalRead } from '@/lib/server/local-only';
import { jevCircuit, jevConfigured, readTelemetry } from '@/lib/server/jev';
import { jevTelemetry, routeAndRecord, type JevRouteOutput } from './jev';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const MAX_PROMPT_CHARS = 20_000;

function bad(message: string) {
  return NextResponse.json({ error: message }, { status: 400 });
}

/**
 * GET → real telemetry only (no call recorded).
 * `telemetry` keeps the UI shape; `detail` has measured spend, latency percentiles, cache hits, fallbacks and persistence status.
 */
export async function GET(req: Request) {
  const denied = rejectNonLocalRead(req);
  if (denied) return denied;
  const { latencyMs: lat, ...rest } = readTelemetry();
  const { samples: _s, ...latencyMs } = lat;
  return NextResponse.json(
    { telemetry: jevTelemetry(), detail: { ...rest, latencyMs }, status: { configured: jevConfigured(), circuit: jevCircuit() } },
    { headers: { 'Cache-Control': 'no-store' } },
  );
}

/** POST { prompt, command? } → JevRouteResult. */
export async function POST(req: Request) {
  const denied = rejectNonLocalMutation(req);
  if (denied) return denied;
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return bad('Body must be valid JSON: { prompt: string, command?: string }');
  }
  if (!body || typeof body !== 'object') return bad('Body must be an object');
  const { prompt, command } = body as Partial<JevRouteRequest>;

  if (typeof prompt !== 'string') return bad('`prompt` must be a string');
  if (prompt.length > MAX_PROMPT_CHARS) return bad(`\`prompt\` exceeds ${MAX_PROMPT_CHARS} characters`);
  if (command !== undefined && (typeof command !== 'string' || !/^\/[a-z0-9][a-z0-9-]{0,47}$/.test(command))) {
    return bad('`command` must look like "/skill-name"');
  }
  if (!prompt.trim() && !command) return bad('Provide a non-empty `prompt` or a `command`');

  const result: JevRouteResult & Partial<JevRouteOutput> = await routeAndRecord(prompt.trim() || command!, command);
  return NextResponse.json(result);
}
