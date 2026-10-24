'use client';

import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { ArrowUpRight, ChevronDown, Database } from 'lucide-react';
import { HudPanel } from '@/components/robo-ui';
import type { MemorySource } from '@/types/sources';
import { cn } from '@/lib/cn';
import { useNow } from './hooks';
import { refreshSources, useMemorySources } from './left-sources';
import { CopyHintButton, STATUS_META, StatusDot } from './left-ui';
import { checkedAtOf, maskSecrets, relativeAgo, sourceFacts, type FactTone, type SourceFact } from './source-facts';

const TONE_CLS: Record<FactTone, string> = { ok: 'text-green', warn: 'text-amber', bad: 'text-[#EF4444]' };

/**
 * Home left-column bottom panel: live status of every memory / data source from /api/sources (shared store,
 * 60s poll, paused while the tab is hidden). One 22px line per source (8 rows ≈ 184px of body):
 * dot · name · [detail | setup hint] · headline · ⌄. The middle slot shows the setup hint (offline /
 * not-connected / stale) or, when the panel is wide enough (container ≥ 24rem), the detail. The chevron
 * expands one row in place to show its full detail plus any extra facts the server sends (Honcho counts,
 * claude-mem latest, ingest backlog, …; read defensively by sourceFacts). The tooltip carries everything too.
 * Opening a row never grows the panel: the list is capped at its collapsed height (measured on the first open)
 * and scrolls inside it, so MICRO APPS above keeps its space and the left column doesn't jump.
 */
export function MemorySourcesWidget({ className }: { className?: string }) {
  const { sources, error, loading } = useMemorySources();
  const [openId, setOpenId] = useState<MemorySource['id'] | null>(null);
  // Collapsed scroll-region height, captured when the first row opens; null while every row is closed.
  const [lockH, setLockH] = useState<number | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const toggle = (id: MemorySource['id']) => {
    if (openId === id) {
      setOpenId(null);
      setLockH(null);
      return;
    }
    if (openId === null) setLockH(scrollRef.current ? scrollRef.current.offsetHeight : null);
    setOpenId(id);
  };
  const now = useNow(60_000); // null until mounted: relative times render only on the client
  const live = sources?.filter((s) => s.status === 'live').length ?? 0;
  const syncing = loading && !!sources;

  let content: ReactNode;
  if (!sources && loading) {
    content = <SkeletonRows />;
  } else if (!sources) {
    content = (
      <div className="flex h-full min-h-[120px] flex-col items-center justify-center gap-2 px-4 text-center">
        <span className="flex items-center gap-2 font-mono text-[11px] font-semibold uppercase tracking-[0.08em] text-[#EF4444]">
          <StatusDot status="offline" /> Sources API unreachable
        </span>
        <span className="line-clamp-2 font-mono text-[10px] text-muted" title={error ?? undefined}>
          {error ?? 'No response from /api/sources'}
        </span>
        <button
          type="button"
          onClick={() => void refreshSources()}
          className="rounded-full border border-subtle bg-panel-elevated px-2.5 py-1 font-mono text-[10px] font-semibold uppercase tracking-[0.08em] text-secondary transition-colors hover:border-highlight hover:text-paper"
        >
          Retry
        </button>
      </div>
    );
  } else if (sources.length === 0) {
    content = (
      <div className="flex h-full min-h-[60px] items-center justify-center font-mono text-[10px] uppercase tracking-[0.08em] text-muted">
        No sources reported
      </div>
    );
  } else {
    content = (
      <ul className="@container flex flex-col">
        {sources.map((s) => (
          <SourceRow
            key={s.id}
            source={s}
            open={openId === s.id}
            onToggle={() => toggle(s.id)}
            nowMs={now ? now.getTime() : null}
          />
        ))}
      </ul>
    );
  }

  return (
    <HudPanel
      title="MEMORY SOURCES"
      icon={<Database size={14} strokeWidth={2.2} />}
      headerExtra={
        sources ? (
          // Constant text + nowrap: refresh state shows as a pulse/colour change, never a width change
          // (extra width would truncate the title at 1280px).
          <span
            className={cn(
              'whitespace-nowrap font-mono text-[10px] transition-colors',
              syncing ? 'animate-pulse text-orange' : error ? 'text-amber' : 'text-muted',
            )}
            title={
              syncing
                ? 'Refreshing…'
                : error
                  ? `Showing last good data — refresh failed: ${error}`
                  : `${live} of ${sources.length} sources live`
            }
          >
            {live}/{sources.length} LIVE{error && !syncing ? '!' : ''}
          </span>
        ) : null
      }
      // Label stays constant: HudPanel keys pills by label, so changing it would remount the button and drop focus.
      actions={[{ label: 'REFRESH', onClick: () => void refreshSources() }]}
      className={className}
      bodyClassName="flex flex-col"
    >
      {/* The one scroll region (flex-1 + min-h-0, so a short viewport shrinks it too). */}
      <div
        ref={scrollRef}
        className="hud-scroll min-h-0 flex-1 overflow-y-auto px-1.5 py-1"
        style={lockH !== null && openId !== null ? { maxHeight: lockH } : undefined}
      >
        {content}
      </div>
    </HudPanel>
  );
}

const factText = (f: SourceFact, nowMs: number | null) => (f.iso ? (nowMs !== null ? relativeAgo(f.iso, nowMs) : '…') : f.value);
const factLine = (f: SourceFact, nowMs: number | null) => `${f.label}: ${factText(f, nowMs)}${f.note ? ` (${f.note})` : ''}`;

function SourceRow({
  source: s,
  open,
  onToggle,
  nowMs,
}: {
  source: MemorySource;
  open: boolean;
  onToggle: () => void;
  nowMs: number | null;
}) {
  const meta = STATUS_META[s.status] ?? STATUS_META.offline;
  // Display copies of the free-text fields, masked client-side as well (a claude-mem title can quote a key).
  const headline = useMemo(() => maskSecrets(s.headline ?? ''), [s.headline]);
  const detail = useMemo(() => maskSecrets(s.detail ?? ''), [s.detail]);
  const setupHint = useMemo(() => (s.setupHint ? maskSecrets(s.setupHint) : ''), [s.setupHint]);
  const hint = setupHint && (s.status === 'offline' || s.status === 'not-connected' || s.status === 'stale') ? setupHint : null;
  const copyable = !!hint && s.status !== 'stale';
  const notConnected = s.status === 'not-connected';
  // "Not connected" headline only repeats the grey dot; the setup hint takes its place.
  const showHeadline = !(notConnected && hint);
  const facts = useMemo(() => sourceFacts(s), [s]);
  const checkedAt = checkedAtOf(s);
  const detailsId = `memsrc-${s.id}-details`;
  const rowRef = useRef<HTMLLIElement>(null);
  useEffect(() => {
    if (open) rowRef.current?.scrollIntoView({ block: 'nearest' });
  }, [open]);
  const tooltip = [
    `${s.name} — ${meta.label}`,
    headline,
    detail,
    ...facts.map((f) => factLine(f, nowMs)),
    setupHint,
    checkedAt && nowMs !== null ? `checked ${relativeAgo(checkedAt, nowMs)}` : '',
  ]
    .filter(Boolean)
    .join('\n');

  const body = (
    <>
      <StatusDot status={s.status} />
      <span
        className={cn(
          // The name keeps its width (all are short); a long headline truncates first.
          'max-w-[48%] shrink-0 truncate text-[12px] font-semibold leading-[14px]',
          notConnected ? 'text-secondary' : 'text-paper',
        )}
      >
        {s.name}
      </span>
      {hint ? (
        <span
          className={cn(
            'min-w-0 flex-1 truncate font-mono text-[9.5px] leading-[14px]',
            s.status === 'stale' ? 'text-amber' : s.status === 'offline' ? 'text-[#EF4444]/85' : 'text-muted',
          )}
        >
          {hint}
        </span>
      ) : (
        <span className="hidden min-w-0 flex-1 truncate text-[10.5px] leading-[14px] text-muted transition-colors group-hover:text-secondary @sm:block">
          {detail}
        </span>
      )}
      {!hint && <span className="flex-1 @sm:hidden" />}
      {showHeadline && (
        <span
          className={cn(
            'min-w-0 max-w-[60%] shrink truncate font-mono text-[10.5px] font-semibold leading-[14px] tabular-nums',
            s.status === 'live' ? 'text-orange' : notConnected ? 'text-muted' : 'text-secondary',
          )}
        >
          {headline}
        </span>
      )}
      {s.href && (
        <ArrowUpRight
          size={12}
          aria-hidden
          className="-ml-1 shrink-0 text-muted opacity-0 transition-opacity group-hover:text-orange group-hover:opacity-100"
        />
      )}
    </>
  );

  return (
    <li
      ref={rowRef}
      className={cn(
        'rounded-md border transition-colors',
        open ? 'border-subtle bg-panel-hover/60' : 'border-transparent hover:border-subtle hover:bg-panel-hover',
      )}
    >
      <div className="group flex items-center">
        <SourceLink
          href={s.href}
          external={s.external}
          className="flex min-w-0 flex-1 items-center gap-2 rounded-md px-2 py-[3px] outline-none focus-visible:ring-1 focus-visible:ring-orange/60"
          title={tooltip}
        >
          {body}
        </SourceLink>
        {/* Outside the link: a <button> may not sit inside an <a>. */}
        {copyable && <CopyHintButton hint={hint!} className="mr-1" />}
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={open}
          aria-controls={open ? detailsId : undefined}
          aria-label={`${open ? 'Hide' : 'Show'} ${s.name} details`}
          title={open ? 'Hide details' : `Details${facts.length ? ` · ${facts.length} more fact${facts.length === 1 ? '' : 's'}` : ''}`}
          className={cn(
            'mr-1 inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-[5px] transition-colors outline-none focus-visible:ring-1 focus-visible:ring-orange/60',
            open ? 'text-orange' : 'text-muted/70 hover:text-paper group-hover:text-secondary',
          )}
        >
          <ChevronDown size={11} strokeWidth={2.4} className={cn('transition-transform', open && 'rotate-180')} />
        </button>
      </div>
      {open && (
        <div id={detailsId} className="selectable flex flex-col gap-1 px-2 pb-1.5 pl-[23px]">
          {detail && <p className="text-[10.5px] leading-[14px] text-secondary">{detail}</p>}
          {facts.length > 0 && (
            <dl className="flex flex-wrap gap-x-3 gap-y-0.5 font-mono text-[9.5px] leading-[13px]">
              {facts.map((f) => (
                <div key={f.key} className="flex min-w-0 max-w-full items-baseline gap-1" title={factLine(f, nowMs)}>
                  <dt className="shrink-0 text-muted">{f.label}</dt>
                  <dd className={cn('min-w-0 truncate font-semibold tabular-nums', f.tone ? TONE_CLS[f.tone] : 'text-paper')}>
                    {factText(f, nowMs)}
                    {f.note && <span className="ml-1 font-normal text-muted">({f.note})</span>}
                  </dd>
                </div>
              ))}
            </dl>
          )}
          {setupHint && (
            <p className={cn('font-mono text-[9.5px] leading-[13px]', s.status === 'offline' ? 'text-[#EF4444]/85' : 'text-amber')}>
              {setupHint}
            </p>
          )}
          {!detail && facts.length === 0 && !setupHint && (
            <p className="text-[10.5px] leading-[14px] text-muted">No further detail reported.</p>
          )}
          {checkedAt && nowMs !== null && (
            <p className="font-mono text-[9px] leading-[12px] text-muted" title={checkedAt}>
              checked {relativeAgo(checkedAt, nowMs)}
            </p>
          )}
        </div>
      )}
    </li>
  );
}

function SourceLink({
  href,
  external,
  className,
  title,
  children,
}: {
  href?: string;
  external?: boolean;
  className: string;
  title: string;
  children: ReactNode;
}) {
  if (!href) {
    return (
      <div className={cn(className, 'cursor-default')} title={title}>
        {children}
      </div>
    );
  }
  if (!external && href.startsWith('/') && !href.startsWith('//')) {
    return (
      <Link href={href} className={className} title={title}>
        {children}
      </Link>
    );
  }
  const web = /^https?:\/\//.test(href);
  return (
    <a href={href} className={className} title={title} {...(web ? { target: '_blank', rel: 'noreferrer noopener' } : {})}>
      {children}
    </a>
  );
}

function SkeletonRows() {
  return (
    <ul className="flex flex-col" aria-label="Loading memory sources">
      {Array.from({ length: 8 }, (_, i) => (
        <li key={i} className="flex h-[22px] items-center gap-2 px-2">
          <span className="h-[7px] w-[7px] shrink-0 animate-pulse rounded-full bg-subtle" />
          <span className="h-2.5 animate-pulse rounded bg-subtle/80" style={{ width: `${26 + ((i * 17) % 22)}%` }} />
          <span className="ml-auto h-2.5 w-14 animate-pulse rounded bg-subtle/60" />
        </li>
      ))}
    </ul>
  );
}

export default MemorySourcesWidget;
