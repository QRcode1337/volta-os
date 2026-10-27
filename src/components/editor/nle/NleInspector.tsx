'use client';
// VOLTA Editor — Edit mode inspector (right-hand panel, CapCut / FCP style). Project settings when nothing is
// selected, per-kind tabs for one clip, common controls for several. Every edit is a reducer action; slider / scrub
// drags pass a stable `key` so one drag is one undo step.

import {
  AlignCenter,
  AlignLeft,
  AlignRight,
  ArrowLeftRight,
  Film,
  Image as ImageIcon,
  Italic,
  Keyboard,
  Link2Off,
  Lock,
  Music,
  RotateCcw,
  Scissors,
  Settings2,
  Square,
  Type,
  type LucideIcon,
} from 'lucide-react';
import { useState, type Dispatch, type ReactNode } from 'react';
import { cn } from '@/lib/cn';
import type { NleClip, NleFont, NleTextAnim, NleTextStyle, NleTransform, NleTransitionType } from '@/types/nle';
import { FONT_STACK, FORMATS, IDENTITY, NEUTRAL_ADJUST, clipEnd, fmtShort, fmtTC, isVisualKind, mainTrackId, maxDuration, previousAdjacent, sequenceDuration } from '@/lib/nle/model';
import type { NleAction, NleState } from './state';
import { TRANSITION_LABELS } from './presets';
import { BTN, ColorField, CommitText, LABEL, ScrubNumber, Section, Segmented, Slider, Toggle } from './panels/controls';
import { TransitionGlyph } from './panels/TransitionGlyph';

export interface NleInspectorProps {
  state: NleState;
  dispatch: Dispatch<NleAction>;
  className?: string;
}

type D = Dispatch<NleAction>;
type TabId = 'text' | 'video' | 'animate' | 'adjust' | 'speed' | 'audio' | 'transition';

const KIND_ICON: Record<NleClip['kind'], LucideIcon> = { video: Film, image: ImageIcon, audio: Music, text: Type, color: Square };
const KIND_TINT: Record<NleClip['kind'], string> = { video: 'text-orange', image: 'text-amber', audio: 'text-teal', text: 'text-paper', color: 'text-purple' };
const TAB_LABEL: Record<TabId, string> = { text: 'Text', video: 'Video', animate: 'Animate', adjust: 'Adjust', speed: 'Speed', audio: 'Audio', transition: 'Transition' };

function tabsFor(c: NleClip): TabId[] {
  switch (c.kind) {
    case 'video':
      return ['video', 'animate', 'adjust', 'speed', ...(c.hasAudio ? (['audio'] as const) : []), 'transition'];
    case 'image':
      return ['video', 'animate', 'adjust', 'transition'];
    case 'color':
      return ['video', 'animate', 'transition'];
    case 'text':
      return ['text', 'video', 'animate', 'transition'];
    case 'audio':
      return ['audio'];
  }
}

export function NleInspector({ state, dispatch, className }: NleInspectorProps) {
  // remembered per clip kind: a text clip opens on Text, a video on whatever video tab was used last
  const [tabByKind, setTabByKind] = useState<Partial<Record<NleClip['kind'], TabId>>>({});
  const s = state.seq;
  const selected = state.selection.map((id) => s.clips.find((c) => c.id === id)).filter((c): c is NleClip => !!c);
  const one = selected.length === 1 ? selected[0] : null;

  let title: ReactNode = (
    <>
      <Settings2 size={13} className="shrink-0 text-orange" /> Project
    </>
  );
  if (one) {
    const Icon = KIND_ICON[one.kind];
    title = (
      <>
        <Icon size={13} className={cn('shrink-0', KIND_TINT[one.kind])} /> {one.kind} clip
      </>
    );
  } else if (selected.length > 1) title = <>{selected.length} clips selected</>;

  return (
    <section className={cn('hud-card flex h-full min-h-0 min-w-0 flex-col overflow-hidden', className)}>
      <header className="flex h-9 shrink-0 items-center gap-1.5 border-b border-subtle px-3">
        <span className="hud-label flex min-w-0 items-center gap-1.5 truncate">{title}</span>
        {selected.length > 0 && (
          <button type="button" onClick={() => dispatch({ type: 'SELECT', ids: [] })} className="ml-auto rounded px-1.5 py-0.5 font-mono text-[9.5px] text-muted hover:bg-panel-hover hover:text-paper" title="Deselect (show project settings)">
            Deselect
          </button>
        )}
      </header>
      <div className="hud-scroll min-h-0 flex-1 overflow-y-auto">
        {selected.length === 0 && <ProjectPanel state={state} dispatch={dispatch} />}
        {one && <ClipPanel key={one.id} clip={one} state={state} dispatch={dispatch} tab={tabByKind[one.kind] ?? tabsFor(one)[0]} onTab={(t) => setTabByKind((m) => ({ ...m, [one.kind]: t }))} />}
        {selected.length > 1 && <MultiPanel clips={selected} dispatch={dispatch} />}
      </div>
    </section>
  );
}

// ───────────────────────── project ─────────────────────────

const FPS_OPTIONS = [24, 25, 30, 50, 60].map((v) => ({ value: v, label: String(v) }));

const SHORTCUTS: [string, string][] = [
  ['Space', 'Play / pause'],
  ['J K L', 'Shuttle back / stop / forward'],
  ['← →', 'Previous / next frame'],
  ['⇧← ⇧→', 'Back / forward 1 s'],
  ['↑ ↓', 'Previous / next edit'],
  ['S  ⌘B', 'Split at playhead'],
  ['⌫', 'Delete'],
  ['⇧⌫', 'Ripple delete'],
  ['⌘D', 'Duplicate'],
  ['⌘C  ⌘V', 'Copy / paste'],
  ['⌘Z  ⇧⌘Z', 'Undo / redo'],
  ['M', 'Add marker'],
  ['B', 'Blade tool'],
  ['A', 'Select tool'],
  ['N', 'Toggle snapping'],
  ['⌘=  ⌘-', 'Zoom in / out'],
  ['⇧Z', 'Zoom to fit'],
  ['⌘E', 'Export'],
  ['⌘S', 'Save'],
];

function ProjectPanel({ state, dispatch }: { state: NleState; dispatch: D }) {
  const s = state.seq;
  const set = (patch: Parameters<typeof seqProps>[0]) => dispatch(seqProps(patch));
  const fmt = FORMATS.find((f) => f.width === s.width && f.height === s.height);
  const dur = sequenceDuration(s);
  const vTracks = s.tracks.filter((t) => t.kind === 'video').length;
  const aTracks = s.tracks.length - vTracks;
  return (
    <>
      <Section title="Project">
        <Field label="Name">
          <CommitText value={s.name} onCommit={(name) => set({ name: name.trim() || 'Untitled edit' })} ariaLabel="Project name" />
        </Field>
        <div>
          <div className={cn(LABEL, 'mb-1')}>Format</div>
          <div className="grid grid-cols-3 gap-1">
            {FORMATS.map((f) => {
              const on = fmt?.id === f.id;
              const r = f.width / f.height;
              return (
                <button
                  key={f.id}
                  type="button"
                  onClick={() => set({ width: f.width, height: f.height })}
                  title={`${f.label} · ${f.width}×${f.height}`}
                  className={cn('flex h-12 flex-col items-center justify-center gap-1 rounded border', on ? 'border-orange/70 bg-orange/10 text-orange' : 'border-subtle text-secondary hover:border-highlight hover:text-paper')}
                >
                  <span className={cn('rounded-[2px] border', on ? 'border-orange' : 'border-current')} style={{ width: r >= 1 ? 22 : 22 * r, height: r >= 1 ? 22 / r : 22 }} />
                  <span className="font-mono text-[9px]">{f.id}</span>
                </button>
              );
            })}
            <div className={cn('flex h-12 flex-col items-center justify-center rounded border font-mono text-[9px]', !fmt ? 'border-orange/70 bg-orange/10 text-orange' : 'border-subtle text-muted')}>Custom</div>
          </div>
          <div className="mt-1.5 grid grid-cols-2 gap-1.5">
            <ScrubNumber label="W" value={s.width} min={16} max={8192} step={2} onChange={(width) => set({ width })} suffix="px" />
            <ScrubNumber label="H" value={s.height} min={16} max={8192} step={2} onChange={(height) => set({ height })} suffix="px" />
          </div>
        </div>
        <Field label="Frame rate">
          <Segmented value={s.fps} options={FPS_OPTIONS} onChange={(fps) => set({ fps })} ariaLabel="Frame rate" />
        </Field>
        <ColorField label="Background" value={s.background} onChange={(background) => set({ background })} />
      </Section>

      <Section title="Sequence">
        <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 font-mono text-[10.5px]">
          <dt className="text-muted">Duration</dt>
          <dd className="text-paper">
            {fmtTC(dur, s.fps)} <span className="text-muted">({fmtShort(dur)})</span>
          </dd>
          <dt className="text-muted">Clips</dt>
          <dd className="text-paper">{s.clips.length}</dd>
          <dt className="text-muted">Tracks</dt>
          <dd className="text-paper">
            {vTracks} video · {aTracks} audio
          </dd>
          <dt className="text-muted">Markers</dt>
          <dd className="text-paper">{s.markers.length}</dd>
          <dt className="text-muted">Frame</dt>
          <dd className="text-paper">
            {s.width}×{s.height} @ {s.fps}
          </dd>
        </dl>
      </Section>

      <Section
        title={
          <span className="inline-flex items-center gap-1">
            <Keyboard size={11} /> Shortcuts
          </span>
        }
      >
        <ul className="space-y-0.5">
          {SHORTCUTS.map(([k, d]) => (
            <li key={k} className="flex items-center gap-2 text-[10.5px]">
              <span className="w-[74px] shrink-0">
                {k.split(/\s{1,2}/).map((x) => (
                  <kbd key={x} className="mr-0.5 inline-block rounded border border-subtle bg-obsidian px-1 font-mono text-[9.5px] text-paper">
                    {x}
                  </kbd>
                ))}
              </span>
              <span className="truncate text-secondary">{d}</span>
            </li>
          ))}
        </ul>
        <p className="font-mono text-[9.5px] text-muted">Select a clip to edit it. ⌘-click or ⇧-click selects several.</p>
      </Section>
    </>
  );
}

const seqProps = (patch: Extract<NleAction, { type: 'SET_SEQ_PROPS' }>['patch']): NleAction => ({ type: 'SET_SEQ_PROPS', patch });

function Field({ label, children }: { label: ReactNode; children: ReactNode }) {
  return (
    <div className="flex min-w-0 items-center gap-1.5">
      <span className={cn(LABEL, 'w-[62px] shrink-0 truncate')}>{label}</span>
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}

// ───────────────────────── one clip ─────────────────────────

function ClipPanel({ clip: c, state, dispatch, tab, onTab }: { clip: NleClip; state: NleState; dispatch: D; tab: TabId; onTab: (t: TabId) => void }) {
  const s = state.seq;
  const tabs = tabsFor(c);
  const active = tabs.includes(tab) ? tab : tabs[0];
  const track = s.tracks.find((t) => t.id === c.trackId);
  const locked = !!track?.locked;
  const isMain = c.trackId === mainTrackId(s);
  const upd = (patch: Partial<NleClip>, key?: string) => dispatch({ type: 'UPDATE_CLIPS', ids: [c.id], patch, key });
  const Icon = KIND_ICON[c.kind];
  const dMax = maxDuration(c);

  return (
    <>
      <div className="space-y-2 border-b border-subtle px-3 py-2.5">
        <div className="flex items-center gap-1.5">
          <Icon size={14} className={cn('shrink-0', KIND_TINT[c.kind])} />
          <CommitText value={c.name} onCommit={(name) => upd({ name: name.trim() || c.name })} ariaLabel="Clip name" className="!h-7 !text-[12px] font-sans font-semibold" />
        </div>
        <div className="flex flex-wrap items-center gap-1 font-mono text-[9px] text-muted">
          <span className="rounded bg-panel-hover px-1 text-secondary">{track?.name ?? '?'}</span>
          {isMain && <span className="rounded bg-orange/10 px-1 text-orange">main</span>}
          {c.linkId && <span className="rounded bg-teal/10 px-1 text-teal">linked</span>}
          {locked && (
            <span className="inline-flex items-center gap-0.5 rounded bg-amber/10 px-1 text-amber">
              <Lock size={8} /> track locked
            </span>
          )}
          {c.width && c.height ? (
            <span>
              {c.width}×{c.height}
            </span>
          ) : null}
        </div>
        <fieldset disabled={locked} className={cn('grid grid-cols-2 gap-x-2 gap-y-1.5', locked && 'pointer-events-none opacity-50')}>
          <ScrubNumber
            stacked
            label="Start"
            value={round2(c.start)}
            min={0}
            step={0.01}
            suffix="s"
            title={`${fmtTC(c.start, s.fps)} — drag the label, type a time or use ↑/↓`}
            onChange={(v) => dispatch({ type: 'MOVE_CLIPS', ids: [c.id], anchorId: c.id, dt: v - c.start, toTrack: null, key: 'start' })}
          />
          <ScrubNumber
            stacked
            label="Duration"
            value={round2(c.duration)}
            min={0.05}
            max={Number.isFinite(dMax) ? round2(dMax) : 3600}
            step={0.01}
            pxPerStep={1}
            suffix="s"
            title={`${fmtTC(c.duration, s.fps)} — drag the label to scrub (⇧ ×10)`}
            onChange={(v) => dispatch({ type: 'TRIM', id: c.id, edge: 'end', t: c.start + v })}
          />
          <div className="col-span-2 flex items-center gap-2 font-mono text-[9.5px] text-muted">
            <span>
              {fmtTC(c.start, s.fps)} → {fmtTC(clipEnd(c), s.fps)}
            </span>
            {c.sourceDuration != null && (
              <span className="ml-auto" title="Source in-point (trim the clip's start edge on the timeline to change it)">
                IN <span className="text-secondary">{fmtTC(c.mediaStart, s.fps)}</span>
              </span>
            )}
          </div>
        </fieldset>
      </div>

      {tabs.length > 1 && (
        <div role="tablist" className="flex flex-wrap gap-0.5 border-b border-subtle px-2 py-1.5">
          {tabs.map((t) => (
            <button
              key={t}
              type="button"
              role="tab"
              aria-selected={active === t}
              onClick={() => onTab(t)}
              className={cn('h-6 rounded px-2 font-mono text-[10px] font-semibold tracking-wide', active === t ? 'bg-orange/15 text-orange' : 'text-secondary hover:bg-panel-hover hover:text-paper')}
            >
              {TAB_LABEL[t]}
            </button>
          ))}
        </div>
      )}

      <fieldset disabled={locked} className={cn('min-w-0', locked && 'pointer-events-none opacity-50')}>
        {active === 'text' && c.text && <TextTab clip={c} text={c.text} upd={upd} />}
        {active === 'video' && <VideoTab clip={c} upd={upd} />}
        {active === 'animate' && <AnimateTab clip={c} upd={upd} />}
        {active === 'adjust' && <AdjustTab clip={c} upd={upd} />}
        {active === 'speed' && (
          <Section title="Speed">
            <SpeedControls clip={c} upd={upd} />
          </Section>
        )}
        {active === 'audio' && <AudioTab clip={c} upd={upd} dispatch={dispatch} />}
        {active === 'transition' && <TransitionTab clip={c} state={state} dispatch={dispatch} />}
      </fieldset>
    </>
  );
}

const round2 = (n: number) => Math.round(n * 100) / 100;
type Upd = (patch: Partial<NleClip>, key?: string) => void;

// ── transform ──

function TransformEditor({ value, onChange, compact, keyPrefix }: { value: NleTransform; onChange: (t: NleTransform, key: string) => void; compact?: boolean; keyPrefix: string }) {
  const f = (field: keyof NleTransform, v: number) => onChange({ ...value, [field]: v }, `${keyPrefix}.${field}`);
  return (
    <div className={cn('grid gap-x-2 gap-y-1.5', compact ? 'grid-cols-1' : 'grid-cols-2')}>
      <ScrubNumber stacked={compact} label={compact ? 'X' : 'Pos X'} value={round2(value.x * 100)} step={0.5} min={-300} max={300} suffix="%" onChange={(v) => f('x', v / 100)} title="Horizontal offset of the centre, % of frame width" />
      <ScrubNumber stacked={compact} label={compact ? 'Y' : 'Pos Y'} value={round2(value.y * 100)} step={0.5} min={-300} max={300} suffix="%" onChange={(v) => f('y', v / 100)} title="Vertical offset of the centre, % of frame height" />
      <ScrubNumber stacked={compact} label="Scale" value={round2(value.scale * 100)} step={1} min={1} max={1000} suffix="%" onChange={(v) => f('scale', v / 100)} />
      <ScrubNumber stacked={compact} label={compact ? 'Rot' : 'Rotation'} value={round2(value.rotation)} step={1} min={-3600} max={3600} suffix="°" onChange={(v) => f('rotation', v)} />
      <ScrubNumber stacked={compact} label={compact ? 'Opac' : 'Opacity'} value={Math.round(value.opacity * 100)} step={1} min={0} max={100} suffix="%" onChange={(v) => f('opacity', v / 100)} />
    </div>
  );
}

const sameTransform = (a: NleTransform, b: NleTransform) => a.x === b.x && a.y === b.y && a.scale === b.scale && a.rotation === b.rotation && a.opacity === b.opacity;

function VideoTab({ clip: c, upd }: { clip: NleClip; upd: Upd }) {
  const isMedia = c.kind === 'video' || c.kind === 'image';
  return (
    <>
      {c.kind === 'color' && (
        <Section title="Fill">
          <ColorField label="Colour" value={c.color ?? '#000000'} onChange={(color) => upd({ color }, 'color')} />
        </Section>
      )}
      <Section
        title={c.transformEnd ? 'Transform · start' : 'Transform'}
        right={
          <button type="button" className={BTN} disabled={sameTransform(c.transform, IDENTITY) && !c.transformEnd} onClick={() => upd({ transform: { ...IDENTITY }, transformEnd: null })} title="Reset position, scale, rotation, opacity and animation">
            <RotateCcw size={10} /> Reset
          </button>
        }
      >
        <TransformEditor value={c.transform} keyPrefix="transform" onChange={(transform, key) => upd({ transform }, key)} />
        {c.transformEnd && <p className="font-mono text-[9.5px] text-amber">Animated: this is the start state. Edit the end state in Animate.</p>}
        {isMedia && (
          <Field label="Fit">
            <Segmented
              value={c.fit}
              ariaLabel="Fit"
              onChange={(fit) => upd({ fit })}
              options={[
                { value: 'contain', label: 'Fit', title: 'Contain: whole frame visible, letterboxed' },
                { value: 'cover', label: 'Fill', title: 'Cover: fills the frame, crops the overflow' },
                { value: 'fill', label: 'Stretch', title: 'Stretch to the frame (distorts)' },
              ]}
            />
          </Field>
        )}
      </Section>
    </>
  );
}

// ── animate ──

const KB = 1.15;
function animPresets(t: NleTransform): { label: string; title: string; from: NleTransform; to: NleTransform }[] {
  const s = Math.max(t.scale, KB);
  return [
    { label: 'Ken Burns in', title: 'Slow push in: scale 100% → 115%', from: { ...t, scale: 1 }, to: { ...t, scale: KB } },
    { label: 'Zoom out', title: 'Slow pull out: 115% → 100%', from: { ...t, scale: KB }, to: { ...t, scale: 1 } },
    { label: 'Pan left', title: 'Drift left at 115%', from: { ...t, scale: s, x: 0.05 }, to: { ...t, scale: s, x: -0.05 } },
    { label: 'Pan right', title: 'Drift right at 115%', from: { ...t, scale: s, x: -0.05 }, to: { ...t, scale: s, x: 0.05 } },
    { label: 'Rise', title: 'Drift upwards at 110%', from: { ...t, scale: Math.max(t.scale, 1.1), y: 0.04 }, to: { ...t, scale: Math.max(t.scale, 1.1), y: -0.04 } },
  ];
}

function AnimateTab({ clip: c, upd }: { clip: NleClip; upd: Upd }) {
  const on = !!c.transformEnd;
  const base = c.transform;
  return (
    <>
      <Section title="Animate">
        <Toggle
          checked={on}
          onChange={(v) => upd({ transformEnd: v ? { ...c.transform } : null })}
          label="Animate from start → end"
          title="Interpolate position, scale, rotation and opacity linearly across the clip"
        />
        <div>
          <div className={cn(LABEL, 'mb-1')}>One-click</div>
          <div className="flex flex-wrap gap-1">
            {animPresets({ ...base, x: 0, y: 0 }).map((p) => (
              <button key={p.label} type="button" className={BTN} title={p.title} onClick={() => upd({ transform: p.from, transformEnd: p.to })}>
                {p.label}
              </button>
            ))}
          </div>
        </div>
      </Section>
      {c.transformEnd && (
        <Section
          title="Keyframes"
          right={
            <button type="button" className={BTN} title="Swap start and end" onClick={() => upd({ transform: c.transformEnd as NleTransform, transformEnd: c.transform })}>
              <ArrowLeftRight size={10} /> Swap
            </button>
          }
        >
          <div className="grid grid-cols-2 gap-2">
            <div className="min-w-0 space-y-1">
              <div className="font-mono text-[9.5px] font-semibold text-teal">START · {fmtShort(0)}</div>
              <TransformEditor compact value={c.transform} keyPrefix="transform" onChange={(transform, key) => upd({ transform }, key)} />
            </div>
            <div className="min-w-0 space-y-1">
              <div className="font-mono text-[9.5px] font-semibold text-orange">END · {fmtShort(c.duration)}</div>
              <TransformEditor compact value={c.transformEnd} keyPrefix="transformEnd" onChange={(transformEnd, key) => upd({ transformEnd }, key)} />
            </div>
          </div>
          <div className="flex gap-1">
            <button type="button" className={BTN} onClick={() => upd({ transformEnd: { ...c.transform } })}>
              Start → end
            </button>
            <button type="button" className={BTN} onClick={() => upd({ transform: { ...(c.transformEnd as NleTransform) } })}>
              End → start
            </button>
          </div>
        </Section>
      )}
    </>
  );
}

// ── adjust ──

function AdjustTab({ clip: c, upd }: { clip: NleClip; upd: Upd }) {
  const a = c.adjust;
  const set = (field: keyof typeof a, v: number) => upd({ adjust: { ...a, [field]: v } }, `adjust.${field}`);
  const neutral = a.brightness === 0 && a.contrast === 1 && a.saturation === 1 && a.blur === 0;
  return (
    <Section
      title="Adjust"
      right={
        <button type="button" className={BTN} disabled={neutral} onClick={() => upd({ adjust: { ...NEUTRAL_ADJUST } })}>
          <RotateCcw size={10} /> Reset all
        </button>
      }
    >
      <Slider label="Brightness" value={Math.round(a.brightness * 100)} min={-100} max={100} step={1} defaultValue={0} onChange={(v) => set('brightness', v / 100)} format={(v) => (v > 0 ? `+${v}` : String(v))} />
      <Slider label="Contrast" value={Math.round(a.contrast * 100)} min={0} max={200} step={1} defaultValue={100} onChange={(v) => set('contrast', v / 100)} format={(v) => `${v}%`} />
      <Slider label="Saturation" value={Math.round(a.saturation * 100)} min={0} max={300} step={1} defaultValue={100} onChange={(v) => set('saturation', v / 100)} format={(v) => `${v}%`} />
      <Slider label="Blur" value={a.blur} min={0} max={40} step={0.5} defaultValue={0} onChange={(v) => set('blur', v)} format={(v) => `${v}px`} />
    </Section>
  );
}

// ── speed ──

const SPEED_CHIPS = [0.5, 1, 1.5, 2, 4];
const fmtRate = (r: number) => `${Number(r.toFixed(2))}×`;

function SpeedControls({ clip: c, upd }: { clip: NleClip; upd: Upd }) {
  const projected = (r: number) => Math.min((c.duration * c.rate) / r, maxDuration({ ...c, rate: r }));
  return (
    <>
      <Slider label="Rate" value={c.rate} min={0.25} max={4} step={0.01} log defaultValue={1} onChange={(rate) => upd({ rate }, 'rate')} format={fmtRate} />
      <div className="flex gap-1">
        {SPEED_CHIPS.map((r) => (
          <button key={r} type="button" onClick={() => upd({ rate: r })} className={cn(BTN, 'flex-1 px-1', Math.abs(c.rate - r) < 1e-3 && 'border-orange/60 bg-orange/10 text-orange')}>
            {r}×
          </button>
        ))}
      </div>
      <p className="font-mono text-[9.5px] leading-relaxed text-muted">
        Duration <span className="text-paper">{fmtShort(c.duration)}</span> · source used <span className="text-paper">{fmtShort(c.duration * c.rate)}</span>. At 2× it would run {fmtShort(projected(2))}. Audio pitch is preserved
        by the browser; linked clips change speed together.
      </p>
    </>
  );
}

// ── audio ──

function AudioTab({ clip: c, upd, dispatch }: { clip: NleClip; upd: Upd; dispatch: D }) {
  const detached = c.kind === 'video' && c.muted && !!c.linkId;
  const fadeMax = Math.max(0.1, Math.min(10, c.duration / 2));
  return (
    <>
      <Section title="Audio">
        {detached && <p className="rounded border border-teal/30 bg-teal/5 px-2 py-1 font-mono text-[9.5px] text-teal">Sound detached to a linked audio clip. Edit it there; this video stays muted.</p>}
        <Slider label="Volume" value={Math.round(c.volume * 100)} min={0} max={200} step={1} defaultValue={100} onChange={(v) => upd({ volume: v / 100 }, 'volume')} format={(v) => `${v}%`} disabled={c.muted} />
        <Slider label="Fade in" value={Math.min(c.fadeIn, fadeMax)} min={0} max={fadeMax} step={0.05} defaultValue={0} onChange={(fadeIn) => upd({ fadeIn }, 'fadeIn')} format={(v) => `${v.toFixed(2)}s`} disabled={c.muted} />
        <Slider label="Fade out" value={Math.min(c.fadeOut, fadeMax)} min={0} max={fadeMax} step={0.05} defaultValue={0} onChange={(fadeOut) => upd({ fadeOut }, 'fadeOut')} format={(v) => `${v.toFixed(2)}s`} disabled={c.muted} />
        <Toggle checked={c.muted} onChange={(muted) => upd({ muted })} label="Mute" />
        <div className="flex flex-wrap gap-1">
          {c.kind === 'video' && c.hasAudio && !c.muted && (
            <button type="button" className={BTN} onClick={() => dispatch({ type: 'DETACH_AUDIO', id: c.id })} title="Split the sound onto its own audio track (linked)">
              <Scissors size={10} /> Detach audio
            </button>
          )}
          {c.linkId && (
            <button type="button" className={BTN} onClick={() => dispatch({ type: 'UNLINK', id: c.id })} title="Stop moving / trimming with its linked partner">
              <Link2Off size={10} /> Unlink
            </button>
          )}
        </div>
      </Section>
      {c.kind === 'audio' && (
        <Section title="Speed">
          <SpeedControls clip={c} upd={upd} />
        </Section>
      )}
    </>
  );
}

// ── transition ──

const TRANSITION_TYPES = Object.keys(TRANSITION_LABELS) as NleTransitionType[];

function TransitionTab({ clip: c, state, dispatch }: { clip: NleClip; state: NleState; dispatch: D }) {
  const tr = c.transitionIn;
  const prev = previousAdjacent(state.seq, c);
  const maxD = Math.max(0.1, Math.min(2, c.duration * 0.9));
  const set = (type: NleTransitionType | 'none', duration = tr?.duration ?? 0.5) =>
    dispatch({ type: 'SET_TRANSITION', id: c.id, transition: type === 'none' ? null : { type, duration: Math.min(duration, maxD) } });
  return (
    <Section title="Transition in">
      <p className="font-mono text-[9.5px] leading-relaxed text-muted">
        From <span className="text-paper">{prev ? prev.name : 'the background'}</span>
        {!prev && ' (no clip ends where this one starts on its track)'}.
      </p>
      <div className="flex items-center gap-2">
        {tr ? <TransitionGlyph type={tr.type} className="h-9 w-16 shrink-0 border border-subtle" /> : <div className="flex h-9 w-16 shrink-0 items-center justify-center rounded border border-dashed border-subtle font-mono text-[9px] text-muted">cut</div>}
        <select
          value={tr?.type ?? 'none'}
          onChange={(e) => set(e.target.value as NleTransitionType | 'none')}
          aria-label="Transition type"
          className="h-7 min-w-0 flex-1 rounded border border-subtle bg-obsidian px-1.5 font-mono text-[10.5px] text-paper outline-none focus:border-orange/60"
        >
          <option value="none">None (cut)</option>
          {TRANSITION_TYPES.map((t) => (
            <option key={t} value={t}>
              {TRANSITION_LABELS[t]}
            </option>
          ))}
        </select>
      </div>
      {tr && <Slider label="Duration" value={Math.min(tr.duration, maxD)} min={0.1} max={maxD} step={0.05} defaultValue={Math.min(0.5, maxD)} onChange={(d) => set(tr.type, d)} format={(v) => `${v.toFixed(2)}s`} />}
    </Section>
  );
}

// ── text ──

const FONTS = Object.keys(FONT_STACK) as NleFont[];
const ANIMS: { value: NleTextAnim; label: string }[] = [
  { value: 'none', label: 'None' },
  { value: 'fade', label: 'Fade' },
  { value: 'pop', label: 'Pop' },
  { value: 'slide-up', label: 'Slide up' },
  { value: 'typewriter', label: 'Typewriter' },
];
const SELECT = 'h-6 w-full min-w-0 rounded border border-subtle bg-obsidian px-1 font-mono text-[10.5px] text-paper outline-none focus:border-orange/60';

function TextTab({ clip: c, text: t, upd }: { clip: NleClip; text: NleTextStyle; upd: Upd }) {
  const set = <K extends keyof NleTextStyle>(field: K, v: NleTextStyle[K], extra?: Partial<NleClip>) => upd({ text: { ...t, [field]: v }, ...extra }, `text.${field}`);
  const firstLine = (s: string) => s.split('\n')[0].trim().slice(0, 40);
  return (
    <>
      <Section title="Text">
        <CommitText
          multiline
          rows={3}
          value={t.content}
          ariaLabel="Text content"
          placeholder="Type something"
          onCommit={(content) => set('content', content, c.name === firstLine(t.content) || c.name === 'text' ? { name: firstLine(content) || 'Text' } : undefined)}
        />
        <p className="-mt-1 font-mono text-[9px] text-muted">⌘↵ to apply · Esc to revert</p>
        <div>
          <div className={cn(LABEL, 'mb-1')}>Font</div>
          <div className="grid grid-cols-3 gap-1">
            {FONTS.map((f) => (
              <button
                key={f}
                type="button"
                onClick={() => set('font', f)}
                className={cn('h-8 truncate rounded border px-1 text-[13px]', t.font === f ? 'border-orange/70 bg-orange/10 text-orange' : 'border-subtle text-paper hover:border-highlight')}
                style={{ fontFamily: FONT_STACK[f] }}
                title={f}
              >
                {f}
              </button>
            ))}
          </div>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <ScrubNumber stacked label="Size" value={t.size} min={8} max={800} step={1} suffix="px" onChange={(v) => set('size', v)} />
          <ScrubNumber stacked label="Spacing" value={t.letterSpacing} min={-20} max={100} step={0.5} suffix="px" onChange={(v) => set('letterSpacing', v)} />
        </div>
        <Field label="Weight">
          <Segmented
            value={t.weight}
            ariaLabel="Weight"
            onChange={(w) => set('weight', w)}
            options={[
              { value: 400, label: 'Reg' },
              { value: 600, label: 'Semi' },
              { value: 800, label: 'Bold' },
            ]}
          />
        </Field>
        <Field label="Style">
          <div className="flex gap-1">
            <button type="button" aria-pressed={t.italic} onClick={() => set('italic', !t.italic)} className={cn(BTN, 'w-8 px-0', t.italic && 'border-orange/60 bg-orange/10 text-orange')} title="Italic">
              <Italic size={11} />
            </button>
            <Segmented
              className="flex-1"
              value={t.align}
              ariaLabel="Alignment"
              onChange={(a) => set('align', a)}
              options={[
                { value: 'left', label: <AlignLeft size={11} />, title: 'Align left' },
                { value: 'center', label: <AlignCenter size={11} />, title: 'Centre' },
                { value: 'right', label: <AlignRight size={11} />, title: 'Align right' },
              ]}
            />
          </div>
        </Field>
        <ColorField label="Colour" value={t.color} allowAlpha onChange={(v) => set('color', v)} />
      </Section>

      <Section title="Outline & box">
        <Toggle checked={!!t.stroke} onChange={(on) => upd({ text: { ...t, stroke: on ? '#000000' : null, strokeWidth: on ? Math.max(t.strokeWidth, 4) : t.strokeWidth } })} label="Outline" />
        {t.stroke && (
          <div className="space-y-1.5 pl-2">
            <ColorField label="Colour" value={t.stroke} onChange={(v) => set('stroke', v)} />
            <ScrubNumber label="Width" value={t.strokeWidth} min={0} max={40} step={0.5} suffix="px" onChange={(v) => set('strokeWidth', v)} />
          </div>
        )}
        <Toggle checked={!!t.background} onChange={(on) => upd({ text: { ...t, background: on ? '#000000B3' : null } })} label="Background box" />
        {t.background && (
          <div className="pl-2">
            <ColorField label="Box" value={t.background} allowAlpha onChange={(v) => set('background', v)} />
          </div>
        )}
      </Section>

      <Section title="Text animation">
        <div className="grid grid-cols-2 gap-2">
          <label className="min-w-0">
            <span className={LABEL}>In</span>
            <select value={t.animIn} onChange={(e) => set('animIn', e.target.value as NleTextAnim)} className={SELECT}>
              {ANIMS.map((a) => (
                <option key={a.value} value={a.value}>
                  {a.label}
                </option>
              ))}
            </select>
          </label>
          <label className="min-w-0">
            <span className={LABEL}>Out</span>
            <select value={t.animOut} onChange={(e) => set('animOut', e.target.value as NleTextAnim)} className={SELECT}>
              {ANIMS.filter((a) => a.value !== 'typewriter').map((a) => (
                <option key={a.value} value={a.value}>
                  {a.label}
                </option>
              ))}
              {t.animOut === 'typewriter' && <option value="typewriter">Typewriter (fades)</option>}
            </select>
          </label>
        </div>
      </Section>
    </>
  );
}

// ───────────────────────── several clips ─────────────────────────

function MultiPanel({ clips, dispatch }: { clips: NleClip[]; dispatch: D }) {
  const visual = clips.filter((c) => isVisualKind(c.kind));
  const audible = clips.filter((c) => c.kind === 'audio' || (c.kind === 'video' && c.hasAudio));
  const timed = clips.filter((c) => c.kind === 'video' || c.kind === 'audio');
  const counts = clips.reduce<Record<string, number>>((m, c) => ((m[c.kind] = (m[c.kind] ?? 0) + 1), m), {});
  const first = <T,>(xs: NleClip[], f: (c: NleClip) => T) => (xs.length ? f(xs[0]) : undefined);
  const mixed = (xs: NleClip[], f: (c: NleClip) => number) => xs.some((c) => Math.abs(f(c) - f(xs[0])) > 1e-6);
  const ids = (xs: NleClip[]) => xs.map((c) => c.id);

  return (
    <>
      <div className="border-b border-subtle px-3 py-2.5">
        <div className="text-[13px] font-semibold text-paper">{clips.length} clips selected</div>
        <div className="mt-1 flex flex-wrap gap-1 font-mono text-[9.5px]">
          {Object.entries(counts).map(([k, n]) => {
            const Icon = KIND_ICON[k as NleClip['kind']];
            return (
              <span key={k} className="inline-flex items-center gap-1 rounded bg-panel-hover px-1.5 py-0.5 text-secondary">
                <Icon size={9} className={KIND_TINT[k as NleClip['kind']]} /> {n} {k}
              </span>
            );
          })}
        </div>
      </div>
      {visual.length > 0 && (
        <Section title={`Video · ${visual.length}`}>
          <Slider
            label={mixed(visual, (c) => c.transform.opacity) ? 'Opacity (mixed)' : 'Opacity'}
            value={Math.round((first(visual, (c) => c.transform.opacity) ?? 1) * 100)}
            min={0}
            max={100}
            step={1}
            defaultValue={100}
            format={(v) => `${v}%`}
            onChange={(v) => {
              // one action → one undo step: transform merges per clip; animated clips also get their end opacity
              const patches = Object.fromEntries(visual.filter((c) => c.transformEnd).map((c) => [c.id, { transformEnd: { ...(c.transformEnd as NleTransform), opacity: v / 100 } }]));
              dispatch({ type: 'UPDATE_CLIPS', ids: visual.map((c) => c.id), transformPatch: { opacity: v / 100 }, patches, key: 'opacity' });
            }}
          />
        </Section>
      )}
      {audible.length > 0 && (
        <Section title={`Audio · ${audible.length}`}>
          <Slider
            label={mixed(audible, (c) => c.volume) ? 'Volume (mixed)' : 'Volume'}
            value={Math.round((first(audible, (c) => c.volume) ?? 1) * 100)}
            min={0}
            max={200}
            step={1}
            defaultValue={100}
            format={(v) => `${v}%`}
            onChange={(v) => dispatch({ type: 'UPDATE_CLIPS', ids: ids(audible), patch: { volume: v / 100 }, key: 'volume' })}
          />
          <Toggle checked={audible.every((c) => c.muted)} onChange={(muted) => dispatch({ type: 'UPDATE_CLIPS', ids: ids(audible), patch: { muted } })} label="Mute all" />
        </Section>
      )}
      {timed.length > 0 && (
        <Section title={`Speed · ${timed.length}`}>
          <Slider
            label={mixed(timed, (c) => c.rate) ? 'Rate (mixed)' : 'Rate'}
            value={first(timed, (c) => c.rate) ?? 1}
            min={0.25}
            max={4}
            step={0.01}
            log
            defaultValue={1}
            format={fmtRate}
            onChange={(rate) => dispatch({ type: 'UPDATE_CLIPS', ids: ids(timed), patch: { rate }, key: 'rate' })}
          />
          <div className="flex gap-1">
            {SPEED_CHIPS.map((r) => (
              <button key={r} type="button" onClick={() => dispatch({ type: 'UPDATE_CLIPS', ids: ids(timed), patch: { rate: r } })} className={cn(BTN, 'flex-1 px-1')}>
                {r}×
              </button>
            ))}
          </div>
        </Section>
      )}
    </>
  );
}
