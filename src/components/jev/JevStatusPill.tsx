'use client';

import { Sparkles } from 'lucide-react';
import { useSharedJson } from '@/components/dashboard/widgets/shared-json';
import { formatInt, formatUsd } from '@/lib/format';
import { cn } from '@/lib/cn';

/** GET /api/jev-router: real telemetry only, never a paid call. */
const JEV_URL = '/api/jev-router';
const POLL_MS = 60_000;

interface JevStatusPayload {
  telemetry: { calls: number; haikuPct: number; sonnetPct: number; opusPct: number };
  detail: {
    since: string;
    requests: number;
    cacheHits: number;
    errors: number;
    fallbacks: number;
    totalUsd: number;
    byOp: Record<string, number>;
    latencyMs: { p50: number; p95: number };
    lastError: { at: string; code: string; message: string } | null;
    persisted: boolean;
    persistError: string | null;
  };
  status: { configured: boolean; circuit: { open: boolean; retryInMs: number } };
}

const isPayload = (v: unknown): v is JevStatusPayload => {
  const p = v as JevStatusPayload | null;
  return !!p && typeof p.telemetry?.calls === 'number' && typeof p.detail?.requests === 'number' && typeof p.status?.configured === 'boolean';
};

/**
 * "JEV ACTIVE · N routes · $X" (HANDOFF_SPEC §9 Jev Router Status Pill). Routes = skill tier decisions; calls = every
 * JEV request (skill routing, feeds triage, podcast and research ranking); spend is measured, not estimated.
 */
export function JevStatusPill({ className }: { className?: string }) {
  const q = useSharedJson<unknown>(JEV_URL, POLL_MS);
  const p = isPayload(q.data) ? q.data : null;

  if (!p) {
    return (
      <span className={cn('rounded-full border border-subtle px-1.5 py-px font-mono text-[9px] uppercase tracking-[0.08em] text-muted', className)} title={q.error ? `JEV status: ${q.error.message}` : undefined}>
        JEV {q.error ? 'unknown' : '…'}
      </span>
    );
  }

  const { telemetry: t, detail: d, status: s } = p;
  const state = !s.configured ? 'off' : s.circuit.open ? 'paused' : 'active';
  const ops = Object.entries(d.byOp)
    .filter(([, n]) => n > 0)
    .map(([op, n]) => `${op} ${formatInt(n)}`)
    .join(' · ');
  const title = [
    state === 'off'
      ? 'TYPESAFE_JEV_API_KEY is not set: skills route with the keyword fallback, feeds and podcast skip JEV.'
      : state === 'paused'
        ? `JEV circuit open after failures; retrying in ${Math.ceil(s.circuit.retryInMs / 1000)} s. Skills use the keyword fallback meanwhile.`
        : 'JEV (TypeSafe System One) is routing skills and triaging/ranking feeds, podcast and research.',
    `Since ${d.since.slice(0, 10)}: ${formatInt(t.calls)} skill routes (Haiku ${t.haikuPct}% · Sonnet ${t.sonnetPct}% · Opus ${t.opusPct}%), ${formatInt(d.fallbacks)} heuristic fallbacks.`,
    `${formatInt(d.requests)} JEV calls${ops ? ` (${ops})` : ''}, ${formatInt(d.cacheHits)} cache hits, ${formatInt(d.errors)} errors · p50 ${d.latencyMs.p50} ms · p95 ${d.latencyMs.p95} ms.`,
    `Measured spend ${formatUsd(d.totalUsd)} ($${d.totalUsd.toFixed(5)}).`,
    d.lastError ? `Last error ${d.lastError.at.slice(0, 16).replace('T', ' ')}: ${d.lastError.code}` : '',
    d.persisted ? '' : `Telemetry not saved to disk${d.persistError ? `: ${d.persistError}` : ''}.`,
  ]
    .filter(Boolean)
    .join('\n');

  return (
    <span
      className={cn(
        'inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded-full border px-1.5 py-px font-mono text-[9px] uppercase tracking-[0.08em]',
        state === 'active' ? 'border-purple/40 text-purple' : state === 'paused' ? 'border-amber/40 text-amber' : 'border-subtle text-muted',
        className,
      )}
      title={title}
    >
      <Sparkles className="h-2.5 w-2.5 shrink-0" aria-hidden />
      <span>JEV {state}</span>
      {state !== 'off' && (
        <span className="hidden normal-case tracking-normal opacity-80 lg:inline">
          · {formatInt(t.calls)} routes · {formatInt(d.requests)} calls · {formatUsd(d.totalUsd)}
        </span>
      )}
    </span>
  );
}
