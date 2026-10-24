'use client';

import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import { EDITOR_INBOX_EVENT, clearEditorInbox, readEditorInbox } from '@/lib/editor-inbox';
import { isTypingTarget } from '@/lib/events';
import { ClipSceneBin } from './ClipSceneBin';
import { DiffModal, EditorToast, PromptPreviewModal, type AppliedFile, type ToastState } from './EditorModals';
import { EditorHeader } from './EditorHeader';
import { InspectorPanel } from './InspectorPanel';
import { MultiTrackTimeline } from './MultiTrackTimeline';
import { compilePrompt, copyToastText, singlePinMarkdown, toRlInputs, writeClipboard } from './prompt';
import { SpatialVideoCanvas } from './SpatialVideoCanvas';
import { STORAGE_KEY, clipAt, editorReducer, inboxItemToClip, initialState, nextPinNumber, parsePersisted, toPersisted, totalDuration } from './state';
import type { ClipFilter, ClipStatus, EditorClip, EditorPin, GroupMode, InspectorTab, PinDraft, PinMode, PlaybackSpeed, SkillTag } from './types';

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

export function EditorApp() {
  const [state, dispatch] = useReducer(editorReducer, undefined, initialState);
  const [toast, setToast] = useState<ToastState | null>(null);
  const [preview, setPreview] = useState(false);
  const [applied, setApplied] = useState<AppliedFile[] | null>(null);
  const [applying, setApplying] = useState(false);
  const toastSeq = useRef(0);
  const stateRef = useRef(state);
  stateRef.current = state;

  const notify = useCallback((text: string, tone: ToastState['tone'] = 'ok') => {
    toastSeq.current += 1;
    setToast({ id: toastSeq.current, text, tone });
  }, []);
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 3600);
    return () => clearTimeout(t);
  }, [toast]);

  // ── hydrate from localStorage, then pull the cross-app inbox ──
  const importInbox = useCallback(() => {
    const items = readEditorInbox();
    if (!items.length) return;
    const s = stateRef.current;
    let num = s.clips.reduce((m, c) => Math.max(m, c.number), 0);
    const existing = new Set(s.clips.map((c) => c.id));
    const fresh = items.filter((it) => it && typeof it.id === 'string' && !existing.has(`inbox-${it.id}`));
    const clips = fresh.map((it) => inboxItemToClip(it, ++num));
    clearEditorInbox();
    if (!clips.length) return;
    dispatch({ type: 'ADD_CLIPS', clips });
    const sources = [...new Set(fresh.map((f) => f.source))].join(' & ');
    notify(`Imported ${clips.length} clip${clips.length === 1 ? '' : 's'} from ${sources} into the bin`, 'info');
  }, [notify]);

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
    if (!state.hydrated) return;
    importInbox();
    const onInbox = () => importInbox();
    window.addEventListener(EDITOR_INBOX_EVENT, onInbox);
    const onStorage = (e: StorageEvent) => e.key === 'rubric:editor-inbox' && importInbox();
    window.addEventListener('storage', onStorage);
    return () => {
      window.removeEventListener(EDITOR_INBOX_EVENT, onInbox);
      window.removeEventListener('storage', onStorage);
    };
  }, [state.hydrated, importInbox]);

  // ── persist pins / toggles / clip statuses ──
  useEffect(() => {
    if (!state.hydrated) return;
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(toPersisted(stateRef.current)));
    } catch {
      // storage full / private mode — app keeps working in memory
    }
  }, [state.hydrated, state.pins, state.clips, state.teachCut, state.teachAnimate, state.project, state.group]);

  // ── object URL lifecycle for imported files ──
  const urlsRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    const now = new Set(state.clips.map((c) => c.videoUrl).filter((u): u is string => !!u));
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
    return compilePrompt({ project: s.project, clips: s.clips, pins: s.pins.filter((p) => !p.resolved), teachCut: s.teachCut, teachAnimate: s.teachAnimate });
  }, []);

  const copyAll = useCallback(async () => {
    const s = stateRef.current;
    const n = s.pins.filter((p) => !p.resolved).length;
    if (!n) {
      notify('No unresolved pins to copy — drop a pin on the frame first.', 'info');
      return;
    }
    const ok = await writeClipboard(compile());
    if (ok) notify(copyToastText(n, s.teachCut, s.teachAnimate));
    else notify('Clipboard blocked by the browser — open Preview Prompt and copy manually.', 'error');
  }, [compile, notify]);

  const apply = useCallback(async () => {
    const s = stateRef.current;
    if (!s.teachCut && !s.teachAnimate) {
      notify('Turn on "Teach my /cut" or "Teach my /animate" first.', 'info');
      return;
    }
    const pins = s.pins.filter((p) => !p.resolved);
    setApplying(true);
    try {
      const res = await fetch('/api/editor/apply-feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ project: s.project, teach: { cut: s.teachCut, animate: s.teachAnimate }, pins: toRlInputs(pins, s.clips) }),
      });
      const data = (await res.json().catch(() => ({}))) as { files?: AppliedFile[]; error?: string };
      if (!res.ok || !Array.isArray(data.files)) throw new Error(data.error || `HTTP ${res.status}`);
      setApplied(data.files);
      notify(`Taught ${data.files.map((f) => f.path.replace('workspace/skills/', '/').replace('/SKILL.md', '')).join(' & ')} — rules appended locally.`);
    } catch (err) {
      notify(`Apply & Teach failed: ${(err as Error).message}`, 'error');
    } finally {
      setApplying(false);
    }
  }, [notify]);

  const reset = useCallback(() => {
    if (!window.confirm('Reset VOLTA Editor to the seed project? Local pins, statuses and imported clips will be discarded.')) return;
    dispatch({ type: 'RESET' });
    notify('Editor reset to seed data.', 'info');
  }, [notify]);

  const importFile = useCallback(
    async (file: File) => {
      if (!/^video\/(mp4|webm|quicktime)$/.test(file.type) && !/\.(mp4|webm|mov)$/i.test(file.name)) {
        notify('Only MP4 / WebM video files can be imported.', 'error');
        return;
      }
      const url = URL.createObjectURL(file);
      const probe = await probeVideo(url);
      if (!probe) {
        URL.revokeObjectURL(url);
        notify(`Couldn't decode ${file.name} in this browser.`, 'error');
        return;
      }
      const id = `file-${Date.now().toString(36)}`;
      const clip: Omit<EditorClip, 'startSec' | 'number'> = {
        id,
        title: file.name.replace(/\.[^.]+$/, '').slice(0, 60) || 'Imported clip',
        kind: 'A-ROLL CUT',
        status: 'NEEDS REVIEW',
        durationSec: Math.round(probe.duration * 30) / 30,
        sourcePath: `local://${file.name}`,
        sceneKey: 'title-reveal',
        animationLabel: 'Imported footage',
        voiceover: [],
        origin: 'file',
        videoUrl: url,
        fileName: file.name,
        thumbUrl: probe.thumb,
      };
      dispatch({ type: 'ADD_CLIPS', clips: [clip], select: true });
      notify(`Imported ${file.name} (${probe.duration.toFixed(1)}s) — local only, never uploaded.`, 'info');
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
      project: (project: string) => dispatch({ type: 'SET_PROJECT', project }),
      selectClip: (clipId: string) => dispatch({ type: 'SELECT_CLIP', clipId }),
      clearFocus: () => dispatch({ type: 'CLEAR_FOCUS' }),
      cycleStatus: (clipId: string) => dispatch({ type: 'CYCLE_CLIP_STATUS', clipId }),
      setStatus: (clipId: string, status: ClipStatus) => dispatch({ type: 'SET_CLIP_STATUS', clipId, status }),
      removeClip: (clipId: string) => dispatch({ type: 'REMOVE_CLIP', clipId }),
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
          text: kind === 'animate' ? `Attach a visual / animation cue for “${line}” — illustrate this line on screen.` : `Mark cut / trim here: tighten the delivery around “${line}”.`,
        }),
    }),
    [],
  );

  const openPreview = useCallback(() => setPreview(true), []);

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

  return (
    <div className="flex h-screen w-screen flex-col overflow-hidden bg-obsidian text-paper">
      <style>{EDITOR_CSS}</style>
      <EditorHeader
        project={state.project}
        teachCut={state.teachCut}
        teachAnimate={state.teachAnimate}
        filter={state.filter}
        unresolvedCount={unresolved.length}
        applying={applying}
        onProject={h.project}
        onToggleTeach={h.teach}
        onFilter={h.filter}
        onPreview={openPreview}
        onCopyAll={copyAll}
        onApply={apply}
        onReset={reset}
      />
      <div className="flex min-h-0 flex-1 gap-2 px-2 pt-2">
        <div className="h-full min-h-0 w-[20%] min-w-[200px]">
          <ClipSceneBin
            clips={state.clips}
            pins={state.pins}
            filter={state.filter}
            activeClipId={activeId}
            focusClipId={state.focusClipId}
            onSelect={h.selectClip}
            onCycleStatus={h.cycleStatus}
            onSetStatus={h.setStatus}
            onRemove={h.removeClip}
          />
        </div>
        <div className="h-full min-h-0 w-[54%] min-w-0 flex-1">
          <SpatialVideoCanvas
            clip={active}
            pins={state.pins}
            draft={state.draft}
            pulse={state.pulse}
            nextPinNumber={nextPinNumber(state.pins)}
            playhead={state.playhead}
            total={total}
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
        <div className="h-full min-h-0 w-[26%] min-w-[260px]">
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
