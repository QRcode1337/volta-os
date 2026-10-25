'use client';
import { BookOpen, FileText, Film, Lightbulb, Lock, Sparkles, Zap } from 'lucide-react';
import type { ReactNode } from 'react';
import type { VpCatalog, VpGroupKind, VpItem } from '@/types/notion';
import { cn } from '@/lib/cn';
import { DreamsPanel, ErrorNotice, PinnedLinks, Skeleton } from '@/components/notion/NotionBits';
import type { Remote } from '@/components/notion/useRemote';

export type Selection = { type: 'ep'; key: string } | { type: 'page'; id: string; title: string };

const GROUP_ICON: Record<VpGroupKind, ReactNode> = {
  series: <Film size={12} />,
  project: <BookOpen size={12} />,
  shorts: <Zap size={12} />,
  ideas: <Lightbulb size={12} />,
  playbooks: <Sparkles size={12} />,
  other: <FileText size={12} />,
};

function Row({ active, onClick, title, sub, badge }: { active: boolean; onClick: () => void; title: string; sub?: string; badge?: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-current={active ? 'page' : undefined}
      className={cn(
        'group relative flex w-full items-start gap-2 rounded-md border px-2.5 py-1.5 text-left transition-colors',
        active ? 'border-orange/60 bg-panel-elevated' : 'border-transparent hover:border-subtle hover:bg-panel-elevated/60',
      )}
    >
      {active && <span className="absolute inset-y-2 left-0 w-[3px] rounded-r bg-orange" />}
      <span className="min-w-0 flex-1">
        <span className={cn('block truncate text-[12.5px] font-semibold', active ? 'text-paper' : 'text-secondary group-hover:text-paper')} title={title}>
          {title}
        </span>
        {sub && <span className="block truncate font-mono text-[9.5px] text-muted">{sub}</span>}
      </span>
      {badge}
    </button>
  );
}

const shortTitle = (it: VpItem) =>
  it.title
    .replace(/^Internet Lore Series\s*[—-]\s*/i, '')
    .replace(/\s*v0\.1\b/i, '')
    .trim();

export function CatalogRail({ catalog, selection, onSelect }: { catalog: Remote<VpCatalog>; selection: Selection | null; onSelect: (s: Selection) => void }) {
  const c = catalog.data;
  return (
    <aside className="hud-scroll flex min-h-0 flex-col gap-4 overflow-y-auto border-r border-subtle bg-panel p-3">
      {catalog.status === 'loading' && !c && <Skeleton lines={9} />}
      {catalog.status === 'error' && <ErrorNotice message={catalog.notConfigured ? 'NOTION_TOKEN is not set in .env.local, so Notion content cannot load.' : `Could not read the Video Production index: ${catalog.error}`} onRetry={() => catalog.reload()} />}

      {c && c.episodes.length > 0 && (
        <section>
          <p className="hud-label mb-1.5 flex items-center gap-1.5 px-1 !text-[9.5px]">
            {GROUP_ICON.series} The Internet Lore series
          </p>
          <div className="space-y-0.5">
            {c.episodes.map((e) => (
              <Row
                key={e.key}
                active={selection?.type === 'ep' && selection.key === e.key}
                onClick={() => onSelect({ type: 'ep', key: e.key })}
                title={e.title}
                sub={[e.outline ? 'outline' : null, e.ledger ? 'ledger' : null, e.evidence.length ? `${e.evidence.length} evidence` : null].filter(Boolean).join(' · ') || 'no pages yet'}
                badge={!e.outline ? <span className="mt-0.5 rounded bg-amber/10 px-1 font-mono text-[8.5px] font-bold text-amber">NO OUTLINE</span> : undefined}
              />
            ))}
          </div>
        </section>
      )}

      {c?.groups
        .filter((g) => g.items.length > 0)
        .map((g) => (
          <section key={g.key}>
            <p className="hud-label mb-1.5 flex items-center gap-1.5 px-1 !text-[9.5px]">
              {GROUP_ICON[g.kind]} {g.label}
            </p>
            <div className="space-y-0.5">
              {g.items.map((it) => (
                <Row key={it.id} active={selection?.type === 'page' && selection.id === it.id} onClick={() => onSelect({ type: 'page', id: it.id, title: it.title })} title={shortTitle(it)} />
              ))}
            </div>
          </section>
        ))}

      {c && c.inaccessible.length > 0 && (
        <section>
          <p className="hud-label mb-1.5 flex items-center gap-1.5 px-1 !text-[9.5px] !text-amber">
            <Lock size={12} /> Not shared with VOLTA
          </p>
          <ul className="space-y-1">
            {c.inaccessible.map((n) => (
              <li key={n.id} className="rounded-md border border-amber/30 bg-amber/5 px-2.5 py-1.5">
                <a href={n.url} target="_blank" rel="noreferrer noopener" className="block truncate text-[12px] font-medium text-amber hover:underline" title={n.title}>
                  {n.title}
                </a>
                <span className="font-mono text-[9.5px] leading-snug text-muted">{n.hint}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {c?.source === 'fallback' && <p className="px-1 font-mono text-[10px] leading-snug text-amber">The index could not be read, so this list is the built-in set of known pages.</p>}

      <div className="mt-auto space-y-4 border-t border-subtle pt-3">
        <PinnedLinks />
        <DreamsPanel />
      </div>
    </aside>
  );
}
