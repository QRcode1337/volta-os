'use client';
// Presentational pieces for VOLTA Tasks: status styling, inline `code` rendering, cards and the detail drawer.
import { useEffect, useState, type ReactNode } from 'react';
import { AlertTriangle, BookOpen, Bot, ChevronDown, ChevronRight, Copy, ExternalLink, FileText, Lock, Monitor, RefreshCw, Send, X } from 'lucide-react';
import { cn } from '@/lib/cn';
import { ACTION_STATUSES, VERY_STALE_DAYS, isStale, type ActionItem, type ActionStatus, type ActionsSource } from './types';

export interface StatusStyle {
  label: string;
  /** Column / chip accent text colour. */
  text: string;
  /** Card border + background. */
  card: string;
  dot: string;
}

export const STATUS_STYLE: Record<ActionStatus, StatusStyle> = {
  // Neutral card: the Awaiting column's orange tint is the signal, so 19 orange-bordered cards don't flatten it.
  awaiting: { label: 'Awaiting Patrick', text: 'text-orange', card: 'border-subtle bg-panel hover:border-orange/60', dot: 'bg-orange' },
  blocked: { label: 'Blocked', text: 'text-[#EF4444]', card: 'border-[#EF4444]/35 bg-panel hover:border-[#EF4444]/70', dot: 'bg-[#EF4444]' },
  progress: { label: 'In progress', text: 'text-purple', card: 'border-subtle bg-panel hover:border-purple/60', dot: 'bg-purple' },
  todo: { label: 'Todo', text: 'text-secondary', card: 'border-subtle bg-panel hover:border-highlight', dot: 'bg-muted' },
  done: { label: 'Done', text: 'text-green', card: 'border-subtle bg-panel hover:border-green/50', dot: 'bg-green' },
};

/** Renders `backtick` spans as inline code; everything else as plain text. */
export function Inline({ text }: { text: string }) {
  const parts = text.split(/(`[^`\n]+`)/g);
  return (
    <>
      {parts.map((p, i) =>
        p.length > 2 && p.startsWith('`') && p.endsWith('`') ? (
          <code key={i} className="rounded bg-panel-elevated px-1 py-px font-mono text-[0.92em] text-paper">
            {p.slice(1, -1)}
          </code>
        ) : (
          <span key={i}>{p}</span>
        ),
      )}
    </>
  );
}

export function AgeChip({ item, staleDays }: { item: ActionItem; staleDays: number }) {
  if (item.ageDays === null) return null;
  const stale = isStale(item, staleDays);
  // Graded: ≥30d is a filled badge so the oldest cards lead; younger stale items stay an outline.
  const veryStale = stale && item.ageDays >= VERY_STALE_DAYS;
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full border px-1.5 py-px font-mono text-[11px]',
        veryStale ? 'border-amber bg-amber font-semibold text-obsidian' : stale ? 'border-amber/60 bg-amber/10 text-amber' : 'border-subtle text-muted',
      )}
      title={stale ? `Stale: open for ${item.ageDays} days (threshold ${staleDays}d)` : `${item.status === 'done' ? 'Captured' : 'Open for'} ${item.ageDays} days`}
    >
      {stale && <AlertTriangle className="h-2.5 w-2.5" />}
      {stale ? 'STALE ' : ''}
      {item.ageDays}d
    </span>
  );
}

export function TaskCard({ item, staleDays, selected, onOpen }: { item: ActionItem; staleDays: number; selected: boolean; onOpen: (id: string) => void }) {
  const st = STATUS_STYLE[item.status];
  return (
    <button
      type="button"
      onClick={() => onOpen(item.id)}
      aria-pressed={selected}
      className={cn(
        'group flex w-full flex-col gap-2 rounded-lg border px-3 py-2.5 text-left transition-colors',
        st.card,
        selected && 'ring-1 ring-orange',
      )}
    >
      <p className="line-clamp-3 text-[13px] leading-snug text-paper">
        <Inline text={item.text} />
      </p>
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="rounded-full bg-panel-elevated px-1.5 py-px font-mono text-[11px] text-secondary">{item.agent}</span>
        <AgeChip item={item} staleDays={staleDays} />
        {item.notes.length > 0 && <FileText className="h-3 w-3 text-muted" aria-label="Has notes" />}
      </div>
    </button>
  );
}

export function TaskColumn({
  status,
  items,
  total,
  staleDays,
  selectedId,
  onOpen,
  collapsed,
  onToggle,
}: {
  status: ActionStatus;
  items: ActionItem[];
  total: number;
  staleDays: number;
  selectedId: string | null;
  onOpen: (id: string) => void;
  /** Only the Done column is collapsible. */
  collapsed?: boolean;
  onToggle?: () => void;
}) {
  const st = STATUS_STYLE[status];
  const highlight = status === 'awaiting';
  const count = items.length === total ? String(total) : `${items.length}/${total}`;
  const header = (
    <>
      <span className={cn('h-2 w-2 shrink-0 rounded-full', st.dot, highlight && items.length > 0 && 'animate-pulse')} />
      <span className={cn('truncate font-mono text-[11px] font-semibold uppercase tracking-[0.08em]', st.text)}>{st.label}</span>
      <span className="ml-auto rounded-full bg-panel-elevated px-1.5 font-mono text-[11px] text-muted">{count}</span>
      {onToggle && (collapsed ? <ChevronRight className="h-3.5 w-3.5 text-muted" /> : <ChevronDown className="h-3.5 w-3.5 text-muted" />)}
    </>
  );
  return (
    // id + scroll-mt: jump target for the status bar in TasksApp (clears its sticky height).
    <section
      id={`tasks-col-${status}`}
      data-count={total}
      aria-label={st.label}
      className={cn(
        'flex min-w-0 scroll-mt-14 flex-col rounded-xl border lg:min-h-0',
        highlight ? 'border-orange/50 bg-orange/[0.04] shadow-[0_0_0_1px_rgba(255,106,0,0.08)]' : 'border-subtle bg-panel/60',
      )}
    >
      {onToggle ? (
        <button type="button" onClick={onToggle} aria-expanded={!collapsed} className="flex shrink-0 items-center gap-2 px-3 py-2.5 text-left">
          {header}
        </button>
      ) : (
        <div className="flex shrink-0 items-center gap-2 px-3 py-2.5">{header}</div>
      )}
      {!collapsed && (
        <div className="hud-scroll flex flex-col gap-2 px-2 pb-2 lg:min-h-0 lg:flex-1 lg:overflow-y-auto">
          {items.length === 0 ? (
            <p className="px-2 py-4 text-center font-mono text-[11px] uppercase tracking-[0.06em] text-muted">
              {total === 0 ? (highlight ? 'Nothing waiting on you' : 'None') : 'No matches'}
            </p>
          ) : (
            items.map((it) => <TaskCard key={it.id} item={it} staleDays={staleDays} selected={it.id === selectedId} onOpen={onOpen} />)
          )}
        </div>
      )}
    </section>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="hud-label">{label}</span>
      <span className="text-[13px] text-paper">{children}</span>
    </div>
  );
}

export function TaskDetail({
  item,
  source,
  staleDays,
  onClose,
  onCopy,
  onOpenNote,
  remote,
  act,
}: {
  item: ActionItem;
  source: ActionsSource;
  staleDays: number;
  onClose: () => void;
  onCopy: (text: string, what: string) => void;
  /** Open a wiki note (`wiki/…/x.md`) in the in-app viewer. */
  onOpenNote: (rel: string) => void;
  /** Page opened from the phone: Mac `open` commands are hidden, notes open in VOLTA instead. */
  remote: boolean;
  act: TaskActions;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  const st = STATUS_STYLE[item.status];
  const stale = isStale(item, staleDays);
  return (
    // z-[60]: above the phone MobileTabBar (z-50), which used to cover the bottom of the drawer.
    <div className="fixed inset-0 z-[60] flex justify-end">
      <button type="button" aria-label="Close detail" onClick={onClose} className="absolute inset-0 bg-black/50" />
      <aside role="dialog" aria-label="Task detail" className="relative flex h-full w-[560px] max-w-full flex-col border-l border-highlight bg-panel pb-[env(safe-area-inset-bottom)] shadow-[0_0_60px_rgba(0,0,0,0.6)]">
        <header className="flex shrink-0 items-center gap-2 border-b border-subtle px-4 pb-3 pt-[max(0.75rem,env(safe-area-inset-top))]">
          <span className={cn('h-2 w-2 rounded-full', st.dot)} />
          <span className={cn('font-mono text-[11px] font-semibold uppercase tracking-[0.08em]', st.text)}>{st.label}</span>
          {stale && <AgeChip item={item} staleDays={staleDays} />}
          <button type="button" onClick={onClose} aria-label="Close" className="ml-auto rounded-full border border-subtle p-1.5 text-muted hover:text-paper max-md:p-2.5">
            <X className="h-3.5 w-3.5" />
          </button>
        </header>
        <div className="hud-scroll flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-4 py-4">
          <p className="text-[16px] leading-relaxed text-paper">
            <Inline text={item.text} />
          </p>
          {item.notes.length > 0 && (
            <div className="flex flex-col gap-1.5 rounded-lg border border-subtle bg-obsidian/60 p-3">
              <span className="hud-label">Notes</span>
              {item.notes.map((n, i) => (
                <p key={i} className="text-[13px] leading-snug text-secondary">
                  <Inline text={n} />
                </p>
              ))}
            </div>
          )}
          <ActPanel item={item} remote={remote} act={act} onCopy={onCopy} />
          <div className="grid grid-cols-2 gap-x-4 gap-y-3">
            <Field label="Waiting on / owner">{item.agent}</Field>
            <Field label="Age">{item.ageDays === null ? 'no date' : `${item.ageDays} days`}</Field>
            <Field label="Captured">{item.created ?? '—'}</Field>
            <Field label={item.status === 'done' ? 'Completed' : 'Last updated'}>{item.updated ?? '—'}</Field>
            {item.agingDays !== null && <Field label="Pipeline aging counter">{item.agingDays}d (at last run)</Field>}
            <Field label="Item id">
              <span className="font-mono text-[11px]">{item.id}</span>
            </Field>
          </div>
          <div className="flex flex-col gap-1.5 rounded-lg border border-subtle p-3">
            <span className="hud-label">Source</span>
            <p className="font-mono text-[12px] text-secondary">
              <span className="text-paper">actions.md</span> · section <span className="text-paper">## {item.section || '(none)'}</span> (line {item.sectionLine}) · item at <span className="text-paper">line {item.line}</span>
              <span className="text-muted"> · marker [{item.marker}]</span>
            </p>
            <div className="mt-1 flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => onOpenNote(SOURCE_NOTE)}
                className="inline-flex min-h-9 items-center gap-2 rounded-md border border-orange/50 bg-orange/[0.08] px-2.5 py-1.5 font-mono text-[12px] text-orange hover:border-orange"
              >
                <BookOpen className="h-3.5 w-3.5" /> View actions.md
              </button>
              {!remote && (
                <button
                  type="button"
                  onClick={() => onCopy(source.openHint, 'Command copied.')}
                  className="group flex min-w-0 flex-1 items-center gap-2 rounded-md border border-subtle bg-obsidian px-2.5 py-2 text-left font-mono text-[12px] text-paper hover:border-orange/60"
                  title="Copy"
                >
                  <span className="text-orange">$</span>
                  <span className="min-w-0 flex-1 truncate">{source.openHint}</span>
                  <Copy className="h-3.5 w-3.5 shrink-0 text-muted group-hover:text-orange" />
                </button>
              )}
            </div>
            <p className="flex items-center gap-1.5 font-mono text-[11px] uppercase tracking-[0.06em] text-muted">
              <Lock className="h-3 w-3" /> Changes are made inline, the way OpenClaw edits it · a backup is kept
            </p>
          </div>
          {item.links.length > 0 && (
            <div className="flex flex-col gap-1.5">
              <span className="hud-label">Links</span>
              {item.links.map((l) =>
                l.kind === 'wiki' ? (
                  <button
                    key={l.target}
                    type="button"
                    onClick={() => onOpenNote(l.target.replace(/^~\/\.openclaw\//, ''))}
                    className="flex min-h-9 items-center gap-2 rounded-md border border-subtle px-2.5 py-1.5 text-left font-mono text-[11px] text-secondary hover:border-highlight hover:text-paper"
                    title={`Read ${l.target}`}
                  >
                    <FileText className="h-3.5 w-3.5 shrink-0 text-muted" />
                    <span className="min-w-0 flex-1 truncate">{l.target}</span>
                    <BookOpen className="h-3 w-3 shrink-0 text-muted" />
                  </button>
                ) : (
                  <a
                    key={l.target}
                    href={l.target}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-2 rounded-md border border-subtle px-2.5 py-1.5 font-mono text-[11px] text-secondary hover:border-highlight hover:text-paper"
                  >
                    <ExternalLink className="h-3.5 w-3.5 shrink-0 text-muted" />
                    <span className="min-w-0 flex-1 truncate">{l.label}</span>
                  </a>
                ),
              )}
            </div>
          )}
        </div>
      </aside>
    </div>
  );
}

/** actions.md itself, in the repo-relative form /api/actions/note takes. */
export const SOURCE_NOTE = 'wiki/main/actions.md';

interface WikiNote {
  path: string;
  content: string;
  mtime: string;
  truncated: boolean;
}

/** Read-only view of a wiki note, fetched from the Mac, so links work from the phone too. Sits above the detail drawer. */
export function NoteViewer({ rel, onClose, onCopy, remote }: { rel: string; onClose: () => void; onCopy: (text: string, what: string) => void; remote: boolean }) {
  const [state, setState] = useState<{ rel: string; note?: WikiNote; error?: string } | null>(null);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    const ctl = new AbortController();
    fetch(`/api/actions/note?path=${encodeURIComponent(rel)}`, { signal: ctl.signal })
      .then(async (r) => {
        const json = (await r.json()) as WikiNote & { error?: string };
        setState(r.ok ? { rel, note: json } : { rel, error: json.error || `HTTP ${r.status}` });
      })
      .catch((err: Error) => {
        if (err.name !== 'AbortError') setState({ rel, error: err.message });
      });
    return () => ctl.abort();
  }, [rel, attempt]);
  useEffect(() => {
    // Capture phase + stopPropagation: Escape closes only this viewer, not the drawer underneath.
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.stopPropagation();
      onClose();
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [onClose]);
  const current = state?.rel === rel ? state : null;
  const display = `~/.openclaw/${rel}`;
  return (
    <div className="fixed inset-0 z-[65] flex justify-end">
      <button type="button" aria-label="Close note" onClick={onClose} className="absolute inset-0 bg-black/40" />
      <aside role="dialog" aria-label={`Note ${display}`} className="relative flex h-full w-[640px] max-w-full flex-col border-l border-highlight bg-panel pb-[env(safe-area-inset-bottom)] shadow-[0_0_60px_rgba(0,0,0,0.6)]">
        <header className="flex shrink-0 items-center gap-2 border-b border-subtle px-4 pb-3 pt-[max(0.75rem,env(safe-area-inset-top))]">
          <FileText className="h-3.5 w-3.5 shrink-0 text-orange" />
          <span className="min-w-0 flex-1 truncate font-mono text-[12px] text-paper" title={display}>
            {display}
          </span>
          {!remote && (
            <button type="button" onClick={() => onCopy(`open ${display}`, 'Command copied.')} title={`Copy: open ${display}`} className="rounded-full border border-subtle p-1.5 text-muted hover:text-paper">
              <Copy className="h-3.5 w-3.5" />
            </button>
          )}
          <button type="button" onClick={onClose} aria-label="Close note" className="rounded-full border border-subtle p-1.5 text-muted hover:text-paper max-md:p-2.5">
            <X className="h-3.5 w-3.5" />
          </button>
        </header>
        <div className="hud-scroll min-h-0 flex-1 overflow-y-auto px-4 py-4" aria-live="polite" aria-busy={!current}>
          {!current ? (
            <p className="flex items-center gap-2 font-mono text-[11px] text-muted">
              <RefreshCw className="h-3 w-3 robo-spin" /> Loading note…
            </p>
          ) : current.error ? (
            <div className="flex flex-col items-start gap-2 rounded-md border border-[#EF4444]/40 bg-[#EF4444]/5 px-3 py-2.5">
              <p className="font-mono text-[11px] text-[#EF4444]">Couldn’t read the note: {current.error}</p>
              <button type="button" onClick={() => setAttempt((n) => n + 1)} className="font-mono text-[11px] uppercase tracking-[0.06em] text-muted hover:text-paper">
                Retry
              </button>
            </div>
          ) : (
            <>
              <p className="mb-3 flex items-center gap-1.5 font-mono text-[11px] uppercase tracking-[0.06em] text-muted">
                <Lock className="h-3 w-3" /> Read-only · updated {new Date(current.note!.mtime).toLocaleString()}
                {current.note!.truncated && ' · first 512 KB'}
              </p>
              <pre className="whitespace-pre-wrap break-words font-mono text-[12px] leading-relaxed text-secondary">{current.note!.content}</pre>
            </>
          )}
        </div>
      </aside>
    </div>
  );
}

export interface TaskAgentResult {
  id: string;
  prompt: string;
  opened: boolean;
  error: string | null;
}

/** What the drawer can do to an item; TasksApp does the requests, toasts and refresh. */
export interface TaskActions {
  /** `status:<s>`, `note`, `agent` while a request is in flight. */
  busy: string | null;
  onStatus: (item: ActionItem, status: ActionStatus) => void;
  /** Resolves true when the note was saved (the box is then cleared). */
  onNote: (item: ActionItem, note: string) => Promise<boolean>;
  /** `onMac` starts Claude Code in Terminal on the Mac; otherwise only the prompt comes back. */
  onAgent: (item: ActionItem, onMac: boolean) => void;
  agent: TaskAgentResult | null;
}

const MOVE_LABEL: Record<ActionStatus, string> = { done: 'Mark done', progress: 'In progress', blocked: 'Blocked', todo: 'Reopen', awaiting: 'Needs me' };
const MOVE_ORDER: ActionStatus[] = ['done', 'progress', 'blocked', 'todo', 'awaiting'];
const actBtn =
  'inline-flex min-h-9 items-center gap-1.5 rounded-full border px-3 font-mono text-[11px] font-semibold uppercase tracking-[0.06em] transition-colors disabled:opacity-50';

function ActPanel({ item, remote, act, onCopy }: { item: ActionItem; remote: boolean; act: TaskActions; onCopy: (text: string, what: string) => void }) {
  const [note, setNote] = useState('');
  const busy = act.busy;
  const agent = act.agent?.id === item.id ? act.agent : null;
  const save = async () => {
    if (await act.onNote(item, note)) setNote('');
  };
  return (
    <div className="flex flex-col gap-3 rounded-lg border border-orange/30 bg-orange/[0.04] p-3">
      <span className="hud-label">Act on it</span>
      <div className="flex flex-wrap gap-1.5" role="group" aria-label="Change status">
        {MOVE_ORDER.filter((s) => s !== item.status && ACTION_STATUSES.includes(s)).map((s) => (
          <button
            key={s}
            type="button"
            disabled={!!busy}
            onClick={() => act.onStatus(item, s)}
            className={cn(actBtn, 'border-subtle bg-panel-elevated text-secondary hover:border-highlight hover:text-paper')}
          >
            {busy === `status:${s}` ? <RefreshCw className="h-3 w-3 robo-spin" /> : <span className={cn('h-1.5 w-1.5 rounded-full', STATUS_STYLE[s].dot)} />}
            {MOVE_LABEL[s]}
          </button>
        ))}
      </div>
      <div className="flex flex-col gap-1.5">
        <label htmlFor={`note-${item.id}`} className="font-mono text-[11px] uppercase tracking-[0.06em] text-muted">
          {item.status === 'awaiting' ? 'Your answer or decision' : 'Add a note'}
        </label>
        <textarea
          id={`note-${item.id}`}
          value={note}
          onChange={(e) => setNote(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && (e.metaKey || e.ctrlKey) && note.trim()) void save();
          }}
          rows={2}
          maxLength={1000}
          placeholder={item.status === 'awaiting' ? 'e.g. Open-weight only; no government data enters the system.' : 'Saved under the item in actions.md'}
          className="w-full resize-y rounded-md border border-subtle bg-obsidian px-2.5 py-2 text-[13px] leading-snug text-paper placeholder:text-muted focus:border-orange/60 focus:outline-none max-md:text-[16px]"
        />
        <div className="flex flex-wrap items-center gap-1.5">
          {/* The one filled button: answering is the primary act once there is something to send. */}
          <button
            type="button"
            disabled={!!busy || !note.trim()}
            onClick={() => void save()}
            className={cn(actBtn, note.trim() ? 'border-orange bg-orange text-obsidian hover:bg-orange/90' : 'border-subtle bg-panel-elevated text-muted')}
          >
            {busy === 'note' ? <RefreshCw className="h-3 w-3 robo-spin" /> : <Send className="h-3 w-3" />} {item.status === 'awaiting' ? 'Send answer' : 'Save note'}
          </button>
          <button
            type="button"
            disabled={!!busy}
            onClick={() => act.onAgent(item, !remote)}
            title={remote ? 'Get a Claude Code prompt for this item, to copy or start on the Mac' : 'Open Claude Code in Terminal with this item (you approve each step)'}
            className={cn(actBtn, 'border-teal/50 bg-teal/10 text-teal hover:border-teal')}
          >
            {busy === 'agent' ? <RefreshCw className="h-3 w-3 robo-spin" /> : <Bot className="h-3 w-3" />} Solve with agent
          </button>
        </div>
      </div>
      {agent && (
        <div className="flex flex-col gap-2 rounded-md border border-subtle bg-panel px-2.5 py-2">
          <div className="flex flex-wrap items-center gap-1.5 font-mono text-[11px] text-paper">
            <Bot className="h-3.5 w-3.5 shrink-0 text-teal" />
            <span className="min-w-0 flex-1">
              {agent.opened ? 'Claude Code opened in Terminal on the Mac — approve its steps there' : agent.error ? `Couldn’t open Terminal (${agent.error})` : 'Prompt ready — copy it into Claude, or start it on the Mac'}
            </span>
            <button type="button" onClick={() => onCopy(agent.prompt, 'Prompt copied.')} className={cn(actBtn, 'border-subtle bg-panel-elevated text-secondary hover:text-paper')}>
              <Copy className="h-3 w-3" /> Copy prompt
            </button>
            {!agent.opened && (
              <button type="button" disabled={!!busy} onClick={() => act.onAgent(item, true)} className={cn(actBtn, 'border-subtle bg-panel-elevated text-secondary hover:text-paper')}>
                <Monitor className="h-3 w-3" /> Start on Mac
              </button>
            )}
          </div>
          <pre className="hud-scroll max-h-40 overflow-auto whitespace-pre-wrap break-words rounded border border-subtle bg-obsidian p-2 font-mono text-[11px] leading-relaxed text-secondary">{agent.prompt}</pre>
        </div>
      )}
    </div>
  );
}
