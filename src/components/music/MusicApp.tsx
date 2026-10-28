'use client';
// VOLTA Music: the VANTA VECTOR library. Album grid / list over the files in config/music.json roots,
// a persistent player bar with a Web Audio waveform, and a notes editor (lyrics, credits, Suno link, tags, BPM, key).
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, Cloud, Copy, FolderPlus, HardDrive, LayoutGrid, List, Pause, Play, RefreshCw, Search, Sparkles } from 'lucide-react';
import { cn } from '@/lib/cn';
import { pushToEditorInbox } from '@/lib/editor-inbox';
import { AppTopBar } from '@/components/elements/kit/AppTopBar';
import { ToastStack, useToasts } from '@/components/elements/kit/toast';
import { copyText } from '@/components/elements/kit/clipboard';
import { Cover } from './Cover';
import { PlayerBar, type PlayerHandle } from './PlayerBar';
import { SunoPanel } from './SunoPanel';
import { TrackPanel } from './TrackPanel';
import { fmtBytes, fmtClock } from './format';
import { makeInboxItem } from '@/lib/media-ids';
import { api } from './music-client';
import type { MusicLibrary, MusicRoot, MusicTrack, TrackMeta } from './types';

type Filter = 'all' | 'local' | 'icloud';
type Sort = 'title' | 'recent' | 'length' | 'size';
type View = 'grid' | 'list';
const FILTERS: { id: Filter; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'local', label: 'Local' },
  { id: 'icloud', label: 'In iCloud' },
];
const SORTS: { id: Sort; label: string }[] = [
  { id: 'title', label: 'Title' },
  { id: 'recent', label: 'Newest' },
  { id: 'length', label: 'Length' },
  { id: 'size', label: 'Size' },
];
const VIEW_KEY = 'volta:music:view';

const chip = 'rounded-full border border-subtle bg-panel-elevated px-2 py-0.5 font-mono text-[9.5px] uppercase tracking-[0.05em] text-secondary';
const smallBtn =
  'inline-flex h-7 items-center gap-1.5 rounded-full border border-subtle px-3 font-mono text-[10px] font-semibold uppercase tracking-[0.06em] text-secondary transition-colors hover:border-highlight hover:text-paper disabled:opacity-40';

function Equalizer() {
  return (
    <span className="flex h-3.5 items-end gap-[2px]" aria-label="Playing">
      {[0, 1, 2].map((i) => (
        <span key={i} className="w-[3px] origin-bottom rounded-sm bg-orange" style={{ height: '100%', animation: `music-eq 0.9s ease-in-out ${i * 0.18}s infinite` }} />
      ))}
    </span>
  );
}

function StatusChip({ t }: { t: MusicTrack }) {
  return t.storage === 'icloud' ? (
    <span className={cn(chip, 'inline-flex items-center gap-1 border-amber/50 text-amber')}>
      <Cloud className="h-3 w-3" /> In iCloud
    </span>
  ) : (
    <span className={cn(chip, 'inline-flex items-center gap-1 border-green/40 text-green')}>
      <span className="h-1.5 w-1.5 rounded-full bg-green" /> Local
    </span>
  );
}

export function MusicApp() {
  const { toasts, push, dismiss } = useToasts();
  const [lib, setLib] = useState<MusicLibrary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [filter, setFilter] = useState<Filter>('all');
  const [sort, setSort] = useState<Sort>('title');
  const [view, setView] = useState<View>('grid');
  const [query, setQuery] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [playingId, setPlayingId] = useState<string | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [saving, setSaving] = useState(false);
  const [rootsOpen, setRootsOpen] = useState(false);
  const [sunoOpen, setSunoOpen] = useState(false);
  const dirtyRef = useRef(false);
  const playerRef = useRef<PlayerHandle>(null);

  const load = useCallback(
    async (refresh = false) => {
      setRefreshing(true);
      try {
        setLib(await api<MusicLibrary>(`/api/music${refresh ? '?refresh=1' : ''}`));
        setError(null);
      } catch (err) {
        setError((err as Error).message);
      } finally {
        setRefreshing(false);
      }
    },
    [],
  );
  useEffect(() => {
    void load();
    try {
      const v = window.localStorage.getItem(VIEW_KEY);
      if (v === 'grid' || v === 'list') setView(v);
    } catch {
      // storage unavailable
    }
  }, [load]);

  const tracks = useMemo(() => lib?.tracks ?? [], [lib]);
  const byId = useMemo(() => new Map(tracks.map((t) => [t.id, t])), [tracks]);
  const selected = selectedId ? (byId.get(selectedId) ?? null) : null;
  const playing = playingId ? (byId.get(playingId) ?? null) : null;

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    const rows = tracks.filter((t) => {
      if (filter === 'local' && t.storage !== 'local') return false;
      if (filter === 'icloud' && t.storage !== 'icloud') return false;
      if (!q) return true;
      const hay = [t.title, t.fileName, ...(t.meta.credits ?? []), ...(t.meta.tags ?? []), t.meta.lyrics ?? '', t.tags.artist ?? '', t.tags.album ?? ''].join('\n').toLowerCase();
      return hay.includes(q);
    });
    const cmp: Record<Sort, (a: MusicTrack, b: MusicTrack) => number> = {
      title: (a, b) => a.title.localeCompare(b.title, undefined, { sensitivity: 'base', numeric: true }),
      recent: (a, b) => b.mtime.localeCompare(a.mtime),
      length: (a, b) => (b.durationSec ?? -1) - (a.durationSec ?? -1),
      size: (a, b) => b.bytes - a.bytes,
    };
    return [...rows].sort(cmp[sort]);
  }, [tracks, filter, query, sort]);

  const counts = lib?.counts ?? { total: 0, local: 0, icloud: 0 };
  const filterCount: Record<Filter, number> = { all: counts.total, local: counts.local, icloud: counts.icloud };

  // ── queue: playable (local) tracks in the order currently on screen ──
  const queue = useMemo(() => {
    const q = visible.filter((t) => t.storage === 'local');
    return playingId && !q.some((t) => t.id === playingId) ? tracks.filter((t) => t.storage === 'local') : q;
  }, [visible, tracks, playingId]);
  const qIdx = queue.findIndex((t) => t.id === playingId);
  const goPrev = useCallback(() => qIdx > 0 && setPlayingId(queue[qIdx - 1].id), [qIdx, queue]);
  const goNext = useCallback(() => {
    if (qIdx >= 0 && qIdx < queue.length - 1) setPlayingId(queue[qIdx + 1].id);
    else if (qIdx < 0 && queue.length) setPlayingId(queue[0].id);
  }, [qIdx, queue]);

  const playOrToggle = useCallback(
    (t: MusicTrack) => {
      if (t.storage === 'icloud') {
        setSelectedId(t.id);
        push(`${t.title} is in iCloud. Download it first (command in the panel).`, { tone: 'error' });
        return;
      }
      if (t.id === playingId) playerRef.current?.toggle();
      else setPlayingId(t.id);
    },
    [playingId, push],
  );

  const select = useCallback((id: string | null) => {
    if (dirtyRef.current && id !== selectedIdRef.current && !window.confirm('Discard unsaved notes for this track?')) return;
    dirtyRef.current = false;
    setSelectedId(id);
  }, []);
  const selectedIdRef = useRef<string | null>(null);
  selectedIdRef.current = selectedId;

  const copy = useCallback(
    async (text: string, what: string) => {
      const ok = await copyText(text);
      push(ok ? `${what} copied.` : 'Copy failed; select the text instead.', { tone: ok ? 'success' : 'error' });
    },
    [push],
  );

  const saveMeta = useCallback(
    async (meta: TrackMeta) => {
      if (!selectedId) return;
      setSaving(true);
      try {
        await api('/api/music/meta', { method: 'PUT', body: { id: selectedId, meta } });
        await load();
        push('Notes saved to Windsor.', { tone: 'success' });
      } catch (err) {
        push((err as Error).message, { tone: 'error', ttl: 9000 });
      } finally {
        setSaving(false);
      }
    },
    [selectedId, load, push],
  );

  const useInStudio = useCallback(
    async (t: MusicTrack) => {
      const ok = await copyText(t.id);
      push(ok ? `Studio file id ${t.id} copied.` : `Copy failed. The Studio file id is ${t.id}.`, { tone: ok ? 'success' : 'error', ttl: 6000 });
    },
    [push],
  );

  const sendToEditor = useCallback(
    (t: MusicTrack) => {
      const waiting = pushToEditorInbox(
        makeInboxItem({ source: 'music', ref: t.id, title: t.title, kind: 'A-ROLL CUT', durationSec: t.durationSec ?? 0, media: { id: t.id, path: t.path } }),
      );
      push(`Sent to the VOLTA Editor inbox (${waiting} waiting).`, { tone: 'success', href: '/apps/editor', linkLabel: 'Open VOLTA Editor' });
    },
    [push],
  );

  const setRoot = useCallback(
    async (path: string, enabled: boolean) => {
      try {
        await api('/api/music/roots', { method: 'PUT', body: { path, enabled } });
        await load(true);
        push(enabled ? 'Folder enabled and added to config/music.json.' : 'Folder disabled.', { tone: 'success' });
      } catch (err) {
        push((err as Error).message, { tone: 'error' });
      }
    },
    [load, push],
  );

  const changeView = (v: View) => {
    setView(v);
    try {
      window.localStorage.setItem(VIEW_KEY, v);
    } catch {
      // storage unavailable
    }
  };

  const icloudRoots = (lib?.roots ?? []).filter((r) => r.icloudCount > 0);

  return (
    <div className="flex h-screen w-screen flex-col overflow-hidden bg-obsidian text-paper">
      <style>{`@keyframes music-eq{0%,100%{transform:scaleY(.25)}50%{transform:scaleY(1)}}`}</style>
      <AppTopBar
        accent="Music"
        subtitle={`${lib?.band ?? 'VANTA VECTOR'} · local library`}
        right={
          <>
            {lib && (
              <span className="hud-label hidden md:inline">
                {counts.total} tracks · <span className="text-green">{counts.local} local</span> · <span className="text-amber">{counts.icloud} in iCloud</span>
              </span>
            )}
            <button type="button" onClick={() => setSunoOpen((o) => !o)} className={cn(smallBtn, sunoOpen && 'border-orange/50 text-paper')} aria-expanded={sunoOpen}>
              <Sparkles className="h-3 w-3" /> Suno
            </button>
            <button type="button" onClick={() => setRootsOpen((o) => !o)} className={cn(smallBtn, rootsOpen && 'border-orange/50 text-paper')} aria-expanded={rootsOpen}>
              <HardDrive className="h-3 w-3" /> Folders
            </button>
            <button type="button" onClick={() => void load(true)} aria-label="Refresh" className={smallBtn}>
              <RefreshCw className={cn('h-3 w-3', refreshing && 'animate-spin')} /> Refresh
            </button>
          </>
        }
      />

      {sunoOpen && <SunoPanel onSaved={() => void load(true)} onCopy={copy} onToast={(m, tone) => push(m, { tone, ttl: tone === 'error' ? 9000 : undefined })} />}

      {rootsOpen && lib && <RootsPanel roots={lib.roots} candidates={lib.candidates} configErrors={lib.configErrors} onToggle={setRoot} onCopy={copy} />}

      <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-subtle px-4 py-2">
        <nav className="flex flex-wrap gap-1" aria-label="Filter">
          {FILTERS.map((f) => (
            <button
              key={f.id}
              type="button"
              onClick={() => setFilter(f.id)}
              className={cn(
                'flex h-8 items-center gap-1.5 rounded-full border px-3 text-[12px] font-medium transition-colors',
                filter === f.id ? 'border-orange bg-orange/10 text-paper' : 'border-transparent text-secondary hover:border-subtle hover:text-paper',
              )}
            >
              {f.label}
              <span className="rounded-full bg-panel-elevated px-1.5 font-mono text-[10px] text-muted">{filterCount[f.id]}</span>
            </button>
          ))}
        </nav>
        <label className="relative ml-2 flex items-center">
          <Search className="pointer-events-none absolute left-2.5 h-3.5 w-3.5 text-muted" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search titles, credits, lyrics"
            aria-label="Search tracks"
            className="h-8 w-64 rounded-full border border-subtle bg-panel pl-8 pr-3 text-[12px] text-paper placeholder:text-muted focus:border-orange/60 focus:outline-none"
          />
        </label>
        <div className="ml-auto flex items-center gap-2">
          <label className="flex items-center gap-1.5">
            <span className="hud-label">Sort</span>
            <select value={sort} onChange={(e) => setSort(e.target.value as Sort)} className="h-8 rounded-full border border-subtle bg-panel px-2.5 text-[12px] text-paper focus:outline-none">
              {SORTS.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.label}
                </option>
              ))}
            </select>
          </label>
          <div className="flex rounded-full border border-subtle p-0.5" role="group" aria-label="View">
            {(['grid', 'list'] as const).map((v) => (
              <button
                key={v}
                type="button"
                onClick={() => changeView(v)}
                aria-pressed={view === v}
                aria-label={v === 'grid' ? 'Grid view' : 'List view'}
                className={cn('flex h-7 w-8 items-center justify-center rounded-full', view === v ? 'bg-panel-elevated text-orange' : 'text-muted hover:text-paper')}
              >
                {v === 'grid' ? <LayoutGrid className="h-3.5 w-3.5" /> : <List className="h-3.5 w-3.5" />}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="flex min-h-0 flex-1">
        <main className="hud-scroll min-w-0 flex-1 overflow-y-auto px-4 pb-6 pt-4">
          {error && <p className="mb-3 rounded-md border border-[#EF4444]/40 bg-[#EF4444]/5 px-3 py-2 font-mono text-[11px] text-[#EF4444]">Could not load the library: {error}</p>}
          {!lib && !error && <p className="font-mono text-[11px] uppercase tracking-[0.06em] text-muted">Reading the library...</p>}

          {lib && lib.meta.reason && (
            <p className="mb-3 flex items-start gap-2 rounded-md border border-amber/40 bg-amber/5 px-3 py-2 text-[12.5px] text-paper">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber" />
              <span>{lib.meta.reason}</span>
            </p>
          )}

          {lib && counts.icloud > 0 && (
            <section className="mb-4 rounded-lg border border-amber/40 bg-amber/5 p-3.5" aria-label="iCloud notice">
              <p className="flex items-start gap-2 text-[12.5px] leading-relaxed text-paper">
                <Cloud className="mt-0.5 h-4 w-4 shrink-0 text-amber" />
                <span>
                  <strong className="font-semibold">{counts.icloud} of {counts.total} tracks are in iCloud.</strong> They are dataless placeholders (0 bytes on this Mac), so they cannot be played, probed or sent anywhere yet.
                  VOLTA never triggers the download or opens them. To fetch a folder, run this in Terminal:
                </span>
              </p>
              <div className="mt-2.5 space-y-1.5">
                {icloudRoots.map((r) => (
                  <div key={r.id} className="flex items-center gap-2">
                    <code className="min-w-0 flex-1 truncate rounded bg-obsidian px-2.5 py-1.5 font-mono text-[11px] text-secondary" title={r.downloadCommand}>
                      {r.downloadCommand}
                    </code>
                    <button type="button" className={smallBtn} onClick={() => void copy(r.downloadCommand, 'Download command')}>
                      <Copy className="h-3 w-3" /> Copy
                    </button>
                    <span className="hidden font-mono text-[10px] uppercase tracking-[0.05em] text-muted lg:inline">
                      {r.icloudCount} file{r.icloudCount === 1 ? '' : 's'}
                    </span>
                  </div>
                ))}
              </div>
            </section>
          )}

          {lib && visible.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-2 py-24 text-center">
              <p className="font-doto text-4xl text-orange">0</p>
              <p className="max-w-md text-secondary">
                {counts.total === 0
                  ? lib.roots.some((r) => r.enabled && !r.exists)
                    ? `The library folder was not found: ${lib.roots.find((r) => r.enabled && !r.exists)?.path}`
                    : 'No tracks found in the enabled folders. Check Folders in the top bar.'
                  : 'Nothing matches this filter.'}
              </p>
            </div>
          ) : view === 'grid' ? (
            <div className="grid grid-cols-[repeat(auto-fill,minmax(190px,1fr))] gap-4">
              {visible.map((t) => (
                <TrackCard key={t.id} t={t} selected={t.id === selectedId} current={t.id === playingId} playing={isPlaying && t.id === playingId} onSelect={() => select(t.id)} onPlay={() => playOrToggle(t)} />
              ))}
            </div>
          ) : (
            <div className="hud-card divide-y divide-subtle overflow-hidden">
              {visible.map((t, i) => (
                <TrackRow key={t.id} n={i + 1} t={t} selected={t.id === selectedId} current={t.id === playingId} playing={isPlaying && t.id === playingId} onSelect={() => select(t.id)} onPlay={() => playOrToggle(t)} />
              ))}
            </div>
          )}
        </main>

        {selected && lib && (
          <TrackPanel
            key={selected.id}
            track={selected}
            metaOk={lib.meta.ok}
            metaReason={lib.meta.reason}
            isCurrent={selected.id === playingId}
            playing={isPlaying}
            saving={saving}
            onClose={() => select(null)}
            onPlay={() => playOrToggle(selected)}
            onSave={(m) => void saveMeta(m)}
            onDirty={(d) => {
              dirtyRef.current = d;
            }}
            onUseInStudio={() => void useInStudio(selected)}
            onSendToEditor={() => sendToEditor(selected)}
            onCopy={(text, what) => void copy(text, what)}
          />
        )}
      </div>

      <PlayerBar
        track={playing}
        hasPrev={qIdx > 0}
        hasNext={qIdx >= 0 ? qIdx < queue.length - 1 : queue.length > 0 && !!playing}
        onPrev={goPrev}
        onNext={goNext}
        onPlayState={setIsPlaying}
        onError={(m) => push(m, { tone: 'error', ttl: 8000 })}
        handleRef={playerRef}
      />
      <ToastStack toasts={toasts} onDismiss={dismiss} />
    </div>
  );
}

interface RowProps {
  t: MusicTrack;
  selected: boolean;
  current: boolean;
  playing: boolean;
  onSelect: () => void;
  onPlay: () => void;
}

function TrackCard({ t, selected, current, playing, onSelect, onPlay }: RowProps) {
  const offline = t.storage === 'icloud';
  return (
    <article className={cn('hud-card group overflow-hidden transition-colors hover:border-highlight', selected && 'border-orange/60', current && 'shadow-[0_0_0_1px_rgba(255,85,0,0.35)]')}>
      <div className="relative">
        <button type="button" onClick={onSelect} className="block w-full" aria-label={`Open ${t.title}`}>
          <Cover track={t} />
        </button>
        <span className={cn(chip, 'pointer-events-none absolute left-2 top-2 bg-black/70')}>{t.format}</span>
        {current && playing && (
          <span className="pointer-events-none absolute right-2 top-2 rounded-full bg-black/70 px-2 py-1">
            <Equalizer />
          </span>
        )}
        {!offline && (
          <button
            type="button"
            onClick={onPlay}
            aria-label={current && playing ? `Pause ${t.title}` : `Play ${t.title}`}
            className={cn(
              'absolute bottom-2 right-2 inline-flex h-10 w-10 items-center justify-center rounded-full bg-orange text-black shadow-lg transition-all hover:scale-105',
              current ? 'opacity-100' : 'translate-y-1 opacity-0 focus-visible:translate-y-0 focus-visible:opacity-100 group-hover:translate-y-0 group-hover:opacity-100',
            )}
          >
            {current && playing ? <Pause className="h-4 w-4" fill="currentColor" /> : <Play className="ml-0.5 h-4 w-4" fill="currentColor" />}
          </button>
        )}
      </div>
      <button type="button" onClick={onSelect} className="block w-full space-y-1.5 p-3 text-left">
        <p className={cn('line-clamp-2 text-[13px] font-medium leading-snug', current ? 'text-orange' : 'text-paper')} title={t.fileName}>
          {t.title}
        </p>
        <p className="font-mono text-[10px] text-muted">
          {fmtClock(t.durationSec)} · {fmtBytes(t.bytes)}
        </p>
        <div className="flex flex-wrap items-center gap-1">
          <StatusChip t={t} />
          {(t.meta.credits ?? []).slice(0, 2).map((c) => (
            <span key={c} className={chip}>
              {c}
            </span>
          ))}
          {t.meta.bpm ? <span className={chip}>{t.meta.bpm} bpm</span> : null}
          {t.meta.lyrics ? <span className={chip}>lyrics</span> : null}
        </div>
      </button>
    </article>
  );
}

function TrackRow({ n, t, selected, current, playing, onSelect, onPlay }: RowProps & { n: number }) {
  const offline = t.storage === 'icloud';
  return (
    <div className={cn('group grid grid-cols-[36px_44px_minmax(0,1fr)_minmax(0,1.1fr)_56px_64px_72px_92px] items-center gap-3 px-3 py-2 transition-colors hover:bg-panel-hover', selected && 'bg-panel-elevated')}>
      <span className="flex justify-center font-mono text-[11px] text-muted">
        {current && playing ? <Equalizer /> : n}
      </span>
      <button type="button" onClick={onSelect} className="block h-10 w-10 overflow-hidden rounded-md border border-subtle" aria-label={`Open ${t.title}`}>
        <Cover track={t} />
      </button>
      <button type="button" onClick={onSelect} className="min-w-0 text-left">
        <p className={cn('truncate text-[13px] font-medium', current ? 'text-orange' : 'text-paper')} title={t.fileName}>
          {t.title}
        </p>
        <p className="truncate font-mono text-[10px] text-muted">{t.fileName}</p>
      </button>
      <div className="flex min-w-0 flex-wrap gap-1 overflow-hidden">
        {(t.meta.credits ?? []).slice(0, 3).map((c) => (
          <span key={c} className={chip}>
            {c}
          </span>
        ))}
        {(t.meta.tags ?? []).slice(0, 2).map((c) => (
          <span key={c} className={cn(chip, 'text-muted')}>
            {c}
          </span>
        ))}
      </div>
      <span className="font-mono text-[10.5px] uppercase text-secondary">{t.format}</span>
      <span className="font-mono text-[10.5px] tabular-nums text-secondary">{fmtClock(t.durationSec)}</span>
      <span className="font-mono text-[10.5px] tabular-nums text-muted">{fmtBytes(t.bytes)}</span>
      <div className="flex items-center justify-end gap-2">
        <StatusChip t={t} />
        {!offline && (
          <button
            type="button"
            onClick={onPlay}
            aria-label={current && playing ? `Pause ${t.title}` : `Play ${t.title}`}
            className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-orange text-black"
          >
            {current && playing ? <Pause className="h-3 w-3" fill="currentColor" /> : <Play className="ml-0.5 h-3 w-3" fill="currentColor" />}
          </button>
        )}
      </div>
    </div>
  );
}

function RootsPanel({
  roots,
  candidates,
  configErrors,
  onToggle,
  onCopy,
}: {
  roots: MusicRoot[];
  candidates: MusicLibrary['candidates'];
  configErrors: string[];
  onToggle: (path: string, enabled: boolean) => void;
  onCopy: (text: string, what: string) => void;
}) {
  return (
    <section className="hud-scroll max-h-[40vh] shrink-0 overflow-y-auto border-b border-subtle bg-panel px-4 py-3" aria-label="Library folders">
      <p className="hud-label mb-2">Library folders · config/music.json</p>
      {configErrors.map((e) => (
        <p key={e} className="mb-1 font-mono text-[11px] text-amber">
          {e}
        </p>
      ))}
      <ul className="space-y-1.5">
        {roots.map((r) => (
          <li key={r.id} className="flex flex-wrap items-center gap-3 rounded-md border border-subtle bg-obsidian px-3 py-2">
            <label className="flex min-w-0 flex-1 items-center gap-2.5">
              <input type="checkbox" checked={r.enabled} onChange={(e) => onToggle(r.path, e.target.checked)} className="h-3.5 w-3.5 accent-[#FF5500]" />
              <span className="min-w-0">
                <span className="block text-[12.5px] font-medium text-paper">{r.label}</span>
                <span className="block truncate font-mono text-[10px] text-muted" title={r.path}>
                  {r.path}
                </span>
              </span>
            </label>
            {!r.exists && <span className="font-mono text-[10px] uppercase text-[#EF4444]">folder missing</span>}
            {r.enabled && r.exists && (
              <span className="font-mono text-[10px] uppercase tracking-[0.05em] text-muted">
                {r.trackCount} tracks · <span className="text-green">{r.localCount} local</span> · <span className="text-amber">{r.icloudCount} iCloud</span>
              </span>
            )}
            <button type="button" className={smallBtn} onClick={() => onCopy(r.downloadCommand, 'Download command')} title={r.downloadCommand}>
              <Copy className="h-3 w-3" /> brctl
            </button>
          </li>
        ))}
      </ul>
      <p className="hud-label mb-2 mt-4">Other music folders under ~/Documents/Audio · optional, off by default</p>
      {candidates.length === 0 ? (
        <p className="font-mono text-[11px] text-muted">No other folders with audio files found.</p>
      ) : (
        <ul className="grid gap-1.5 md:grid-cols-2">
          {candidates.map((c) => (
            <li key={c.path} className="flex items-center gap-3 rounded-md border border-subtle px-3 py-2">
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[12.5px] text-paper" title={c.path}>
                  {c.label}
                </span>
                <span className="block font-mono text-[10px] text-muted">{c.audioFiles} audio file{c.audioFiles === 1 ? '' : 's'}</span>
              </span>
              <button type="button" className={smallBtn} onClick={() => onToggle(c.path, true)}>
                <FolderPlus className="h-3 w-3" /> Enable
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
