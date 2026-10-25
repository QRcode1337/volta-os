'use client';

import { AlertTriangle, ChevronDown, ChevronRight, CloudOff, Copy, FileAudio, FileVideo, Image as ImageIcon, Inbox, Layers, RefreshCw, Search, Trash2, X } from 'lucide-react';
import { memo, useEffect, useMemo, useState } from 'react';
import { cn } from '@/lib/cn';
import type { EditorMediaGroup, EditorMediaItem, EditorMediaList } from '@/types/editor';
import type { NotionSection, VpEpisode } from '@/types/notion';
import { outlineOptions } from '@/lib/notion-md';
import type { EditorInboxItem } from '@/types/os';
import { fmtDuration } from './spatial';
import { clipMatchesFilter } from './state';
import { STATUS_ORDER, type ClipFilter, type ClipStatus, type EditorClip, type EditorPin, type NotesState } from './types';

const STATUS_STYLE: Record<ClipStatus, string> = {
  'NEEDS REVIEW': 'border-amber/50 bg-amber/10 text-amber',
  'CHANGES REQUESTED': 'border-orange/60 bg-orange/10 text-orange',
  APPROVED: 'border-green/60 bg-green/10 text-green',
};

const NOTE_DOT: Record<NotesState, { cls: string; tip: string }> = {
  loading: { cls: 'bg-muted', tip: 'Loading saved notes' },
  saved: { cls: 'bg-green', tip: 'Notes saved to the Windsor drive' },
  dirty: { cls: 'bg-amber', tip: 'Unsaved changes' },
  saving: { cls: 'bg-amber', tip: 'Saving' },
  error: { cls: 'bg-[#EF4444]', tip: 'Not saved' },
  local: { cls: 'bg-secondary', tip: 'Session only (local import)' },
};

export function fmtSize(bytes: number): string {
  if (bytes >= 1024 ** 3) return `${(bytes / 1024 ** 3).toFixed(1)} GB`;
  if (bytes >= 1024 ** 2) return `${(bytes / 1024 ** 2).toFixed(bytes >= 100 * 1024 ** 2 ? 0 : 1)} MB`;
  if (bytes >= 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${bytes} B`;
}

export function fmtDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const sameYear = d.getFullYear() === new Date().getFullYear();
  return d.toLocaleDateString('en-US', sameYear ? { month: 'short', day: 'numeric' } : { month: 'short', day: 'numeric', year: 'numeric' });
}

const KIND_ICON = { video: FileVideo, audio: FileAudio, image: ImageIcon } as const;
const KIND_TEXT = { video: 'text-orange', audio: 'text-teal', image: 'text-amber' } as const;

export interface BinState {
  status: 'loading' | 'ready' | 'error';
  data: EditorMediaList | null;
  error: string | null;
}

export interface MediaBinProps {
  clips: EditorClip[];
  pins: EditorPin[];
  filter: ClipFilter;
  activeClipId: string | null;
  focusClipId: string | null;
  notes: Record<string, NotesState>;
  bin: BinState;
  handoffs: EditorInboxItem[];
  /** Notion episodes from the Video Production index (for tagging files). */
  episodes: { status: 'loading' | 'ready' | 'error'; list: VpEpisode[]; error: string | null };
  /** Outline chapters per outline page id, loaded on demand. */
  outlines: Record<string, NotionSection[] | 'error'>;
  onSetEpisode: (clipId: string, key: string | null, section?: string | null) => void;
  onSelect: (id: string) => void;
  onCycleStatus: (id: string) => void;
  onSetStatus: (id: string, s: ClipStatus) => void;
  onRemove: (id: string) => void;
  onOpen: (item: EditorMediaItem) => void;
  onOffline: (item: EditorMediaItem) => void;
  onRefresh: () => void;
  onCopy: (text: string, label: string) => void;
  onDismissHandoff: (id: string) => void;
}

const SELECT = 'h-6 w-full min-w-0 rounded border border-subtle bg-obsidian px-1 font-mono text-[10px] text-secondary outline-none focus:border-orange/60';

/** Tag an open file with a Notion episode (and the outline chapter / beat it shows). Saved with its pins on Windsor. */
function EpisodeTag({ clip, episodes, outlines, onSet }: { clip: EditorClip; episodes: MediaBinProps['episodes']; outlines: MediaBinProps['outlines']; onSet: MediaBinProps['onSetEpisode'] }) {
  if (clip.origin !== 'server') return null;
  const ep = clip.episode;
  const sections = ep?.outlineId ? outlines[ep.outlineId] : undefined;
  const options = Array.isArray(sections) ? outlineOptions(sections) : [];
  return (
    <div className="mt-1.5 space-y-1" onClick={(e) => e.stopPropagation()} onContextMenu={(e) => e.stopPropagation()}>
      <div className="flex items-center gap-1">
        <span className="w-[46px] shrink-0 font-mono text-[8.5px] font-semibold tracking-wide text-muted">EPISODE</span>
        <select
          aria-label={`Notion episode for ${clip.name}`}
          value={ep?.key ?? ''}
          disabled={episodes.status !== 'ready'}
          onChange={(e) => onSet(clip.id, e.target.value || null)}
          className={SELECT}
          title={episodes.status === 'error' ? `Video Production index unavailable: ${episodes.error}` : 'Tag this file with a Video Production episode: the prompt then includes its title, Notion link and outline part'}
        >
          <option value="">{episodes.status === 'loading' ? 'loading…' : episodes.status === 'error' ? 'Notion unavailable' : 'No episode'}</option>
          {episodes.list.map((e) => (
            <option key={e.key} value={e.key}>
              {e.title}
            </option>
          ))}
        </select>
      </div>
      {ep && (
        <div className="flex items-center gap-1">
          <span className="w-[46px] shrink-0 font-mono text-[8.5px] font-semibold tracking-wide text-muted">PART</span>
          <select
            aria-label={`Outline part for ${clip.name}`}
            value={ep.section ?? ''}
            disabled={!ep.outlineId || !Array.isArray(sections)}
            onChange={(e) => onSet(clip.id, ep.key, e.target.value || null)}
            className={SELECT}
          >
            <option value="">{!ep.outlineId ? 'no outline yet' : sections === 'error' ? 'outline unavailable' : sections ? 'Whole outline (beat sheet)' : 'loading outline…'}</option>
            {options.map((o) => (
              <option key={o.value} value={o.value}>
                {o.depth ? `   ${o.label}` : o.label}
              </option>
            ))}
            {ep.section && !options.some((o) => o.value === ep.section) && <option value={ep.section}>{ep.section}</option>}
          </select>
          {ep.outlineUrl && (
            <a href={ep.outlineUrl} target="_blank" rel="noreferrer noopener" title="Open the outline in Notion" className="shrink-0 font-mono text-[9px] text-secondary hover:text-orange">
              Notion↗
            </a>
          )}
        </div>
      )}
    </div>
  );
}

function BinRow({ item, open, onOpen, onOffline, onCopy }: { item: EditorMediaItem; open: boolean; onOpen: () => void; onOffline: () => void; onCopy: (text: string, label: string) => void }) {
  const Icon = KIND_ICON[item.media];
  const dur = item.media === 'image' ? 'still' : fmtDuration(item.durationSec);
  return (
    <li
      onClick={item.offline ? onOffline : onOpen}
      title={`${item.path}\n${item.offline ? 'Not downloaded from iCloud' : open ? 'On the timeline: click to select' : 'Click to open on the timeline'}`}
      className={cn(
        'cursor-pointer rounded-md border px-2 py-1.5 transition-colors',
        item.offline ? 'border-amber/30 bg-amber/5 hover:border-amber/60' : open ? 'border-orange/50 bg-panel-elevated' : 'border-subtle bg-obsidian/40 hover:border-highlight hover:bg-panel-hover',
      )}
    >
      <div className="flex items-center gap-1.5">
        <Icon size={12} className={cn('shrink-0', item.offline ? 'text-muted' : KIND_TEXT[item.media])} />
        <span className={cn('min-w-0 flex-1 truncate text-[12px] font-semibold', item.offline ? 'text-secondary' : 'text-paper')}>{item.name}</span>
        {open && <span className="shrink-0 rounded bg-orange/15 px-1 font-mono text-[8.5px] font-bold text-orange">OPEN</span>}
        {item.offline && (
          <span className="flex shrink-0 items-center gap-0.5 rounded border border-amber/50 bg-amber/10 px-1 font-mono text-[8.5px] font-bold text-amber">
            <CloudOff size={9} /> NOT DOWNLOADED
          </span>
        )}
      </div>
      <div className="mt-0.5 flex flex-wrap items-center gap-x-1.5 pl-[18px] font-mono text-[9.5px] text-muted">
        <span className="text-secondary">{item.offline ? '--' : dur}</span>
        <span>{fmtSize(item.size)}</span>
        <span>{fmtDate(item.mtime)}</span>
        <span className="uppercase">{item.media}</span>
        {item.width && item.height ? (
          <span>
            {item.width}x{item.height}
            {item.fps ? ` @${Math.round(item.fps * 100) / 100}` : ''}
          </span>
        ) : null}
      </div>
      {item.offline && item.brctl && (
        <div className="mt-1 flex items-center gap-1 pl-[18px]" onClick={(e) => e.stopPropagation()}>
          <code className="selectable min-w-0 flex-1 truncate rounded bg-obsidian px-1 py-0.5 font-mono text-[9px] text-amber" title={item.brctl}>
            {item.brctl}
          </code>
          <button
            type="button"
            onClick={() => onCopy(item.brctl as string, 'brctl command')}
            title="Copy the command, run it in Terminal, then refresh the bin"
            className="flex shrink-0 items-center gap-0.5 rounded border border-amber/50 px-1 py-0.5 font-mono text-[9px] text-amber hover:bg-amber/10"
          >
            <Copy size={9} /> Copy
          </button>
        </div>
      )}
    </li>
  );
}

function GroupBlock({ group, query, openIds, expanded, onToggle, onOpen, onOffline, onCopy }: { group: EditorMediaGroup; query: string; openIds: Set<string>; expanded: boolean; onToggle: () => void; onOpen: (i: EditorMediaItem) => void; onOffline: (i: EditorMediaItem) => void; onCopy: (t: string, l: string) => void }) {
  const q = query.trim().toLowerCase();
  const items = q ? group.items.filter((i) => `${i.name} ${i.path}`.toLowerCase().includes(q)) : group.items;
  if (q && items.length === 0) return null;
  const show = q ? true : expanded;
  const offline = group.items.filter((i) => i.offline).length;
  return (
    <section className="rounded-md border border-subtle/70">
      <button type="button" onClick={onToggle} title={group.path ?? 'VOLTA Generations manifest'} className="flex w-full items-center gap-1.5 px-2 py-1.5 text-left hover:bg-panel-hover">
        {show ? <ChevronDown size={12} className="shrink-0 text-muted" /> : <ChevronRight size={12} className="shrink-0 text-muted" />}
        <span className="min-w-0 flex-1 truncate text-[11.5px] font-semibold text-paper">{group.name}</span>
        <span className="shrink-0 rounded bg-panel-hover px-1 font-mono text-[8.5px] uppercase text-secondary">{group.kind ?? group.source}</span>
        {offline > 0 && <CloudOff size={10} className="shrink-0 text-amber" aria-label={`${offline} not downloaded`} />}
        <span className="shrink-0 font-mono text-[9.5px] text-muted">
          {items.length}
          {group.total > group.items.length ? `/${group.total}` : ''}
        </span>
      </button>
      {show && (
        <ul className="space-y-1 px-1.5 pb-1.5">
          {items.length === 0 && <li className="px-1 py-2 font-mono text-[10.5px] text-muted">{group.exists ? "No media files found in this project's output folders." : 'Project folder not found (drive unplugged?).'}</li>}
          {items.map((i) => (
            <BinRow key={i.id} item={i} open={openIds.has(i.id)} onOpen={() => onOpen(i)} onOffline={() => onOffline(i)} onCopy={onCopy} />
          ))}
        </ul>
      )}
    </section>
  );
}

export const MediaBin = memo(function MediaBin(p: MediaBinProps) {
  const [menu, setMenu] = useState<{ clipId: string; x: number; y: number } | null>(null);
  const [query, setQuery] = useState('');
  const [collapsed, setCollapsed] = useState<Set<string> | null>(null);
  const shown = p.clips.filter((c) => clipMatchesFilter(c, p.pins, p.filter));
  const openIds = useMemo(() => new Set(p.clips.map((c) => c.id)), [p.clips]);
  const groups = p.bin.data?.groups ?? [];

  // groups with files start open for the two newest, the rest collapsed
  const expandedFor = (g: EditorMediaGroup, idx: number) => (collapsed ? !collapsed.has(g.id) : idx < 2 && g.items.length > 0);
  const toggle = (g: EditorMediaGroup, idx: number) => {
    const base = new Set<string>(collapsed ?? groups.filter((x, i) => !(i < 2 && x.items.length > 0)).map((x) => x.id));
    if (expandedFor(g, idx)) base.add(g.id);
    else base.delete(g.id);
    setCollapsed(base);
  };

  useEffect(() => {
    if (!menu) return;
    const close = () => setMenu(null);
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && close();
    window.addEventListener('pointerdown', close);
    window.addEventListener('keydown', onKey);
    window.addEventListener('blur', close);
    return () => {
      window.removeEventListener('pointerdown', close);
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('blur', close);
    };
  }, [menu]);

  const menuClip = menu ? p.clips.find((c) => c.id === menu.clipId) : null;
  const totalFiles = groups.reduce((n, g) => n + g.items.length, 0);

  return (
    <section className="hud-card flex h-full min-h-0 min-w-0 flex-col overflow-hidden">
      <header className="flex h-9 shrink-0 items-center gap-2 border-b border-subtle px-3">
        <Layers size={14} className="text-orange" />
        <h2 className="hud-label truncate">Media Bin</h2>
        <span className="ml-auto font-mono text-[10px] text-muted">{p.bin.status === 'ready' ? `${totalFiles} files` : p.bin.status === 'loading' ? 'scanning...' : ''}</span>
        <button type="button" onClick={p.onRefresh} title="Rescan Studio projects and the Generations manifest" className="rounded p-1 text-secondary hover:bg-panel-hover hover:text-paper">
          <RefreshCw size={12} className={p.bin.status === 'loading' ? 'robo-spin' : ''} />
        </button>
      </header>
      <div className="hud-scroll min-h-0 flex-1 space-y-3 overflow-y-auto p-2">
        {/* ── on the timeline ── */}
        <div>
          <div className="mb-1 flex items-center px-0.5 font-mono text-[9.5px] font-semibold tracking-wide text-secondary">
            ON TIMELINE
            <span className="ml-auto text-muted">
              {shown.length}/{p.clips.length}
            </span>
          </div>
          <ul className="space-y-1.5">
            {p.clips.length === 0 && <li className="rounded-md border border-dashed border-subtle px-2 py-3 text-center font-mono text-[10.5px] leading-relaxed text-muted">Nothing open. Click a file below.</li>}
            {p.clips.length > 0 && shown.length === 0 && <li className="px-2 py-3 text-center font-mono text-[10.5px] text-muted">No open files match this filter.</li>}
            {shown.map((c) => {
              const count = p.pins.filter((x) => x.clipId === c.id).length;
              const open = p.pins.filter((x) => x.clipId === c.id && !x.resolved).length;
              const active = c.id === p.activeClipId;
              const note = p.notes[c.id];
              return (
                <li
                  key={c.id}
                  onClick={() => p.onSelect(c.id)}
                  onContextMenu={(e) => {
                    e.preventDefault();
                    setMenu({ clipId: c.id, x: e.clientX, y: e.clientY });
                  }}
                  className={cn(
                    'group relative cursor-pointer rounded-md border p-2 transition-colors',
                    active ? 'border-orange/60 bg-panel-elevated' : 'border-subtle bg-obsidian/40 hover:border-highlight hover:bg-panel-hover',
                    p.focusClipId === c.id && 'ring-1 ring-orange/50',
                  )}
                >
                  {active && <span className="absolute inset-y-2 left-0 w-[3px] rounded-r bg-orange" />}
                  <div className="flex items-baseline gap-1.5">
                    <span className="font-doto text-[13px] font-bold text-orange">{String(c.number).padStart(2, '0')}</span>
                    <span className="min-w-0 flex-1 truncate text-[12.5px] font-semibold text-paper" title={c.path}>
                      {c.name}
                    </span>
                    {note && <span className={cn('h-1.5 w-1.5 shrink-0 rounded-full', NOTE_DOT[note].cls)} title={NOTE_DOT[note].tip} />}
                    <button
                      type="button"
                      title="Take off the timeline (saved notes stay on disk)"
                      onClick={(e) => {
                        e.stopPropagation();
                        p.onRemove(c.id);
                      }}
                      className="shrink-0 rounded p-0.5 text-muted opacity-0 hover:bg-panel-hover hover:text-paper group-hover:opacity-100"
                    >
                      <X size={11} />
                    </button>
                  </div>
                  <div className="mt-0.5 truncate font-mono text-[9.5px] text-muted">
                    {c.projectName} · {c.media === 'image' ? 'still' : fmtDuration(c.durationSec)} · {c.fpsKnown ? `${Math.round(c.fps * 100) / 100} fps` : c.media === 'video' ? '30 fps (assumed)' : c.media}
                  </div>
                  <div className="mt-1 flex flex-wrap items-center gap-1">
                    <span className={cn('rounded px-1 py-px font-mono text-[8.5px] font-bold', c.kind === 'ANIMATION' ? 'bg-orange/15 text-orange' : 'bg-teal/15 text-teal')}>{c.kind}</span>
                    <span className={cn('rounded px-1 py-px font-mono text-[8.5px]', count ? 'bg-panel-hover text-paper' : 'text-muted')} title={`${open} open / ${count} total pins`}>
                      pins {count}
                    </span>
                  </div>
                  <button
                    type="button"
                    title="Click to cycle status · right-click the card for all options"
                    onClick={(e) => {
                      e.stopPropagation();
                      p.onCycleStatus(c.id);
                    }}
                    className={cn('mt-1.5 w-full rounded border px-1.5 py-0.5 text-left font-mono text-[9px] font-semibold tracking-wide', STATUS_STYLE[c.status])}
                  >
                    ● {c.status}
                  </button>
                  <EpisodeTag clip={c} episodes={p.episodes} outlines={p.outlines} onSet={p.onSetEpisode} />
                </li>
              );
            })}
          </ul>
        </div>

        {/* ── bin ── */}
        <div>
          <div className="mb-1 flex items-center gap-1.5 px-0.5 font-mono text-[9.5px] font-semibold tracking-wide text-secondary">BY PROJECT / SOURCE</div>
          <label className="mb-1.5 flex h-7 items-center gap-1.5 rounded-md border border-subtle bg-obsidian px-2 focus-within:border-orange/60">
            <Search size={11} className="shrink-0 text-muted" />
            <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Filter by name or path" aria-label="Filter media" className="min-w-0 flex-1 bg-transparent font-mono text-[10.5px] text-paper outline-none placeholder:text-muted" />
            {query && (
              <button type="button" onClick={() => setQuery('')} aria-label="Clear filter" className="text-muted hover:text-paper">
                <X size={11} />
              </button>
            )}
          </label>
          {p.bin.status === 'loading' && !p.bin.data && (
            <div className="space-y-1.5" aria-busy>
              {[0, 1, 2].map((i) => (
                <div key={i} className="h-8 animate-pulse rounded-md bg-panel-hover/60" />
              ))}
            </div>
          )}
          {p.bin.status === 'error' && (
            <div className="flex items-start gap-1.5 rounded-md border border-[#EF4444]/40 bg-[#1F0F0F] px-2 py-1.5 font-mono text-[10.5px] text-paper">
              <AlertTriangle size={12} className="mt-0.5 shrink-0 text-[#EF4444]" />
              <span>
                Could not load the media bin: {p.bin.error}{' '}
                <button type="button" onClick={p.onRefresh} className="text-orange underline">
                  Retry
                </button>
              </span>
            </div>
          )}
          {p.bin.data && !p.bin.data.storage.windsorMounted && (
            <div className="mb-1.5 flex items-start gap-1.5 rounded-md border border-amber/40 bg-amber/5 px-2 py-1.5 font-mono text-[10px] leading-snug text-amber">
              <AlertTriangle size={11} className="mt-0.5 shrink-0" /> The Windsor drive is not mounted: Generations, renders and saved notes are unavailable until it is plugged in.
            </div>
          )}
          {p.bin.data && p.bin.data.errors.length > 0 && <div className="mb-1.5 font-mono text-[9.5px] leading-snug text-muted">{p.bin.data.errors.slice(0, 3).join(' · ')}</div>}
          {p.bin.data && totalFiles === 0 && (
            <div className="rounded-md border border-dashed border-subtle px-3 py-4 font-mono text-[10.5px] leading-relaxed text-muted">
              <div className="mb-1 font-semibold text-secondary">No media yet</div>
              Files appear here from three places:
              <ul className="mt-1 list-disc space-y-0.5 pl-4">
                <li>Studio project outputs and renders (VOLTA Studio, config/studio-projects.json)</li>
                <li>Generations: video, voice and image files in the Windsor manifest</li>
                <li>&quot;Send to VOLTA Editor&quot; from Generations or Studio</li>
              </ul>
            </div>
          )}
          <div className="space-y-1.5">
            {groups.map((g, i) => (
              <GroupBlock key={g.id} group={g} query={query} openIds={openIds} expanded={expandedFor(g, i)} onToggle={() => toggle(g, i)} onOpen={p.onOpen} onOffline={p.onOffline} onCopy={p.onCopy} />
            ))}
          </div>
        </div>

        {/* ── hand-offs that carry no media file ── */}
        {p.handoffs.length > 0 && (
          <div>
            <div className="mb-1 flex items-center gap-1 px-0.5 font-mono text-[9.5px] font-semibold tracking-wide text-secondary">
              <Inbox size={11} /> HAND-OFFS WITHOUT A FILE ({p.handoffs.length})
            </div>
            <p className="mb-1.5 px-0.5 font-mono text-[9.5px] leading-snug text-muted">These were sent from Scripts or Carousels and have nothing to play. Render them in Studio, then use &quot;Send to VOLTA Editor&quot; on the output.</p>
            <ul className="space-y-1">
              {p.handoffs.map((h) => (
                <li key={h.id} className="flex items-center gap-1.5 rounded-md border border-subtle bg-obsidian/40 px-2 py-1">
                  <span className="min-w-0 flex-1 truncate text-[11px] text-secondary" title={h.title}>
                    {h.title}
                  </span>
                  <span className="shrink-0 font-mono text-[9px] uppercase text-muted">{h.source}</span>
                  {h.notion && (
                    <a href={h.notion.url} target="_blank" rel="noreferrer noopener" title={`From Notion: ${h.notion.title}`} className="shrink-0 font-mono text-[9px] text-secondary hover:text-orange">
                      Notion↗
                    </a>
                  )}
                  <button type="button" onClick={() => p.onDismissHandoff(h.id)} aria-label="Dismiss hand-off" title="Dismiss" className="shrink-0 rounded p-0.5 text-muted hover:bg-panel-hover hover:text-paper">
                    <Trash2 size={10} />
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      {menu && menuClip && (
        <div
          className="fixed z-50 w-56 rounded-md border border-highlight bg-panel-elevated p-1 shadow-xl shadow-black/60"
          style={{ left: Math.min(menu.x, typeof window !== 'undefined' ? window.innerWidth - 232 : menu.x), top: menu.y }}
          onPointerDown={(e) => e.stopPropagation()}
        >
          <div className="px-2 py-1 font-mono text-[9.5px] text-muted">FILE {String(menuClip.number).padStart(2, '0')} · SET STATUS</div>
          {STATUS_ORDER.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => {
                p.onSetStatus(menuClip.id, s);
                setMenu(null);
              }}
              className={cn('flex w-full items-center gap-2 rounded px-2 py-1 text-left font-mono text-[10.5px] hover:bg-panel-hover', menuClip.status === s ? 'text-paper' : 'text-secondary')}
            >
              <span className={cn('h-1.5 w-1.5 rounded-full', s === 'APPROVED' ? 'bg-green' : s === 'CHANGES REQUESTED' ? 'bg-orange' : 'bg-amber')} />
              {s}
              {menuClip.status === s && <span className="ml-auto text-orange">✓</span>}
            </button>
          ))}
          <button
            type="button"
            onClick={() => {
              p.onRemove(menuClip.id);
              setMenu(null);
            }}
            className="mt-1 flex w-full items-center gap-2 rounded border-t border-subtle px-2 py-1 text-left font-mono text-[10.5px] text-secondary hover:bg-panel-hover hover:text-paper"
          >
            <Trash2 size={11} /> Take off timeline (notes stay saved)
          </button>
        </div>
      )}
    </section>
  );
});
