'use client';

import { ArrowLeft, ChevronDown, Download, FilePlus2, FolderOpen, Redo2, Trash2, Undo2 } from 'lucide-react';
import Link from 'next/link';
import { useCallback, useEffect, useMemo, useReducer, useRef, useState, type ReactNode } from 'react';
import { PixelMascotLogo } from '@/components/robo-ui';
import { cn } from '@/lib/cn';
import { isTypingTarget } from '@/lib/events';
import { clipEnd, clipFromAsset, newSequence, sequenceDuration } from '@/lib/nle/model';
import type { EditorMediaList } from '@/types/editor';
import type { NleProjectSummary, NleSequence, NleUploadResult } from '@/types/nle';
import { EditorToast, type ToastState } from '../EditorModals';
import type { BinState } from '../MediaBin';
import type { DndAsset } from './dnd';
import { NleAssets } from './NleAssets';
import { NleExportDialog } from './NleExportDialog';
import { NleInspector } from './NleInspector';
import { NlePreview } from './NlePreview';
import { NleTimeline } from './NleTimeline';
import { initialNleState, nleReducer, type NewTrackTarget } from './state';

const LAST_KEY = 'volta:nle-last';
const BACKUP_KEY = 'volta:nle-backup';
const UPLOADS_KEY = 'volta:nle-uploads';
const TL_H_KEY = 'volta:nle-timeline-h';
const PROJECTS = '/api/editor/nle/projects';

const ls = {
  get(k: string): string | null {
    try {
      return localStorage.getItem(k);
    } catch {
      return null;
    }
  },
  set(k: string, v: string): void {
    try {
      localStorage.setItem(k, v);
    } catch {
      /* quota / private mode */
    }
  },
};

async function jsonFetch<T>(url: string, init?: { method?: string; body?: unknown }): Promise<T> {
  const method = init?.method ?? (init?.body !== undefined ? 'POST' : 'GET');
  const res = await fetch(url, {
    method,
    // the local-only mutation guard requires a JSON content type on every non-GET request
    headers: method !== 'GET' ? { 'Content-Type': 'application/json' } : undefined,
    body: init?.body !== undefined ? JSON.stringify(init.body) : undefined,
    cache: 'no-store',
  });
  const data = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
  return data;
}

/** Upload one file with progress (XHR: fetch has no upload progress). */
function uploadFile(file: File, onProgress: (p: number) => void): Promise<NleUploadResult> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', '/api/editor/nle/upload');
    xhr.setRequestHeader('X-File-Name', encodeURIComponent(file.name));
    xhr.setRequestHeader('Content-Type', file.type || 'application/octet-stream');
    xhr.upload.onprogress = (e) => e.lengthComputable && onProgress(e.loaded / e.total);
    xhr.onload = () => {
      let data: (NleUploadResult & { error?: string }) | null = null;
      try {
        data = JSON.parse(xhr.responseText);
      } catch {
        /* fallthrough */
      }
      if (xhr.status >= 200 && xhr.status < 300 && data?.assetId) resolve(data);
      else reject(new Error(data?.error || `Upload failed (HTTP ${xhr.status})`));
    };
    xhr.onerror = () => reject(new Error('Upload failed (network)'));
    xhr.send(file);
  });
}

const toAsset = (u: NleUploadResult): DndAsset => ({ id: u.assetId, url: u.url, name: u.name, media: u.media, durationSec: u.durationSec, width: u.width, height: u.height, hasAudio: u.hasAudio });

/** Edit-points across all tracks (clip starts / ends), sorted. */
function editPoints(seq: NleSequence): number[] {
  const set = new Set<number>([0]);
  for (const c of seq.clips) {
    set.add(Math.round(c.start * 1000) / 1000);
    set.add(Math.round(clipEnd(c) * 1000) / 1000);
  }
  return [...set].sort((a, b) => a - b);
}

export function NleWorkspace({ modeSwitch }: { modeSwitch?: ReactNode }) {
  const [state, dispatch] = useReducer(nleReducer, undefined, () => initialNleState());
  const [bin, setBin] = useState<BinState>({ status: 'loading', data: null, error: null });
  const [uploads, setUploads] = useState<DndAsset[]>([]);
  const [uploading, setUploading] = useState<{ name: string; progress: number }[]>([]);
  const [projects, setProjects] = useState<NleProjectSummary[] | null>(null);
  const [menu, setMenu] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [toast, setToast] = useState<ToastState | null>(null);
  const [tlH, setTlH] = useState(300);
  const [loaded, setLoaded] = useState(false);
  const stateRef = useRef(state);
  stateRef.current = state;
  const toastSeq = useRef(0);

  const notify = useCallback((text: string, tone: ToastState['tone'] = 'ok') => {
    toastSeq.current += 1;
    setToast({ id: toastSeq.current, text, tone });
  }, []);
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 4200);
    return () => clearTimeout(t);
  }, [toast]);

  // ── bin, uploads, timeline height ──
  const loadBin = useCallback(async (refresh = false) => {
    setBin((b) => ({ ...b, status: 'loading', error: null }));
    try {
      const data = await jsonFetch<EditorMediaList>(`/api/editor/media${refresh ? '?refresh=1' : ''}`);
      setBin({ status: 'ready', data, error: null });
    } catch (err) {
      setBin((b) => ({ ...b, status: 'error', error: (err as Error).message }));
    }
  }, []);
  useEffect(() => {
    void loadBin();
    try {
      const u = JSON.parse(ls.get(UPLOADS_KEY) ?? '[]') as DndAsset[];
      if (Array.isArray(u)) setUploads(u.filter((x) => x && typeof x.id === 'string'));
    } catch {
      /* ignore */
    }
    const h = Number(ls.get(TL_H_KEY));
    if (h > 120) setTlH(h);
  }, [loadBin]);

  // ── projects: open the last one (server first, local backup if the server copy is missing / older) ──
  const refreshProjects = useCallback(async () => {
    try {
      const r = await jsonFetch<{ projects: NleProjectSummary[] }>(PROJECTS);
      setProjects(r.projects);
      return r.projects;
    } catch {
      setProjects([]);
      return [];
    }
  }, []);
  const openProject = useCallback(
    async (id: string) => {
      try {
        const r = await jsonFetch<{ sequence: NleSequence }>(`${PROJECTS}?id=${encodeURIComponent(id)}`);
        dispatch({ type: 'LOAD', seq: r.sequence });
        ls.set(LAST_KEY, id);
        setMenu(false);
      } catch (err) {
        notify(`Could not open the project: ${(err as Error).message}`, 'error');
      }
    },
    [notify],
  );
  useEffect(() => {
    let backup: NleSequence | null = null;
    try {
      backup = JSON.parse(ls.get(BACKUP_KEY) ?? 'null') as NleSequence | null;
    } catch {
      backup = null;
    }
    const last = ls.get(LAST_KEY);
    void (async () => {
      const list = await refreshProjects();
      let seq: NleSequence | null = null;
      const id = last && list.some((p) => p.id === last) ? last : list[0]?.id;
      if (id) {
        try {
          seq = (await jsonFetch<{ sequence: NleSequence }>(`${PROJECTS}?id=${encodeURIComponent(id)}`)).sequence;
        } catch {
          seq = null;
        }
      }
      if (backup?.v === 1 && (!seq || (backup.id === seq.id && backup.updatedAt > seq.updatedAt) || (!id && backup.clips.length))) seq = backup;
      if (seq) dispatch({ type: 'LOAD', seq });
      setLoaded(true);
    })();
  }, [refreshProjects]);

  // ── autosave: local backup at once, server after 1.2 s idle ──
  const saveNow = useCallback(async () => {
    const seq = stateRef.current.seq;
    dispatch({ type: 'SET_SAVED', saved: 'saving' });
    try {
      await jsonFetch(PROJECTS, { body: { sequence: seq } });
      ls.set(LAST_KEY, seq.id);
      if (stateRef.current.seq === seq) dispatch({ type: 'SET_SAVED', saved: 'saved' });
      else dispatch({ type: 'SET_SAVED', saved: 'dirty' });
    } catch (err) {
      dispatch({ type: 'SET_SAVED', saved: 'error' });
      notify(`Not saved to disk (kept in this browser): ${(err as Error).message}`, 'error');
    }
  }, [notify]);
  useEffect(() => {
    if (!loaded || state.saved !== 'dirty') return;
    ls.set(BACKUP_KEY, JSON.stringify(state.seq));
    const t = setTimeout(() => void saveNow(), 1200);
    return () => clearTimeout(t);
  }, [state.seq, state.saved, loaded, saveNow]);

  const newProject = useCallback(() => {
    const seq = newSequence(`Edit ${new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`);
    dispatch({ type: 'LOAD', seq });
    dispatch({ type: 'SET_SAVED', saved: 'dirty' });
    setMenu(false);
  }, []);
  const deleteProject = useCallback(
    async (id: string) => {
      if (!window.confirm('Move this project to the trash folder? Media files are not touched.')) return;
      try {
        await jsonFetch(`${PROJECTS}?id=${encodeURIComponent(id)}`, { method: 'DELETE' });
        const list = await refreshProjects();
        if (id === stateRef.current.seq.id) {
          if (list[0]) void openProject(list[0].id);
          else newProject();
        }
      } catch (err) {
        notify(`Delete failed: ${(err as Error).message}`, 'error');
      }
    },
    [newProject, notify, openProject, refreshProjects],
  );

  // ── imports: Finder files → upload → bin (and optionally straight onto the timeline) ──
  const importFiles = useCallback(
    async (files: File[], at?: { t: number; trackId: string | NewTrackTarget | null }): Promise<void> => {
      let t = at?.t ?? 0;
      for (const f of files) {
        setUploading((u) => [...u, { name: f.name, progress: 0 }]);
        try {
          const res = await uploadFile(f, (p) => setUploading((u) => u.map((x) => (x.name === f.name ? { ...x, progress: p } : x))));
          const asset = toAsset(res);
          setUploads((list) => {
            const next = [asset, ...list.filter((x) => x.id !== asset.id)].slice(0, 200);
            ls.set(UPLOADS_KEY, JSON.stringify(next));
            return next;
          });
          if (at) {
            const clip = clipFromAsset(asset);
            dispatch({ type: 'ADD_CLIPS', clips: [clip], trackId: at.trackId, start: t });
            t += clip.duration;
          }
        } catch (err) {
          notify(`${f.name}: ${(err as Error).message}`, 'error');
        } finally {
          setUploading((u) => u.filter((x) => x.name !== f.name));
        }
      }
    },
    [notify],
  );
  const onDropFiles = useCallback((files: File[], at: { t: number; trackId: string | NewTrackTarget | null }) => void importFiles(files, at), [importFiles]);

  // ── keyboard shortcuts (CapCut / FCP style) ──
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (isTypingTarget(e.target)) return;
      const st = stateRef.current;
      const mod = e.metaKey || e.ctrlKey;
      const k = e.key.toLowerCase();
      const sel = st.selection;
      const fps = st.seq.fps || 30;
      const run = (fn: () => void) => {
        e.preventDefault();
        fn();
      };
      if (mod && k === 'z') return run(() => dispatch({ type: e.shiftKey ? 'REDO' : 'UNDO' }));
      if (mod && k === 'y') return run(() => dispatch({ type: 'REDO' }));
      if (mod && k === 's') return run(() => void saveNow());
      if (mod && k === 'e') return run(() => setExportOpen(true));
      if (mod && k === 'a') return run(() => dispatch({ type: 'SELECT_ALL' }));
      if (mod && k === 'c') return sel.length ? run(() => dispatch({ type: 'COPY', ids: sel })) : undefined;
      if (mod && k === 'x') return sel.length ? run(() => (dispatch({ type: 'COPY', ids: sel }), dispatch({ type: 'DELETE', ids: sel, ripple: st.magnetic }))) : undefined;
      if (mod && k === 'v') return run(() => dispatch({ type: 'PASTE', t: st.playhead }));
      if (mod && k === 'd') return sel.length ? run(() => dispatch({ type: 'DUPLICATE', ids: sel })) : undefined;
      if (mod && k === 'b') return run(() => dispatch({ type: 'SPLIT', t: st.playhead }));
      if (mod && (k === '=' || k === '+')) return run(() => dispatch({ type: 'SET_ZOOM', pps: st.pps * 1.4 }));
      if (mod && k === '-') return run(() => dispatch({ type: 'SET_ZOOM', pps: st.pps / 1.4 }));
      if (mod) return;
      switch (e.key) {
        case ' ':
          return run(() => dispatch({ type: 'TOGGLE_PLAY' }));
        case 'Backspace':
        case 'Delete':
          return sel.length ? run(() => dispatch({ type: 'DELETE', ids: sel, ripple: e.shiftKey })) : undefined;
        case 'ArrowLeft':
          return run(() => (sel.length && e.altKey ? dispatch({ type: 'NUDGE', ids: sel, frames: e.shiftKey ? -10 : -1 }) : e.shiftKey ? dispatch({ type: 'SEEK', t: st.playhead - 1 }) : dispatch({ type: 'STEP', frames: -1 })));
        case 'ArrowRight':
          return run(() => (sel.length && e.altKey ? dispatch({ type: 'NUDGE', ids: sel, frames: e.shiftKey ? 10 : 1 }) : e.shiftKey ? dispatch({ type: 'SEEK', t: st.playhead + 1 }) : dispatch({ type: 'STEP', frames: 1 })));
        case 'ArrowUp': {
          const pts = editPoints(st.seq).filter((p) => p < st.playhead - 0.5 / fps);
          return run(() => dispatch({ type: 'SEEK', t: pts.length ? pts[pts.length - 1] : 0 }));
        }
        case 'ArrowDown': {
          const p = editPoints(st.seq).find((x) => x > st.playhead + 0.5 / fps);
          return run(() => dispatch({ type: 'SEEK', t: p ?? sequenceDuration(st.seq) }));
        }
        case 'Home':
          return run(() => dispatch({ type: 'SEEK', t: 0 }));
        case 'End':
          return run(() => dispatch({ type: 'SEEK', t: sequenceDuration(st.seq) }));
        case 'Escape':
          return sel.length ? run(() => dispatch({ type: 'SELECT', ids: [] })) : undefined;
        default:
          break;
      }
      switch (k) {
        case 's':
          return run(() => dispatch({ type: 'SPLIT', t: st.playhead }));
        case 'm':
          return run(() => dispatch({ type: 'ADD_MARKER', t: st.playhead }));
        case 'b':
          return run(() => dispatch({ type: 'SET_TOOL', tool: 'blade' }));
        case 'a':
        case 'v':
          return run(() => dispatch({ type: 'SET_TOOL', tool: 'select' }));
        case 'n':
          return run(() => dispatch({ type: 'TOGGLE_SNAP' }));
        case 'j':
          return run(() => (dispatch({ type: 'SET_PLAYING', playing: false }), dispatch({ type: 'SEEK', t: st.playhead - 1 })));
        case 'k':
          return run(() => dispatch({ type: 'SET_PLAYING', playing: false }));
        case 'l':
          return run(() => dispatch({ type: 'SET_PLAYING', playing: true }));
        case 'i':
          return undefined;
        case 'z':
          if (e.shiftKey) return run(() => window.dispatchEvent(new CustomEvent('nle:fit')));
          return undefined;
        default:
          return undefined;
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [saveNow]);

  // ── timeline height drag ──
  const dragRef = useRef<{ y: number; h: number } | null>(null);
  const onDividerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    dragRef.current = { y: e.clientY, h: tlH };
  };
  const onDividerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const d = dragRef.current;
    if (!d) return;
    setTlH(Math.max(160, Math.min(window.innerHeight - 260, d.h - (e.clientY - d.y))));
  };
  const onDividerUp = () => {
    if (!dragRef.current) return;
    dragRef.current = null;
    ls.set(TL_H_KEY, String(tlH));
  };

  const savedChip = useMemo(
    () =>
      ({
        saved: { text: 'Saved', cls: 'text-green' },
        dirty: { text: 'Unsaved', cls: 'text-amber' },
        saving: { text: 'Saving…', cls: 'text-amber' },
        error: { text: 'Not saved', cls: 'text-[#EF4444]' },
      })[state.saved],
    [state.saved],
  );

  return (
    <div className="flex h-[100dvh] w-screen flex-col overflow-hidden bg-obsidian text-paper">
      <header className="relative flex h-[calc(3.5rem+env(safe-area-inset-top,0px))] shrink-0 items-center gap-2 border-b border-subtle bg-panel/80 px-3 pt-[env(safe-area-inset-top,0px)] md:h-12 md:pt-0">
        <Link href="/" aria-label="Back to VOLTA OS" title="Back to VOLTA OS" className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-subtle text-secondary hover:border-highlight hover:text-paper">
          <ArrowLeft size={13} />
        </Link>
        <div className="flex shrink-0 items-center gap-2">
          <PixelMascotLogo size={20} className="max-[480px]:hidden" />
          <span className="text-[16px] font-bold tracking-tight text-paper max-sm:hidden">
            VOLTA <span className="font-doto font-extrabold text-orange">EDITOR</span>
          </span>
        </div>
        {modeSwitch}
        <div className="relative ml-2 flex min-w-0 items-center gap-1">
          <input
            value={state.seq.name}
            onChange={(e) => dispatch({ type: 'SET_SEQ_PROPS', patch: { name: e.target.value } })}
            aria-label="Project name"
            className="h-7 w-[min(260px,30vw)] min-w-0 rounded-md max-sm:hidden border border-transparent bg-transparent px-2 text-[13px] font-semibold text-paper outline-none hover:border-subtle focus:border-orange/60 focus:bg-obsidian"
          />
          <button
            type="button"
            onClick={() => {
              setMenu((m) => !m);
              void refreshProjects();
            }}
            title="Projects"
            aria-label="Projects"
            className="inline-flex h-7 items-center gap-1 rounded-md border border-subtle bg-panel-elevated px-2 font-mono text-[10px] text-secondary hover:text-paper"
          >
            <FolderOpen size={12} /> <ChevronDown size={11} />
          </button>
          <span className={cn('ml-1 shrink-0 font-mono text-[10px] max-sm:hidden', savedChip.cls)} title="Projects save to ~/Documents/PROJECTS/ErisMornCloud/volta/editor/projects (and this browser)">
            ● {savedChip.text}
          </span>
          {menu && (
            <div className="absolute left-0 top-9 z-50 w-80 rounded-lg border border-highlight bg-panel-elevated p-1.5 shadow-2xl shadow-black/70">
              <button type="button" onClick={newProject} className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left font-mono text-[11px] text-paper hover:bg-panel-hover">
                <FilePlus2 size={13} className="text-orange" /> New project
              </button>
              <div className="my-1 border-t border-subtle" />
              <div className="max-h-72 overflow-y-auto">
                {projects === null && <div className="px-2 py-1.5 font-mono text-[10px] text-muted">Loading…</div>}
                {projects?.length === 0 && <div className="px-2 py-1.5 font-mono text-[10px] text-muted">No saved projects yet.</div>}
                {projects?.map((p) => (
                  <div key={p.id} className={cn('group flex items-center gap-2 rounded-md px-2 py-1.5 hover:bg-panel-hover', p.id === state.seq.id && 'bg-orange/10')}>
                    <button type="button" onClick={() => void openProject(p.id)} className="min-w-0 flex-1 text-left">
                      <div className="truncate text-[12px] text-paper">{p.name}</div>
                      <div className="font-mono text-[9.5px] text-muted">
                        {p.clips} clips · {p.duration.toFixed(1)}s · {new Date(p.updatedAt).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}
                      </div>
                    </button>
                    <button type="button" onClick={() => void deleteProject(p.id)} aria-label={`Delete ${p.name}`} className="hidden rounded p-1 text-muted hover:text-[#EF4444] group-hover:block">
                      <Trash2 size={12} />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
        <div className="ml-auto flex shrink-0 items-center gap-1.5 [&>button:not(:last-child)]:max-sm:hidden">
          <button type="button" onClick={() => dispatch({ type: 'UNDO' })} disabled={!state.past.length} title="Undo (⌘Z)" aria-label="Undo" className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-subtle bg-panel-elevated text-secondary hover:text-paper disabled:opacity-40">
            <Undo2 size={13} />
          </button>
          <button type="button" onClick={() => dispatch({ type: 'REDO' })} disabled={!state.future.length} title="Redo (⇧⌘Z)" aria-label="Redo" className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-subtle bg-panel-elevated text-secondary hover:text-paper disabled:opacity-40">
            <Redo2 size={13} />
          </button>
          <button
            type="button"
            onClick={() => setExportOpen(true)}
            disabled={!state.seq.clips.length}
            title="Export video (⌘E)"
            className="inline-flex h-7 items-center gap-1.5 rounded-md border border-orange bg-orange px-3 font-mono text-[11px] font-bold text-obsidian hover:brightness-110 disabled:opacity-50"
          >
            <Download size={13} /> Export
          </button>
        </div>
      </header>

      {menu && <div className="fixed inset-0 z-40" onClick={() => setMenu(false)} />}
      {!loaded && (
        <div className="pointer-events-none fixed inset-x-0 top-16 z-50 flex justify-center">
          <span className="rounded-full border border-subtle bg-panel-elevated px-3 py-1 font-mono text-[10.5px] text-secondary shadow-lg">Opening your last project…</span>
        </div>
      )}

      <div className="flex min-h-0 flex-1 gap-1.5 px-1.5 pt-1.5 max-md:flex-col max-md:overflow-y-auto">
        <NleAssets
          state={state}
          dispatch={dispatch}
          bin={bin}
          uploads={uploads}
          uploading={uploading}
          onImportFiles={(files) => void importFiles(files)}
          onRefresh={() => void loadBin(true)}
          className="h-full w-[300px] shrink-0 max-lg:w-[250px] max-md:h-[55dvh] max-md:w-full"
        />
        <NlePreview state={state} dispatch={dispatch} onDropFiles={onDropFiles} className="h-full min-w-0 flex-1 max-md:h-[45dvh] max-md:flex-none" />
        <NleInspector state={state} dispatch={dispatch} className="h-full w-[300px] shrink-0 max-xl:w-[260px] max-md:h-[60dvh] max-md:w-full" />
      </div>
      <div
        role="separator"
        aria-orientation="horizontal"
        aria-label="Resize timeline"
        onPointerDown={onDividerDown}
        onPointerMove={onDividerMove}
        onPointerUp={onDividerUp}
        onPointerCancel={onDividerUp}
        className="group flex h-2 shrink-0 cursor-row-resize items-center justify-center max-md:hidden"
      >
        <span className="h-[3px] w-12 rounded-full bg-subtle group-hover:bg-orange/70" />
      </div>
      <div className="shrink-0 px-1.5 pb-1.5 max-md:h-[50dvh]" style={{ height: tlH }}>
        <NleTimeline state={state} dispatch={dispatch} onDropFiles={onDropFiles} className="h-full" />
      </div>

      <NleExportDialog open={exportOpen} onClose={() => setExportOpen(false)} seq={state.seq} />
      <EditorToast toast={toast} />
    </div>
  );
}
