'use client';
import { Fragment, useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { AlertTriangle, Brain, ChevronDown, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, Image as ImageIcon, Wrench } from 'lucide-react';
import type { ClaudeSubagent, TranscriptItem, TranscriptPage } from '@/types/sessions';
import { cn } from '@/lib/cn';
import { formatInt } from '@/lib/format';
import { ApiError, getJson, modelColor, shortModel, shortTool, timeLabel, toolColor } from './sessions-client';

const PAGE = 120;

// ── Minimal, safe text renderer: ``` fences → monospace blocks, `code`, **bold**, # headings. No HTML. ──

function inline(text: string, key: string): ReactNode[] {
  const out: ReactNode[] = [];
  const re = /(\*\*[^*\n]+\*\*|`[^`\n]+`)/g;
  let last = 0;
  let i = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    if (m.index > last) out.push(text.slice(last, m.index));
    const tok = m[0];
    out.push(
      tok.startsWith('**') ? (
        <strong key={`${key}-${i++}`} className="font-semibold text-paper">
          {inline(tok.slice(2, -2), `${key}-${i}b`)}
        </strong>
      ) : (
        <code key={`${key}-${i++}`} className="rounded bg-obsidian px-1 py-px font-mono text-[0.88em] text-amber">
          {tok.slice(1, -1)}
        </code>
      ),
    );
    last = m.index + tok.length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

function prose(text: string, key: string): ReactNode {
  const lines = text.split('\n');
  return lines.map((line, j) => {
    const h = /^(#{1,4})\s+(.*)$/.exec(line);
    const k = `${key}-l${j}`;
    if (h)
      return (
        <div key={k} className="mt-1.5 font-semibold text-paper">
          {inline(h[2], k)}
        </div>
      );
    return (
      <Fragment key={k}>
        {inline(line, k)}
        {j < lines.length - 1 && '\n'}
      </Fragment>
    );
  });
}

export function MessageText({ text, className }: { text: string; className?: string }) {
  const parts: ReactNode[] = [];
  const re = /```([\w+.#-]*)[^\n]*\n?([\s\S]*?)(?:```|$)/g;
  let last = 0;
  let m: RegExpExecArray | null;
  let i = 0;
  while ((m = re.exec(text))) {
    if (m.index > last) parts.push(<span key={`p${i++}`}>{prose(text.slice(last, m.index), `p${i}`)}</span>);
    parts.push(
      <pre key={`c${i++}`} className="hud-scroll my-1.5 max-h-80 overflow-auto rounded-md border border-subtle bg-obsidian px-3 py-2 font-mono text-[11px] leading-relaxed text-paper/90">
        {m[1] && <div className="mb-1 font-mono text-[9px] uppercase tracking-[0.1em] text-muted">{m[1]}</div>}
        {m[2].replace(/\n$/, '')}
      </pre>,
    );
    last = m.index + m[0].length;
    if (m[0].length === 0) re.lastIndex++;
  }
  if (last < text.length) parts.push(<span key={`p${i++}`}>{prose(text.slice(last), `p${i}`)}</span>);
  return <div className={cn('whitespace-pre-wrap break-words text-[12.5px] leading-relaxed text-paper/90', className)}>{parts}</div>;
}

// ── Rows ──

function ToolRow({ item, open, onToggle }: { item: Extract<TranscriptItem, { kind: 'tool' }>; open: boolean; onToggle: () => void }) {
  return (
    <div className={cn('rounded-md border', item.isError ? 'border-[#EF4444]/35 bg-[#EF4444]/[0.04]' : 'border-subtle bg-panel/60')}>
      <button type="button" onClick={onToggle} className="flex w-full items-center gap-2 px-2.5 py-1.5 text-left">
        {open ? <ChevronDown className="h-3 w-3 shrink-0 text-muted" /> : <ChevronRight className="h-3 w-3 shrink-0 text-muted" />}
        <Wrench className="h-3 w-3 shrink-0" style={{ color: toolColor(item.name) }} />
        <span className="shrink-0 font-mono text-[11px] font-semibold text-paper" title={item.name}>
          {shortTool(item.name)}
        </span>
        <span className="min-w-0 flex-1 truncate font-mono text-[11px] text-secondary">{item.summary}</span>
        {item.isError && (
          <span className="flex shrink-0 items-center gap-1 font-mono text-[9.5px] uppercase text-[#EF4444]">
            <AlertTriangle className="h-3 w-3" /> error
          </span>
        )}
        {item.result == null ? (
          <span className="shrink-0 font-mono text-[9.5px] text-muted">no result</span>
        ) : (
          <span className="shrink-0 font-mono text-[9.5px] text-muted">{formatInt(item.resultChars)} ch</span>
        )}
        <span className="shrink-0 font-mono text-[9.5px] text-muted">{timeLabel(item.ts)}</span>
      </button>
      {open && (
        <div className="space-y-2 border-t border-subtle px-2.5 py-2">
          <div>
            <div className="mb-1 font-mono text-[9px] uppercase tracking-[0.1em] text-muted">Input{item.inputTruncated && ' · truncated'}</div>
            <pre className="hud-scroll max-h-60 overflow-auto whitespace-pre-wrap break-all rounded bg-obsidian px-2.5 py-2 font-mono text-[10.5px] leading-relaxed text-paper/85">
              {item.input}
            </pre>
          </div>
          {item.result != null && (
            <div>
              <div className="mb-1 font-mono text-[9px] uppercase tracking-[0.1em] text-muted">
                Result{item.resultChars > item.result.length && ` · first ${formatInt(item.result.length)} of ${formatInt(item.resultChars)} chars`}
              </div>
              <pre
                className={cn(
                  'hud-scroll max-h-72 overflow-auto whitespace-pre-wrap break-all rounded bg-obsidian px-2.5 py-2 font-mono text-[10.5px] leading-relaxed',
                  item.isError ? 'text-[#FCA5A5]' : 'text-paper/80',
                )}
              >
                {item.result || '(empty)'}
              </pre>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function MetaRow({ item }: { item: Extract<TranscriptItem, { kind: 'meta' }> }) {
  const [open, setOpen] = useState(false);
  const long = item.text.length > 140 || item.text.includes('\n');
  return (
    <div className="flex items-start gap-2 px-1 font-mono text-[10.5px] text-muted">
      <span className="mt-px shrink-0 rounded border border-subtle px-1 py-px text-[9px] uppercase tracking-[0.08em] text-secondary">{item.label}</span>
      <button
        type="button"
        onClick={() => long && setOpen((v) => !v)}
        className={cn('min-w-0 flex-1 text-left', open ? 'whitespace-pre-wrap break-words' : 'truncate', long && 'hover:text-secondary')}
      >
        {item.text || '—'}
      </button>
      <span className="shrink-0 text-[9.5px]">{timeLabel(item.ts)}</span>
    </div>
  );
}

function ThinkingRow({ item }: { item: Extract<TranscriptItem, { kind: 'thinking' }> }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="rounded-md border border-dashed border-subtle">
      <button type="button" onClick={() => setOpen((v) => !v)} className="flex w-full items-center gap-2 px-2.5 py-1.5 text-left font-mono text-[10.5px] text-muted hover:text-secondary">
        {open ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
        <Brain className="h-3 w-3 text-purple" /> thinking
        {!open && <span className="min-w-0 flex-1 truncate">{item.text}</span>}
      </button>
      {open && <MessageText text={item.text} className="px-3 pb-2 text-[11.5px] text-secondary" />}
    </div>
  );
}

function ItemView({ item, open, onToggle }: { item: TranscriptItem; open: boolean; onToggle: () => void }) {
  switch (item.kind) {
    case 'user':
      return (
        <div className="rounded-lg border border-orange/25 border-l-2 border-l-orange bg-orange/[0.05] px-3 py-2">
          <div className="mb-1 flex items-center gap-2 font-mono text-[9.5px] uppercase tracking-[0.08em] text-orange">
            {item.source === 'sdk' ? 'SDK prompt' : 'You'}
            {item.images > 0 && (
              <span className="flex items-center gap-1 normal-case text-secondary">
                <ImageIcon className="h-3 w-3" /> {item.images} image{item.images === 1 ? '' : 's'}
              </span>
            )}
            <span className="ml-auto normal-case text-muted">{timeLabel(item.ts)}</span>
          </div>
          {item.text && <MessageText text={item.text} />}
          {item.truncated && <div className="mt-1 font-mono text-[9.5px] text-muted">… truncated</div>}
        </div>
      );
    case 'assistant':
      return (
        <div className="px-1 py-1">
          <div className="mb-1 flex items-center gap-2 font-mono text-[9.5px] uppercase tracking-[0.08em] text-secondary">
            <span className="h-1.5 w-1.5 rounded-full" style={{ background: item.model ? modelColor(item.model) : 'var(--text-muted)' }} />
            Claude{item.model && <span className="normal-case text-muted">{shortModel(item.model)}</span>}
            <span className="ml-auto normal-case text-muted">{timeLabel(item.ts)}</span>
          </div>
          <MessageText text={item.text} />
          {item.truncated && <div className="mt-1 font-mono text-[9.5px] text-muted">… truncated</div>}
        </div>
      );
    case 'thinking':
      return <ThinkingRow item={item} />;
    case 'tool':
      return <ToolRow item={item} open={open} onToggle={onToggle} />;
    case 'meta':
      return <MetaRow item={item} />;
  }
}

// ── View ──

interface TranscriptViewProps {
  sessionId: string;
  agentId: string | null;
  subagents: ClaudeSubagent[];
  onAgent: (agentId: string | null) => void;
  /** Bumps when the session's transcript changed on disk (live session) — reloads the current page. */
  revision: string;
}

export function TranscriptView({ sessionId, agentId, subagents, onAgent, revision }: TranscriptViewProps) {
  const [offset, setOffset] = useState(0);
  const [page, setPage] = useState<TranscriptPage | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [openTools, setOpenTools] = useState<Set<string>>(new Set());
  const [expandAll, setExpandAll] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  // The parent keys this component by session + agent, so a new transcript always starts fresh at offset 0.
  useEffect(() => {
    const ac = new AbortController();
    setLoading(true);
    setError(null);
    const sp = new URLSearchParams({ offset: String(offset), limit: String(PAGE) });
    if (agentId) sp.set('agent', agentId);
    getJson<TranscriptPage>(`/api/claude-sessions/${encodeURIComponent(sessionId)}/transcript?${sp}`, ac.signal)
      .then((p) => {
        if (ac.signal.aborted) return;
        setPage(p);
        if (p.offset !== offset) setOffset(p.offset); // server resolved "last page"
      })
      .catch((err) => {
        if ((err as Error).name === 'AbortError') return;
        setError(err instanceof ApiError ? err.message : 'Failed to load transcript');
      })
      .finally(() => {
        if (!ac.signal.aborted) setLoading(false);
      });
    return () => ac.abort();
  }, [sessionId, agentId, offset, revision]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: 0 });
  }, [offset, sessionId, agentId]);

  const toggle = useCallback((id: string) => {
    setOpenTools((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const total = page?.total ?? 0;
  const from = total ? offset + 1 : 0;
  const to = Math.min(offset + PAGE, total);
  const lastOffset = Math.max(0, Math.floor((total - 1) / PAGE) * PAGE);
  const navBtn = 'flex h-6 w-6 items-center justify-center rounded border border-subtle text-muted hover:border-highlight hover:text-paper disabled:pointer-events-none disabled:opacity-30';

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-subtle px-4 py-2">
        {subagents.length > 0 && (
          <select
            value={agentId ?? ''}
            onChange={(e) => onAgent(e.target.value || null)}
            className="h-6 max-w-[240px] truncate rounded border border-subtle bg-panel-elevated px-1.5 font-mono text-[10.5px] text-paper focus:border-orange/60 focus:outline-none"
            aria-label="Transcript"
          >
            <option value="">Main session</option>
            {subagents.map((a) => (
              <option key={a.agentId} value={a.agentId}>
                {a.agentType ?? 'agent'}: {a.description ?? a.agentId}
              </option>
            ))}
          </select>
        )}
        <span className="font-mono text-[10.5px] text-secondary">
          {page ? (
            <>
              items <span className="text-paper">{formatInt(from)}–{formatInt(to)}</span> of {formatInt(total)}
            </>
          ) : loading ? (
            'Loading…'
          ) : (
            '—'
          )}
        </span>
        {loading && page && <span className="font-mono text-[10px] text-muted">refreshing…</span>}
        <button
          type="button"
          onClick={() => {
            setExpandAll((v) => !v);
            setOpenTools(new Set());
          }}
          className="ml-auto rounded border border-subtle px-2 py-0.5 font-mono text-[9.5px] uppercase tracking-[0.08em] text-muted hover:border-highlight hover:text-paper"
        >
          {expandAll ? 'Collapse tools' : 'Expand tools'}
        </button>
        <div className="flex items-center gap-1">
          <button type="button" className={navBtn} disabled={offset === 0} onClick={() => setOffset(0)} title="First page">
            <ChevronsLeft className="h-3.5 w-3.5" />
          </button>
          <button type="button" className={navBtn} disabled={offset === 0} onClick={() => setOffset(Math.max(0, offset - PAGE))} title="Previous page">
            <ChevronLeft className="h-3.5 w-3.5" />
          </button>
          <button type="button" className={navBtn} disabled={to >= total} onClick={() => setOffset(offset + PAGE)} title="Next page">
            <ChevronRight className="h-3.5 w-3.5" />
          </button>
          <button type="button" className={navBtn} disabled={to >= total} onClick={() => setOffset(lastOffset)} title="Last page">
            <ChevronsRight className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
      <div ref={scrollRef} className="hud-scroll min-h-0 flex-1 overflow-y-auto px-4 py-3">
        {error && <div className="rounded-md border border-[#EF4444]/40 bg-[#EF4444]/10 px-3 py-2 text-[12px] text-paper">{error}</div>}
        {!error && page && page.items.length === 0 && <div className="py-8 text-center font-mono text-[11px] text-muted">No readable messages in this transcript.</div>}
        {!page && loading && <div className="animate-pulse py-8 text-center font-mono text-[11px] text-muted">Parsing transcript…</div>}
        <div className="space-y-2">
          {page?.items.map((item, i) => {
            const id = item.kind === 'tool' ? item.id : '';
            const open = item.kind === 'tool' ? expandAll !== openTools.has(id) : false;
            return <ItemView key={`${offset}-${i}`} item={item} open={open} onToggle={() => toggle(id)} />;
          })}
        </div>
        {page && to < total && (
          <div className="flex justify-center py-4">
            <button
              type="button"
              onClick={() => setOffset(offset + PAGE)}
              className="rounded-full border border-subtle bg-panel-elevated px-4 py-1.5 font-mono text-[10px] font-semibold uppercase tracking-[0.08em] text-secondary hover:border-highlight hover:text-paper"
            >
              Next {Math.min(PAGE, total - to)} items →
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
