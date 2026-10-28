'use client';

import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import { EDITOR_INBOX_EVENT, readEditorInbox, replaceEditorInbox } from '@/lib/editor-inbox';
import { EDITOR_INBOX_KEY, mediaIdFromUrl } from '@/lib/media-ids';
import { isTypingTarget } from '@/lib/events';
import type { EditorEpisodeRef, EditorFeedbackResponse, EditorMediaItem, EditorReviewNoteResponse, EditorSkillsResponse } from '@/types/editor';
import type { NotionPageDoc, NotionSection, VpCatalog, VpEpisode } from '@/types/notion';
import { guessOutlineValue } from '@/lib/notion-md';
import type { EditorInboxItem } from '@/types/os';
import { DiffModal, EditorToast, PromptPreviewModal, type AppliedFile, type ToastState } from './EditorModals';
import { EditorHeader } from './EditorHeader';
import { InspectorPanel } from './InspectorPanel';
import { MediaBin, type BinState } from './MediaBin';
import { MultiTrackTimeline } from './MultiTrackTimeline';
import { compilePrompt, copyToastText, singlePinMarkdown, toRlInputs, writeClipboard } from './prompt';
import { SpatialVideoCanvas } from './SpatialVideoCanvas';
import { STORAGE_KEY, clipAt, clipFromMedia, editorReducer, inboxVoiceover, initialState, nextPinNumber, parsePersisted, recordsFromPins, toPersisted, totalDuration, type NewClip } from './state';
import { DEFAULT_FPS, type ClipFilter, type ClipStatus, type EditorClip, type EditorPin, type GroupMode, type InspectorTab, type NotesState, type PinDraft, type PinMode, type PlaybackSpeed, type SkillTag } from './types';

const EDITOR_CSS = `
@keyframes editor-pin-ping { 0% { transform: scale(1); opacity: .9 } 80%,100% { transform: scale(2.3); opacity: 0 } }
.editor-pin-ping { animation: editor-pin-ping 1.6s cubic-bezier(0.16,1,0.3,1) infinite; }
@keyframes editor-pin-burst { 0% { transform: scale(1); opacity: 1 } 100% { transform: scale(4.2); opacity: 0 } }
.editor-pin-burst { animation: editor-pin-burst 0.55s ease-out 3; }
@keyframes editor-card-flash { 0%,100% { box-shadow: 0 0 0 0 rgba(255,85,0,0) } 30% { box-shadow: 0 0 0 3px rgba(255,85,0,.55) } }
.editor-card-flash { animation: editor-card-flash 0.6s ease-out 2; }
@keyframes rubric-toast-in { from { transform: translateY(10px); opacity: 0 } to { transform: none; opacity: 1 } }
`;

/** Read duration + a midpoint frame thumbnail from a local video object URL. */
function probeVideo(url: string): Promise<{ duration: number; thumb?: string } | null> {
  return new Promise((resolve) => {
    const v = document.createElement('video');
    v.muted = true;
    v.preload = 'auto';
    v.playsInline = true;
    let duration = 0;
    let done = false;
    const finish = (r: { duration: number; thumb?: string } | null) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      v.removeAttribute('src');
      v.load();
      resolve(r);
    };
    const timer = setTimeout(() => finish(duration > 0 ? { duration } : null), 8000);
    v.onloadedmetadata = () => {
      duration = Number.isFinite(v.duration) && v.duration > 0 ? v.duration : 30;
      try {
        v.currentTime = Math.min(duration / 2, Math.max(0, duration - 0.1));
      } catch {
        finish({ duration });
      }
    };
    v.onseeked = () => {
      try {
        const c = document.createElement('canvas');
        c.width = 192;
        c.height = 108;
        const ctx = c.getContext('2d');
        if (ctx && v.videoWidth) {
          const s = Math.min(c.width / v.videoWidth, c.height / v.videoHeight);
          const w = v.videoWidth * s;
          const h = v.videoHeight * s;
          ctx.fillStyle = '#000';
          ctx.fillRect(0, 0, c.width, c.height);
          ctx.drawImage(v, (c.width - w) / 2, (c.height - h) / 2, w, h);
          finish({ duration, thumb: c.toDataURL('image/jpeg', 0.72) });
          return;
        }
      } catch {
        // tainted / decode failure — fall back to no thumbnail
      }
      finish({ duration });
    };
    v.onerror = () => finish(null);
    v.src = url;
  });
}

interface NoteInfo {
  state: NotesState;
  detail: string | null;
}

const BACKUP_PREFIX = 'volta:editor:fb:';
interface Backup {
  dirty: boolean;
  status: ClipStatus;
  pins: ReturnType<typeof recordsFromPins>;
  episode?: EditorEpisodeRef | null;
}
function readBackup(id: string): Backup | null {
  try {
    const raw = window.localStorage.getItem(BACKUP_PREFIX + id);
    const o = raw ? (JSON.parse(raw) as Backup) : null;
    return o && Array.isArray(o.pins) ? o : null;
  } catch {
    return null;
  }
}
function writeBackup(id: string, b: Backup): void {
  try {
    window.localStorage.setItem(BACKUP_PREFIX + id, JSON.stringify(b));
  } catch {
    // storage unavailable: the server copy is still the source of truth
  }
}

/** What the server stores for a file (numbers are session-local, so they are not part of the change signature). */
const episodeSig = (e: EditorEpisodeRef | null | undefined) => (e ? [e.key, e.section] : null);
function signature(clip: EditorClip, pins: EditorPin[]): string {
  return JSON.stringify({ s: clip.status, p: recordsFromPins(pins, clip).map(({ number: _n, ...r }) => r).sort((a, b) => (a.id < b.id ? -1 : 1)), e: episodeSig(clip.episode) });
}

async function jsonFetch<T>(url: string, body?: unknown, keepalive = false): Promise<T> {
  const res = await fetch(url, body === undefined ? { cache: 'no-store' } : { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), keepalive });
  const data = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
  return data;
}

export function EditorApp({ modeSwitch }: { modeSwitch?: React.ReactNode } = {}) {
  const [state, dispatch] = useReducer(editorReducer, undefined, initialState);
  const [toast, setToast] = useState<ToastState | null>(null);
  const [preview, setPreview] = useState(false);
  const [applied, setApplied] = useState<AppliedFile[] | null>(null);
  const [applying, setApplying] = useState(false);
  const [savingNote, setSavingNote] = useState(false);
  const [bin, setBin] = useState<BinState>({ status: 'loading', data: null, error: null });
  const [skills, setSkills] = useState<EditorSkillsResponse | null>(null);
  const [notes, setNotes] = useState<Record<string, NoteInfo>>({});
  const [handoffs, setHandoffs] = useState<EditorInboxItem[]>([]);
  const [episodes, setEpisodes] = useState<{ status: 'loading' | 'ready' | 'error'; list: VpEpisode[]; error: string | null }>({ status: 'loading', list: [], error: null });
  const [outlines, setOutlines] = useState<Record<string, NotionSection[] | 'error'>>({});
  const toastSeq = useRef(0);
  const stateRef = useRef(state);
  stateRef.current = state;
  const binRef = useRef(bin);
  binRef.current = bin;

  // per-file persistence bookkeeping (refs: they must not re-render)
  const loadedRef = useRef<Set<string>>(new Set()); // notes fetched OK: autosave allowed
  const sigRef = useRef<Map<string, string>>(new Map()); // last signature known to be on the server
  const timersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
  const savingRef = useRef<Set<string>>(new Set());
  const restoredRef = useRef(false);

  const notify = useCallback((text: string, tone: ToastState['tone'] = 'ok') => {
    toastSeq.current += 1;
    setToast({ id: toastSeq.current, text, tone });
  }, []);
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 4200);
    return () => clearTimeout(t);
  }, [toast]);

  const setNote = useCallback((id: string, noteState: NotesState, detail: string | null = null) => {
    setNotes((m) => (m[id]?.state === noteState && m[id]?.detail === detail ? m : { ...m, [id]: { state: noteState, detail } }));
  }, []);

  // ── media bin + live skill targets ──
  const loadBin = useCallback(async (refresh = false) => {
    setBin((b) => ({ ...b, status: 'loading', error: null }));
    try {
      const data = await jsonFetch<BinState['data'] & object>(`/api/editor/media${refresh ? '?refresh=1' : ''}`);
      setBin({ status: 'ready', data: data as BinState['data'], error: null });
    } catch (err) {
      setBin((b) => ({ ...b, status: 'error', error: (err as Error).message }));
    }
  }, []);
  useEffect(() => {
    void loadBin();
    jsonFetch<EditorSkillsResponse>('/api/editor/skills')
      .then(setSkills)
      .catch(() => setSkills(null));
    jsonFetch<VpCatalog>('/api/notion/catalog')
      .then((c) => setEpisodes({ status: 'ready', list: c.episodes, error: null }))
      .catch((err: Error) => setEpisodes({ status: 'error', list: [], error: err.message }));
  }, [loadBin]);

  // outline text for every episode a file on the timeline is tagged with (the prompt compiler quotes the chosen section)
  const outlineRequested = useRef<Set<string>>(new Set());
  const loadOutline = useCallback(async (outlineId: string): Promise<NotionSection[] | null> => {
    if (outlineRequested.current.has(outlineId)) return null;
    outlineRequested.current.add(outlineId);
    try {
      const page = await jsonFetch<NotionPageDoc>(`/api/notion/page?id=${outlineId}`);
      setOutlines((m) => ({ ...m, [outlineId]: page.sections }));
      return page.sections;
    } catch {
      outlineRequested.current.delete(outlineId); // allow a retry on the next tag / open
      setOutlines((m) => ({ ...m, [outlineId]: 'error' }));
      return null;
    }
  }, []);
  useEffect(() => {
    for (const c of state.clips) if (c.episode?.outlineId && !(c.episode.outlineId in outlines)) void loadOutline(c.episode.outlineId);
  }, [state.clips, outlines, loadOutline]);

  // ── per-file notes: load ──
  const loadNotes = useCallback(
    async (clip: EditorClip) => {
      setNote(clip.id, 'loading');
      try {
        const r = await jsonFetch<EditorFeedbackResponse>(`/api/editor/feedback?fileKey=${encodeURIComponent(clip.id)}`);
        const backup = readBackup(clip.id);
        const useBackup = !!backup?.dirty && (backup.pins.length > 0 || backup.status !== 'NEEDS REVIEW');
        const records = useBackup ? backup!.pins : (r.doc?.pins ?? backup?.pins.filter(() => !r.available) ?? []);
        const status = useBackup ? backup!.status : (r.doc?.status ?? 'NEEDS REVIEW');
        const episode = useBackup && backup!.episode !== undefined ? backup!.episode : (r.doc?.episode ?? null);
        dispatch({ type: 'LOAD_PINS', clipId: clip.id, records, status, episode });
        loadedRef.current.add(clip.id);
        // baseline = what the server holds; a recovered local backup differs from it, so it gets saved by the autosave pass
        if (useBackup || !r.available) sigRef.current.delete(clip.id);
        else sigRef.current.set(clip.id, JSON.stringify({ s: status, p: records.map(({ number: _n, ...x }) => x).sort((a, b) => (a.id < b.id ? -1 : 1)), e: episodeSig(episode) }));
        if (!r.available) setNote(clip.id, 'error', r.reason);
        else {
          setNote(clip.id, useBackup ? 'dirty' : 'saved');
          if (useBackup) notify(`Recovered unsaved notes for ${clip.name} and re-saving them.`, 'info');
        }
      } catch (err) {
        setNote(clip.id, 'error', `Could not load saved notes (${(err as Error).message}). Take the file off the timeline and reopen it to retry; nothing is overwritten.`);
        notify(`Saved notes for ${clip.name} could not be loaded: ${(err as Error).message}`, 'error');
      }
    },
    [notify, setNote],
  );

  // ── per-file notes: save ──
  const saveClip = useCallback(
    async (id: string, keepalive = false): Promise<boolean> => {
      const t = timersRef.current.get(id);
      if (t) clearTimeout(t);
      timersRef.current.delete(id);
      const s = stateRef.current;
      const clip = s.clips.find((c) => c.id === id);
      if (!clip || clip.origin !== 'server' || !loadedRef.current.has(id)) return true;
      if (savingRef.current.has(id)) {
        // a save is in flight: try again right after it
        timersRef.current.set(id, setTimeout(() => void saveClip(id), 300));
        return true;
      }
      const sig = signature(clip, s.pins);
      if (sigRef.current.get(id) === sig) {
        setNote(id, 'saved');
        return true;
      }
      const records = recordsFromPins(s.pins, clip);
      writeBackup(id, { dirty: true, status: clip.status, pins: records, episode: clip.episode });
      savingRef.current.add(id);
      setNote(id, 'saving');
      try {
        const saved = await jsonFetch<{ episode?: EditorEpisodeRef | null }>('/api/editor/feedback', { fileKey: id, pins: records, status: clip.status, episode: clip.episode ? { key: clip.episode.key, section: clip.episode.section } : null }, keepalive);
        sigRef.current.set(id, sig);
        writeBackup(id, { dirty: false, status: clip.status, pins: records, episode: clip.episode });
        // the server fills in the title and Notion links: keep its copy
        if (saved.episode && clip.episode && saved.episode.key === clip.episode.key && saved.episode.section === clip.episode.section) dispatch({ type: 'SET_EPISODE', clipId: id, episode: saved.episode });
        const cur = stateRef.current.clips.find((c) => c.id === id);
        setNote(id, cur && signature(cur, stateRef.current.pins) !== sig ? 'dirty' : 'saved');
        return true;
      } catch (err) {
        setNote(id, 'error', (err as Error).message);
        notify(`Notes for ${clip.name} were not saved: ${(err as Error).message}`, 'error');
        return false;
      } finally {
        savingRef.current.delete(id);
      }
    },
    [notify, setNote],
  );

  // autosave: debounce per file whenever its pins / status differ from what the server holds
  useEffect(() => {
    for (const c of state.clips) {
      if (c.origin !== 'server' || !loadedRef.current.has(c.id)) continue;
      const sig = signature(c, state.pins);
      if (sigRef.current.get(c.id) === sig) continue;
      setNote(c.id, savingRef.current.has(c.id) ? 'saving' : 'dirty');
      const old = timersRef.current.get(c.id);
      if (old) clearTimeout(old);
      timersRef.current.set(
        c.id,
        setTimeout(() => void saveClip(c.id), 450),
      );
    }
  }, [state.clips, state.pins, saveClip, setNote]);

  // flush pending saves when the tab is hidden or closed
  useEffect(() => {
    const flush = () => {
      for (const id of [...timersRef.current.keys()]) void saveClip(id, true);
    };
    const onVis = () => document.visibilityState === 'hidden' && flush();
    window.addEventListener('pagehide', flush);
    document.addEventListener('visibilitychange', onVis);
    return () => {
      window.removeEventListener('pagehide', flush);
      document.removeEventListener('visibilitychange', onVis);
    };
  }, [saveClip]);

  // ── open a real file on the timeline ──
  const openItem = useCallback(
    async (item: EditorMediaItem, opts: { select?: boolean; voiceover?: EditorClip['voiceover'] } = {}) => {
      const select = opts.select ?? true;
      if (stateRef.current.clips.some((c) => c.id === item.id)) {
        if (select) dispatch({ type: 'SELECT_CLIP', clipId: item.id });
        return;
      }
      if (item.offline) {
        notify(`${item.name} is an iCloud placeholder and is not downloaded to this Mac.`, 'error');
        return;
      }
      let durationOverride: number | undefined;
      if (item.media !== 'image' && item.durationSec === null) {
        const probe = await probeVideo(item.url);
        if (!probe) {
          notify(`Could not read the duration of ${item.name} (ffprobe and the browser both failed).`, 'error');
          return;
        }
        durationOverride = probe.duration;
      }
      if (stateRef.current.clips.some((c) => c.id === item.id)) return; // opened meanwhile
      const clip = clipFromMedia(item, { durationOverride, voiceover: opts.voiceover });
      dispatch({ type: 'ADD_CLIPS', clips: [clip], select });
      // the reducer assigns number / startSec; loadNotes only needs identity + name until LOAD_PINS runs against the stored clip
      void loadNotes({ ...clip, number: 0, startSec: 0 });
    },
    [loadNotes, notify],
  );

  const fetchItem = useCallback(async (key: string): Promise<EditorMediaItem | null> => {
    const fromBin = binRef.current.data?.groups.flatMap((g) => g.items).find((i) => i.id === key);
    if (fromBin) return fromBin;
    try {
      return (await jsonFetch<{ item: EditorMediaItem }>(`/api/editor/media?id=${encodeURIComponent(key)}`)).item;
    } catch {
      return null;
    }
  }, []);

  // ── hydrate toggles, then reopen the files that were open ──
  useEffect(() => {
    let saved = null;
    try {
      saved = parsePersisted(window.localStorage.getItem(STORAGE_KEY));
    } catch {
      saved = null;
    }
    dispatch({ type: 'HYDRATE', saved });
  }, []);
  useEffect(() => {
    if (!state.hydrated || restoredRef.current || bin.status === 'loading') return;
    restoredRef.current = true;
    const ids = stateRef.current.restoreIds;
    void (async () => {
      for (const id of ids) {
        const item = await fetchItem(id);
        if (item) await openItem(item, { select: false });
      }
    })();
  }, [state.hydrated, bin.status, fetchItem, openItem]);

  // ── inbox: items from Generations / Studio carry a file id or url and open as real clips ──
  const importInbox = useCallback(async () => {
    const items = readEditorInbox();
    if (!items.length) return;
    const keyed = items.map((it) => ({ it, key: it && typeof it.id === 'string' ? mediaIdFromUrl(it.mediaUrl) : null }));
    // consume the file-backed items now; anything unresolved is put back below so nothing vanishes silently
    replaceEditorInbox(keyed.filter((k) => !k.key).map((k) => k.it));
    const leftovers: EditorInboxItem[] = keyed.filter((k) => !k.key).map((k) => k.it);
    let opened = 0;
    let last: EditorMediaItem | null = null;
    for (const { it, key } of keyed) {
      if (!key) continue;
      let item = await fetchItem(key);
      if (!item && it.file) item = binRef.current.data?.groups.flatMap((g) => g.items).find((i) => i.path === it.file) ?? null;
      if (!item) {
        leftovers.push(it);
        continue;
      }
      const already = stateRef.current.clips.some((c) => c.id === item!.id);
      await openItem(item, { select: false, voiceover: inboxVoiceover(it) });
      if (!already) opened += 1;
      last = item;
    }
    if (leftovers.length) {
      const known = new Set(leftovers.map((l) => l.id));
      replaceEditorInbox(leftovers);
      setHandoffs([...known].map((id) => leftovers.find((l) => l.id === id) as EditorInboxItem));
    } else setHandoffs([]);
    if (last) dispatch({ type: 'SELECT_CLIP', clipId: last.id });
    if (opened) notify(`Opened ${opened} file${opened === 1 ? '' : 's'} from the inbox.`, 'info');
    const unresolved = leftovers.filter((l) => mediaIdFromUrl(l.mediaUrl));
    if (unresolved.length) notify(`${unresolved.length} inbox item${unresolved.length === 1 ? '' : 's'} pointed at a file that no longer resolves (moved or drive unplugged).`, 'error');
  }, [fetchItem, notify, openItem]);

  useEffect(() => {
    if (!state.hydrated || bin.status === 'loading') return;
    void importInbox();
    const onInbox = () => void importInbox();
    window.addEventListener(EDITOR_INBOX_EVENT, onInbox);
    const onStorage = (e: StorageEvent) => e.key === EDITOR_INBOX_KEY && void importInbox();
    window.addEventListener('storage', onStorage);
    return () => {
      window.removeEventListener(EDITOR_INBOX_EVENT, onInbox);
      window.removeEventListener('storage', onStorage);
    };
  }, [state.hydrated, bin.status, importInbox]);

  const dismissHandoff = useCallback((id: string) => {
    setHandoffs((h) => {
      const next = h.filter((x) => x.id !== id);
      replaceEditorInbox(next);
      return next;
    });
  }, []);

  // ── persist toggles + which files are open (pins live on disk per file) ──
  useEffect(() => {
    if (!state.hydrated) return;
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(toPersisted(stateRef.current)));
    } catch {
      // storage full / private mode: app keeps working in memory
    }
  }, [state.hydrated, state.clips, state.teachCut, state.teachAnimate, state.group]);

  // ── object URL lifecycle for session-only imports ──
  const urlsRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    const now = new Set(state.clips.filter((c) => c.origin === 'local').map((c) => c.url));
    for (const u of urlsRef.current) if (!now.has(u)) URL.revokeObjectURL(u);
    urlsRef.current = now;
  }, [state.clips]);
  useEffect(
    () => () => {
      for (const u of urlsRef.current) URL.revokeObjectURL(u);
    },
    [],
  );

  // ── rAF playback clock ──
  useEffect(() => {
    if (!state.playing) return;
    let raf = 0;
    let last = performance.now();
    const loop = (now: number) => {
      const dt = Math.min(0.1, Math.max(0, (now - last) / 1000));
      last = now;
      dispatch({ type: 'TICK', dt });
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [state.playing]);

  // ── pulse auto-clear ──
  useEffect(() => {
    if (!state.pulse) return;
    const t = setTimeout(() => dispatch({ type: 'CLEAR_PULSE' }), 2200);
    return () => clearTimeout(t);
  }, [state.pulse]);

  // ── derived ──
  const total = totalDuration(state.clips);
  const active = clipAt(state.clips, state.playhead);
  const activeId = active?.id ?? null;
  const unresolved = useMemo(() => state.pins.filter((p) => !p.resolved), [state.pins]);
  const noteStates = useMemo(() => {
    const out: Record<string, NotesState> = {};
    for (const c of state.clips) out[c.id] = c.origin === 'local' ? 'local' : (notes[c.id]?.state ?? 'loading');
    return out;
  }, [state.clips, notes]);
  const activeLineKey = useMemo(() => {
    if (!active) return null;
    const local = state.playhead - active.startSec;
    let idx = -1;
    active.voiceover.forEach((v, i) => {
      if (v.atSec <= local) idx = i;
    });
    return idx >= 0 ? `${active.id}:${idx}` : null;
  }, [active, state.playhead]);

  // ── actions ──
  const compile = useCallback(() => {
    const s = stateRef.current;
    const ready: Record<string, NotionSection[]> = {};
    for (const [id, v] of Object.entries(outlines)) if (Array.isArray(v)) ready[id] = v;
    return compilePrompt({ clips: s.clips, pins: s.pins.filter((p) => !p.resolved), teachCut: s.teachCut, teachAnimate: s.teachAnimate, skills, outlines: ready });
  }, [skills, outlines]);

  // tag a file with a Notion episode (and optionally the outline chapter / beat it is about); stored with its pins on Windsor
  const setEpisode = useCallback(
    async (clipId: string, key: string | null, section?: string | null) => {
      const clip = stateRef.current.clips.find((c) => c.id === clipId);
      if (!clip) return;
      if (!key) {
        dispatch({ type: 'SET_EPISODE', clipId, episode: null });
        return;
      }
      const ep = episodes.list.find((e) => e.key === key);
      if (!ep) return;
      const same = clip.episode?.key === key;
      const ref: EditorEpisodeRef = {
        key,
        number: ep.number,
        title: ep.title,
        section: section !== undefined ? section : same ? (clip.episode?.section ?? null) : null,
        outlineId: ep.outline?.id ?? null,
        outlineTitle: ep.outline?.title ?? null,
        outlineUrl: ep.outline?.url ?? null,
        ledgerUrl: ep.ledger?.url ?? null,
        taggedAt: clip.episode?.taggedAt ?? new Date().toISOString(),
      };
      dispatch({ type: 'SET_EPISODE', clipId, episode: ref });
      if (!same && section === undefined && ep.outline) {
        // new episode, no explicit part: guess the chapter from the file name once the outline text is here
        const known = outlines[ep.outline.id];
        const secs = Array.isArray(known) ? known : await loadOutline(ep.outline.id);
        const guess = secs ? guessOutlineValue(clip.name, secs) : null;
        if (guess) dispatch({ type: 'SET_EPISODE', clipId, episode: { ...ref, section: guess } });
      }
    },
    [episodes.list, outlines, loadOutline],
  );

  const copyAll = useCallback(async () => {
    const s = stateRef.current;
    const n = s.pins.filter((p) => !p.resolved).length;
    if (!n) {
      notify('No unresolved pins to copy. Drop a pin on the frame first.', 'info');
      return;
    }
    const ok = await writeClipboard(compile());
    if (ok) notify(copyToastText(n, s.teachCut, s.teachAnimate));
    else notify('Clipboard blocked by the browser. Open Preview Prompt and copy manually.', 'error');
  }, [compile, notify]);

  const copyText = useCallback(
    async (text: string, label: string) => {
      const ok = await writeClipboard(text);
      notify(ok ? `Copied the ${label}.` : 'Clipboard blocked by the browser.', ok ? 'ok' : 'error');
    },
    [notify],
  );

  const apply = useCallback(async () => {
    const s = stateRef.current;
    if (!s.teachCut && !s.teachAnimate) {
      notify('Turn on "Teach my /cut" or "Teach my /animate" first.', 'info');
      return;
    }
    const pins = s.pins.filter((p) => !p.resolved);
    const projects = [...new Set(s.clips.filter((c) => pins.some((p) => p.clipId === c.id)).map((c) => c.projectName))].join(', ') || 'VOLTA Editor';
    setApplying(true);
    try {
      const data = await jsonFetch<{ files?: AppliedFile[] }>('/api/editor/apply-feedback', { project: projects, teach: { cut: s.teachCut, animate: s.teachAnimate }, pins: toRlInputs(pins, s.clips) });
      if (!Array.isArray(data.files)) throw new Error('unexpected response');
      setApplied(data.files);
      notify(`Appended rules to VOLTA's workspace copy of ${data.files.map((f) => f.path.replace('workspace/skills/', '/').replace('/SKILL.md', '')).join(' & ')} (not your live ~/.claude skills).`);
    } catch (err) {
      notify(`Apply & Teach failed: ${(err as Error).message}`, 'error');
    } finally {
      setApplying(false);
    }
  }, [notify]);

  const clearTimeline = useCallback(() => {
    const open = stateRef.current.clips.length;
    if (!open) return;
    if (!window.confirm(`Take ${open} file${open === 1 ? '' : 's'} off the timeline? Saved notes stay on disk and reload when you reopen a file. Session-only imports and their pins are discarded.`)) return;
    for (const id of [...timersRef.current.keys()]) void saveClip(id);
    loadedRef.current.clear();
    sigRef.current.clear();
    dispatch({ type: 'CLEAR_TIMELINE' });
  }, [saveClip]);

  const removeClip = useCallback(
    async (clipId: string) => {
      if (timersRef.current.has(clipId)) await saveClip(clipId);
      loadedRef.current.delete(clipId);
      sigRef.current.delete(clipId);
      dispatch({ type: 'REMOVE_CLIP', clipId });
    },
    [saveClip],
  );

  const saveNoteToProject = useCallback(async () => {
    const s = stateRef.current;
    const clip = clipAt(s.clips, s.playhead);
    if (!clip || clip.origin !== 'server') return;
    setSavingNote(true);
    try {
      await saveClip(clip.id); // make sure the pins on disk match what is on screen
      const records = recordsFromPins(stateRef.current.pins, clip);
      const res = await jsonFetch<EditorReviewNoteResponse>('/api/editor/review-note', { fileKey: clip.id, pins: records, status: stateRef.current.clips.find((c) => c.id === clip.id)?.status ?? clip.status });
      notify(`Saved ${res.pinCount} pin${res.pinCount === 1 ? '' : 's'} to ${res.projectName}: ${res.relPath}`);
    } catch (err) {
      notify(`Save notes to project failed: ${(err as Error).message}`, 'error');
    } finally {
      setSavingNote(false);
    }
  }, [notify, saveClip]);

  const importFile = useCallback(
    async (file: File) => {
      if (!/^video\/(mp4|webm|quicktime)$/.test(file.type) && !/\.(mp4|webm|mov)$/i.test(file.name)) {
        notify('Only MP4 / WebM / MOV video files can be imported.', 'error');
        return;
      }
      const url = URL.createObjectURL(file);
      const probe = await probeVideo(url);
      if (!probe) {
        URL.revokeObjectURL(url);
        notify(`Couldn't decode ${file.name} in this browser.`, 'error');
        return;
      }
      const id = `local-${Date.now().toString(36)}`;
      const clip: NewClip = {
        id,
        title: file.name.replace(/\.[^.]+$/, '').slice(0, 60) || 'Imported clip',
        name: file.name,
        path: `local://${file.name}`,
        origin: 'local',
        media: 'video',
        projectId: null,
        projectName: 'Local import',
        projectKind: null,
        projectPath: null,
        kind: 'A-ROLL CUT',
        status: 'NEEDS REVIEW',
        durationSec: Math.max(0.5, Math.round(probe.duration * DEFAULT_FPS) / DEFAULT_FPS),
        fps: DEFAULT_FPS,
        fpsKnown: false,
        width: null,
        height: null,
        hasAudio: true,
        url,
        animationLabel: 'Local import',
        voiceover: [],
        canSaveNotes: false,
        episode: null,
        thumbUrl: probe.thumb,
      };
      dispatch({ type: 'ADD_CLIPS', clips: [clip], select: true });
      notify(`Opened ${file.name} (${probe.duration.toFixed(1)}s) for this session only: not uploaded, pins are not saved.`, 'info');
    },
    [notify],
  );

  const copyPin = useCallback(
    async (id: string) => {
      const s = stateRef.current;
      const pin = s.pins.find((p) => p.id === id);
      if (!pin) return;
      const ok = await writeClipboard(singlePinMarkdown(pin, s.clips.find((c) => c.id === pin.clipId)));
      notify(ok ? `Copied Pin #${pin.number} to clipboard.` : 'Clipboard blocked by the browser.', ok ? 'ok' : 'error');
    },
    [notify],
  );

  // stable handlers for memoised children
  const h = useMemo(
    () => ({
      togglePlay: () => dispatch({ type: 'TOGGLE_PLAY' }),
      step: (frames: number) => dispatch({ type: 'STEP', frames }),
      seek: (t: number) => dispatch({ type: 'SEEK', t }),
      nextPin: () => dispatch({ type: 'NEXT_PIN' }),
      speed: (speed: PlaybackSpeed) => dispatch({ type: 'SET_SPEED', speed }),
      loop: () => dispatch({ type: 'TOGGLE_LOOP' }),
      mode: (mode: PinMode) => dispatch({ type: 'SET_MODE', mode }),
      teach: (skill: 'cut' | 'animate') => dispatch({ type: 'TOGGLE_TEACH', skill }),
      filter: (filter: ClipFilter) => dispatch({ type: 'SET_FILTER', filter }),
      tab: (tab: InspectorTab) => dispatch({ type: 'SET_TAB', tab }),
      group: (group: GroupMode) => dispatch({ type: 'SET_GROUP', group }),
      selectClip: (clipId: string) => dispatch({ type: 'SELECT_CLIP', clipId }),
      clearFocus: () => dispatch({ type: 'CLEAR_FOCUS' }),
      cycleStatus: (clipId: string) => dispatch({ type: 'CYCLE_CLIP_STATUS', clipId }),
      setStatus: (clipId: string, status: ClipStatus) => dispatch({ type: 'SET_CLIP_STATUS', clipId, status }),
      startDraft: (draft: PinDraft) => dispatch({ type: 'START_DRAFT', draft }),
      cancelDraft: () => dispatch({ type: 'CANCEL_DRAFT' }),
      saveDraft: (text: string, skill: SkillTag) => dispatch({ type: 'SAVE_DRAFT', text, skill }),
      pinClick: (id: string) => dispatch({ type: 'PULSE_PIN', id, seek: false }),
      seekPin: (id: string) => dispatch({ type: 'PULSE_PIN', id, seek: true }),
      updatePin: (id: string, patch: Partial<Pick<EditorPin, 'commentText' | 'skill' | 'resolved'>>) => dispatch({ type: 'UPDATE_PIN', id, patch }),
      deletePin: (id: string) => dispatch({ type: 'DELETE_PIN', id }),
      editing: (id: string | null) => dispatch({ type: 'SET_EDITING', id }),
      addCue: (clipId: string, atSec: number, line: string, kind: 'animate' | 'cut') =>
        dispatch({
          type: 'ADD_SCRIPT_PIN',
          clipId,
          timestampSec: atSec,
          line,
          skill: kind === 'animate' ? '/animate' : '/cut',
          text: kind === 'animate' ? `Attach a visual / animation cue for “${line}”: illustrate this line on screen.` : `Mark cut / trim here: tighten the delivery around “${line}”.`,
        }),
    }),
    [],
  );

  const openPreview = useCallback(() => setPreview(true), []);
  const onOffline = useCallback(
    (item: EditorMediaItem) => {
      if (item.brctl) void writeClipboard(item.brctl);
      notify(`${item.name} is not downloaded from iCloud. ${item.brctl ? 'The command is copied: run it in Terminal, then refresh the bin.' : 'Download it in Finder, then refresh the bin.'}`, 'info');
    },
    [notify],
  );

  const clipStart = useCallback(() => {
    const c = clipAt(stateRef.current.clips, stateRef.current.playhead);
    if (c) dispatch({ type: 'SEEK', t: c.startSec });
  }, []);

  // ── keyboard shortcuts (skipped while typing) ──
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented) return;
      if (e.key === 'Escape') {
        if (stateRef.current.draft) dispatch({ type: 'CANCEL_DRAFT' });
        return;
      }
      if (isTypingTarget(e.target) || e.metaKey || e.ctrlKey || e.altKey) return;
      if (preview || applied) return;
      if (e.code === 'Space' || e.key === ' ') {
        e.preventDefault();
        // a focused button would otherwise also "click" on keyup
        if ((e.target as HTMLElement | null)?.tagName === 'BUTTON') (e.target as HTMLElement).blur();
        dispatch({ type: 'TOGGLE_PLAY' });
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        dispatch({ type: 'STEP', frames: e.shiftKey ? -10 : -1 });
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        dispatch({ type: 'STEP', frames: e.shiftKey ? 10 : 1 });
      } else if (e.key === 'n' || e.key === 'N') {
        dispatch({ type: 'NEXT_PIN' });
      } else if (e.key === 'p' || e.key === 'P') {
        dispatch({ type: 'SET_MODE', mode: 'point' });
      } else if (e.key === 'b' || e.key === 'B') {
        dispatch({ type: 'SET_MODE', mode: 'box' });
      } else if (e.key === 'l' || e.key === 'L') {
        dispatch({ type: 'TOGGLE_LOOP' });
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [preview, applied]);

  const saveHint = !active
    ? 'Open a file first.'
    : active.origin !== 'server'
      ? 'Session-only imports have no project to save to.'
      : !active.canSaveNotes
        ? 'Generations files do not belong to a Studio project, so there is no project folder to write to. Their pins are still saved on the Windsor drive.'
        : `Write a dated markdown review note (pins, timestamps, coordinates, text) to ${active.projectPath}/review-notes/ (a new file each time)`;

  return (
    <div className="flex h-screen w-screen flex-col overflow-hidden bg-obsidian text-paper">
      <style>{EDITOR_CSS}</style>
      <EditorHeader
        canSaveNote={!!active && active.origin === 'server' && active.canSaveNotes}
        saveNoteHint={saveHint}
        savingNote={savingNote}
        onSaveNote={saveNoteToProject}
        teachCut={state.teachCut}
        teachAnimate={state.teachAnimate}
        filter={state.filter}
        unresolvedCount={unresolved.length}
        applying={applying}
        onToggleTeach={h.teach}
        onFilter={h.filter}
        onPreview={openPreview}
        onCopyAll={copyAll}
        onApply={apply}
        onClear={clearTimeline}
        modeSwitch={modeSwitch}
      />
      <div className="flex min-h-0 flex-1 gap-2 px-2 pt-2 max-md:flex-col max-md:overflow-y-auto max-md:pb-2">
        <div className="h-full min-h-0 w-[24%] min-w-[250px] max-md:h-[70dvh] max-md:w-full max-md:min-w-0 max-md:shrink-0">
          <MediaBin
            clips={state.clips}
            pins={state.pins}
            filter={state.filter}
            activeClipId={activeId}
            focusClipId={state.focusClipId}
            notes={noteStates}
            bin={bin}
            handoffs={handoffs}
            onSelect={h.selectClip}
            onCycleStatus={h.cycleStatus}
            episodes={episodes}
            outlines={outlines}
            onSetEpisode={setEpisode}
            onSetStatus={h.setStatus}
            onRemove={removeClip}
            onOpen={(item) => void openItem(item)}
            onOffline={onOffline}
            onRefresh={() => void loadBin(true)}
            onCopy={copyText}
            onDismissHandoff={dismissHandoff}
          />
        </div>
        <div className="h-full min-h-0 w-[50%] min-w-0 flex-1 max-md:h-[60dvh] max-md:w-full max-md:flex-none max-md:shrink-0">
          <SpatialVideoCanvas
            clip={active}
            notes={active ? noteStates[active.id] : null}
            notesDetail={active ? (notes[active.id]?.detail ?? null) : null}
            pins={state.pins}
            draft={state.draft}
            pulse={state.pulse}
            nextPinNumber={nextPinNumber(state.pins)}
            playhead={state.playhead}
            total={total}
            fps={active?.fps ?? DEFAULT_FPS}
            playing={state.playing}
            speed={state.speed}
            loop={state.loop}
            mode={state.mode}
            onTogglePlay={h.togglePlay}
            onStep={h.step}
            onClipStart={clipStart}
            onNextPin={h.nextPin}
            onSpeed={h.speed}
            onLoop={h.loop}
            onMode={h.mode}
            onStartDraft={h.startDraft}
            onCancelDraft={h.cancelDraft}
            onSaveDraft={h.saveDraft}
            onPinClick={h.pinClick}
            onImport={importFile}
          />
        </div>
        <div className="h-full min-h-0 w-[24%] min-w-[260px] max-md:h-[70dvh] max-md:w-full max-md:min-w-0 max-md:shrink-0">
          <InspectorPanel
            tab={state.tab}
            group={state.group}
            clips={state.clips}
            pins={state.pins}
            focusClipId={state.focusClipId}
            pulse={state.pulse}
            editingPinId={state.editingPinId}
            activeLineKey={state.tab === 'script' ? activeLineKey : null}
            onTab={h.tab}
            onGroup={h.group}
            onClearFocus={h.clearFocus}
            onSeekPin={h.seekPin}
            onSeek={h.seek}
            onUpdatePin={h.updatePin}
            onDeletePin={h.deletePin}
            onCopyPin={copyPin}
            onEditing={h.editing}
            onAddCue={h.addCue}
          />
        </div>
      </div>
      <div className="h-[24vh] min-h-[170px] shrink-0 p-2">
        <MultiTrackTimeline
          clips={state.clips}
          pins={state.pins}
          playhead={state.playhead}
          playing={state.playing}
          total={total}
          isolate={state.isolate}
          focusClipId={state.focusClipId}
          onSeek={h.seek}
          onPinClick={h.seekPin}
          onIsolateClip={h.selectClip}
          onClearFocus={h.clearFocus}
        />
      </div>

      {preview && (
        <PromptPreviewModal
          prompt={compile()}
          count={unresolved.length}
          onCopy={() => {
            void copyAll();
          }}
          onClose={() => setPreview(false)}
        />
      )}
      {applied && <DiffModal files={applied} onClose={() => setApplied(null)} />}
      <EditorToast toast={toast} />
    </div>
  );
}

export default EditorApp;
