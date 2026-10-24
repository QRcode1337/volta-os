'use client';

import { useState, type ReactNode } from 'react';
import { ArrowDown, ArrowUp, Copy, LoaderCircle, Play, TriangleAlert, Zap } from 'lucide-react';
import { ModelEffortBadge } from '@/components/robo-ui';
import { formatInt, formatTokens, formatUsd } from '@/lib/format';
import type { ModelTier, SkillRunRequest, SkillRunResult } from '@/types/os';
import { cn } from '@/lib/cn';
import { HudModal } from './Overlay';
import { MiniMarkdown } from './MiniMarkdown';

export interface SkillReport {
  request: SkillRunRequest;
  result?: SkillRunResult;
  error?: string;
  clientMs: number;
}

const TIER_RANK: Record<ModelTier, number> = { HAIKU: 0, SONNET: 1, OPUS: 2, FABLE: 3 };

interface ExecutionReportModalProps {
  report: SkillReport | null;
  rerunning: boolean;
  onRerun: () => void;
  onClose: () => void;
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${Math.round(ms)}ms`;
  return `${(ms / 1000).toFixed(ms < 10_000 ? 2 : 1)}s`;
}

export function ExecutionReportModal({ report, rerunning, onRerun, onClose }: ExecutionReportModalProps) {
  const [copied, setCopied] = useState(false);
  const r = report?.result;
  const req = report?.request;
  const errorMsg = report?.error ?? (r && !r.ok ? r.error ?? 'Skill reported a failure.' : r?.error);

  const copy = async () => {
    if (!r?.markdown) return;
    try {
      await navigator.clipboard.writeText(r.markdown);
      setCopied(true);
      setTimeout(() => setCopied(false), 1400);
    } catch {
      /* clipboard unavailable — ignore, button just won't confirm */
    }
  };

  const routeDelta = r ? TIER_RANK[r.routedModel] - TIER_RANK[r.requestedModel] : 0;
  // Token/cost figures are estimates even in live mode (the CLI output isn't metered), and invented in simulated mode.
  const simulated = r?.mode !== 'live';
  const figTag = simulated ? ' · SIM' : ' · EST';
  const command = r?.command ?? req?.command ?? '';
  // Mirrors runClaude() in /api/skills/run: the CLI has no FABLE alias, so FABLE runs as opus.
  const cliTier = r?.routedModel ?? req?.model ?? 'HAIKU';
  const cliModel = (cliTier === 'FABLE' ? 'OPUS' : cliTier).toLowerCase();

  return (
    <HudModal
      open={!!report}
      onClose={onClose}
      icon={<Zap size={14} strokeWidth={2.2} />}
      title={
        <>
          EXECUTION REPORT <span className="text-muted">·</span> <span className="text-orange">{command}</span>
        </>
      }
      headerExtra={
        r ? (
          <span
            className={cn(
              'ml-1 inline-flex h-5 items-center gap-1 rounded-full border px-2 font-mono text-[9px] font-semibold tracking-[0.08em]',
              r.mode === 'live' ? 'border-green/40 bg-green/10 text-green' : 'border-amber/40 bg-amber/10 text-amber',
            )}
          >
            <span className={cn('h-1.5 w-1.5 rounded-full', r.mode === 'live' ? 'bg-green robo-pulse' : 'bg-amber')} />
            {r.mode === 'live' ? 'LIVE' : 'SIMULATED'}
          </span>
        ) : null
      }
      footer={
        <>
          <button
            type="button"
            onClick={copy}
            disabled={!r?.markdown}
            className="inline-flex h-7 items-center gap-1.5 rounded-full border border-subtle bg-panel-elevated px-3 font-mono text-[10px] font-semibold uppercase tracking-[0.08em] text-secondary transition-colors hover:border-highlight hover:text-paper disabled:opacity-40"
          >
            <Copy size={11} />
            {copied ? 'COPIED' : 'COPY MD'}
          </button>
          <span className="ml-auto font-mono text-[9.5px] text-muted">
            {report ? `round-trip ${formatDuration(report.clientMs)}` : ''}
          </span>
          <button
            type="button"
            onClick={onRerun}
            disabled={rerunning}
            className="inline-flex h-7 items-center gap-1.5 rounded-full border border-orange bg-orange px-3 font-mono text-[10px] font-semibold uppercase tracking-[0.08em] text-obsidian transition-[filter] hover:brightness-110 disabled:opacity-60"
          >
            {rerunning ? <LoaderCircle size={11} className="robo-spin" /> : <Play size={10} fill="currentColor" strokeWidth={0} />}
            {rerunning ? 'RUNNING' : 'RUN AGAIN'}
          </button>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-7 items-center rounded-full border border-subtle bg-panel-elevated px-3 font-mono text-[10px] font-semibold uppercase tracking-[0.08em] text-secondary transition-colors hover:border-highlight hover:text-paper"
          >
            CLOSE
          </button>
        </>
      }
    >
      <div className={cn('flex flex-col gap-3 p-4 transition-opacity', rerunning && 'opacity-50')}>
        {/* Command line */}
        <div className="rounded-lg border border-subtle bg-obsidian px-3 py-2">
          <div
            className="hud-label mb-1 text-[9px] text-muted"
            title="Illustrative: live mode sends a longer dry-run prompt that wraps this command (see /api/skills/run buildLivePrompt), and effort is not passed to the CLI."
          >
            ≈ EQUIVALENT CLI
          </div>
          <div className="selectable truncate font-mono text-[11.5px] text-paper">
            <span className="text-orange">$</span> claude -p <span className="text-amber">&quot;{command}{req?.customPrompt ? ` ${req.customPrompt}` : ''}&quot;</span>{' '}
            --model {cliModel}
          </div>
          {r && (
            <div className="mt-1 font-mono text-[9.5px] text-muted">
              {r.mode === 'live'
                ? `Executed by the local Claude Code CLI (--model ${cliModel}) with a dry-run prompt wrapping ${command}.`
                : 'Simulated run — set RUBRIC_CLAUDE_LIVE=1 to execute with the local claude CLI.'}
            </div>
          )}
        </div>

        {errorMsg && (
          <div className="flex gap-2.5 rounded-lg border border-[#EF4444]/40 bg-[#EF4444]/10 px-3 py-2.5">
            <TriangleAlert size={15} className="mt-0.5 shrink-0 text-[#EF4444]" />
            <div className="min-w-0">
              <div className="font-mono text-[10px] font-semibold uppercase tracking-[0.08em] text-[#EF4444]">
                {r ? 'Skill error' : 'Run failed'}
              </div>
              <div className="selectable mt-0.5 break-words text-[12px] leading-snug text-paper/90">{errorMsg}</div>
              {!r && (
                <div className="mt-1 font-mono text-[9.5px] text-muted">POST /api/skills/run did not return a valid SkillRunResult.</div>
              )}
            </div>
          </div>
        )}

        {r && (
          <>
            {/* Stats */}
            <div className="grid grid-cols-3 gap-px overflow-hidden rounded-lg border border-subtle bg-subtle">
              <Stat label="REQUESTED">
                <ModelEffortBadge model={r.requestedModel} />
              </Stat>
              <Stat label="JEV ROUTED">
                <span className="flex items-center gap-1.5">
                  <ModelEffortBadge model={r.routedModel} />
                  {routeDelta !== 0 && (
                    <span className={cn('flex items-center font-mono text-[9px]', routeDelta < 0 ? 'text-green' : 'text-amber')}>
                      {routeDelta < 0 ? <ArrowDown size={10} /> : <ArrowUp size={10} />}
                      {routeDelta < 0 ? 'SAVED' : 'UP'}
                    </span>
                  )}
                </span>
              </Stat>
              <Stat label="EFFORT">
                <span className="font-mono text-[13px] font-semibold text-paper">{r.effort}</span>
              </Stat>
              <Stat label={`TOKENS IN / OUT${figTag}`}>
                <span
                  className={cn('font-mono text-[13px] font-semibold tabular-nums', simulated ? 'text-secondary' : 'text-paper')}
                  title={`${formatInt(r.tokensIn)} in · ${formatInt(r.tokensOut)} out — ${simulated ? 'simulated, not a real run' : 'estimated from prompt/output length'}`}
                >
                  {formatTokens(r.tokensIn)} <span className="text-muted">/</span> {formatTokens(r.tokensOut)}
                </span>
              </Stat>
              <Stat label={`COST${figTag}`}>
                <span
                  className={cn('font-doto text-[17px] font-bold leading-none', simulated ? 'text-secondary' : 'text-orange')}
                  title={simulated ? 'Simulated figure — nothing was billed' : 'Estimated from tier rates — not a metered bill'}
                >
                  {formatUsd(r.costUsd)}
                </span>
              </Stat>
              <Stat label={simulated ? 'DURATION · SIM' : 'DURATION'}>
                <span className="font-mono text-[13px] font-semibold tabular-nums text-paper">{formatDuration(r.durationMs)}</span>
              </Stat>
            </div>

            {/* Report body */}
            <div className="rounded-lg border border-subtle bg-panel-elevated/50 px-4 pb-4 pt-2">
              {r.markdown.trim() ? (
                <MiniMarkdown source={r.markdown} />
              ) : (
                <p className="mt-2 text-[12px] text-muted">No report body returned.</p>
              )}
            </div>
          </>
        )}
      </div>
    </HudModal>
  );
}

function Stat({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex min-h-[54px] flex-col justify-between gap-1.5 bg-panel px-3 py-2">
      <span className="font-mono text-[9px] font-semibold uppercase tracking-[0.1em] text-muted">{label}</span>
      <div className="flex items-center">{children}</div>
    </div>
  );
}
