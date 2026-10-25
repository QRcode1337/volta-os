'use client';
import { memo } from 'react';
import { AlertTriangle, CircleDot, Info, MinusCircle } from 'lucide-react';
import { cn } from '@/lib/cn';
import { STATUS_LABEL, TRIAGE_LABEL, ago, type FeedListItem, type FeedStatus, type FeedTriage } from './feeds-client';

export function StatusDot({ status, className }: { status: FeedStatus | null; className?: string }) {
  const tone = status === 'error' ? 'bg-[#EF4444]' : status === 'skipped' ? 'bg-amber' : status === 'ok' ? 'bg-green' : 'bg-muted';
  return <span aria-label={status ? STATUS_LABEL[status] : 'No runs'} title={status ? STATUS_LABEL[status] : 'No runs'} className={cn('inline-block h-1.5 w-1.5 shrink-0 rounded-full', tone, className)} />;
}

export function TriageBadge({ triage, by, confidence, className }: { triage: FeedTriage | null; by: 'jev' | 'rule' | null; confidence?: number | null; className?: string }) {
  if (!triage) return null;
  const tone =
    triage === 'needs-action' ? 'border-amber/50 bg-amber/10 text-amber' : triage === 'fyi' ? 'border-teal/40 bg-teal/10 text-teal' : 'border-subtle bg-panel-elevated text-muted';
  const Icon = triage === 'needs-action' ? AlertTriangle : triage === 'fyi' ? Info : MinusCircle;
  const how = by === 'jev' ? `Classified by JEV${confidence ? ` (${Math.round(confidence * 100)}% confident)` : ''}` : 'Classified by a rule (failed run or empty output)';
  return (
    <span title={how} className={cn('inline-flex shrink-0 items-center gap-1 rounded-full border px-1.5 py-px font-mono text-[9.5px] font-semibold uppercase tracking-[0.05em]', tone, className)}>
      <Icon className="h-2.5 w-2.5" />
      {TRIAGE_LABEL[triage]}
      {by === 'jev' && <span className="text-[8px] opacity-70">jev</span>}
    </span>
  );
}

export const ItemRow = memo(function ItemRow({ it, active, now, onSelect }: { it: FeedListItem; active: boolean; now: number; onSelect: (id: string) => void }) {
  return (
    <li>
      <button
        type="button"
        data-item-id={it.id}
        onClick={() => onSelect(it.id)}
        aria-current={active ? 'true' : undefined}
        className={cn(
          'group relative flex w-full flex-col gap-1 border-b border-subtle px-4 py-3 text-left transition-colors',
          active ? 'bg-panel-elevated' : 'hover:bg-panel-hover/60',
        )}
      >
        {active && <span className="absolute inset-y-0 left-0 w-0.5 bg-orange" />}
        <span className="flex items-center gap-2">
          {!it.read ? <CircleDot className="h-3 w-3 shrink-0 text-orange" aria-label="Unread" /> : <span className="h-3 w-3 shrink-0" />}
          <StatusDot status={it.status} />
          <span className="min-w-0 truncate font-mono text-[10px] uppercase tracking-[0.06em] text-muted">{it.sourceLabel}</span>
          <span className="ml-auto shrink-0 font-mono text-[10px] text-muted" title={new Date(it.ranAt).toLocaleString()}>
            {ago(it.ranAt, now)}
          </span>
        </span>
        <span className={cn('line-clamp-2 pl-5 text-[13px] leading-snug', it.read ? 'text-secondary' : 'font-semibold text-paper')}>{it.title}</span>
        {it.excerpt && it.excerpt !== it.title && <span className="line-clamp-2 pl-5 text-[11.5px] leading-snug text-muted">{it.excerpt}</span>}
        {it.triage && (
          <span className="pl-5">
            <TriageBadge triage={it.triage} by={it.triageBy} confidence={it.triageConfidence} />
          </span>
        )}
      </button>
    </li>
  );
});
