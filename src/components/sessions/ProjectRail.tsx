'use client';
import { useState } from 'react';
import { Bot, ChevronDown, ChevronRight, FolderGit2, Layers } from 'lucide-react';
import type { ClaudeProject, ClaudeSessionList, SessionIndexProgress } from '@/types/sessions';
import { cn } from '@/lib/cn';
import { formatInt } from '@/lib/format';
import { ago, dayShort, fmtTokens, formatBytes } from './sessions-client';

interface ProjectRailProps {
  data: ClaudeSessionList | null;
  now: number | null;
  selected: string | null;
  onSelect: (projectId: string | null) => void;
  showAutomated: boolean;
}

export function Sparkline({ values, days, className }: { values: number[]; days: string[]; className?: string }) {
  const max = Math.max(1, ...values);
  const w = 3;
  const gap = 1;
  const h = 16;
  return (
    <svg
      width={values.length * (w + gap) - gap}
      height={h}
      viewBox={`0 0 ${values.length * (w + gap) - gap} ${h}`}
      className={cn('shrink-0', className)}
      aria-hidden="true"
    >
      {values.map((v, i) => {
        const bh = v ? Math.max(2, Math.round((v / max) * h)) : 1;
        return (
          <rect
            key={i}
            x={i * (w + gap)}
            y={h - bh}
            width={w}
            height={bh}
            rx={0.5}
            fill={v ? 'var(--accent-orange)' : 'var(--border-highlight)'}
            opacity={v ? 0.35 + 0.65 * (v / max) : 0.6}
          >
            <title>{`${days[i] ? dayShort(days[i]) : ''}: ${v} assistant message${v === 1 ? '' : 's'}`}</title>
          </rect>
        );
      })}
    </svg>
  );
}

function IndexCard({ progress, totals }: { progress: SessionIndexProgress | null; totals: ClaudeSessionList['totals'] | null }) {
  const scanning = progress?.state === 'scanning';
  const pct = progress && progress.bytesTotal ? Math.min(100, Math.round((progress.bytesIndexed / progress.bytesTotal) * 100)) : 0;
  return (
    <div className="hud-card p-3">
      <div className="flex items-center gap-2">
        <span
          className={cn(
            'h-2 w-2 rounded-full',
            progress == null ? 'bg-muted' : progress.state === 'error' ? 'bg-[#EF4444]' : scanning ? 'bg-amber robo-pulse' : 'bg-green',
          )}
        />
        <span className="hud-label">
          {progress == null ? 'Connecting…' : progress.state === 'error' ? 'Index error' : scanning ? 'Indexing transcripts' : 'Index ready'}
        </span>
        <Layers className="ml-auto h-3.5 w-3.5 text-muted" />
      </div>
      <div className="mt-2 font-doto text-[26px] font-bold leading-none text-orange">{totals ? formatInt(totals.sessions) : '—'}</div>
      <div className="mt-1 font-mono text-[10px] uppercase tracking-[0.08em] text-muted">
        sessions · {totals ? formatInt(totals.projects) : '—'} projects · {totals ? formatInt(totals.subagentFiles) : '—'} subagents
      </div>
      {progress && (
        <>
          <div className="mt-2.5 h-1 overflow-hidden rounded-full bg-obsidian">
            <div className={cn('h-full rounded-full', scanning ? 'bg-amber' : 'bg-green/70')} style={{ width: `${scanning ? pct : 100}%` }} />
          </div>
          <div className="mt-1.5 font-mono text-[10px] text-secondary">
            {formatInt(progress.filesIndexed)} / {formatInt(progress.filesTotal)} files · {formatBytes(progress.bytesIndexed)}
            {scanning ? ` of ${formatBytes(progress.bytesTotal)}` : ''}
            {!scanning && progress.lastPassMs != null && <span className="text-muted"> · pass {(progress.lastPassMs / 1000).toFixed(1)}s</span>}
          </div>
          {progress.error && <div className="mt-1 text-[10px] text-[#EF4444]">{progress.error}</div>}
        </>
      )}
      {totals && (
        <div className="mt-1 font-mono text-[10px] text-muted" title="input + output + cache read + cache write, message ids deduplicated">
          {fmtTokens(totals.tokens)} tokens all-time
        </div>
      )}
    </div>
  );
}

function ProjectButton({
  p,
  active,
  now,
  days,
  onClick,
}: {
  p: ClaudeProject;
  active: boolean;
  now: number | null;
  days: string[];
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={`${p.path}${p.pathSource === 'decoded' ? ' (decoded from the directory name)' : ''}`}
      className={cn(
        'group mb-0.5 flex w-full flex-col gap-1 rounded-md border px-2.5 py-2 text-left transition-colors',
        active ? 'border-orange/50 bg-orange/10' : 'border-transparent hover:border-subtle hover:bg-panel-hover',
      )}
    >
      <div className="flex w-full items-center gap-2">
        <span className={cn('min-w-0 flex-1 truncate text-[12.5px] font-medium', active ? 'text-paper' : 'text-secondary group-hover:text-paper')}>
          {p.name}
        </span>
        <span className={cn('rounded-full px-1.5 font-mono text-[10px]', active ? 'bg-orange text-obsidian' : 'bg-panel-elevated text-secondary')}>
          {formatInt(p.sessions)}
        </span>
      </div>
      <div className="flex w-full items-center gap-2">
        <span className="min-w-0 flex-1 truncate font-mono text-[9.5px] text-muted">{p.path === '~' ? 'home directory' : p.path}</span>
        <Sparkline values={p.activity30d} days={days} />
      </div>
      <div className="font-mono text-[9.5px] text-muted">
        {ago(p.lastActive, now)} · {fmtTokens(p.tokens)} tok{p.subagents ? ` · ${p.subagents} subagents` : ''}
      </div>
    </button>
  );
}

export function ProjectRail({ data, now, selected, onSelect, showAutomated }: ProjectRailProps) {
  const [automatedOpen, setAutomatedOpen] = useState(false);
  const projects = data?.projects ?? [];
  const human = projects.filter((p) => !p.automated);
  const automated = projects.filter((p) => p.automated);
  const days = data?.days ?? [];
  const allActivity = days.map((_, i) => human.reduce((n, p) => n + (p.activity30d[i] ?? 0), 0));
  const humanSessions = human.reduce((n, p) => n + p.sessions, 0);

  return (
    <aside className="flex w-[264px] shrink-0 flex-col border-r border-subtle bg-panel/40">
      <div className="border-b border-subtle p-3">
        <IndexCard progress={data?.progress ?? null} totals={data?.totals ?? null} />
      </div>
      <div className="hud-scroll min-h-0 flex-1 overflow-y-auto px-2 py-2">
        <button
          type="button"
          onClick={() => onSelect(null)}
          className={cn(
            'mb-1 flex w-full flex-col gap-1 rounded-md border px-2.5 py-2 text-left transition-colors',
            selected == null ? 'border-orange/50 bg-orange/10' : 'border-transparent hover:border-subtle hover:bg-panel-hover',
          )}
        >
          <div className="flex w-full items-center gap-2">
            <FolderGit2 className="h-3.5 w-3.5 shrink-0 text-orange" />
            <span className="min-w-0 flex-1 truncate text-[12.5px] font-medium text-paper">All projects</span>
            <span className={cn('rounded-full px-1.5 font-mono text-[10px]', selected == null ? 'bg-orange text-obsidian' : 'bg-panel-elevated text-secondary')}>
              {formatInt(humanSessions + (showAutomated ? automated.reduce((n, p) => n + p.sessions, 0) : 0))}
            </span>
          </div>
          {days.length > 0 && (
            <div className="flex w-full items-center gap-2">
              <span className="min-w-0 flex-1 truncate font-mono text-[9.5px] text-muted">
                {formatInt(allActivity.reduce((a, b) => a + b, 0))} msgs
              </span>
              <Sparkline values={allActivity} days={days} />
            </div>
          )}
        </button>

        <div className="hud-label flex items-center px-2 py-1.5 text-[10px] text-muted">
          Projects <span className="ml-auto font-normal normal-case tracking-normal">30-day activity</span>
        </div>
        {data == null && <div className="px-2 py-3 font-mono text-[11px] text-muted">Loading…</div>}
        {human.map((p) => (
          <ProjectButton key={p.id} p={p} active={selected === p.id} now={now} days={days} onClick={() => onSelect(selected === p.id ? null : p.id)} />
        ))}

        {automated.length > 0 && (
          <div className="mt-2 border-t border-subtle pt-2">
            <button
              type="button"
              onClick={() => setAutomatedOpen((v) => !v)}
              className="hud-label flex w-full items-center gap-1.5 px-2 py-1.5 text-[10px] text-muted hover:text-secondary"
              title="Sessions started by tools under ~/.claude* (claude-mem observer, double-shot-latte, plugin runs)"
            >
              {automatedOpen ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
              <Bot className="h-3 w-3" /> Automated
              <span className="ml-auto font-normal">{formatInt(automated.reduce((n, p) => n + p.sessions, 0))}</span>
            </button>
            {(automatedOpen || automated.some((p) => p.id === selected)) &&
              automated.map((p) => (
                <ProjectButton
                  key={p.id}
                  p={p}
                  active={selected === p.id}
                  now={now}
                  days={days}
                  onClick={() => onSelect(selected === p.id ? null : p.id)}
                />
              ))}
          </div>
        )}
      </div>
    </aside>
  );
}
