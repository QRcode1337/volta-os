'use client';
import { useEffect, useRef, type ReactNode } from 'react';
import { Bot, GitBranch, Sparkles, Users } from 'lucide-react';
import type { ClaudeSessionSummary } from '@/types/sessions';
import { cn } from '@/lib/cn';
import { formatInt } from '@/lib/format';
import { ago, fmtTokens, formatDuration, modelColor, shortModel, shortTool, toolColor, whenLabel } from './sessions-client';

interface SessionListProps {
  items: ClaudeSessionSummary[];
  selectedId: string | null;
  now: number | null;
  showProject: boolean;
  onSelect: (id: string) => void;
  hasMore: boolean;
  onMore: () => void;
  loadingMore: boolean;
}

function Chip({ color, children, title }: { color?: string; children: ReactNode; title?: string }) {
  return (
    <span
      title={title}
      className="inline-flex max-w-[180px] items-center gap-1 truncate rounded-full border border-subtle bg-panel-elevated px-1.5 py-px font-mono text-[9.5px] text-secondary"
    >
      {color && <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: color }} />}
      <span className="truncate">{children}</span>
    </span>
  );
}

function Row({ s, active, now, showProject, onSelect }: { s: ClaudeSessionSummary; active: boolean; now: number | null; showProject: boolean; onSelect: () => void }) {
  const ref = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (active) ref.current?.scrollIntoView({ block: 'nearest' });
  }, [active]);
  return (
    <button
      ref={ref}
      type="button"
      onClick={onSelect}
      data-session-id={s.id}
      className={cn(
        'flex w-full flex-col gap-1 border-b border-l-2 border-b-subtle px-4 py-2.5 text-left transition-colors',
        active ? 'border-l-orange bg-orange/[0.07]' : 'border-l-transparent hover:bg-panel-hover',
      )}
    >
      <div className="flex w-full items-baseline gap-2">
        {s.live && <span className="h-1.5 w-1.5 shrink-0 translate-y-[-1px] rounded-full bg-green robo-pulse" title="Transcript changed in the last 2 minutes" />}
        <span className={cn('min-w-0 flex-1 truncate text-[13px] font-medium', active ? 'text-paper' : 'text-paper/90')} title={s.title}>
          {s.title}
        </span>
        <span className="shrink-0 font-mono text-[10px] text-muted" title={s.end ?? ''}>
          {ago(s.end, now)}
        </span>
      </div>
      <div className="flex w-full flex-wrap items-center gap-x-2 gap-y-0.5 font-mono text-[10px] text-muted">
        {showProject && (
          <span className="inline-flex items-center gap-1 text-secondary" title={s.projectPath}>
            {s.automated && <Bot className="h-3 w-3" />}
            {s.projectName}
          </span>
        )}
        <span>{whenLabel(s.start)}</span>
        <span title={`wall clock ${formatDuration(s.durationMs)} · active ≈ ${formatDuration(s.activeMs)} (gaps over 10 min excluded)`}>
          {formatDuration(s.activeMs)} active
        </span>
        <span title={`${formatInt(s.tokens.total)} tokens (in ${formatInt(s.tokens.input)} · out ${formatInt(s.tokens.output)} · cache read ${formatInt(s.tokens.cacheRead)} · cache write ${formatInt(s.tokens.cacheWrite)})`}>
          <span className="text-orange/90">{fmtTokens(s.tokens.total)}</span> tok
        </span>
        <span>
          {s.userPrompts} prompt{s.userPrompts === 1 ? '' : 's'} · {formatInt(s.toolCalls)} tools
          {s.toolErrors > 0 && <span className="text-[#EF4444]/80"> · {s.toolErrors} err</span>}
        </span>
        {s.gitBranch && s.gitBranch !== 'HEAD' && (
          <span className="inline-flex items-center gap-0.5">
            <GitBranch className="h-2.5 w-2.5" />
            {s.gitBranch}
          </span>
        )}
      </div>
      {(s.models.length > 0 || s.topTools.length > 0 || s.skills.length > 0 || s.subagents > 0) && (
        <div className="flex w-full flex-wrap items-center gap-1">
          {s.models.slice(0, 2).map((m) => (
            <Chip key={m} color={modelColor(m)} title={m}>
              {shortModel(m)}
            </Chip>
          ))}
          {s.topTools.slice(0, 3).map((t) => (
            <Chip key={t.name} color={toolColor(t.name)} title={`${t.name}: ${t.count} calls${t.errors ? `, ${t.errors} errors` : ''}`}>
              {shortTool(t.name)} {t.count}
            </Chip>
          ))}
          {s.skills.slice(0, 2).map((k) => (
            <span
              key={k}
              title={`Skill: ${k}`}
              className="inline-flex max-w-[180px] items-center gap-1 truncate rounded-full border border-purple/40 bg-purple/10 px-1.5 py-px font-mono text-[9.5px] text-paper/80"
            >
              <Sparkles className="h-2.5 w-2.5 shrink-0 text-purple" />
              <span className="truncate">{k}</span>
            </span>
          ))}
          {s.skills.length > 2 && <span className="font-mono text-[9.5px] text-muted">+{s.skills.length - 2}</span>}
          {s.subagents > 0 && (
            <Chip title={`${s.subagents} subagent transcripts`}>
              <Users className="inline h-2.5 w-2.5" /> {s.subagents}
            </Chip>
          )}
        </div>
      )}
    </button>
  );
}

export function SessionList({ items, selectedId, now, showProject, onSelect, hasMore, onMore, loadingMore }: SessionListProps) {
  return (
    <div>
      {items.map((s) => (
        <Row key={s.id} s={s} active={s.id === selectedId} now={now} showProject={showProject} onSelect={() => onSelect(s.id)} />
      ))}
      {hasMore && (
        <div className="flex justify-center py-3">
          <button
            type="button"
            onClick={onMore}
            disabled={loadingMore}
            className="rounded-full border border-subtle bg-panel-elevated px-4 py-1.5 font-mono text-[10px] font-semibold uppercase tracking-[0.08em] text-secondary hover:border-highlight hover:text-paper disabled:opacity-50"
          >
            {loadingMore ? 'Loading…' : 'Load more'}
          </button>
        </div>
      )}
    </div>
  );
}
