'use client';

import { useEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type RefObject } from 'react';
import { createPortal } from 'react-dom';
import { AlertTriangle, ChevronLeft, ChevronRight, Clock, Copy, ExternalLink, Maximize2, RotateCw, X } from 'lucide-react';
import { getJson } from '@/components/ltm/ltm-client';
import { isTypingTarget } from '@/lib/events';
import { cn } from '@/lib/cn';
import { NotePreview } from './ArtifactPreview';
import { NOTE_KIND_META, absTime, relTime, type NoteRingItem } from './artifact-meta';

function usePortalReady() {
  const [ready, setReady] = useState(false);
  useEffect(() => setReady(true), []);
  return ready;
}

// ───────────────────────── dialog focus (initial focus, Tab trap, restore) ─────────────────────────

const FOCUSABLE = 'a[href],button:not([disabled]),input:not([disabled]),textarea:not([disabled]),select:not([disabled]),[tabindex]:not([tabindex="-1"])';

function focusablesIn(root: HTMLElement): HTMLElement[] {
  return Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE)).filter((el) => el.offsetParent !== null || el === document.activeElement);
}

/**
 * Moves focus into the dialog once its portal is mounted (so a search input behind it stops receiving
 * keys), and returns focus to whatever had it before when the dialog unmounts.
 */
function useDialogFocus(ready: boolean, initialRef: RefObject<HTMLElement | null>) {
  useEffect(() => {
    if (!ready) return;
    const prev = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    initialRef.current?.focus({ preventScroll: true });
    return () => {
      if (prev && prev.isConnected && prev !== document.body) prev.focus({ preventScroll: true });
    };
  }, [ready, initialRef]);
}

/** Keeps Tab / Shift+Tab cycling inside the dialog. Attach to the dialog root's onKeyDown. */
function trapTab(e: ReactKeyboardEvent<HTMLElement>) {
  if (e.key !== 'Tab') return;
  const els = focusablesIn(e.currentTarget);
  if (els.length === 0) {
    e.preventDefault();
    return;
  }
  const first = els[0];
  const last = els[els.length - 1];
  const active = document.activeElement;
  const inside = active instanceof Node && e.currentTarget.contains(active);
  if (e.shiftKey && (active === first || !inside || active === e.currentTarget)) {
    e.preventDefault();
    last.focus();
  } else if (!e.shiftKey && (active === last || !inside)) {
    e.preventDefault();
    first.focus();
  }
}

// ───────────────────────── note document fetch (/api/brain/note) ─────────────────────────

export type NoteDocState =
  | { status: 'loading' }
  | { status: 'ready'; content: string }
  | { status: 'missing' }
  | { status: 'error'; message: string };

interface NoteDocResponse {
  id: string;
  content: string;
  exists: boolean;
}

/** Small client cache keyed by id + mtime, so ←/→ browsing is instant and edited notes refetch. */
const docCache = new Map<string, string | null>();
const DOC_CACHE_MAX = 60;

function cacheKey(item: NoteRingItem) {
  return `${item.id}@${item.mtime}`;
}

function fromCache(key: string): NoteDocState | null {
  const hit = docCache.get(key);
  if (hit === undefined) return null;
  return hit === null ? { status: 'missing' } : { status: 'ready', content: hit };
}

/** Fetches (and caches) one note's markdown. Errors are not cached; bump `reloadKey` to retry. */
export function useNoteDoc(item: NoteRingItem, reloadKey = 0): NoteDocState {
  const key = cacheKey(item);
  const [state, setState] = useState<{ key: string; doc: NoteDocState }>(() => ({ key, doc: fromCache(key) ?? { status: 'loading' } }));

  useEffect(() => {
    const cached = fromCache(key);
    if (cached) {
      setState({ key, doc: cached });
      return;
    }
    const ctrl = new AbortController();
    setState({ key, doc: { status: 'loading' } });
    getJson<NoteDocResponse>(`/api/brain/note?id=${encodeURIComponent(item.id)}`, ctrl.signal)
      .then((res) => {
        const content = res.exists && typeof res.content === 'string' ? res.content : null;
        docCache.set(key, content);
        if (docCache.size > DOC_CACHE_MAX) docCache.delete(docCache.keys().next().value as string);
        setState({ key, doc: content === null ? { status: 'missing' } : { status: 'ready', content } });
      })
      .catch((err: unknown) => {
        if (ctrl.signal.aborted) return;
        setState({ key, doc: { status: 'error', message: err instanceof Error ? err.message : 'Request failed' } });
      });
    return () => ctrl.abort();
  }, [key, item.id, reloadKey]);

  // While a new note's fetch is being set up, never show the previous note's body.
  if (state.key !== key) return fromCache(key) ?? { status: 'loading' };
  return state.doc;
}

function DocBody({ doc, variant, onRetry }: { doc: NoteDocState; variant: 'card' | 'full'; onRetry: () => void }) {
  if (doc.status === 'loading') {
    return (
      <div className="flex flex-col gap-2.5 pt-1" aria-busy="true" aria-label="Loading note">
        <span className="h-4 w-1/2 animate-pulse rounded bg-panel-hover" />
        {[92, 84, 96, 70, 88, 60].map((w, i) => (
          <span key={i} className="h-2.5 animate-pulse rounded bg-panel-elevated" style={{ width: `${w}%`, animationDelay: `${i * 80}ms` }} />
        ))}
        <span className="mt-1 font-mono text-[10px] uppercase tracking-[0.1em] text-muted">Reading note from vault…</span>
      </div>
    );
  }
  if (doc.status === 'missing') {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2 py-8 text-center">
        <AlertTriangle size={18} className="text-amber" />
        <p className="font-mono text-[11px] text-secondary">Note not found on disk — it may have been moved, renamed or is still an iCloud placeholder.</p>
      </div>
    );
  }
  if (doc.status === 'error') {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2.5 py-8 text-center">
        <AlertTriangle size={18} className="text-[#EF4444]" />
        <p className="font-mono text-[11px] text-secondary">Couldn&apos;t load the note · {doc.message}</p>
        <button
          type="button"
          onClick={onRetry}
          className="inline-flex h-7 items-center gap-1.5 rounded-full border border-highlight px-3 font-mono text-[10px] font-semibold uppercase tracking-[0.1em] text-secondary hover:text-paper"
        >
          <RotateCw size={11} /> Retry
        </button>
      </div>
    );
  }
  return <NotePreview source={doc.content} variant={variant} />;
}

// ───────────────────────── inspection modal ─────────────────────────

interface NoteModalProps {
  item: NoteRingItem;
  index: number;
  total: number;
  /** Client clock (ms) — null until mounted. */
  now: number | null;
  onClose: () => void;
  onStep: (dir: 1 | -1) => void;
  onExpand: () => void;
  onCopyPath: () => void;
}

/** Dark inspection modal: real markdown preview + vault/folder tag, edited time, path, OPEN IN OBSIDIAN / COPY PATH. */
export function NoteModal({ item, index, total, now, onClose, onStep, onExpand, onCopyPath }: NoteModalProps) {
  const ready = usePortalReady();
  const [reloadKey, setReloadKey] = useState(0);
  const doc = useNoteDoc(item, reloadKey);
  const meta = NOTE_KIND_META[item.kind];
  const Icon = meta.icon;
  const closeRef = useRef<HTMLButtonElement>(null);
  useDialogFocus(ready, closeRef);

  // ←/→ browse notes while the modal is open (Esc is handled via OS_EVENTS.escape by the ring).
  // Ignored while a text field has focus, so arrows only move a caret there.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey || isTypingTarget(e.target)) return;
      if (e.key === 'ArrowRight') onStep(1);
      else if (e.key === 'ArrowLeft') onStep(-1);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onStep]);

  if (!ready) return null;
  return createPortal(
    <div
      className="orbital-fade fixed inset-0 z-[60] flex items-center justify-center bg-black/70 p-6 outline-none backdrop-blur-[6px]"
      onPointerDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      onKeyDown={trapTab}
      tabIndex={-1}
      role="dialog"
      aria-modal="true"
      aria-label={`Note: ${item.title}`}
    >
      <div className="orbital-pop relative flex max-h-[min(88vh,760px)] w-[min(92vw,780px)] flex-col overflow-hidden rounded-2xl border border-highlight bg-panel shadow-[0_30px_120px_rgba(0,0,0,0.7),0_0_0_1px_rgba(255,85,0,0.06)]">
        {/* preview */}
        <div className="relative h-[min(50vh,430px)] w-full shrink-0 border-b border-subtle bg-[#0C0C0B]">
          <div key={item.id} className="hud-scroll orbital-fade h-full overflow-y-auto px-6 pb-14 pt-12">
            <DocBody doc={doc} variant="card" onRetry={() => setReloadKey((k) => k + 1)} />
          </div>
          <span
            className="pointer-events-none absolute left-3 top-3 rounded-full border bg-black/60 px-2 py-0.5 font-mono text-[9px] font-semibold uppercase tracking-[0.12em] backdrop-blur"
            style={{ color: meta.color, borderColor: `${meta.color}55` }}
          >
            {meta.label} · markdown preview
          </span>
          <div className="absolute right-3 top-3 flex items-center gap-1.5">
            <button
              type="button"
              onClick={onExpand}
              aria-label="Read fullscreen"
              title="Read fullscreen"
              className="flex h-8 w-8 items-center justify-center rounded-full border border-highlight bg-black/60 text-secondary backdrop-blur transition-colors hover:text-paper"
            >
              <Maximize2 size={13} />
            </button>
            <button
              ref={closeRef}
              type="button"
              onClick={onClose}
              aria-label="Close"
              className="flex h-8 w-8 items-center justify-center rounded-full border border-highlight bg-black/60 text-secondary outline-none backdrop-blur transition-colors hover:text-paper focus-visible:ring-2 focus-visible:ring-orange/60"
            >
              <X size={15} />
            </button>
          </div>
          <div className="pointer-events-none absolute inset-x-0 bottom-0 h-12 bg-gradient-to-t from-[#0C0C0B] to-transparent" aria-hidden />
          <div className="absolute bottom-3 right-3 flex items-center gap-1.5">
            <button type="button" onClick={() => onStep(-1)} aria-label="Previous note" className="flex h-7 w-7 items-center justify-center rounded-full border border-highlight bg-black/60 text-secondary backdrop-blur hover:text-paper">
              <ChevronLeft size={14} />
            </button>
            <span className="rounded-full bg-black/60 px-2 py-0.5 font-mono text-[10px] text-secondary backdrop-blur">
              {String(index + 1).padStart(2, '0')} / {total}
            </span>
            <button type="button" onClick={() => onStep(1)} aria-label="Next note" className="flex h-7 w-7 items-center justify-center rounded-full border border-highlight bg-black/60 text-secondary backdrop-blur hover:text-paper">
              <ChevronRight size={14} />
            </button>
          </div>
        </div>

        {/* meta */}
        <div className="flex flex-col gap-4 p-5">
          <div className="flex items-start gap-3">
            <span className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-[#2A2825] bg-panel-elevated" style={{ color: meta.color }}>
              <Icon size={17} />
            </span>
            <div className="min-w-0 flex-1">
              <h3 className="truncate text-[19px] font-semibold leading-tight text-paper" title={item.title}>
                {item.title}
              </h3>
              <div className="mt-1.5 flex flex-wrap items-center gap-2">
                <span className="rounded-full border border-orange/50 bg-orange/10 px-2.5 py-0.5 font-mono text-[10px] font-semibold uppercase tracking-[0.1em] text-orange">
                  {item.tag}
                </span>
                <span className="rounded-full border border-subtle px-2.5 py-0.5 font-mono text-[10px] uppercase tracking-[0.1em]" style={{ color: meta.color }}>
                  {meta.label}
                </span>
                <span className="flex items-center gap-1 font-mono text-[11px] text-secondary" title={now ? absTime(item.mtime) : undefined}>
                  <Clock size={11} /> Edited {now ? relTime(item.mtime, now) : '…'}
                </span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2 rounded-lg border border-subtle bg-obsidian px-3 py-2">
            <span className="hud-label shrink-0 !text-[9px] !text-muted">PATH</span>
            <code className="selectable min-w-0 flex-1 truncate font-mono text-[11px] text-secondary" title={item.path}>
              {item.path}
            </code>
          </div>

          <div className="flex items-center gap-2">
            <a
              href={item.obsidianUrl}
              className="inline-flex h-9 items-center gap-2 rounded-full bg-orange px-5 font-mono text-[11px] font-bold uppercase tracking-[0.1em] text-obsidian shadow-[0_0_24px_rgba(255,85,0,0.35)] transition hover:brightness-110"
            >
              <ExternalLink size={13} /> Open in Obsidian
            </a>
            <button
              type="button"
              onClick={onCopyPath}
              className="inline-flex h-9 items-center gap-2 rounded-full border border-highlight bg-panel-elevated px-5 font-mono text-[11px] font-semibold uppercase tracking-[0.1em] text-secondary transition hover:border-paper/30 hover:text-paper"
            >
              <Copy size={13} /> Copy path
            </button>
            <span className="ml-auto hidden font-mono text-[10px] text-muted sm:block">← → browse · esc close</span>
          </div>
        </div>
      </div>
      <OrbitalOverlayStyles />
    </div>,
    document.body,
  );
}

// ───────────────────────── fullscreen reader ─────────────────────────

interface NoteFullscreenProps {
  item: NoteRingItem;
  onClose: () => void;
  onStep: (dir: 1 | -1) => void;
  onCopyPath: () => void;
}

/** Fullscreen read-only reader for the selected note (←/→ keeps browsing via the modal underneath). */
export function NoteFullscreen({ item, onClose, onStep, onCopyPath }: NoteFullscreenProps) {
  const ready = usePortalReady();
  const [reloadKey, setReloadKey] = useState(0);
  const doc = useNoteDoc(item, reloadKey);
  const meta = NOTE_KIND_META[item.kind];
  const closeRef = useRef<HTMLButtonElement>(null);
  useDialogFocus(ready, closeRef);

  if (!ready) return null;
  return createPortal(
    <div
      className="orbital-fade fixed inset-0 z-[70] flex flex-col bg-obsidian/95 outline-none backdrop-blur-md"
      onKeyDown={trapTab}
      tabIndex={-1}
      role="dialog"
      aria-modal="true"
      aria-label={`Reading: ${item.title}`}
    >
      <header className="flex h-12 shrink-0 items-center gap-3 border-b border-subtle px-4">
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-[#2A2825]" style={{ color: meta.color }}>
          <meta.icon size={13} />
        </span>
        <span className="truncate text-[15px] font-semibold text-paper">{item.title}</span>
        <span className="shrink-0 rounded-full border border-orange/50 px-2 py-0.5 font-mono text-[9px] font-semibold uppercase tracking-[0.1em] text-orange">{item.tag}</span>
        <code className="hidden min-w-0 truncate font-mono text-[11px] text-muted lg:block">{item.path}</code>
        <div className="ml-auto flex shrink-0 items-center gap-2">
          <button type="button" onClick={() => onStep(-1)} aria-label="Previous note" className="flex h-8 w-8 items-center justify-center rounded-full border border-highlight text-secondary hover:text-paper">
            <ChevronLeft size={14} />
          </button>
          <button type="button" onClick={() => onStep(1)} aria-label="Next note" className="flex h-8 w-8 items-center justify-center rounded-full border border-highlight text-secondary hover:text-paper">
            <ChevronRight size={14} />
          </button>
          <button type="button" onClick={onCopyPath} className="inline-flex h-8 items-center gap-1.5 rounded-full border border-highlight px-3 font-mono text-[10px] font-semibold uppercase tracking-[0.1em] text-secondary hover:text-paper">
            <Copy size={12} /> Copy path
          </button>
          <a
            href={item.obsidianUrl}
            className="inline-flex h-8 items-center gap-1.5 rounded-full bg-orange px-3 font-mono text-[10px] font-bold uppercase tracking-[0.1em] text-obsidian hover:brightness-110"
          >
            <ExternalLink size={12} /> Open in Obsidian
          </a>
          <button
            ref={closeRef}
            type="button"
            onClick={onClose}
            aria-label="Close reader"
            className="flex h-8 w-8 items-center justify-center rounded-full border border-highlight text-secondary outline-none hover:text-paper focus-visible:ring-2 focus-visible:ring-orange/60"
          >
            <X size={15} />
          </button>
        </div>
      </header>
      <div className="hud-scroll relative min-h-0 flex-1 overflow-y-auto">
        <article key={item.id} className={cn('orbital-pop mx-auto w-full max-w-[860px] px-8 py-10')}>
          <DocBody doc={doc} variant="full" onRetry={() => setReloadKey((k) => k + 1)} />
        </article>
      </div>
      <OrbitalOverlayStyles />
    </div>,
    document.body,
  );
}

function OrbitalOverlayStyles() {
  return (
    <style>{`
      @keyframes orbital-fade-in { from { opacity: 0; } to { opacity: 1; } }
      @keyframes orbital-pop-in { from { opacity: 0; transform: translateY(10px) scale(0.975); } to { opacity: 1; transform: none; } }
      .orbital-fade { animation: orbital-fade-in 180ms ease-out both; }
      .orbital-pop { animation: orbital-pop-in 260ms cubic-bezier(.2,.8,.2,1) both; }
      @media (prefers-reduced-motion: reduce) { .orbital-fade, .orbital-pop { animation: none; } }
    `}</style>
  );
}
