'use client';
// Presentational pieces for VOLTA Tasks: status styling, inline `code` rendering, cards and the detail drawer.
import { useEffect, type ReactNode } from 'react';
import { AlertTriangle, ChevronDown, ChevronRight, Copy, ExternalLink, FileText, Lock, X } from 'lucide-react';
import { cn } from '@/lib/cn';
import { isStale, type ActionItem, type ActionStatus, type ActionsSource } from './types';

export interface StatusStyle {
  label: string;
  /** Column / chip accent text colour. */
  text: string;
  /** Card border + background. */
  card: string;
  dot: string;
}

export const STATUS_STYLE: Record<ActionStatus, StatusStyle> = {
  awaiting: { label: 'Awaiting Patrick', text: 'text-orange', card: 'border-orange/45 bg-orange/[0.07] hover:border-orange', dot: 'bg-orange' },
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
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full border px-1.5 py-px font-mono text-[10px]',
        stale ? 'border-amber/60 bg-amber/10 text-amber' : 'border-subtle text-muted',
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
      <p className="line-clamp-3 text-[12.5px] leading-snug text-paper">
        <Inline text={item.text} />
      </p>
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="rounded-full bg-panel-elevated px-1.5 py-px font-mono text-[10px] text-secondary">{item.agent}</span>
        <AgeChip item={item} staleDays={staleDays} />
        {item.notes.length > 0 && <FileText className="h-3 w-3 text-muted" aria-label="Has notes" />}
        <span className="ml-auto font-mono text-[10px] text-muted">L{item.line}</span>
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
      <span className="ml-auto rounded-full bg-panel-elevated px-1.5 font-mono text-[10px] text-muted">{count}</span>
      {onToggle && (collapsed ? <ChevronRight className="h-3.5 w-3.5 text-muted" /> : <ChevronDown className="h-3.5 w-3.5 text-muted" />)}
    </>
  );
  return (
    <section
      aria-label={st.label}
      className={cn(
        'flex min-w-0 flex-col rounded-xl border lg:min-h-0',
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
            <p className="px-2 py-4 text-center font-mono text-[10.5px] uppercase tracking-[0.06em] text-muted">
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
      <span className="text-[12.5px] text-paper">{children}</span>
    </div>
  );
}

export function TaskDetail({
  item,
  source,
  staleDays,
  onClose,
  onCopy,
}: {
  item: ActionItem;
  source: ActionsSource;
  staleDays: number;
  onClose: () => void;
  onCopy: (text: string, what: string) => void;
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
    <div className="fixed inset-0 z-50 flex justify-end">
      <button type="button" aria-label="Close detail" onClick={onClose} className="absolute inset-0 bg-black/50" />
      <aside role="dialog" aria-label="Task detail" className="relative flex h-full w-[560px] max-w-full flex-col border-l border-highlight bg-panel shadow-[0_0_60px_rgba(0,0,0,0.6)]">
        <header className="flex shrink-0 items-center gap-2 border-b border-subtle px-4 py-3">
          <span className={cn('h-2 w-2 rounded-full', st.dot)} />
          <span className={cn('font-mono text-[11px] font-semibold uppercase tracking-[0.08em]', st.text)}>{st.label}</span>
          {stale && (
            <span className="inline-flex items-center gap-1 rounded-full border border-amber/60 bg-amber/10 px-1.5 py-px font-mono text-[10px] text-amber">
              <AlertTriangle className="h-2.5 w-2.5" /> STALE {item.ageDays}d
            </span>
          )}
          <button type="button" onClick={onClose} aria-label="Close" className="ml-auto rounded-full border border-subtle p-1.5 text-muted hover:text-paper">
            <X className="h-3.5 w-3.5" />
          </button>
        </header>
        <div className="hud-scroll flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-4 py-4">
          <p className="text-[14px] leading-relaxed text-paper">
            <Inline text={item.text} />
          </p>
          {item.notes.length > 0 && (
            <div className="flex flex-col gap-1.5 rounded-lg border border-subtle bg-obsidian/60 p-3">
              <span className="hud-label">Notes</span>
              {item.notes.map((n, i) => (
                <p key={i} className="text-[12.5px] leading-snug text-secondary">
                  <Inline text={n} />
                </p>
              ))}
            </div>
          )}
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
            <p className="font-mono text-[11.5px] text-secondary">
              <span className="text-paper">actions.md</span> · section <span className="text-paper">## {item.section || '(none)'}</span> (line {item.sectionLine}) · item at <span className="text-paper">line {item.line}</span>
              <span className="text-muted"> · marker [{item.marker}]</span>
            </p>
            <button
              type="button"
              onClick={() => onCopy(source.openHint, 'Command copied.')}
              className="group mt-1 flex items-center gap-2 rounded-md border border-subtle bg-obsidian px-2.5 py-2 text-left font-mono text-[11.5px] text-paper hover:border-orange/60"
              title="Copy"
            >
              <span className="text-orange">$</span>
              <span className="min-w-0 flex-1 truncate">{source.openHint}</span>
              <Copy className="h-3.5 w-3.5 shrink-0 text-muted group-hover:text-orange" />
            </button>
            <p className="flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.06em] text-muted">
              <Lock className="h-3 w-3" /> Read-only: edit the file or ask OpenClaw to change status
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
                    onClick={() => onCopy(`open ${l.target}`, 'Command copied.')}
                    className="flex items-center gap-2 rounded-md border border-subtle px-2.5 py-1.5 text-left font-mono text-[11px] text-secondary hover:border-highlight hover:text-paper"
                    title={`Copy: open ${l.target}`}
                  >
                    <FileText className="h-3.5 w-3.5 shrink-0 text-muted" />
                    <span className="min-w-0 flex-1 truncate">{l.target}</span>
                    <Copy className="h-3 w-3 shrink-0 text-muted" />
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
