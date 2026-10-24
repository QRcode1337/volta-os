'use client';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Clapperboard, FileText, ListOrdered, MonitorPlay, Send, Sparkles } from 'lucide-react';
import { HudPanel } from '@/components/robo-ui';
import { pushToEditorInbox } from '@/lib/editor-inbox';
import { isTypingTarget } from '@/lib/events';
import { cn } from '@/lib/cn';
import { AppTopBar } from '@/components/elements/kit/AppTopBar';
import { ToastStack, useToasts } from '@/components/elements/kit/toast';
import { AvScriptTable } from './AvScriptTable';
import { ChapterOutline } from './ChapterOutline';
import { HookLab } from './HookLab';
import { Teleprompter } from './Teleprompter';
import type { ScriptDoc, ScriptRow } from './script-model';
import {
  SCRIPT_TOPICS,
  SEED_SCRIPTS,
  WPM,
  activeHook,
  buildEditorItems,
  computeTiming,
  fmtClock,
  generateWildcards,
  newRowId,
  orderedRows,
  seedById,
} from './script-model';

const STORAGE_KEY = 'rubric:scripts:v1';

interface PersistedState {
  activeId: string;
  docs: Record<string, ScriptDoc>;
}

function seedState(): PersistedState {
  return { activeId: SEED_SCRIPTS[0].id, docs: Object.fromEntries(SEED_SCRIPTS.map((d) => [d.id, d])) };
}

function isValidState(v: unknown): v is PersistedState {
  if (!v || typeof v !== 'object') return false;
  const s = v as PersistedState;
  return typeof s.activeId === 'string' && !!s.docs && typeof s.docs === 'object' && !!s.docs[s.activeId]?.chapters;
}

export function ScriptsApp() {
  const [state, setState] = useState<PersistedState>(seedState);
  const [hydrated, setHydrated] = useState(false);
  const [prompterOpen, setPrompterOpen] = useState(false);
  const [flashChapter, setFlashChapter] = useState<string | null>(null);
  const { toasts, push, dismiss } = useToasts();
  const tableScrollRef = useRef<HTMLDivElement>(null);
  const chapterRefs = useRef(new Map<string, HTMLElement>());

  // Load persisted drafts after mount (initial render = seed, so SSR and client match).
  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed: unknown = JSON.parse(raw);
        if (isValidState(parsed)) {
          // Merge so newly added seed scripts still appear.
          setState({ activeId: parsed.activeId, docs: { ...seedState().docs, ...parsed.docs } });
        }
      }
    } catch {
      // corrupted storage — keep seed
    }
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch {
      // quota / private mode — drafts just won't persist
    }
  }, [state, hydrated]);

  const doc = state.docs[state.activeId] ?? SEED_SCRIPTS[0];
  const timing = useMemo(() => computeTiming(doc), [doc]);
  const hook = activeHook(doc);

  const updateDoc = useCallback((fn: (d: ScriptDoc) => ScriptDoc) => {
    setState((s) => ({ ...s, docs: { ...s.docs, [s.activeId]: fn(s.docs[s.activeId]) } }));
  }, []);

  // ── hooks ──
  const selectHook = (id: string) => updateDoc((d) => ({ ...d, activeHookId: id }));
  const regenerateWildcards = () => {
    updateDoc((d) => {
      const seed = d.wildcardSeed + 1;
      const fresh = generateWildcards(seed, SCRIPT_TOPICS[d.id] ?? 'this system');
      const oldWild = d.hooks.filter((h) => h.kind === 'wildcard');
      const activeSlot = oldWild.findIndex((h) => h.id === d.activeHookId);
      return {
        ...d,
        wildcardSeed: seed,
        hooks: [...d.hooks.filter((h) => h.kind === 'tone'), ...fresh],
        activeHookId: activeSlot >= 0 ? fresh[activeSlot].id : d.activeHookId,
      };
    });
    push('Rolled 2 fresh /wildcard hooks (deterministic seed).');
  };

  // ── chapters ──
  const moveChapter = useCallback(
    (id: string, to: number) =>
      updateDoc((d) => {
        const from = d.chapters.findIndex((c) => c.id === id);
        if (from < 0 || to < 0 || to >= d.chapters.length || from === to) return d;
        const chapters = [...d.chapters];
        const [m] = chapters.splice(from, 1);
        chapters.splice(to, 0, m);
        return { ...d, chapters };
      }),
    [updateDoc],
  );
  const renameChapter = (id: string, title: string) =>
    updateDoc((d) => ({ ...d, chapters: d.chapters.map((c) => (c.id === id ? { ...c, title } : c)) }));
  const addChapter = () => {
    const chId = `ch-${newRowId()}`;
    updateDoc((d) => ({
      ...d,
      chapters: [...d.chapters, { id: chId, title: 'New Chapter' }],
      rows: [...d.rows, { id: newRowId(), chapterId: chId, voiceover: '', visualCue: '' }],
    }));
    setTimeout(() => jumpToChapter(chId), 50);
  };
  const jumpToChapter = (id: string) => {
    const el = chapterRefs.current.get(id);
    const scroller = tableScrollRef.current;
    if (el && scroller) {
      scroller.scrollTo({ top: el.offsetTop - 36, behavior: 'smooth' });
      setFlashChapter(id);
      setTimeout(() => setFlashChapter((c) => (c === id ? null : c)), 900);
    }
  };

  // ── rows ──
  const changeRow = (id: string, field: 'voiceover' | 'visualCue', value: string) =>
    updateDoc((d) => ({ ...d, rows: d.rows.map((r) => (r.id === id ? { ...r, [field]: value } : r)) }));
  const addRow = (chapterId: string, afterRowId?: string) =>
    updateDoc((d) => {
      const row: ScriptRow = { id: newRowId(), chapterId, voiceover: '', visualCue: '' };
      const rows = [...d.rows];
      let at = afterRowId ? rows.findIndex((r) => r.id === afterRowId) + 1 : -1;
      if (at <= 0) {
        const lastInChapter = rows.map((r) => r.chapterId).lastIndexOf(chapterId);
        at = lastInChapter >= 0 ? lastInChapter + 1 : rows.length;
      }
      rows.splice(at, 0, row);
      return { ...d, rows };
    });
  const deleteRow = (id: string) => updateDoc((d) => ({ ...d, rows: d.rows.filter((r) => r.id !== id) }));
  /** Moves within the flat AV order; crossing a chapter boundary re-parents the row into the neighbour chapter. */
  const moveRow = (id: string, dir: -1 | 1) =>
    updateDoc((d) => {
      const flat = orderedRows(d).map((r) => ({ ...r }));
      const i = flat.findIndex((r) => r.id === id);
      const j = i + dir;
      if (i < 0 || j < 0 || j >= flat.length) return d;
      if (flat[j].chapterId !== flat[i].chapterId) {
        flat[i].chapterId = flat[j].chapterId; // hop into the adjacent chapter (lands at its edge)
      } else {
        [flat[i], flat[j]] = [flat[j], flat[i]];
      }
      return { ...d, rows: flat };
    });

  // ── hand-off ──
  const pushCues = () => {
    const items = buildEditorItems(doc, timing, new Date().toISOString(), Date.now());
    if (items.length === 0) {
      push('Nothing to push — add some rows first.', { tone: 'error' });
      return;
    }
    const cueCount = items.reduce((a, it) => a + (it.cues?.length ?? 0), 0);
    const queued = pushToEditorInbox(items);
    push(`Pushed ${items.length} chapter clips (${cueCount} cues) to VOLTA Editor · ${queued} waiting in inbox.`, {
      tone: 'success',
      href: '/apps/editor',
      linkLabel: 'Open VOLTA Editor',
    });
  };

  const resetDoc = () => {
    const seed = seedById(doc.id);
    if (!seed) return;
    updateDoc(() => seed);
    push(`Reset “${doc.title}” to the seed draft.`);
  };

  // "T" opens the teleprompter when not typing.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (prompterOpen || isTypingTarget(e.target) || e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === 't' || e.key === 'T') {
        e.preventDefault();
        setPrompterOpen(true);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [prompterOpen]);

  const rowCount = timing.flat.length;

  return (
    <div className="flex h-screen w-screen flex-col overflow-hidden bg-obsidian text-paper">
      <AppTopBar
        accent="Scripts"
        subtitle="YouTube script & retention architect"
        center={
          <div className="flex items-center gap-1 rounded-full border border-subtle bg-panel-elevated p-0.5" role="tablist" aria-label="Script">
            {Object.values(state.docs).map((d) => (
              <button
                key={d.id}
                type="button"
                role="tab"
                aria-selected={d.id === state.activeId}
                onClick={() => setState((s) => ({ ...s, activeId: d.id }))}
                className={cn(
                  'inline-flex h-7 items-center gap-1.5 rounded-full px-3 text-[12px] font-medium transition-colors',
                  d.id === state.activeId ? 'bg-paper text-obsidian' : 'text-secondary hover:text-paper',
                )}
              >
                <FileText className="h-3.5 w-3.5" />
                {d.title}
              </button>
            ))}
          </div>
        }
        right={
          <>
            <div className="mr-2 hidden items-center gap-4 2xl:flex">
              <Stat label="Runtime" value={fmtClock(timing.totalSec)} />
              <Stat label="Words" value={timing.totalWords.toLocaleString('en-US')} />
              <Stat label="Pace" value={`${WPM}`} unit="wpm" />
            </div>
            <button
              type="button"
              onClick={() => setPrompterOpen(true)}
              className="inline-flex h-8 items-center gap-1.5 rounded-full border border-subtle bg-panel-elevated px-3 font-mono text-[10px] font-semibold uppercase tracking-[0.08em] text-secondary transition-colors hover:border-highlight hover:text-paper"
              title="Teleprompter (T)"
            >
              <MonitorPlay className="h-3.5 w-3.5" /> Teleprompter
            </button>
            <button
              type="button"
              onClick={pushCues}
              className="inline-flex h-8 items-center gap-1.5 rounded-full bg-orange px-3.5 font-mono text-[10px] font-bold uppercase tracking-[0.08em] text-obsidian shadow-[0_0_18px_rgba(255,85,0,0.35)] transition hover:brightness-110"
            >
              <Send className="h-3.5 w-3.5" /> Push Cues to VOLTA Editor
            </button>
          </>
        }
      />

      <main className="grid min-h-0 flex-1 grid-cols-[minmax(320px,380px)_minmax(0,1fr)] gap-3 p-3">
        {/* Left column */}
        <div className="flex min-h-0 flex-col gap-3">
          <HudPanel
            title="Hook Lab"
            icon={<Sparkles className="h-3.5 w-3.5" />}
            className="min-h-0 flex-[1.35]"
            bodyClassName="hud-scroll overflow-y-auto p-2.5"
            headerExtra={<span className="font-mono text-[9px] text-muted">{doc.hooks.length} variants</span>}
          >
            <HookLab hooks={doc.hooks} activeHookId={doc.activeHookId} onSelect={selectHook} onRegenerate={regenerateWildcards} />
          </HudPanel>
          <HudPanel
            title="Chapter Outline"
            icon={<ListOrdered className="h-3.5 w-3.5" />}
            className="min-h-0 flex-1"
            bodyClassName="hud-scroll overflow-y-auto p-2.5"
            headerExtra={<span className="font-mono text-[9px] text-muted">drag to reorder · {WPM} wpm</span>}
          >
            <ChapterOutline chapters={timing.chapters} totalSec={timing.totalSec} onMove={moveChapter} onJump={jumpToChapter} />
          </HudPanel>
          <button
            type="button"
            onClick={() => setPrompterOpen(true)}
            className="hud-card group flex shrink-0 items-center gap-3 px-3 py-2.5 text-left transition-colors hover:border-orange/60"
          >
            <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-orange/10 text-orange transition-colors group-hover:bg-orange group-hover:text-obsidian">
              <MonitorPlay className="h-4.5 w-4.5" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-[13px] font-semibold text-paper">Teleprompter mode</span>
              <span className="block font-mono text-[9.5px] uppercase tracking-[0.06em] text-muted">Space pause · ↑↓ speed · M mirror · Esc exit</span>
            </span>
            <kbd className="rounded border border-subtle bg-obsidian px-1.5 py-0.5 font-mono text-[10px] text-secondary">T</kbd>
          </button>
        </div>

        {/* Right column: AV script */}
        <HudPanel
          title="AV Script"
          icon={<Clapperboard className="h-3.5 w-3.5" />}
          className="min-h-0"
          bodyClassName="flex min-h-0 flex-col"
          headerExtra={<span className="truncate font-mono text-[9.5px] text-muted">{doc.title}</span>}
          actions={[{ label: 'Reset draft', onClick: resetDoc }]}
        >
          <div ref={tableScrollRef} className="hud-scroll relative min-h-0 flex-1 overflow-y-auto">
            <AvScriptTable
              timing={timing}
              hook={hook}
              hookCue={doc.hookCue}
              onHookCue={(v) => updateDoc((d) => ({ ...d, hookCue: v }))}
              onRowChange={changeRow}
              onAddRow={addRow}
              onDeleteRow={deleteRow}
              onMoveRow={moveRow}
              onRenameChapter={renameChapter}
              onAddChapter={addChapter}
              chapterRefs={chapterRefs}
              flashChapterId={flashChapter}
            />
          </div>
          <footer className="flex h-11 shrink-0 items-center gap-5 border-t border-subtle bg-panel-elevated/60 px-3">
            <Stat label="Total words" value={timing.totalWords.toLocaleString('en-US')} />
            <Stat label="Runtime" value={fmtClock(timing.totalSec)} unit={`@ ${WPM} wpm`} />
            <Stat label="Rows" value={String(rowCount + (hook ? 1 : 0))} />
            <Stat label="Chapters" value={String(doc.chapters.length)} />
            <span className={cn('ml-auto flex items-center gap-1.5 font-mono text-[9.5px] uppercase tracking-[0.08em]', hydrated ? 'text-muted' : 'text-muted/50')}>
              <span className="h-1.5 w-1.5 rounded-full bg-green shadow-[0_0_6px_#22C55E]" /> Autosaved locally
            </span>
          </footer>
        </HudPanel>
      </main>

      {prompterOpen && <Teleprompter title={doc.title} hook={hook} timing={timing} onClose={() => setPrompterOpen(false)} />}
      <ToastStack toasts={toasts} onDismiss={dismiss} />
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
