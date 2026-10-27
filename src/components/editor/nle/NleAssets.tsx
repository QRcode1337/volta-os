'use client';
// VOLTA Editor — Edit mode asset panel (CapCut-style): icon tab rail + Media / Text / Transitions / Elements.
// Everything is draggable onto the timeline / preview (dnd.ts payloads); clicking "+" or a preset adds it at the playhead.

import { AlertTriangle, CloudOff, FileAudio, Film, Image as ImageIcon, Loader2, Music, Palette, Plus, RefreshCw, Search, Shapes, Sparkles, Type, Upload, X } from 'lucide-react';
import { memo, useMemo, useRef, useState, type Dispatch, type ReactNode } from 'react';
import { cn } from '@/lib/cn';
import type { NleClip, NleTextStyle } from '@/types/nle';
import type { EditorMediaItem } from '@/types/editor';
import { DEFAULT_TEXT, FONT_STACK, clipFromAsset, fmtShort, isVisualKind, mainTrackId, previousAdjacent, trackClips } from '@/lib/nle/model';
import type { BinState } from '../MediaBin';
import { DND_ASSET, DND_PRESET, clearDrag, setDrag, type DndAsset } from './dnd';
import { COLOR_PRESETS, TEXT_PRESETS, TRANSITION_PRESETS, overlayTrackFor, presetToClip, presetToTransition, type ColorPreset, type TextPreset, type TransitionPreset } from './presets';
import type { NleAction, NleLeftTab, NleState } from './state';
import { TransitionGlyph } from './panels/TransitionGlyph';
import { useInView, useThumb } from './panels/thumbs';
import { normHex } from './panels/controls';

export interface NleAssetsProps {
  state: NleState;
  dispatch: Dispatch<NleAction>;
  bin: BinState;
  uploads: DndAsset[];
  onImportFiles: (files: File[]) => void;
  onRefresh: () => void;
  uploading: { name: string; progress: number }[];
  className?: string;
}

const TABS: { id: NleLeftTab; label: string; icon: typeof Film }[] = [
  { id: 'media', label: 'Media', icon: Film },
  { id: 'text', label: 'Text', icon: Type },
  { id: 'transitions', label: 'Transitions', icon: Sparkles },
  { id: 'elements', label: 'Elements', icon: Shapes },
];

type MediaFilter = 'all' | 'video' | 'image' | 'audio';
const ACCEPT = 'video/*,audio/*,image/*';
const MEDIA_RE = /^(video|audio|image)\//;
const GROUP_LIMIT = 120;

const toAsset = (i: EditorMediaItem): DndAsset => ({ id: i.id, url: i.url, name: i.name, media: i.media, durationSec: i.durationSec, width: i.width, height: i.height, hasAudio: i.hasAudio });

export function NleAssets(props: NleAssetsProps) {
  const { state, dispatch } = props;
  const tab = state.leftTab;
  return (
    <section className={cn('hud-card flex h-full min-h-0 min-w-0 overflow-hidden', props.className)}>
      <nav aria-label="Asset categories" className="flex w-[58px] shrink-0 flex-col items-stretch gap-0.5 border-r border-subtle bg-obsidian/40 p-1">
        {TABS.map((t) => {
          const Icon = t.icon;
          const on = tab === t.id;
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => dispatch({ type: 'SET_LEFT_TAB', tab: t.id })}
              aria-pressed={on}
              title={t.label}
              className={cn('flex flex-col items-center gap-0.5 rounded-md py-2 transition-colors', on ? 'bg-orange/15 text-orange' : 'text-secondary hover:bg-panel-hover hover:text-paper')}
            >
              <Icon size={17} />
              <span className="max-w-full truncate px-0.5 font-mono text-[8px] font-semibold uppercase tracking-wide">{t.id === 'transitions' ? 'Trans.' : t.label}</span>
            </button>
          );
        })}
      </nav>
      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        {tab === 'media' && <MediaTab {...props} />}
        {tab === 'text' && <TextTab state={state} dispatch={dispatch} />}
        {tab === 'transitions' && <TransitionsTab state={state} dispatch={dispatch} />}
        {tab === 'elements' && <ElementsTab state={state} dispatch={dispatch} />}
      </div>
    </section>
  );
}

function TabHeader({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <header className="flex h-9 shrink-0 items-center gap-1.5 border-b border-subtle px-3">
      <span className="hud-label truncate">{title}</span>
      <div className="ml-auto flex items-center gap-1">{children}</div>
    </header>
  );
}

function Notice({ text, tone }: { text: string; tone: 'ok' | 'warn' }) {
  return <div className={cn('shrink-0 border-b border-subtle px-3 py-1.5 font-mono text-[10px]', tone === 'ok' ? 'bg-green/5 text-green' : 'bg-amber/5 text-amber')}>{text}</div>;
}

function useNotice(): [{ text: string; tone: 'ok' | 'warn' } | null, (text: string, tone?: 'ok' | 'warn') => void] {
  const [n, setN] = useState<{ text: string; tone: 'ok' | 'warn' } | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const show = (text: string, tone: 'ok' | 'warn' = 'ok') => {
    setN({ text, tone });
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setN(null), 2600);
  };
  return [n, show];
}

// ───────────────────────── Media ─────────────────────────

function MediaTab({ state, dispatch, bin, uploads, onImportFiles, onRefresh, uploading }: NleAssetsProps) {
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<MediaFilter>('all');
  const [group, setGroup] = useState<string>('all');
  const [over, setOver] = useState(false);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const fileRef = useRef<HTMLInputElement>(null);
  const depth = useRef(0);

  const q = query.trim().toLowerCase();
  const match = (a: { name: string; media: DndAsset['media'] }, extra = '') => (filter === 'all' || a.media === filter) && (!q || `${a.name} ${extra}`.toLowerCase().includes(q));

  const groups = useMemo(() => bin.data?.groups ?? [], [bin.data]);
  const shownUploads = uploads.filter((u) => match(u));
  const shownGroups = groups
    .filter((g) => group === 'all' || g.id === group)
    .map((g) => ({ g, items: g.items.filter((i) => match(i, i.path)) }))
    .filter((x) => x.items.length > 0);
  const total = shownUploads.length + shownGroups.reduce((n, x) => n + x.items.length, 0);

  const addAtPlayhead = (a: DndAsset) => dispatch({ type: 'ADD_CLIPS', clips: [clipFromAsset(a)], trackId: null, start: state.playhead });

  const isFileDrag = (e: React.DragEvent) => {
    const t = Array.from(e.dataTransfer.types);
    return t.includes('Files') && !t.includes(DND_ASSET) && !t.includes(DND_PRESET);
  };

  return (
    <div
      className="relative flex min-h-0 flex-1 flex-col"
      onDragEnter={(e) => {
        if (!isFileDrag(e)) return;
        e.preventDefault();
        depth.current++;
        setOver(true);
      }}
      onDragOver={(e) => {
        if (!isFileDrag(e)) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = 'copy';
      }}
      onDragLeave={(e) => {
        if (!isFileDrag(e)) return;
        depth.current = Math.max(0, depth.current - 1);
        if (depth.current === 0) setOver(false);
      }}
      onDrop={(e) => {
        if (!isFileDrag(e)) return;
        e.preventDefault();
        depth.current = 0;
        setOver(false);
        const files = Array.from(e.dataTransfer.files).filter((f) => MEDIA_RE.test(f.type));
        if (files.length) onImportFiles(files);
      }}
    >
      <TabHeader title="Media">
        <button type="button" onClick={onRefresh} title="Rescan the media bin" className="rounded p-1 text-secondary hover:bg-panel-hover hover:text-paper" aria-label="Refresh media">
          <RefreshCw size={12} className={cn(bin.status === 'loading' && 'animate-spin')} />
        </button>
        <button type="button" onClick={() => fileRef.current?.click()} className="inline-flex h-6 items-center gap-1 rounded-md bg-orange px-2 font-mono text-[10px] font-semibold text-obsidian hover:brightness-110">
          <Upload size={11} /> Import
        </button>
        <input
          ref={fileRef}
          type="file"
          multiple
          accept={ACCEPT}
          hidden
          onChange={(e) => {
            const files = Array.from(e.target.files ?? []).filter((f) => MEDIA_RE.test(f.type));
            e.target.value = '';
            if (files.length) onImportFiles(files);
          }}
        />
      </TabHeader>

      <div className="shrink-0 space-y-1.5 border-b border-subtle px-3 py-2">
        <div className="relative">
          <Search size={11} className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-muted" />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              e.stopPropagation();
              if (e.key === 'Escape') setQuery('');
            }}
            placeholder="Search media"
            aria-label="Search media"
            className="h-7 w-full rounded-md border border-subtle bg-obsidian pl-6 pr-6 text-[11.5px] text-paper outline-none placeholder:text-muted focus:border-orange/60"
          />
          {query && (
            <button type="button" onClick={() => setQuery('')} className="absolute right-1.5 top-1/2 -translate-y-1/2 text-muted hover:text-paper" aria-label="Clear search">
              <X size={11} />
            </button>
          )}
        </div>
        <div className="flex items-center gap-1">
          {(['all', 'video', 'image', 'audio'] as const).map((f) => (
            <button
              key={f}
              type="button"
              onClick={() => setFilter(f)}
              className={cn('h-5 rounded-full border px-2 font-mono text-[9.5px] capitalize', filter === f ? 'border-orange/60 bg-orange/15 text-orange' : 'border-subtle text-secondary hover:text-paper')}
            >
              {f}
            </button>
          ))}
        </div>
        {groups.length > 1 && (
          <select
            value={group}
            onChange={(e) => setGroup(e.target.value)}
            aria-label="Project"
            className="h-6 w-full min-w-0 rounded border border-subtle bg-obsidian px-1 font-mono text-[10px] text-secondary outline-none focus:border-orange/60"
          >
            <option value="all">All projects ({groups.reduce((n, g) => n + g.items.length, 0)})</option>
            {groups.map((g) => (
              <option key={g.id} value={g.id}>
                {g.name} ({g.items.length})
              </option>
            ))}
          </select>
        )}
      </div>

      {uploading.length > 0 && (
        <div className="shrink-0 space-y-1 border-b border-subtle px-3 py-2">
          {uploading.map((u, i) => (
            <div key={`${u.name}-${i}`} className="font-mono text-[9.5px] text-secondary">
              <div className="flex items-center gap-1">
                <Loader2 size={10} className="shrink-0 animate-spin text-orange" />
                <span className="min-w-0 flex-1 truncate">{u.name}</span>
                <span className="tabular-nums text-paper">{Math.round(u.progress * 100)}%</span>
              </div>
              <div className="mt-0.5 h-1 overflow-hidden rounded-full bg-obsidian">
                <div className="h-full rounded-full bg-orange transition-[width]" style={{ width: `${Math.max(2, u.progress * 100)}%` }} />
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="hud-scroll min-h-0 flex-1 space-y-3 overflow-y-auto px-3 py-2">
        {shownUploads.length > 0 && (
          <AssetGroup title="Imported" count={shownUploads.length}>
            {shownUploads.map((a) => (
              <AssetCard key={a.id} asset={a} onAdd={addAtPlayhead} />
            ))}
          </AssetGroup>
        )}

        {bin.status === 'loading' && !bin.data && (
          <div className="grid grid-cols-[repeat(auto-fill,minmax(96px,1fr))] gap-2">
            {Array.from({ length: 6 }, (_, i) => (
              <div key={i} className="aspect-video animate-pulse rounded-md bg-panel-elevated" />
            ))}
          </div>
        )}
        {bin.status === 'error' && (
          <div className="rounded-md border border-[#EF4444]/40 bg-[#EF4444]/5 p-2 font-mono text-[10px] text-[#FCA5A5]">
            <div className="flex items-center gap-1">
              <AlertTriangle size={11} /> Media bin unavailable
            </div>
            {bin.error && <div className="mt-1 break-words text-secondary">{bin.error}</div>}
            <button type="button" onClick={onRefresh} className="mt-1.5 rounded border border-subtle px-2 py-0.5 text-secondary hover:text-paper">
              Retry
            </button>
          </div>
        )}

        {shownGroups.map(({ g, items }) => {
          const all = expanded.has(g.id) || !!q;
          const list = all ? items : items.slice(0, GROUP_LIMIT);
          return (
            <AssetGroup key={g.id} title={g.name} count={items.length}>
              {list.map((i) => (
                <AssetCard key={i.id} asset={toAsset(i)} offline={i.offline} hint={i.offline ? i.brctl ?? undefined : i.path} onAdd={addAtPlayhead} />
              ))}
              {list.length < items.length && (
                <button
                  type="button"
                  onClick={() => setExpanded((s) => new Set(s).add(g.id))}
                  className="col-span-full h-7 rounded-md border border-dashed border-subtle font-mono text-[10px] text-secondary hover:border-highlight hover:text-paper"
                >
                  Show all {items.length}
                </button>
              )}
            </AssetGroup>
          );
        })}

        {bin.status !== 'loading' && total === 0 && (
          <div className="flex flex-col items-center gap-2 py-8 text-center">
            <Upload size={20} className="text-muted" />
            <p className="font-mono text-[10.5px] leading-relaxed text-secondary">{q || filter !== 'all' ? 'No media matches.' : 'Drop video, audio or images here, or use Import.'}</p>
          </div>
        )}
        {bin.data?.errors?.length ? <p className="font-mono text-[9px] text-amber">{bin.data.errors.join(' · ')}</p> : null}
      </div>

      {over && (
        <div className="pointer-events-none absolute inset-1 z-10 flex flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed border-orange bg-obsidian/80 backdrop-blur-[1px]">
          <Upload size={22} className="text-orange" />
          <span className="font-mono text-[11px] font-semibold text-paper">Drop to import</span>
          <span className="font-mono text-[9.5px] text-secondary">video · audio · images</span>
        </div>
      )}
    </div>
  );
}

function AssetGroup({ title, count, children }: { title: string; count: number; children: ReactNode }) {
  return (
    <section>
      <div className="mb-1 flex items-center gap-1.5">
        <span className="min-w-0 truncate font-mono text-[9.5px] font-semibold uppercase tracking-wide text-secondary">{title}</span>
        <span className="font-mono text-[9px] text-muted">{count}</span>
        <span className="h-px flex-1 bg-subtle" />
      </div>
      <div className="grid grid-cols-[repeat(auto-fill,minmax(96px,1fr))] gap-2">{children}</div>
    </section>
  );
}

const MEDIA_ICON = { video: Film, image: ImageIcon, audio: FileAudio } as const;

const SCRUB_FRAMES = 8;

const AssetCard = memo(function AssetCard({ asset, offline, hint, onAdd }: { asset: DndAsset; offline?: boolean; hint?: string; onAdd: (a: DndAsset) => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const visible = useInView(ref);
  const [hover, setHover] = useState<number | null>(null); // 0..1 across the thumbnail
  const isVideo = asset.media === 'video';
  const poster = useThumb(isVideo && !offline ? asset.id : null, 1, visible);
  const sprite = useThumb(isVideo && !offline ? asset.id : null, SCRUB_FRAMES, hover != null);
  const Icon = MEDIA_ICON[asset.media];
  const dur = asset.media === 'image' ? 'IMG' : asset.durationSec != null ? fmtShort(asset.durationSec) : '--';
  const frames = sprite && sprite.count > 1 ? sprite.count : 0;
  const frameIdx = frames && hover != null ? Math.min(frames - 1, Math.floor(hover * frames)) : 0;

  return (
    <div
      ref={ref}
      draggable={!offline}
      onDragStart={(e) => {
        if (offline) return e.preventDefault();
        setHover(null);
        setDrag(e, DND_ASSET, asset);
      }}
      onDragEnd={clearDrag}
      onDoubleClick={() => !offline && onAdd(asset)}
      title={offline ? `${asset.name}\nNot downloaded from iCloud${hint ? `\n${hint}` : ''}` : `${asset.name}\nDrag to the timeline, or + to add at the playhead`}
      className={cn('group min-w-0 select-none', offline ? 'cursor-not-allowed opacity-50 grayscale' : 'cursor-grab active:cursor-grabbing')}
    >
      <div
        className={cn('relative aspect-video overflow-hidden rounded-md border bg-obsidian transition-colors', offline ? 'border-amber/30' : 'border-subtle group-hover:border-orange/60')}
        onMouseMove={(e) => {
          if (!isVideo || offline) return;
          const r = e.currentTarget.getBoundingClientRect();
          setHover(Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)));
        }}
        onMouseLeave={() => setHover(null)}
      >
        {asset.media === 'image' && visible && !offline && <img src={asset.url} alt="" loading="lazy" draggable={false} className="absolute inset-0 h-full w-full object-cover" />}
        {isVideo && poster && <img src={poster.url} alt="" draggable={false} className="absolute inset-0 h-full w-full object-cover" />}
        {isVideo && frames > 0 && hover != null && sprite && (
          <div
            className="absolute inset-0"
            style={{ backgroundImage: `url("${sprite.url}")`, backgroundSize: `${frames * 100}% 100%`, backgroundPosition: `${(frameIdx / (frames - 1)) * 100}% 0` }}
          />
        )}
        {isVideo && hover != null && <div className="pointer-events-none absolute inset-y-0 w-px bg-orange" style={{ left: `${hover * 100}%` }} />}
        {(asset.media === 'audio' || (isVideo && poster === null) || offline) && (
          <div className="absolute inset-0 flex items-center justify-center">
            {asset.media === 'audio' ? <WaveGlyph seed={asset.id} /> : offline ? <CloudOff size={18} className="text-amber" /> : <Icon size={18} className="text-muted" />}
          </div>
        )}
        {isVideo && poster === undefined && visible && !offline && <div className="absolute inset-0 animate-pulse bg-panel-elevated" />}

        <span className="absolute bottom-1 left-1 flex items-center rounded bg-black/70 p-0.5">
          {asset.media === 'audio' ? <Music size={9} className="text-teal" /> : <Icon size={9} className={asset.media === 'video' ? 'text-orange' : 'text-amber'} />}
        </span>
        <span className="absolute bottom-1 right-1 rounded bg-black/70 px-1 font-mono text-[8.5px] tabular-nums text-paper">{offline ? <CloudOff size={9} className="inline text-amber" /> : dur}</span>
        {!offline && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onAdd(asset);
            }}
            onDoubleClick={(e) => e.stopPropagation()}
            title="Add at the playhead"
            aria-label={`Add ${asset.name} at the playhead`}
            className="absolute right-1 top-1 flex h-5 w-5 items-center justify-center rounded-full bg-orange text-obsidian opacity-0 shadow-md shadow-black/50 transition-opacity hover:brightness-110 focus:opacity-100 group-hover:opacity-100"
          >
            <Plus size={12} strokeWidth={3} />
          </button>
        )}
      </div>
      <div className={cn('mt-1 truncate text-[10.5px] font-medium', offline ? 'text-muted' : 'text-paper')}>{asset.name}</div>
    </div>
  );
});

/** Deterministic little waveform for audio cards. */
function WaveGlyph({ seed }: { seed: string }) {
  const bars = useMemo(() => {
    let h = 2166136261;
    for (let i = 0; i < seed.length; i++) h = Math.imul(h ^ seed.charCodeAt(i), 16777619);
    return Array.from({ length: 22 }, (_, i) => {
      h = Math.imul(h ^ (h >>> 13), 1274126177) + i;
      const r = ((h >>> 0) % 1000) / 1000;
      return 0.2 + 0.8 * Math.abs(Math.sin(i * 0.55)) * (0.45 + 0.55 * r);
    });
  }, [seed]);
  return (
    <div className="flex h-[55%] w-[80%] items-center gap-[2px]">
      {bars.map((b, i) => (
        <span key={i} className="flex-1 rounded-full bg-teal/70" style={{ height: `${(b * 100).toFixed(1)}%` }} />
      ))}
    </div>
  );
}

// ───────────────────────── Text ─────────────────────────

/** Preview font size: frame px → tile px, kept legible. */
const tilePx = (size: number) => Math.max(9, Math.min(26, size * 0.17));
/** Offsets shrink a little in the tile because the legible preview font is relatively larger than in the frame. */
const TILE_OFFSET = 0.75;

export function TextStylePreview({ style, transform, className }: { style: Partial<NleTextStyle>; transform?: { x?: number; y?: number }; className?: string }) {
  const s = { ...DEFAULT_TEXT, ...style };
  const fs = tilePx(s.size);
  const k = fs / s.size;
  return (
    <div className={cn('relative overflow-hidden rounded-md bg-[#0A0A0A] bg-[radial-gradient(circle_at_30%_20%,#2a2724,transparent_60%)]', className)}>
      <span
        className="absolute whitespace-nowrap"
        style={{
          left: `${50 + (transform?.x ?? 0) * 100 * TILE_OFFSET}%`,
          top: `${50 + (transform?.y ?? 0) * 100 * TILE_OFFSET}%`,
          transform: 'translate(-50%, -50%)',
          fontFamily: FONT_STACK[s.font],
          fontSize: fs,
          fontWeight: s.weight,
          fontStyle: s.italic ? 'italic' : 'normal',
          color: s.color,
          textAlign: s.align,
          letterSpacing: s.letterSpacing * k,
          lineHeight: 1.1,
          WebkitTextStroke: s.stroke && s.strokeWidth ? `${Math.max(0.6, s.strokeWidth * k * 1.6)}px ${s.stroke}` : undefined,
          paintOrder: 'stroke fill',
          background: s.background ?? undefined,
          padding: s.background ? `${Math.max(1, fs * 0.15)}px ${Math.max(2, fs * 0.35)}px` : undefined,
          borderRadius: s.background ? 2 : undefined,
        }}
      >
        {s.content.split('\n')[0]}
      </span>
    </div>
  );
}

function TextTab({ state, dispatch }: { state: NleState; dispatch: Dispatch<NleAction> }) {
  const [notice, show] = useNotice();
  const add = (p: TextPreset) => {
    const clip = presetToClip(p);
    dispatch({ type: 'ADD_CLIPS', clips: [clip], trackId: overlayTrackFor(state.seq, state.playhead, p.duration), start: state.playhead });
    show(`Added "${p.label}" at ${fmtShort(state.playhead)}`);
  };
  return (
    <>
      <TabHeader title="Text" />
      {notice && <Notice {...notice} />}
      <div className="hud-scroll min-h-0 flex-1 overflow-y-auto p-3">
        <div className="grid grid-cols-[repeat(auto-fill,minmax(112px,1fr))] gap-2">
          {TEXT_PRESETS.map((p) => (
            <PresetTile key={p.label} label={p.label} sub={`${p.duration}s`} onAdd={() => add(p)} onDragStart={(e) => setDrag(e, DND_PRESET, p)}>
              <TextStylePreview style={p.style} transform={p.transform} className="aspect-video" />
            </PresetTile>
          ))}
        </div>
        <p className="mt-3 font-mono text-[9.5px] leading-relaxed text-muted">Click to add at the playhead on a free overlay track, or drag onto the timeline. Edit the words and style in the inspector.</p>
      </div>
    </>
  );
}

function PresetTile({ label, sub, children, onAdd, onDragStart }: { label: string; sub?: string; children: ReactNode; onAdd: () => void; onDragStart: (e: React.DragEvent) => void }) {
  return (
    <button
      type="button"
      draggable
      onDragStart={onDragStart}
      onDragEnd={clearDrag}
      onClick={onAdd}
      title={`${label}: click to add, drag to place`}
      className="group min-w-0 cursor-grab text-left active:cursor-grabbing"
    >
      <div className="relative overflow-hidden rounded-md border border-subtle transition-colors group-hover:border-orange/60">
        {children}
        <span className="absolute right-1 top-1 flex h-4 w-4 items-center justify-center rounded-full bg-orange text-obsidian opacity-0 transition-opacity group-hover:opacity-100">
          <Plus size={10} strokeWidth={3} />
        </span>
      </div>
      <div className="mt-1 flex items-center gap-1">
        <span className="min-w-0 flex-1 truncate text-[10.5px] font-medium text-paper">{label}</span>
        {sub && <span className="shrink-0 font-mono text-[9px] text-muted">{sub}</span>}
      </div>
    </button>
  );
}

// ───────────────────────── Transitions ─────────────────────────

/** Where a clicked transition goes: the selected visual clip, else the main-track clip starting nearest the playhead (preferring clips with a previous neighbour). */
export function transitionTarget(state: NleState): NleClip | null {
  const s = state.seq;
  const sel = state.selection.map((id) => s.clips.find((c) => c.id === id)).find((c): c is NleClip => !!c && isVisualKind(c.kind));
  if (sel) return sel;
  const main = mainTrackId(s);
  if (!main) return null;
  const onMain = trackClips(s, main);
  if (!onMain.length) return null;
  const withPrev = onMain.filter((c) => previousAdjacent(s, c));
  const pool = withPrev.length ? withPrev : onMain;
  return pool.reduce((best, c) => (Math.abs(c.start - state.playhead) < Math.abs(best.start - state.playhead) ? c : best), pool[0]);
}

function TransitionsTab({ state, dispatch }: { state: NleState; dispatch: Dispatch<NleAction> }) {
  const [notice, show] = useNotice();
  const target = transitionTarget(state);
  const apply = (p: TransitionPreset) => {
    const t = transitionTarget(state);
    if (!t) {
      show('Add a clip to the timeline first', 'warn');
      return;
    }
    dispatch({ type: 'SET_TRANSITION', id: t.id, transition: presetToTransition(p) });
    show(`${p.label} → ${t.name}`);
  };
  return (
    <>
      <TabHeader title="Transitions" />
      {notice && <Notice {...notice} />}
      <div className="hud-scroll min-h-0 flex-1 overflow-y-auto p-3">
        <div className="grid grid-cols-[repeat(auto-fill,minmax(96px,1fr))] gap-2">
          {TRANSITION_PRESETS.map((p) => (
            <PresetTile key={p.type} label={p.label} sub={`${p.duration}s`} onAdd={() => apply(p)} onDragStart={(e) => setDrag(e, DND_PRESET, p)}>
              <TransitionGlyph type={p.type} className="aspect-video" />
            </PresetTile>
          ))}
        </div>
        <p className="mt-3 font-mono text-[9.5px] leading-relaxed text-muted">
          {target ? (
            <>
              Click applies to <span className="text-paper">{target.name}</span> (from {previousAdjacent(state.seq, target)?.name ?? 'the background'}). Drag onto a cut to place it precisely.
            </>
          ) : (
            'Add clips to the timeline, then click or drag a transition onto a cut.'
          )}
        </p>
      </div>
    </>
  );
}

// ───────────────────────── Elements ─────────────────────────

function ElementsTab({ state, dispatch }: { state: NleState; dispatch: Dispatch<NleAction> }) {
  const [notice, show] = useNotice();
  const [custom, setCustom] = useState('#FF5500');
  const customPreset: ColorPreset = { kind: 'color', label: `Colour ${custom}`, color: custom, duration: 5 };
  const add = (p: ColorPreset) => {
    dispatch({ type: 'ADD_CLIPS', clips: [presetToClip(p)], trackId: null, start: state.playhead });
    show(`Added ${p.label} at ${fmtShort(state.playhead)}`);
  };
  return (
    <>
      <TabHeader title="Elements" />
      {notice && <Notice {...notice} />}
      <div className="hud-scroll min-h-0 flex-1 overflow-y-auto p-3">
        <div className="mb-1 font-mono text-[9.5px] font-semibold uppercase tracking-wide text-secondary">Colour solids</div>
        <div className="grid grid-cols-[repeat(auto-fill,minmax(64px,1fr))] gap-2">
          {COLOR_PRESETS.map((p) => (
            <PresetTile key={p.color} label={p.label} onAdd={() => add(p)} onDragStart={(e) => setDrag(e, DND_PRESET, p)}>
              <div className="aspect-video" style={{ background: p.color }} />
            </PresetTile>
          ))}
        </div>

        <div className="mb-1 mt-4 font-mono text-[9.5px] font-semibold uppercase tracking-wide text-secondary">Custom colour</div>
        <div className="flex items-stretch gap-2 rounded-md border border-subtle bg-obsidian/40 p-2">
          <div
            draggable
            onDragStart={(e) => setDrag(e, DND_PRESET, customPreset)}
            onDragEnd={clearDrag}
            title="Drag onto the timeline"
            className="relative w-20 shrink-0 cursor-grab overflow-hidden rounded border border-subtle active:cursor-grabbing"
            style={{ background: custom }}
          >
            <input type="color" value={custom.toLowerCase()} onChange={(e) => setCustom(e.target.value.toUpperCase())} className="absolute inset-0 h-full w-full cursor-pointer opacity-0" aria-label="Pick a colour" />
          </div>
          <div className="flex min-w-0 flex-1 flex-col gap-1.5">
            <input
              type="text"
              defaultValue={custom}
              key={custom}
              spellCheck={false}
              onKeyDown={(e) => {
                e.stopPropagation();
                if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
              }}
              onBlur={(e) => {
                const n = normHex(e.target.value);
                if (n) setCustom(n);
                else e.target.value = custom;
              }}
              aria-label="Hex colour"
              className="h-6 w-full min-w-0 rounded border border-subtle bg-obsidian px-1.5 font-mono text-[10.5px] uppercase text-paper outline-none focus:border-orange/60"
            />
            <button type="button" onClick={() => add(customPreset)} className="inline-flex h-6 items-center justify-center gap-1 rounded-md bg-orange px-2 font-mono text-[10px] font-semibold text-obsidian hover:brightness-110">
              <Palette size={11} /> Add solid
            </button>
          </div>
        </div>
        <p className="mt-3 font-mono text-[9.5px] leading-relaxed text-muted">Click adds a 5 s solid at the playhead on the main track; drag to put it on any track (e.g. under text as a title card).</p>
      </div>
    </>
  );
}
