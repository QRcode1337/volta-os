'use client';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ExternalLink, FileText, Library, MonitorPlay, RefreshCw, Send } from 'lucide-react';
import type { NotionPageDoc, VpCatalog } from '@/types/notion';
import { HudPanel } from '@/components/robo-ui';
import { AppTopBar } from '@/components/elements/kit/AppTopBar';
import { ToastStack, useToasts } from '@/components/elements/kit/toast';
import { ExternalPill } from '@/components/notion/NotionBits';
import { useRemote } from '@/components/notion/useRemote';
import { pushToEditorInbox } from '@/lib/editor-inbox';
import { isTypingTarget } from '@/lib/events';
import { cn } from '@/lib/cn';
import { CatalogRail, type Selection } from './CatalogRail';
import { LedgerPanel } from './LedgerPanel';
import { OutlineView } from './OutlineView';
import { Teleprompter } from './Teleprompter';
import { WPM, buildEditorItems, computeTiming, docFromOutline, fmtClock } from './script-model';

const LAST_KEY = 'volta:scripts:last';

function readUrlSelection(): Selection | null {
  try {
    const q = new URLSearchParams(window.location.search);
    const ep = q.get('ep');
    if (ep && /^\d{1,3}$/.test(ep)) return { type: 'ep', key: `ep${ep}` };
    const page = q.get('page');
    if (page && /^[0-9a-f]{32}$/i.test(page)) return { type: 'page', id: page.toLowerCase(), title: 'Notion page' };
    const last = window.localStorage.getItem(LAST_KEY);
    if (last) return JSON.parse(last) as Selection;
  } catch {
    // no URL / storage: fall through to the default
  }
  return null;
}

export function ScriptsApp() {
  const catalog = useRemote<VpCatalog>('/api/notion/catalog');
  const [sel, setSel] = useState<Selection | null>(null);
  const [evidenceId, setEvidenceId] = useState<string | null>(null);
  const [prompterOpen, setPrompterOpen] = useState(false);
  const { toasts, push, dismiss } = useToasts();

  // restore the selection after mount (SSR renders the empty state)
  useEffect(() => setSel(readUrlSelection()), []);

  const cat = catalog.data;
  const episode = sel?.type === 'ep' ? (cat?.episodes.find((e) => e.key === sel.key) ?? null) : null;

  // default selection: the newest episode that has an outline
  useEffect(() => {
    if (!cat || sel) return;
    const pick = [...cat.episodes].reverse().find((e) => e.outline) ?? cat.episodes[cat.episodes.length - 1];
    if (pick) setSel({ type: 'ep', key: pick.key });
  }, [cat, sel]);

  const select = useCallback((s: Selection) => {
    setSel(s);
    setEvidenceId(null);
    try {
      window.localStorage.setItem(LAST_KEY, JSON.stringify(s));
      const u = new URL(window.location.href);
      u.search = s.type === 'ep' ? `?ep=${s.key.replace(/^ep/, '')}` : `?page=${s.id}`;
      window.history.replaceState(null, '', u);
    } catch {
      // storage / history unavailable
    }
  }, []);

  const centerId = sel?.type === 'page' ? sel.id : (episode?.outline?.id ?? null);
  const page = useRemote<NotionPageDoc>(centerId ? `/api/notion/page?id=${centerId}` : null);
  const ledgerId = evidenceId ?? (episode ? (episode.ledger?.id ?? null) : null);
  const ledger = useRemote<NotionPageDoc>(ledgerId ? `/api/notion/page?id=${ledgerId}` : null);

  const doc = useMemo(() => (page.data ? docFromOutline(page.data) : null), [page.data]);
  const timing = useMemo(() => (doc ? computeTiming(doc) : null), [doc]);

  const title = episode?.title ?? (sel?.type === 'page' ? sel.title : 'Script');

  const pushCues = () => {
    if (!doc || !timing) {
      push('This page has no voiceover sections to push (needs Cold open, Draft VO by beat or Ending).', { tone: 'error' });
      return;
    }
    const items = buildEditorItems(doc, timing, Date.now());
    const cueCount = items.reduce((a, it) => a + (it.cues?.length ?? 0), 0);
    const queued = pushToEditorInbox(items);
    push(`Pushed ${items.length} chapter hand-offs (${cueCount} cues) from “${doc.title}” to VOLTA Editor · ${queued} waiting.`, { tone: 'success', href: '/apps/editor', linkLabel: 'Open VOLTA Editor' });
  };

  const refresh = () => {
    catalog.reload(true);
    page.reload(true);
    ledger.reload(true);
    push('Refreshing from Notion (forced reloads are limited to one per 30 s per page).');
  };

  // "T" opens the teleprompter when not typing.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (prompterOpen || isTypingTarget(e.target) || e.metaKey || e.ctrlKey || e.altKey) return;
      if ((e.key === 't' || e.key === 'T') && doc) {
        e.preventDefault();
        setPrompterOpen(true);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [prompterOpen, doc]);

  const evidence = episode?.evidence ?? [];
  const pageData = page.data;

  return (
    <div className="flex h-screen w-screen flex-col overflow-hidden bg-obsidian text-paper">
      <AppTopBar
        accent="Scripts"
        subtitle="Notion outlines & source ledgers"
        center={cat ? <span className="hidden truncate font-mono text-[10px] text-muted lg:inline">Video Production · {cat.episodes.length} episodes · {cat.groups.reduce((n, g) => n + g.items.length, 0)} pages</span> : undefined}
        right={
          <>
            {timing && (
              <div className="mr-2 hidden items-center gap-4 2xl:flex">
                <Stat label="VO runtime" value={fmtClock(timing.totalSec)} />
                <Stat label="VO words" value={timing.totalWords.toLocaleString('en-US')} />
                <Stat label="Pace" value={`${WPM}`} unit="wpm" />
              </div>
            )}
            <button type="button" onClick={refresh} className="inline-flex h-8 items-center gap-1.5 rounded-full border border-subtle bg-panel-elevated px-3 font-mono text-[10px] font-semibold uppercase tracking-[0.08em] text-secondary transition-colors hover:border-highlight hover:text-paper" title="Re-read from Notion (otherwise cached for 10 minutes)">
              <RefreshCw className={cn('h-3.5 w-3.5', (page.status === 'loading' || catalog.status === 'loading') && 'robo-spin')} /> Refresh
            </button>
            <button
              type="button"
              disabled={!doc}
              onClick={() => setPrompterOpen(true)}
              className="inline-flex h-8 items-center gap-1.5 rounded-full border border-subtle bg-panel-elevated px-3 font-mono text-[10px] font-semibold uppercase tracking-[0.08em] text-secondary transition-colors hover:border-highlight hover:text-paper disabled:pointer-events-none disabled:opacity-40"
              title={doc ? 'Teleprompter (T)' : 'This page has no voiceover sections'}
            >
              <MonitorPlay className="h-3.5 w-3.5" /> Teleprompter
            </button>
            <button
              type="button"
              disabled={!doc}
              onClick={pushCues}
              className="inline-flex h-8 items-center gap-1.5 rounded-full bg-orange px-3.5 font-mono text-[10px] font-bold uppercase tracking-[0.08em] text-obsidian shadow-[0_0_18px_rgba(255,85,0,0.35)] transition hover:brightness-110 disabled:pointer-events-none disabled:opacity-40"
              title={doc ? 'Send each voiceover chapter to VOLTA Editor as cues' : 'This page has no voiceover sections'}
            >
              <Send className="h-3.5 w-3.5" /> Push Cues to VOLTA Editor
            </button>
          </>
        }
      />

      <main className="grid min-h-0 flex-1 grid-cols-1 gap-0 max-md:overflow-y-auto md:grid-cols-[280px_minmax(0,1fr)_minmax(320px,400px)]">
        <CatalogRail catalog={catalog} selection={sel} onSelect={select} />

        <section className="flex min-h-0 min-w-0 flex-col border-r border-subtle max-md:min-h-[80dvh] max-md:border-r-0 max-md:border-b" aria-label="Outline">
          {sel && sel.type === 'ep' && cat && !episode ? (
            <p className="m-4 text-[13px] text-muted">Episode not found in the Video Production index.</p>
          ) : sel?.type === 'ep' && episode && !episode.outline ? (
            <div className="m-4 rounded-lg border border-dashed border-subtle p-4 text-[13px] text-secondary">
              <p className="font-semibold text-paper">No script outline for {episode.title} yet.</p>
              <p className="mt-1 text-muted">The source ledger is on the right; the outline appears here as soon as a “Script Outline” page is added under Video Production.</p>
            </div>
          ) : !sel ? (
            <div className="flex flex-1 items-center justify-center font-mono text-[11px] text-muted">{catalog.status === 'error' ? '' : 'Loading the Video Production index…'}</div>
          ) : (
            <OutlineView page={page} fallbackTitle={title} fallbackUrl={centerId ? `https://www.notion.so/${centerId}` : null} timing={timing} />
          )}
        </section>

        <HudPanel
          title={episode ? (evidenceId ? 'Evidence' : 'Source Ledger') : 'Linked pages'}
          icon={episode ? <Library className="h-3.5 w-3.5" /> : <FileText className="h-3.5 w-3.5" />}
          className="min-h-0 rounded-none border-0 max-md:min-h-[60dvh]"
          bodyClassName="flex min-h-0 flex-1 flex-col"
        >
          {episode ? (
            <LedgerPanel ledger={ledger} evidence={evidence} evidenceId={evidenceId} onEvidence={setEvidenceId} fallbackTitle={episode.ledger?.title ?? `${episode.title} ledger`} fallbackUrl={ledgerId ? `https://www.notion.so/${ledgerId}` : null} />
          ) : (
            <LinkedPages page={pageData} onOpen={(id, t) => select({ type: 'page', id, title: t })} />
          )}
        </HudPanel>
      </main>

      {prompterOpen && doc && timing && <Teleprompter title={doc.title} timing={timing} onClose={() => setPrompterOpen(false)} />}
      <ToastStack toasts={toasts} onDismiss={dismiss} />
    </div>
  );
}

function LinkedPages({ page, onOpen }: { page: NotionPageDoc | null; onOpen: (id: string, title: string) => void }) {
  if (!page) return <p className="p-4 font-mono text-[11px] text-muted">Select a page on the left.</p>;
  return (
    <div className="hud-scroll min-h-0 flex-1 overflow-y-auto p-3">
      <p className="px-1 text-[12.5px] font-semibold text-paper">{page.title}</p>
      <p className="px-1 pb-2 font-mono text-[10px] text-muted">Only episodes have a source ledger. Pages linked from this one:</p>
      {page.children.length === 0 ? (
        <p className="px-1 font-mono text-[11px] text-muted">No linked pages.</p>
      ) : (
        <ul className="space-y-1">
          {page.children.map((c) => (
            <li key={c.id} className="flex items-center gap-1.5 rounded-md border border-subtle bg-obsidian/40 px-2.5 py-1.5">
              <button type="button" onClick={() => onOpen(c.id, c.title)} className="min-w-0 flex-1 truncate text-left text-[12px] font-medium text-secondary hover:text-paper" title={c.title}>
                {c.title}
              </button>
              <a href={c.url} target="_blank" rel="noreferrer noopener" aria-label={`Open ${c.title} in Notion`} className="shrink-0 text-muted hover:text-orange">
                <ExternalLink size={11} />
              </a>
            </li>
          ))}
        </ul>
      )}
      <div className="mt-3">
        <ExternalPill href={page.url} />
      </div>
    </div>
  );
}

function Stat({ label, value, unit }: { label: string; value: string; unit?: string }) {
  return (
    <div className="flex flex-col leading-none">
      <span className="font-mono text-[8.5px] font-semibold uppercase tracking-[0.12em] text-muted">{label}</span>
      <span className="mt-1 flex items-baseline gap-1">
        <span className="font-doto text-[16px] font-bold text-paper">{value}</span>
        {unit && <span className="font-mono text-[9px] text-muted">{unit}</span>}
      </span>
    </div>
  );
}
