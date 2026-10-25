'use client';

import { AlertTriangle, Film, Music, Upload } from 'lucide-react';
import { useEffect, useLayoutEffect, useRef, useState, type PointerEvent as RPointerEvent } from 'react';
import { cn } from '@/lib/cn';
import { PinPopover, POPOVER_W } from './PinPopover';
import { isPinVisibleAt } from './state';
import { TransportBar, type TransportBarProps } from './TransportBar';
import type { EditorClip, EditorPin, NotesState, PinDraft, PinMode, RegionBox, SkillTag } from './types';

const BOX_MIN = 1.5; // percent

export interface SpatialVideoCanvasProps extends Omit<TransportBarProps, 'onClipStart'> {
  clip: EditorClip | null;
  notes: NotesState | null;
  notesDetail: string | null;
  pins: EditorPin[];
  draft: PinDraft | null;
  pulse: { id: string; nonce: number } | null;
  nextPinNumber: number;
  onClipStart: () => void;
  onStartDraft: (d: PinDraft) => void;
  onCancelDraft: () => void;
  onSaveDraft: (text: string, skill: SkillTag) => void;
  onPinClick: (id: string) => void;
  onImport: (file: File) => void;
  mode: PinMode;
}

const clamp01 = (n: number) => Math.max(0, Math.min(1, n));

/** Script line (from a Scripts hand-off) that is current at `local` seconds into the file. */
function currentCaption(clip: EditorClip, local: number): { text: string; alpha: number } {
  let line: { atSec: number; text: string } | null = null;
  let next = clip.durationSec;
  for (let i = 0; i < clip.voiceover.length; i++) {
    const v = clip.voiceover[i];
    if (v.atSec <= local) {
      line = v;
      next = clip.voiceover[i + 1]?.atSec ?? clip.durationSec;
    }
  }
  if (!line) return { text: '', alpha: 0 };
  const end = Math.min(next, line.atSec + 7);
  return { text: line.text, alpha: Math.min(clamp01((local - line.atSec) / 0.3), clamp01((end - local) / 0.3)) };
}

const NOTES_LABEL: Record<NotesState, { text: string; cls: string }> = {
  loading: { text: 'LOADING NOTES', cls: 'bg-panel-hover text-muted' },
  saved: { text: 'NOTES SAVED', cls: 'bg-green/15 text-green' },
  dirty: { text: 'UNSAVED', cls: 'bg-amber/15 text-amber' },
  saving: { text: 'SAVING', cls: 'bg-amber/15 text-amber' },
  error: { text: 'NOT SAVED', cls: 'bg-[#EF4444]/15 text-[#EF4444]' },
  local: { text: 'SESSION ONLY', cls: 'bg-panel-hover text-secondary' },
};

function PinMarker({ pin, pulsing, onClick }: { pin: EditorPin; pulsing: number | null; onClick: () => void }) {
  const color = pin.resolved ? '#22C55E' : '#FF5500';
  return (
    <>
      {pin.region && (
        <div
          className="pointer-events-none absolute rounded-sm border-2 border-dashed"
          style={{ left: `${pin.region.x}%`, top: `${pin.region.y}%`, width: `${pin.region.w}%`, height: `${pin.region.h}%`, borderColor: color, background: `${color}14` }}
        />
      )}
      <button
        type="button"
        title={`Pin #${pin.number}: ${pin.commentText}`}
        onPointerDown={(e) => e.stopPropagation()}
        onClick={(e) => {
          e.stopPropagation();
          onClick();
        }}
        className="absolute z-10 -translate-x-1/2 -translate-y-1/2"
        style={{ left: `${pin.xPercent}%`, top: `${pin.yPercent}%` }}
      >
        <span className="pointer-events-none absolute left-1/2 top-1/2 h-px w-9 -translate-x-1/2 -translate-y-1/2" style={{ background: `${color}AA` }} />
        <span className="pointer-events-none absolute left-1/2 top-1/2 h-9 w-px -translate-x-1/2 -translate-y-1/2" style={{ background: `${color}AA` }} />
        <span className="editor-pin-ping pointer-events-none absolute inset-0 rounded-full" style={{ boxShadow: `0 0 0 2px ${color}` }} />
        {pulsing !== null && <span key={pulsing} className="editor-pin-burst pointer-events-none absolute inset-0 rounded-full" style={{ boxShadow: `0 0 0 3px ${color}` }} />}
        <span
          className="relative flex h-6 min-w-6 items-center justify-center rounded-full border-2 border-obsidian px-1 font-mono text-[11px] font-bold text-obsidian shadow-lg"
          style={{ background: color, boxShadow: `0 0 14px ${color}99` }}
        >
          {pin.number}
        </span>
      </button>
    </>
  );
}

export function SpatialVideoCanvas(props: SpatialVideoCanvasProps) {
  const { clip, pins, draft, pulse, playhead, playing, speed, mode, notes } = props;
  const stageRef = useRef<HTMLDivElement>(null);
  const frameRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const audioRef = useRef<HTMLAudioElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [stage, setStage] = useState({ w: 0, h: 0 });
  const [popH, setPopH] = useState(250);
  const [drag, setDrag] = useState<{ x0: number; y0: number; x1: number; y1: number; id: number } | null>(null);
  const [mediaError, setMediaError] = useState<{ url: string; text: string } | null>(null);

  const local = clip ? Math.max(0, Math.min(clip.durationSec - 1e-3, playhead - clip.startSec)) : 0;
  const fps = clip?.fps ?? props.fps;
  const locked = notes === 'loading';

  // frame letterboxed inside the stage, at the file's real aspect ratio so pin % are percentages of the actual picture
  useLayoutEffect(() => {
    const el = stageRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setStage({ w: el.clientWidth, h: el.clientHeight }));
    ro.observe(el);
    setStage({ w: el.clientWidth, h: el.clientHeight });
    return () => ro.disconnect();
  }, []);
  const pad = 12;
  const availW = Math.max(0, stage.w - pad * 2);
  const availH = Math.max(0, stage.h - pad * 2);
  const aspect = clip && clip.media !== 'audio' && clip.width && clip.height ? clip.width / clip.height : 16 / 9;
  let fw = Math.floor(Math.min(availW, availH * aspect));
  let fh = Math.floor(fw / aspect);
  if (fh > availH) {
    fh = Math.floor(availH);
    fw = Math.floor(fh * aspect);
  }
  const fx = Math.floor((stage.w - fw) / 2);
  const fy = Math.floor((stage.h - fh) / 2);

  // <video> / <audio> sync with the master clock
  useEffect(() => {
    const v = clip?.media === 'video' ? videoRef.current : clip?.media === 'audio' ? audioRef.current : null;
    if (!v || !clip) return;
    if (v.playbackRate !== speed) v.playbackRate = speed;
    if (playing) {
      if (Math.abs(v.currentTime - local) > 0.3) v.currentTime = local;
      if (v.paused) v.play().catch(() => undefined);
    } else {
      if (!v.paused) v.pause();
      if (Math.abs(v.currentTime - local) > 0.5 / fps) v.currentTime = local;
    }
  }, [clip, local, playing, speed, fps]);

  const toPct = (clientX: number, clientY: number) => {
    const r = frameRef.current?.getBoundingClientRect();
    if (!r || r.width === 0) return null;
    return { x: Math.max(0, Math.min(100, ((clientX - r.left) / r.width) * 100)), y: Math.max(0, Math.min(100, ((clientY - r.top) / r.height) * 100)) };
  };

  const onPointerDown = (e: RPointerEvent<HTMLDivElement>) => {
    if (!clip || locked || e.button !== 0) return;
    const p = toPct(e.clientX, e.clientY);
    if (!p) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    setDrag({ x0: p.x, y0: p.y, x1: p.x, y1: p.y, id: e.pointerId });
  };
  const onPointerMove = (e: RPointerEvent<HTMLDivElement>) => {
    if (!drag || drag.id !== e.pointerId || mode !== 'box') return;
    const p = toPct(e.clientX, e.clientY);
    if (p) setDrag({ ...drag, x1: p.x, y1: p.y });
  };
  const onPointerUp = (e: RPointerEvent<HTMLDivElement>) => {
    if (!drag || drag.id !== e.pointerId || !clip) return;
    const p = toPct(e.clientX, e.clientY) ?? { x: drag.x1, y: drag.y1 };
    setDrag(null);
    const ts = Math.round(playhead * fps) / fps;
    if (mode === 'box') {
      const region: RegionBox = { x: Math.min(drag.x0, p.x), y: Math.min(drag.y0, p.y), w: Math.abs(p.x - drag.x0), h: Math.abs(p.y - drag.y0) };
      if (region.w >= BOX_MIN && region.h >= BOX_MIN) {
        props.onStartDraft({ clipId: clip.id, timestampSec: ts, xPercent: region.x + region.w / 2, yPercent: region.y + region.h / 2, region });
        return;
      }
    }
    props.onStartDraft({ clipId: clip.id, timestampSec: ts, xPercent: p.x, yPercent: p.y });
  };

  const visible = clip ? pins.filter((p) => p.clipId === clip.id && (isPinVisibleAt(p, playhead) || pulse?.id === p.id)) : [];
  const liveBox = drag && mode === 'box' ? { x: Math.min(drag.x0, drag.x1), y: Math.min(drag.y0, drag.y1), w: Math.abs(drag.x1 - drag.x0), h: Math.abs(drag.y1 - drag.y0) } : null;
  const caption = clip && clip.voiceover.length ? currentCaption(clip, local) : null;
  const err = clip && mediaError?.url === clip.url ? mediaError.text : null;
  const noteChip = notes ? NOTES_LABEL[notes] : null;

  // popover placement (stage coordinates), flipped near edges
  let popLeft = 0;
  let popTop = 0;
  if (draft) {
    const px = fx + (draft.xPercent / 100) * fw;
    const py = fy + (draft.yPercent / 100) * fh;
    const anchorRight = draft.region ? fx + ((draft.region.x + draft.region.w) / 100) * fw : px;
    const anchorLeft = draft.region ? fx + (draft.region.x / 100) * fw : px;
    popLeft = anchorRight + 22;
    if (popLeft + POPOVER_W > stage.w - 8) popLeft = anchorLeft - 22 - POPOVER_W;
    popLeft = Math.max(8, Math.min(popLeft, stage.w - POPOVER_W - 8));
    popTop = Math.max(8, Math.min(py - 28, stage.h - popH - 8));
  }

  return (
    <section className="hud-card flex h-full min-h-0 min-w-0 flex-col overflow-hidden">
      <header className="flex h-9 shrink-0 items-center gap-2 border-b border-subtle px-3">
        <Film size={14} className="shrink-0 text-orange" />
        <h2 className="hud-label truncate" title={clip?.path}>
          {clip ? `File ${String(clip.number).padStart(2, '0')} · ${clip.name}` : 'No file open'}
        </h2>
        {clip && (
          <span className={cn('shrink-0 rounded px-1.5 py-0.5 font-mono text-[9px] font-bold', clip.kind === 'ANIMATION' ? 'bg-orange/15 text-orange' : 'bg-teal/15 text-teal')} title={clip.projectId ? `${clip.projectName} (${clip.projectKind})` : clip.projectName}>
            {clip.media.toUpperCase()} · {clip.projectName.toUpperCase()}
          </span>
        )}
        {noteChip && (
          <span className={cn('shrink-0 rounded px-1.5 py-0.5 font-mono text-[9px] font-bold', noteChip.cls)} title={props.notesDetail ?? undefined}>
            {noteChip.text}
          </span>
        )}
        <span className="ml-auto hidden shrink-0 font-mono text-[10px] text-muted xl:inline">{mode === 'point' ? 'Click frame to pin' : 'Drag to box a region'}</span>
        <input
          ref={fileRef}
          type="file"
          accept="video/mp4,video/webm,.mp4,.webm,.mov"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) props.onImport(f);
            e.target.value = '';
          }}
        />
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          title="Open a video from disk for this session only: it is not uploaded, and its pins are not saved"
          className="ml-2 inline-flex h-6 shrink-0 items-center gap-1 rounded-full border border-subtle bg-panel-elevated px-2.5 font-mono text-[10px] font-semibold text-secondary hover:border-orange/60 hover:text-paper"
        >
          <Upload size={11} /> + Import Local MP4 / WebM
        </button>
      </header>

      <div ref={stageRef} className="relative min-h-0 flex-1 overflow-hidden bg-[#060606]">
        {fw > 0 && clip && (
          <div
            ref={frameRef}
            className={cn('absolute overflow-hidden rounded-[4px] bg-black ring-1 ring-subtle', locked ? 'cursor-wait' : mode === 'box' ? 'cursor-crosshair' : 'cursor-cell')}
            style={{ left: fx, top: fy, width: fw, height: fh }}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={() => setDrag(null)}
          >
            {clip.media === 'video' && (
              <video
                ref={videoRef}
                key={clip.url}
                src={clip.url}
                className="pointer-events-none h-full w-full bg-black object-contain"
                playsInline
                preload="auto"
                onError={() => setMediaError({ url: clip.url, text: 'The browser could not play this file (missing, still downloading from iCloud, or an unsupported codec).' })}
              />
            )}
            {clip.media === 'image' && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                key={clip.url}
                src={clip.url}
                alt={clip.name}
                draggable={false}
                className="pointer-events-none h-full w-full bg-black object-contain"
                onError={() => setMediaError({ url: clip.url, text: 'The image could not be loaded.' })}
              />
            )}
            {clip.media === 'audio' && (
              <div className="pointer-events-none flex h-full w-full flex-col items-center justify-center gap-2 bg-gradient-to-b from-panel-elevated to-black px-6 text-center">
                <Music size={36} className="text-teal" />
                <div className="font-mono text-[12px] text-paper">{clip.name}</div>
                <div className="font-mono text-[10px] text-muted">Audio file. Pins mark a moment; x/y say where on this card you meant, if it matters.</div>
                <audio ref={audioRef} key={clip.url} src={clip.url} preload="auto" onError={() => setMediaError({ url: clip.url, text: 'The audio could not be played (missing or still downloading from iCloud).' })} />
              </div>
            )}
            {caption && caption.alpha > 0 && (
              <div className="pointer-events-none absolute inset-x-0 bottom-[7%] flex justify-center px-6" style={{ opacity: caption.alpha }}>
                <span className="max-w-[88%] rounded bg-black/70 px-3 py-1 text-center font-serif text-[15px] italic leading-snug text-paper">{caption.text}</span>
              </div>
            )}
            {visible.map((p) => (
              <PinMarker key={p.id} pin={p} pulsing={pulse?.id === p.id ? pulse.nonce : null} onClick={() => props.onPinClick(p.id)} />
            ))}
            {liveBox && (
              <div
                className="pointer-events-none absolute border-2 border-dashed border-orange bg-orange/10"
                style={{ left: `${liveBox.x}%`, top: `${liveBox.y}%`, width: `${liveBox.w}%`, height: `${liveBox.h}%` }}
              />
            )}
            {draft && draft.clipId === clip.id && (
              <PinMarker
                pin={{ ...draft, id: 'draft', number: props.nextPinNumber, formattedTime: '', commentText: 'New pin', skill: '/animate', resolved: false }}
                pulsing={null}
                onClick={() => undefined}
              />
            )}
          </div>
        )}
        {err && (
          <div className="absolute inset-x-4 top-3 z-20 flex items-start gap-2 rounded-md border border-[#EF4444]/50 bg-[#1F0F0F]/95 px-3 py-2 font-mono text-[11px] text-paper">
            <AlertTriangle size={13} className="mt-0.5 shrink-0 text-[#EF4444]" /> {err}
          </div>
        )}
        {!clip && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 px-8 text-center font-mono text-xs text-muted">
            <Film size={28} className="text-subtle" />
            <div className="text-secondary">Open a file from the media bin to review it.</div>
            <div className="max-w-md leading-relaxed">
              Click a render or generation on the left, or use &quot;Send to VOLTA Editor&quot; in Studio or Generations. Then click the frame to drop a pin; notes save per file on the Windsor drive.
            </div>
          </div>
        )}
        {draft && clip && (
          <PinPopover
            key="draft"
            draft={draft}
            pinNumber={props.nextPinNumber}
            defaultSkill={clip.kind === 'ANIMATION' ? '/animate' : '/cut'}
            left={popLeft}
            top={popTop}
            onMeasure={(h) => setPopH((old) => (Math.abs(old - h) < 1 ? old : h))}
            onSave={props.onSaveDraft}
            onCancel={props.onCancelDraft}
          />
        )}
      </div>

      <TransportBar
        playhead={playhead}
        total={props.total}
        fps={fps}
        playing={playing}
        speed={speed}
        loop={props.loop}
        mode={mode}
        onTogglePlay={props.onTogglePlay}
        onStep={props.onStep}
        onClipStart={props.onClipStart}
        onNextPin={props.onNextPin}
        onSpeed={props.onSpeed}
        onLoop={props.onLoop}
        onMode={props.onMode}
      />
    </section>
  );
}
