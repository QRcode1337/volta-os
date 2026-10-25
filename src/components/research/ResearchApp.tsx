'use client';
// VOLTA Research: the research hub. Find any file, see what connects your folders, read the syntheses, check the indexer.
// Phase 1: no downloads and no reads of iCloud placeholders; the inventory is stat-only (see src/lib/server/research).
import { useCallback, useEffect, useState } from 'react';
import { BookOpen, Library, Network, Activity } from 'lucide-react';
import { cn } from '@/lib/cn';
import { AppTopBar } from '@/components/elements/kit/AppTopBar';
import { ToastStack, useToasts } from '@/components/elements/kit/toast';
import { DocPanel } from './DocPanel';
import { LibraryView } from './LibraryView';
import { StatusView } from './StatusView';
import { SynthesesView } from './SynthesesView';
import { ThreadsView } from './ThreadsView';
import type { Facets, InventoryState } from './types';

type Tab = 'library' | 'threads' | 'syntheses' | 'status';
const TABS: { id: Tab; label: string; icon: typeof Library }[] = [
  { id: 'library', label: 'Library', icon: Library },
  { id: 'threads', label: 'Threads', icon: Network },
  { id: 'syntheses', label: 'Syntheses', icon: BookOpen },
  { id: 'status', label: 'Status', icon: Activity },
];
const TAB_KEY = 'volta:research:tab';
const isTab = (v: string | null): v is Tab => v === 'library' || v === 'threads' || v === 'syntheses' || v === 'status';

export function ResearchApp() {
  const { toasts, push, dismiss } = useToasts();
  const [tab, setTab] = useState<Tab>('library');
  const [docId, setDocId] = useState<string | null>(null);
  const [meta, setMeta] = useState<{ facets: Facets; inv: InventoryState } | null>(null);

  useEffect(() => {
    const fromHash = window.location.hash.replace('#', '');
    if (isTab(fromHash)) setTab(fromHash);
    else
      try {
        const stored = window.localStorage.getItem(TAB_KEY);
        if (isTab(stored)) setTab(stored);
      } catch {
        // storage unavailable
      }
  }, []);
  const changeTab = (t: Tab) => {
    setTab(t);
    try {
      window.localStorage.setItem(TAB_KEY, t);
      window.history.replaceState(null, '', `#${t}`);
    } catch {
      // storage / history unavailable
    }
  };

  const onCopied = useCallback((ok: boolean, what: string) => push(ok ? `${what}: copied.` : 'Copy failed; select the text instead.', { tone: ok ? 'success' : 'error' }), [push]);
  const onMeta = useCallback((facets: Facets, inv: InventoryState) => setMeta({ facets, inv }), []);

  const storageCount = (k: string) => meta?.facets.storage.find((s) => s.key === k)?.count ?? 0;

  return (
    <div className="flex h-screen w-screen flex-col overflow-hidden bg-obsidian text-paper">
      <AppTopBar
        accent="Research"
        subtitle="Find it once · see what connects"
        right={
          meta && (
            <span className="hud-label hidden md:inline">
              {meta.inv.files.toLocaleString()} files · <span className="text-green">{storageCount('local').toLocaleString()} local</span> · <span className="text-amber">{storageCount('icloud').toLocaleString()} in iCloud</span>
            </span>
          )
        }
      />
      <nav className="flex shrink-0 gap-1 border-b border-subtle bg-panel/60 px-4 pt-2" aria-label="Research sections" role="tablist">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={tab === t.id}
            onClick={() => changeTab(t.id)}
            className={cn(
              '-mb-px flex h-9 items-center gap-2 rounded-t-lg border border-b-0 px-4 text-[13px] font-semibold transition-colors',
              tab === t.id ? 'border-subtle bg-obsidian text-paper' : 'border-transparent text-secondary hover:text-paper',
            )}
          >
            <t.icon className={cn('h-3.5 w-3.5', tab === t.id && 'text-orange')} />
            {t.label}
          </button>
        ))}
      </nav>

      {/* The library stays mounted so its query and scroll position survive a tab switch. */}
      <div className={cn('min-h-0 flex-1 flex-col', tab === 'library' ? 'flex' : 'hidden')}>
        <LibraryView activeId={docId} onOpen={setDocId} onCopied={onCopied} onMeta={onMeta} />
      </div>
      {tab === 'threads' && <ThreadsView onOpenDoc={setDocId} />}
      {tab === 'syntheses' && <SynthesesView onCopied={onCopied} />}
      {tab === 'status' && <StatusView />}

      {docId && <DocPanel id={docId} onClose={() => setDocId(null)} onOpen={setDocId} onCopied={onCopied} />}
      <ToastStack toasts={toasts} onDismiss={dismiss} />
    </div>
  );
}

export default ResearchApp;
