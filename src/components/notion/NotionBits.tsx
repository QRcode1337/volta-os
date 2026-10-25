'use client';
// Small shared pieces for the Notion-backed apps: no-access notice, pinned links, Dreams panel, date formatting.
import { ExternalLink, Lock, TriangleAlert } from 'lucide-react';
import type { DreamEntry, NotionLink } from '@/types/notion';
import { cn } from '@/lib/cn';
import { useRemote } from './useRemote';

export const NOTION_SHARE_HINT = 'Share this page with the VOLTA integration: in Notion open the page, then ••• → Connections → add VOLTA.';

export function fmtDay(iso: string | null | undefined): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

export function ExternalPill({ href, label = 'Open in Notion', className }: { href: string; label?: string; className?: string }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer noopener"
      className={cn('inline-flex h-6 shrink-0 items-center gap-1 whitespace-nowrap rounded-full border border-subtle bg-panel-elevated px-2.5 font-mono text-[10px] font-semibold uppercase tracking-[0.08em] text-secondary transition-colors hover:border-orange/60 hover:text-orange', className)}
    >
      {label} <ExternalLink size={10} />
    </a>
  );
}

/** A page the integration cannot read, with the fix. */
export function NoAccessNotice({ title, url, hint }: { title?: string; url?: string; hint?: string }) {
  return (
    <div role="alert" className="m-4 rounded-lg border border-amber/40 bg-amber/5 p-4">
      <p className="flex items-center gap-2 text-[13px] font-semibold text-amber">
        <Lock size={14} /> {title ? `“${title}” is not shared with the VOLTA integration` : 'This page is not shared with the VOLTA integration'}
      </p>
      <p className="mt-1.5 text-[12.5px] leading-relaxed text-secondary">{hint ?? NOTION_SHARE_HINT}</p>
      {url && <ExternalPill href={url} className="mt-3" />}
    </div>
  );
}

export function ErrorNotice({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div role="alert" className="m-4 flex items-start gap-2 rounded-lg border border-[#EF4444]/40 bg-[#1F0F0F] p-3 text-[12.5px] text-paper">
      <TriangleAlert size={14} className="mt-0.5 shrink-0 text-[#EF4444]" />
      <span>
        {message}
        {onRetry && (
          <button type="button" onClick={onRetry} className="ml-2 text-orange underline">
            Retry
          </button>
        )}
      </span>
    </div>
  );
}

export function Skeleton({ lines = 6 }: { lines?: number }) {
  return (
    <div className="space-y-2.5 p-4" aria-busy>
      {Array.from({ length: lines }, (_, i) => (
        <div key={i} className="h-3 animate-pulse rounded bg-panel-hover/70" style={{ width: `${92 - ((i * 17) % 40)}%` }} />
      ))}
    </div>
  );
}

export function PinnedLinks() {
  const r = useRemote<{ links: NotionLink[] }>('/api/notion/links');
  const links = r.data?.links ?? [];
  if (!links.length) return null;
  return (
    <div>
      <p className="hud-label mb-1.5 px-1 !text-[9.5px]">Pinned in Notion</p>
      <ul className="space-y-1">
        {links.map((l) => (
          <li key={l.url}>
            <a href={l.url} target="_blank" rel="noreferrer noopener" className="group flex items-center gap-2 rounded-md border border-subtle bg-obsidian/40 px-2.5 py-1.5 text-[12px] text-secondary transition-colors hover:border-orange/50 hover:text-paper">
              <span className="min-w-0 flex-1 truncate font-medium">{l.label}</span>
              <span className="font-mono text-[9px] uppercase text-muted">{l.kind}</span>
              <ExternalLink size={11} className="shrink-0 text-muted group-hover:text-orange" />
            </a>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Newest five Dreams entries (read-only): title + date. */
export function DreamsPanel() {
  const r = useRemote<{ entries: DreamEntry[] }>('/api/notion/dreams');
  return (
    <div>
      <p className="hud-label mb-1.5 flex items-center px-1 !text-[9.5px]">
        Dreams · newest 5<span className="ml-auto font-mono text-[9px] normal-case tracking-normal text-muted">read-only</span>
      </p>
      {r.status === 'loading' && <Skeleton lines={3} />}
      {r.status === 'error' && (
        <p className="px-1 font-mono text-[10.5px] leading-snug text-muted">{r.noAccess ? 'The Dreams database is not shared with the VOLTA integration.' : `Could not load Dreams: ${r.error}`}</p>
      )}
      {r.data && r.data.entries.length === 0 && <p className="px-1 font-mono text-[10.5px] text-muted">No entries yet.</p>}
      <ul className="space-y-1">
        {r.data?.entries.map((e) => (
          <li key={e.id}>
            <a href={e.url} target="_blank" rel="noreferrer noopener" className="block rounded-md border border-subtle bg-obsidian/40 px-2.5 py-1.5 transition-colors hover:border-orange/50">
              <span className="block truncate text-[12px] font-medium text-paper">{e.title}</span>
              <span className="font-mono text-[9.5px] text-muted">
                {fmtDay(e.date)}
                {e.dateSource === 'created' ? ' · created' : ''}
              </span>
            </a>
          </li>
        ))}
      </ul>
    </div>
  );
}
