'use client';
import { useEffect, useState, type ReactNode } from 'react';
import { Bot, Copy, Database, ExternalLink, FileText, GitBranch, GitPullRequest, LayoutGrid, Sparkles, Terminal, Users } from 'lucide-react';
import type { ClaudeSessionDetail, SessionMemory, SessionTokens } from '@/types/sessions';
import { cn } from '@/lib/cn';
import { formatInt } from '@/lib/format';
import { ApiError, fmtTokens, formatBytes, formatDuration, getJson, modelColor, shortModel, shortTool, toolColor, whenLabel } from './sessions-client';
import { MessageText, TranscriptView } from './TranscriptView';

export type DetailTab = 'overview' | 'transcript';

interface SessionDetailProps {
  detail: ClaudeSessionDetail | null;
  loading: boolean;
  error: string | null;
  tab: DetailTab;
  onTab: (t: DetailTab) => void;
  agentId: string | null;
  onAgent: (a: string | null) => void;
  onCopy: (text: string, what: string) => void;
}

function Stat({ label, value, sub, title }: { label: string; value: ReactNode; sub?: ReactNode; title?: string }) {
  return (
    <div className="rounded-md border border-subtle bg-panel/60 px-2.5 py-2" title={title}>
      <div className="font-mono text-[9px] uppercase tracking-[0.1em] text-muted">{label}</div>
      <div className="mt-0.5 text-[15px] font-semibold leading-tight text-paper">{value}</div>
      {sub && <div className="mt-0.5 font-mono text-[9.5px] text-muted">{sub}</div>}
    </div>
  );
}

function Section({ title, icon, right, children }: { title: string; icon?: ReactNode; right?: ReactNode; children: ReactNode }) {
  return (
    <section className="mt-4">
      <div className="mb-2 flex items-center gap-1.5">
        {icon}
        <h3 className="hud-label text-[10px]">{title}</h3>
        {right && <div className="ml-auto">{right}</div>}
      </div>
      {children}
    </section>
  );
}

const TOKEN_PARTS: { key: keyof Omit<SessionTokens, 'total'>; label: string; color: string }[] = [
  { key: 'cacheRead', label: 'cache read', color: '#3B82F6' },
  { key: 'cacheWrite', label: 'cache write', color: '#A855F7' },
  { key: 'input', label: 'input', color: '#22C55E' },
  { key: 'output', label: 'output', color: '#FF5500' },
];

function TokenBar({ t }: { t: SessionTokens }) {
  if (!t.total) return <div className="font-mono text-[11px] text-muted">No assistant usage recorded.</div>;
  return (
    <div>
      <div className="flex h-2 overflow-hidden rounded-full bg-obsidian">
        {TOKEN_PARTS.map((p) => (t[p.key] ? <div key={p.key} style={{ width: `${(t[p.key] / t.total) * 100}%`, background: p.color }} /> : null))}
      </div>
      <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-0.5 font-mono text-[10px] text-secondary">
        {TOKEN_PARTS.map((p) => (
          <span key={p.key} className="flex items-center gap-1" title={formatInt(t[p.key])}>
            <span className="h-1.5 w-1.5 rounded-full" style={{ background: p.color }} />
            {p.label} <span className="text-paper">{fmtTokens(t[p.key])}</span>
          </span>
        ))}
      </div>
    </div>
  );
}

function MemoryPanel({ sessionId }: { sessionId: string }) {
  const [mem, setMem] = useState<SessionMemory | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [open, setOpen] = useState<number | null>(null);
  useEffect(() => {
    const ac = new AbortController();
    setMem(null);
    setErr(null);
    getJson<SessionMemory>(`/api/claude-sessions/${encodeURIComponent(sessionId)}/memory`, ac.signal)
      .then((m) => !ac.signal.aborted && setMem(m))
      .catch((e) => (e as Error).name !== 'AbortError' && setErr(e instanceof ApiError ? e.message : 'failed'));
    return () => ac.abort();
  }, [sessionId]);

  if (err) return <div className="font-mono text-[11px] text-muted">claude-mem: {err}</div>;
  if (!mem) return <div className="animate-pulse font-mono text-[11px] text-muted">Asking the claude-mem worker…</div>;
  if (!mem.online)
    return (
      <div className="font-mono text-[11px] text-muted">
        claude-mem worker offline ({mem.url}){mem.error ? ` — ${mem.error}` : ''}
      </div>
    );
  if (!mem.observations.length && !mem.summaries.length)
    return <div className="font-mono text-[11px] text-muted">No claude-mem observations recorded for this session.</div>;
  return (
    <div className="space-y-1.5">
      {mem.summaries.slice(0, 2).map((s) => (
        <div key={`s${s.id}`} className="rounded-md border border-teal/30 bg-teal/[0.05] px-2.5 py-2 text-[11.5px] leading-relaxed text-secondary">
          <div className="mb-1 font-mono text-[9px] uppercase tracking-[0.1em] text-teal">Session summary · {whenLabel(s.createdAt)}</div>
          {s.request && <p className="text-paper/90">{s.request}</p>}
          {s.completed && (
            <p className="mt-1">
              <span className="font-mono text-[9.5px] uppercase text-muted">Completed </span>
              {s.completed}
            </p>
          )}
          {s.nextSteps && (
            <p className="mt-1">
              <span className="font-mono text-[9.5px] uppercase text-muted">Next </span>
              {s.nextSteps}
            </p>
          )}
        </div>
      ))}
      {mem.observations.map((o) => (
        <div key={o.id} className="rounded-md border border-subtle bg-panel/60">
          <button type="button" onClick={() => setOpen(open === o.id ? null : o.id)} className="flex w-full items-start gap-2 px-2.5 py-1.5 text-left">
            <span className="mt-px shrink-0 rounded border border-subtle px-1 font-mono text-[9px] uppercase tracking-[0.06em] text-secondary">{o.type}</span>
            <span className="min-w-0 flex-1">
              <span className="block text-[12px] text-paper/90">{o.title}</span>
              {o.subtitle && open !== o.id && <span className="block truncate text-[11px] text-muted">{o.subtitle}</span>}
            </span>
            <span className="shrink-0 font-mono text-[9.5px] text-muted">{whenLabel(o.createdAt)}</span>
          </button>
          {open === o.id && (
            <div className="space-y-1.5 border-t border-subtle px-2.5 py-2 text-[11.5px] leading-relaxed text-secondary">
              {o.subtitle && <p className="text-paper/80">{o.subtitle}</p>}
              {o.narrative && <p>{o.narrative}</p>}
              {o.facts.length > 0 && (
                <ul className="list-disc space-y-0.5 pl-4 marker:text-orange/60">
                  {o.facts.map((f, i) => (
                    <li key={i}>{f}</li>
                  ))}
                </ul>
              )}
              {o.filesModified.length > 0 && <p className="font-mono text-[10px] text-muted">modified: {o.filesModified.join(', ')}</p>}
            </div>
          )}
        </div>
      ))}
      {mem.hasMore && (
        <a href={mem.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 font-mono text-[10px] text-orange hover:underline">
          More in the claude-mem viewer <ExternalLink className="h-3 w-3" />
        </a>
      )}
    </div>
  );
}

function Overview({ d, onAgent }: { d: ClaudeSessionDetail; onAgent: (a: string) => void }) {
  const maxTool = Math.max(1, ...d.tools.map((t) => t.count));
  return (
    <div className="hud-scroll min-h-0 flex-1 overflow-y-auto px-4 pb-6 pt-3">
      <div className="grid grid-cols-4 gap-2">
        <Stat label="Active" value={formatDuration(d.activeMs)} sub={`span ${formatDuration(d.durationMs)}`} title="Estimate: union of activity with gaps over 10 minutes excluded" />
        <Stat label="Tokens" value={fmtTokens(d.tokens.total)} sub={`${fmtTokens(d.tokens.output)} out`} title={`${formatInt(d.tokens.total)} tokens, message ids deduplicated`} />
        <Stat label="Messages" value={formatInt(d.assistantMessages)} sub={`${d.userPrompts} prompts`} />
        <Stat
          label="Tool calls"
          value={formatInt(d.toolCalls)}
          sub={d.toolErrors ? <span className="text-[#EF4444]/80">{d.toolErrors} errors</span> : '0 errors'}
        />
      </div>

      <Section title="Tokens" icon={<Database className="h-3 w-3 text-muted" />}>
        <TokenBar t={d.tokens} />
        {d.subagentTokens.total > 0 && (
          <div className="mt-1.5 font-mono text-[10px] text-muted">
            main {fmtTokens(d.mainTokens.total)} · subagents {fmtTokens(d.subagentTokens.total)}
          </div>
        )}
        {d.byModel.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1.5">
            {d.byModel.map((m) => (
              <span key={m.model} className="flex items-center gap-1.5 rounded-full border border-subtle bg-panel-elevated px-2 py-0.5 font-mono text-[10px] text-secondary" title={m.model}>
                <span className="h-1.5 w-1.5 rounded-full" style={{ background: modelColor(m.model) }} />
                {shortModel(m.model)} <span className="text-paper">{fmtTokens(m.tokens.total)}</span>
                <span className="text-muted">{m.messages} msgs</span>
              </span>
            ))}
          </div>
        )}
      </Section>

      {d.tools.length > 0 && (
        <Section title={`Tool usage · ${d.tools.length} tools`} icon={<Terminal className="h-3 w-3 text-muted" />}>
          <div className="space-y-1">
            {d.tools.slice(0, 16).map((t) => (
              <div key={t.name} className="flex items-center gap-2" title={`${t.name}: ${t.count} calls, ${t.errors} errors`}>
                <span className="w-[150px] shrink-0 truncate text-right font-mono text-[10.5px] text-secondary">{shortTool(t.name)}</span>
                <div className="relative h-3 flex-1 overflow-hidden rounded-sm bg-obsidian">
                  <div className="h-full rounded-sm" style={{ width: `${(t.count / maxTool) * 100}%`, background: toolColor(t.name), opacity: 0.75 }} />
                  {t.errors > 0 && (
                    <div
                      className="absolute top-0 h-full bg-[#EF4444]/80"
                      style={{ left: `${((t.count - t.errors) / maxTool) * 100}%`, width: `${Math.max(0.6, (t.errors / maxTool) * 100)}%` }}
                    />
                  )}
                </div>
                <span className="w-[54px] shrink-0 font-mono text-[10px] text-paper">
                  {t.count}
                  {t.errors > 0 && <span className="text-[#EF4444]/80"> ·{t.errors}</span>}
                </span>
              </div>
            ))}
            {d.tools.length > 16 && <div className="pl-[158px] font-mono text-[10px] text-muted">+{d.tools.length - 16} more tools</div>}
          </div>
        </Section>
      )}

      {(d.skillCounts.length > 0 || d.commands.length > 0) && (
        <Section title="Skills & commands" icon={<Sparkles className="h-3 w-3 text-purple" />}>
          <div className="flex flex-wrap gap-1.5">
            {d.skillCounts.map((s) => (
              <span key={s.name} className="rounded-full border border-purple/40 bg-purple/10 px-2 py-0.5 font-mono text-[10px] text-paper/85">
                {s.name} <span className="text-muted">×{s.count}</span>
              </span>
            ))}
            {d.commands.map((c) => (
              <span key={c.name} className="rounded-full border border-subtle bg-panel-elevated px-2 py-0.5 font-mono text-[10px] text-secondary">
                {c.name} <span className="text-muted">×{c.count}</span>
              </span>
            ))}
          </div>
        </Section>
      )}

      {d.subagentList.length > 0 && (
        <Section title={`Subagents · ${d.subagentList.length}`} icon={<Users className="h-3 w-3 text-muted" />}>
          <div className="space-y-1">
            {d.subagentList.map((a) => (
              <button
                key={a.agentId}
                type="button"
                onClick={() => onAgent(a.agentId)}
                className="flex w-full items-center gap-2 rounded-md border border-subtle bg-panel/60 px-2.5 py-1.5 text-left hover:border-highlight"
                title="Open this subagent's transcript"
              >
                <Bot className="h-3.5 w-3.5 shrink-0 text-muted" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[12px] text-paper/90">{a.description ?? a.firstPrompt ?? a.agentId}</span>
                  <span className="block truncate font-mono text-[9.5px] text-muted">
                    {a.agentType ?? 'agent'}
                    {a.workflow ? ` · ${a.workflow}` : ''} · {whenLabel(a.start)} · {a.assistantMessages} msgs · {a.toolCalls} tools · {formatBytes(a.bytes)}
                  </span>
                </span>
                <span className="shrink-0 font-mono text-[10px] text-orange/90">{fmtTokens(a.tokens.total)}</span>
                <FileText className="h-3 w-3 shrink-0 text-muted" />
              </button>
            ))}
          </div>
        </Section>
      )}

      <Section title="claude-mem observations" icon={<Database className="h-3 w-3 text-teal" />}>
        <MemoryPanel sessionId={d.id} />
      </Section>

      {(d.firstPrompt || d.lastPrompt) && (
        <Section title="Prompts">
          {d.firstPrompt && (
            <div className="rounded-md border border-subtle bg-panel/60 px-2.5 py-2">
              <div className="mb-0.5 font-mono text-[9px] uppercase tracking-[0.1em] text-muted">First</div>
              <MessageText text={d.firstPrompt} className="text-[12px]" />
            </div>
          )}
          {d.lastPrompt && d.lastPrompt !== d.firstPrompt && (
            <div className="mt-1.5 rounded-md border border-subtle bg-panel/60 px-2.5 py-2">
              <div className="mb-0.5 font-mono text-[9px] uppercase tracking-[0.1em] text-muted">Latest</div>
              <MessageText text={d.lastPrompt} className="text-[12px]" />
            </div>
          )}
        </Section>
      )}

      {d.prs.length > 0 && (
        <Section title="Pull requests" icon={<GitPullRequest className="h-3 w-3 text-muted" />}>
          <div className="flex flex-wrap gap-1.5">
            {d.prs.map((p) => (
              <a
                key={p.url}
                href={p.url}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 rounded-full border border-subtle bg-panel-elevated px-2 py-0.5 font-mono text-[10px] text-secondary hover:text-paper"
              >
                {p.repo}#{p.number} <ExternalLink className="h-2.5 w-2.5" />
              </a>
            ))}
          </div>
        </Section>
      )}
    </div>
  );
}

export function SessionDetail({ detail, loading, error, tab, onTab, agentId, onAgent, onCopy }: SessionDetailProps) {
  if (!detail) {
    return (
      <aside className="flex w-[min(46vw,760px)] shrink-0 flex-col items-center justify-center border-l border-subtle bg-panel/30 p-8 max-md:min-h-[60dvh] max-md:w-full max-md:min-w-0 max-md:max-w-none max-md:shrink-0 max-md:border-l-0 max-md:border-t max-md:min-h-0">
        {error ? (
          <div className="max-w-sm rounded-md border border-[#EF4444]/40 bg-[#EF4444]/10 px-3 py-2 text-center text-[12px] text-paper">{error}</div>
        ) : (
          <div className={cn('font-mono text-[11px] text-muted', loading && 'animate-pulse')}>{loading ? 'Loading session…' : 'Select a session'}</div>
        )}
      </aside>
    );
  }
  const d = detail;
  return (
    <aside className="flex w-[min(46vw,760px)] shrink-0 flex-col border-l border-subtle bg-panel/30 max-md:min-h-[60dvh] max-md:w-full max-md:min-w-0 max-md:max-w-none max-md:shrink-0 max-md:border-l-0 max-md:border-t">
      <div className="shrink-0 border-b border-subtle px-4 pb-2 pt-3">
        <div className="flex items-start gap-2">
          <h2 className={cn('min-w-0 flex-1 text-[15px] font-semibold leading-snug text-paper', loading && 'opacity-60')}>{d.title}</h2>
          {d.live && <span className="mt-1 shrink-0 rounded-full bg-green/15 px-2 py-0.5 font-mono text-[9px] uppercase tracking-[0.08em] text-green">live</span>}
        </div>
        <div className="mt-1 flex flex-wrap items-center gap-x-2.5 gap-y-0.5 font-mono text-[10px] text-muted">
          <button type="button" onClick={() => onCopy(d.id, 'session id')} className="inline-flex items-center gap-1 hover:text-paper" title="Copy session id">
            {d.id.slice(0, 8)} <Copy className="h-2.5 w-2.5" />
          </button>
          <span className="text-secondary" title={d.projectPath}>
            {d.automated && <Bot className="mr-0.5 inline h-3 w-3" />}
            {d.projectPath}
          </span>
          {d.branches.length > 0 && (
            <span className="inline-flex items-center gap-0.5" title={d.branches.join(', ')}>
              <GitBranch className="h-2.5 w-2.5" />
              {d.branches.slice(0, 2).join(', ')}
              {d.branches.length > 2 && ` +${d.branches.length - 2}`}
            </span>
          )}
          <span>
            {whenLabel(d.start)} → {whenLabel(d.end)}
          </span>
          {d.version && <span>v{d.version}</span>}
          {d.entrypoint && <span>{d.entrypoint}</span>}
          <span>{formatBytes(d.bytes)}</span>
          <button
            type="button"
            onClick={() => onCopy(`claude --resume ${d.id}`, 'resume command')}
            className="inline-flex items-center gap-1 hover:text-paper"
            title={`Copy "claude --resume ${d.id}" (run it from ${d.projectPath})`}
          >
            resume <Copy className="h-2.5 w-2.5" />
          </button>
        </div>
        <div className="mt-2.5 flex gap-1">
          {(
            [
              ['overview', 'Overview', <LayoutGrid key="i" className="h-3 w-3" />],
              ['transcript', 'Transcript', <FileText key="i" className="h-3 w-3" />],
            ] as const
          ).map(([k, label, icon]) => (
            <button
              key={k}
              type="button"
              onClick={() => onTab(k)}
              className={cn(
                'flex items-center gap-1.5 rounded-full px-3 py-1 font-mono text-[10px] font-semibold uppercase tracking-[0.08em]',
                tab === k ? 'bg-orange text-obsidian' : 'text-muted hover:text-paper',
              )}
            >
              {icon}
              {label}
            </button>
          ))}
          <span className="ml-auto self-center font-mono text-[9.5px] text-muted">o overview · t transcript</span>
        </div>
      </div>
      {tab === 'overview' ? (
        <Overview
          d={d}
          onAgent={(a) => {
            onAgent(a);
            onTab('transcript');
          }}
        />
      ) : (
        <TranscriptView
          key={`${d.id}:${agentId ?? ''}`}
          sessionId={d.id}
          agentId={agentId}
          subagents={d.subagentList}
          onAgent={onAgent}
          revision={`${d.end ?? ''}:${d.bytes}`}
        />
      )}
    </aside>
  );
}
