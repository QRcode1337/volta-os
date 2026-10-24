'use client';

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import { useRouter } from 'next/navigation';
import { LayoutDashboard, RefreshCw, Search, Settings } from 'lucide-react';
import type { McpServerInfo, RealRoutine, RealSkill, RecentNote } from '@/types/sources';
import type { LtmStatus, ObsidianVault } from '@/types/ltm';
import { OS_OWNER } from '@/lib/mock-data';
import { OS_EVENTS, emitOsEvent } from '@/lib/events';
import { formatInt } from '@/lib/format';
import { cn } from '@/lib/cn';
import { agoLabel, minutesBetween, nowLocalIso } from '@/components/ltm/ltm-client';
import { PixelMascotLogo } from '@/components/robo-ui';
import { ArtifactRing, ringStageSize, type NoteRingStatus } from './ArtifactRing';
import { toRingItems } from './orbital/artifact-meta';
import { SPHERE_GROUPS, SPHERE_OFFLINE, type SphereCount, type SphereCounts, type SphereGroupId } from './orbital/sphere-groups';
import { OrbitalToastViewport, useOrbitalToasts } from './orbital/OrbitalToast';
import { ORBITAL_DEFAULTS, OrbitalSettings, loadOrbitalSettings, saveOrbitalSettings, type OrbitalSettingsValue } from './orbital/OrbitalSettings';
import { getSharedJsonState, refreshSharedJson, useSharedJson, type SharedJsonState } from './widgets/shared-json';
import { installedCountOf } from './widgets/right-skills';

const SPHERE = 360;
const USAGE_BAR_RESERVE = 46; // bottom of viewport owned by the UsageRoboBar
const RING_NOTES = 36;
const REFRESH_MS = 5 * 60_000; // notes + vault/skills/routines/MCP counts re-sync (server caches are ~5 min)
const LTM_POLL_MS = 60_000; // same cadence as the Memory Sources row (/api/sources), so the two capture totals agree
const CLOCK_MS = 60_000; // relative-time labels
// Shared-store keys: the same URLs (and so the same requests) as MicroApps (/api/vaults), the Skills Deck
// (/api/skills-real) and Routines (/api/routines). Polls pause while the tab is hidden.
const URLS = {
  notes: `/api/notes/recent?limit=${RING_NOTES}`,
  vaults: '/api/vaults',
  ltm: '/api/ltm/status',
  skills: '/api/skills-real',
  routines: '/api/routines',
  mcp: '/api/mcp',
} as const;
type UrlKey = keyof typeof URLS;
const URL_LABEL: Record<UrlKey, string> = { notes: 'notes', vaults: 'vaults', ltm: 'LTM', skills: 'skills', routines: 'routines', mcp: 'MCP' };

// ── corner readouts: placed in the empty corners of the ring stage, never over the ring itself ──
type CornerId = 'tl' | 'tr' | 'lg';
type CornerMode = 'full' | 'dense';
interface BoxSize {
  w: number;
  h: number;
}
const CORNER_X = 12; // left-3 / right-3
const CORNER_Y = 8; // top-2 / bottom +8
/** Ticks end at r+27 and the 000–315 degree labels sit at r+40; keep readouts outside that. */
const RING_CLEARANCE = 48;
/** Used until the boxes have been measured once in a given mode. */
const BOX_ESTIMATE: Record<CornerMode, Record<CornerId, BoxSize>> = {
  full: { tl: { w: 150, h: 50 }, tr: { w: 130, h: 50 }, lg: { w: 130, h: 84 } },
  dense: { tl: { w: 92, h: 16 }, tr: { w: 108, h: 16 }, lg: { w: 58, h: 84 } },
};

/** Distance from (cx, cy) to the nearest point of an axis-aligned rect. */
function distToRect(cx: number, cy: number, x0: number, y0: number, x1: number, y1: number): number {
  const dx = cx < x0 ? x0 - cx : cx > x1 ? cx - x1 : 0;
  const dy = cy < y0 ? y0 - cy : cy > y1 ? cy - y1 : 0;
  return Math.hypot(dx, dy);
}

const SecondBrainSphere3D = dynamic(() => import('./SecondBrainSphere3D').then((m) => m.SecondBrainSphere3D), {
  ssr: false,
  loading: () => (
    <div
      className="h-full w-full animate-pulse rounded-full [background-image:radial-gradient(rgba(245,242,235,0.35)_1px,transparent_1.5px)] [background-size:10px_10px] [mask-image:radial-gradient(circle,black_25%,transparent_62%)]"
      aria-hidden
    />
  ),
});

// ───────────────────────── real-data state ─────────────────────────

type Loadable<T> = { status: 'loading' } | { status: 'ready'; data: T } | { status: 'error'; message: string; data?: T };

interface CoreData {
  notes: Loadable<RecentNote[]>;
  vaults: Loadable<ObsidianVault[]>;
  ltm: Loadable<LtmStatus>;
  skills: Loadable<number>;
  routines: Loadable<number>;
  mcp: Loadable<number>;
}

const errMsg = (e: unknown) => (e instanceof Error ? e.message : 'request failed');

/** Shared-store state → Loadable, keeping the last good value on failure (shown as stale, not hidden). */
function toLoadable<T, R>(s: Pick<SharedJsonState<T>, 'data' | 'error'>, pick: (d: T) => R): Loadable<R> {
  if (s.data !== null) {
    const v = pick(s.data);
    return s.error ? { status: 'error', message: errMsg(s.error), data: v } : { status: 'ready', data: v };
  }
  return s.error ? { status: 'error', message: errMsg(s.error) } : { status: 'loading' };
}

/** "Installed" = has a SKILL.md on disk — the same definition (and count) as the Skills Deck and Second Brain → Skills. */
const installedSkills = (r: { skills?: RealSkill[]; installedCount?: number }) => installedCountOf(r) ?? 0;

function value<T>(l: Loadable<T>): T | undefined {
  return l.status === 'ready' ? l.data : l.status === 'error' ? l.data : undefined;
}

/** Sphere count for a source: real number, null while loading, 'offline' when it failed with nothing cached. */
function sphereCount(l: Loadable<unknown>, n: number | undefined): SphereCount {
  if (l.status === 'error' && l.data === undefined) return SPHERE_OFFLINE;
  return n ?? null;
}

function IconButton({
  label,
  onClick,
  active,
  children,
  ...rest
}: { label: string; onClick: () => void; active?: boolean; children: React.ReactNode } & Record<`data-${string}`, string | boolean>) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      aria-pressed={active}
      className={cn(
        'group relative flex h-[30px] w-[30px] items-center justify-center rounded-full border transition-[color,border-color,background,box-shadow] duration-200',
        active
          ? 'border-orange/70 bg-orange/10 text-orange shadow-[0_0_14px_rgba(255,85,0,0.25)]'
          : 'border-subtle bg-panel text-secondary hover:border-highlight hover:bg-panel-elevated hover:text-paper',
      )}
      {...rest}
    >
      {children}
    </button>
  );
}

/** Small count readout: "…" while loading, "off" when the source failed with nothing cached. */
function CountText({ l, render }: { l: Loadable<unknown>; render: () => React.ReactNode }) {
  if (l.status === 'loading') return <span className="animate-pulse text-muted">…</span>;
  if (l.status === 'error' && l.data === undefined)
    return (
      <span className="text-[#F87171]" title={l.message}>
        off
      </span>
    );
  return <>{render()}</>;
}

/** Center column of the home dashboard: brand header, 36-note Note Ring and the 3D Second Brain sphere. */
export function CenterOrbitalCore() {
  const router = useRouter();
  const { toasts, toast, dismiss } = useOrbitalToasts();
  const [refreshing, setRefreshing] = useState(false);
  const [now, setNow] = useState<number | null>(null);
  const [nowLocal, setNowLocal] = useState<string | null>(null);
  const [editMode, setEditMode] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settings, setSettings] = useState<OrbitalSettingsValue>(ORBITAL_DEFAULTS);
  const [sphereHover, setSphereHover] = useState(false);
  const [searchActive, setSearchActive] = useState(false);

  const stageAreaRef = useRef<HTMLDivElement>(null);
  const [fit, setFit] = useState({ scale: 1, reserve: 0, measured: false, w: 0, h: 0, cx: 0, cy: 0, rOut: 0 });
  const S = ringStageSize(settings.ringRadius);
  const ringRadius = settings.ringRadius;

  // ── corner readout boxes: measured per mode so the fit test uses their real rendered size ──
  const [boxSizes, setBoxSizes] = useState<Partial<Record<`${CornerMode}:${CornerId}`, BoxSize>>>({});
  const boxEls = useRef<Partial<Record<CornerId, HTMLElement>>>({});
  const boxRo = useRef<ResizeObserver | null>(null);
  useEffect(() => {
    const ro = new ResizeObserver((entries) => {
      setBoxSizes((prev) => {
        let next = prev;
        for (const e of entries) {
          const el = e.target as HTMLElement;
          const id = el.dataset.corner as CornerId | undefined;
          const mode = el.dataset.cornerMode as CornerMode | undefined;
          if (!id || !mode) continue;
          const key = `${mode}:${id}` as const;
          const w = Math.ceil(el.offsetWidth);
          const h = Math.ceil(el.offsetHeight);
          const old = prev[key];
          if (old && Math.abs(old.w - w) <= 1 && Math.abs(old.h - h) <= 1) continue;
          if (next === prev) next = { ...prev };
          next[key] = { w, h };
        }
        return next;
      });
    });
    boxRo.current = ro;
    for (const el of Object.values(boxEls.current)) if (el) ro.observe(el);
    return () => {
      ro.disconnect();
      boxRo.current = null;
    };
  }, []);
  const boxRef = useMemo(() => {
    const attach = (id: CornerId) => (el: HTMLElement | null) => {
      const prev = boxEls.current[id];
      if (prev === el) return;
      if (prev) boxRo.current?.unobserve(prev);
      if (el) {
        boxEls.current[id] = el;
        boxRo.current?.observe(el);
      } else delete boxEls.current[id];
    };
    return { tl: attach('tl'), tr: attach('tr'), lg: attach('lg') };
  }, []);

  // ── settings: hydrate after mount (localStorage + prefers-reduced-motion), persist on change ──
  const settingsHydrated = useRef(false);
  useEffect(() => {
    const prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    setSettings(loadOrbitalSettings(prefersReduced));
    settingsHydrated.current = true;
  }, []);
  const updateSettings = useCallback((v: OrbitalSettingsValue) => {
    setSettings(v);
    if (settingsHydrated.current) saveOrbitalSettings(v);
  }, []);
  const closeSettings = useCallback(() => setSettingsOpen(false), []);

  // ── responsive fit: scale the ring+sphere stage to the remaining column height (minus usage bar) ──
  useLayoutEffect(() => {
    const el = stageAreaRef.current;
    if (!el) return;
    const measure = () => {
      const r = el.getBoundingClientRect();
      const reserve = Math.max(0, Math.min(r.height * 0.3, r.bottom - (window.innerHeight - USAGE_BAR_RESERVE)));
      const availH = r.height - reserve - 6;
      const availW = r.width - 8;
      const scale = Math.max(0.35, Math.min(1, availW / S, availH / S));
      // The stage is centred horizontally and vertically within [0, height - reserve].
      setFit({ scale, reserve, measured: true, w: r.width, h: r.height, cx: r.width / 2, cy: (r.height - reserve) / 2, rOut: (ringRadius + RING_CLEARANCE) * scale });
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    window.addEventListener('resize', measure);
    return () => {
      ro.disconnect();
      window.removeEventListener('resize', measure);
    };
  }, [S, ringRadius]);

  // ── real data: one shared, visibility-aware store entry per source (see URLS) ──
  const notesQ = useSharedJson<{ notes: RecentNote[] }>(URLS.notes, REFRESH_MS);
  const vaultsQ = useSharedJson<{ vaults: ObsidianVault[] }>(URLS.vaults, REFRESH_MS);
  const ltmQ = useSharedJson<LtmStatus>(URLS.ltm, LTM_POLL_MS);
  const skillsQ = useSharedJson<{ skills: RealSkill[]; installedCount?: number }>(URLS.skills, REFRESH_MS);
  const routinesQ = useSharedJson<{ routines: RealRoutine[] }>(URLS.routines, REFRESH_MS);
  const mcpQ = useSharedJson<{ servers: McpServerInfo[] }>(URLS.mcp, REFRESH_MS);

  // /api/ltm/status answers 200 with available:false when the drive/DB is missing: show that as an error
  // while keeping the last available status (stale, not hidden).
  const [lastLtm, setLastLtm] = useState<LtmStatus | null>(null);
  useEffect(() => {
    if (ltmQ.data?.available) setLastLtm(ltmQ.data);
  }, [ltmQ.data]);

  const notesL = useMemo(() => toLoadable({ data: notesQ.data, error: notesQ.error }, (r) => r.notes ?? []), [notesQ.data, notesQ.error]);
  const vaultsL = useMemo(() => toLoadable({ data: vaultsQ.data, error: vaultsQ.error }, (r) => r.vaults ?? []), [vaultsQ.data, vaultsQ.error]);
  const skillsL = useMemo(() => toLoadable({ data: skillsQ.data, error: skillsQ.error }, installedSkills), [skillsQ.data, skillsQ.error]);
  const routinesL = useMemo(() => toLoadable({ data: routinesQ.data, error: routinesQ.error }, (r) => (r.routines ?? []).length), [routinesQ.data, routinesQ.error]);
  const mcpL = useMemo(() => toLoadable({ data: mcpQ.data, error: mcpQ.error }, (r) => (r.servers ?? []).length), [mcpQ.data, mcpQ.error]);
  const ltmL = useMemo<Loadable<LtmStatus>>(() => {
    const d = ltmQ.data;
    const good = d?.available ? d : lastLtm;
    const message = ltmQ.error ? errMsg(ltmQ.error) : d && !d.available ? (d.reason ?? 'LTM unavailable') : null;
    if (message) return { status: 'error', message, data: good ?? undefined };
    return d ? { status: 'ready', data: d } : { status: 'loading' };
  }, [ltmQ.data, ltmQ.error, lastLtm]);
  const data: CoreData = { notes: notesL, vaults: vaultsL, ltm: ltmL, skills: skillsL, routines: routinesL, mcp: mcpL };

  // ── client clock (after mount only → no hydration drift); re-read whenever the ring or LTM lands ──
  useEffect(() => {
    const tick = () => {
      setNow(Date.now());
      setNowLocal(nowLocalIso());
    };
    tick();
    const id = window.setInterval(tick, CLOCK_MS);
    return () => window.clearInterval(id);
  }, [notesQ.fetchedAt, ltmQ.fetchedAt]);

  // ── manual refresh: refetch every source now (joining requests already in flight), then toast ──
  const refreshSeq = useRef(0);
  useEffect(
    () => () => {
      refreshSeq.current++; // unmounted: drop any pending toast/spinner update
    },
    [],
  );
  const refresh = useCallback(async () => {
    const seq = ++refreshSeq.current;
    setRefreshing(true);
    const t0 = performance.now();
    const keys = Object.keys(URLS) as UrlKey[];
    await Promise.all(keys.map((k) => refreshSharedJson(URLS[k])));
    if (seq !== refreshSeq.current) return; // superseded by a newer manual refresh (it owns spinner + toast)
    const failed = keys.filter((k) => {
      const st = getSharedJsonState<unknown>(URLS[k]);
      return !!st.error || (k === 'ltm' && (st.data as LtmStatus | null)?.available === false);
    });
    const notes = getSharedJsonState<{ notes?: RecentNote[] }>(URLS.notes).data?.notes ?? [];
    const vaults = getSharedJsonState<{ vaults?: ObsidianVault[] }>(URLS.vaults).data?.vaults ?? [];
    const total = vaults.reduce((sum, v) => sum + v.notes, 0);
    if (failed.length === 0) toast(`Refreshed · ${notes.length} recent notes · ${formatInt(total)} in vaults`, 'success');
    else toast(`Refreshed · offline: ${failed.map((k) => URL_LABEL[k]).join(', ')}`, failed.length >= 3 ? 'error' : 'info');
    const wait = Math.max(0, 650 - (performance.now() - t0));
    setTimeout(() => {
      if (seq === refreshSeq.current) setRefreshing(false);
    }, wait);
  }, [toast]);

  // ── derived view model ──
  const notesList = value(data.notes);
  const ringItems = useMemo(() => toRingItems(notesList ?? []), [notesList]);
  const ringStatus: NoteRingStatus = data.notes.status === 'loading' ? 'loading' : notesList && notesList.length > 0 ? 'ready' : data.notes.status === 'error' ? 'error' : 'ready';
  const vaults = value(data.vaults);
  const notesTotal = vaults ? vaults.reduce((s, v) => s + v.notes, 0) : undefined;
  const ltm = value(data.ltm);
  const capturesTotal = ltm?.total;
  const counts: SphereCounts = useMemo(
    () => ({
      notes: sphereCount(data.vaults, notesTotal),
      captures: sphereCount(data.ltm, capturesTotal),
      skills: sphereCount(data.skills, value(data.skills)),
      routines: sphereCount(data.routines, value(data.routines)),
      mcp: sphereCount(data.mcp, value(data.mcp)),
    }),
    [data.vaults, notesTotal, data.ltm, capturesTotal, data.skills, data.routines, data.mcp],
  );
  const legendLoad: Record<SphereGroupId, Loadable<unknown>> = {
    notes: data.vaults,
    captures: data.ltm,
    skills: data.skills,
    routines: data.routines,
    mcp: data.mcp,
  };
  const ltmAgo = ltm?.last && nowLocal ? agoLabel(Math.max(0, minutesBetween(ltm.last, nowLocal))) : null;

  const toggleEdit = () => {
    const next = !editMode;
    setEditMode(next);
    toast(next ? 'Layout edit mode on — panels outlined' : 'Layout edit mode off', 'info');
  };

  const openBrain = () => router.push('/second-brain');

  // Each corner box shows in full if it clears the ring's outer decoration, else in a dense one-line form,
  // else (very small stage) it is hidden. Box rects are in stage-area coordinates.
  const sizeOf = (mode: CornerMode, id: CornerId) => boxSizes[`${mode}:${id}`] ?? BOX_ESTIMATE[mode][id];
  const rectOf = (id: CornerId, s: BoxSize): [number, number, number, number] => {
    if (id === 'tl') return [CORNER_X, CORNER_Y, CORNER_X + s.w, CORNER_Y + s.h];
    if (id === 'tr') return [fit.w - CORNER_X - s.w, CORNER_Y, fit.w - CORNER_X, CORNER_Y + s.h];
    const bottom = fit.h - fit.reserve - CORNER_Y;
    return [CORNER_X, bottom - s.h, CORNER_X + s.w, bottom];
  };
  const clears = (id: CornerId, mode: CornerMode) => {
    const s = sizeOf(mode, id);
    // the two top boxes share one row: each may use at most half of it
    if (id !== 'lg' && s.w > (fit.w - 2 * CORNER_X - 8) / 2) return false;
    const [x0, y0, x1, y1] = rectOf(id, s);
    return x0 >= 0 && x1 <= fit.w && y0 >= 0 && distToRect(fit.cx, fit.cy, x0, y0, x1, y1) >= fit.rOut;
  };
  const cornerMode = (id: CornerId): CornerMode | 'hidden' => {
    if (!fit.measured) return 'hidden';
    if (clears(id, 'full')) return 'full';
    return clears(id, 'dense') ? 'dense' : 'hidden';
  };
  const tlMode = cornerMode('tl');
  const trMode = cornerMode('tr');
  const lgMode = cornerMode('lg');
  const notesTitle = vaults
    ? `${formatInt(notesTotal ?? 0)} notes across ${vaults.length} Obsidian vaults (/api/vaults)${data.vaults.status === 'error' ? ' · stale (vaults offline)' : ''}`
    : data.vaults.status === 'error'
      ? `Vaults offline · ${data.vaults.message}`
      : 'Counting vault notes…';
  const capturesTitle = ltm
    ? `${formatInt(capturesTotal ?? 0)} unvolta-ltm screen captures${ltm.last ? ` · last ${ltm.last.slice(0, 16).replace('T', ' ')}` : ''}${data.ltm.status === 'error' ? ' · stale (LTM offline)' : ''}`
    : data.ltm.status === 'error'
      ? `LTM offline · ${data.ltm.message}`
      : 'Reading LTM status…';
  const cornerCls = (mode: CornerMode | 'hidden') => cn('absolute z-10 cursor-default', mode === 'hidden' && 'invisible');

  return (
    <div
      className={cn(
        'relative flex h-full w-full min-h-0 flex-col overflow-hidden rounded-[10px] transition-[outline-color] duration-200',
        editMode ? 'outline-1 outline-offset-[-1px] outline-dashed outline-orange/50' : 'outline-none',
      )}
    >
      {/* ambient backdrop */}
      <div aria-hidden className="pointer-events-none absolute inset-0 bg-[radial-gradient(60%_55%_at_50%_55%,rgba(255,85,0,0.045),transparent_70%)]" />

      {/* ── brand header ── */}
      <header className="relative z-30 flex shrink-0 flex-col items-center gap-1.5 pb-1 pt-3">
        <div className="flex items-center gap-2.5">
          <PixelMascotLogo size={30} />
          <h1 className="flex items-baseline gap-2 leading-none">
            <span className="text-[26px] font-bold tracking-[0.01em] text-paper">VOLTA</span>
            <span className="font-doto text-[28px] font-bold text-orange [text-shadow:0_0_18px_rgba(255,85,0,0.35)]">Agentic</span>
            <span className="text-[26px] font-light text-paper">OS</span>
          </h1>
        </div>
        <div className="flex items-center gap-3">
          <span className="font-mono text-[12px] tracking-[0.04em] text-muted">
            {OS_OWNER.name} | {OS_OWNER.org}
          </span>
          <span className="h-3 w-px bg-subtle" aria-hidden />
          <div className="relative flex items-center gap-1.5">
            <IconButton label="Refresh notes & counts" onClick={() => void refresh()} active={refreshing}>
              <RefreshCw size={13} className={cn(refreshing && 'robo-spin')} />
            </IconButton>
            <IconButton label="Edit layout" onClick={toggleEdit} active={editMode}>
              <LayoutDashboard size={13} />
            </IconButton>
            <IconButton label="Global search (/)" onClick={() => emitOsEvent(OS_EVENTS.focusSearch)} active={searchActive}>
              <Search size={13} />
            </IconButton>
            <IconButton label="OS Settings" onClick={() => setSettingsOpen((v) => !v)} active={settingsOpen} data-orbital-settings-trigger>
              <Settings size={13} />
            </IconButton>
            {settingsOpen && <OrbitalSettings value={settings} onChange={updateSettings} onClose={closeSettings} className="absolute right-0 top-[calc(100%+8px)] z-50" />}
          </div>
        </div>
      </header>

      {/* ── ring + sphere stage ── */}
      <div ref={stageAreaRef} className="relative min-h-0 flex-1">
        {/* corner readouts (always mounted so they can be measured; `invisible` when they would hit the ring) */}
        <div
          ref={boxRef.tl}
          data-corner="tl"
          data-corner-mode={tlMode === 'full' ? 'full' : 'dense'}
          aria-hidden={tlMode === 'hidden'}
          title={notesTitle}
          className={cn(cornerCls(tlMode), 'flex flex-col gap-0.5')}
          style={{ left: CORNER_X, top: CORNER_Y }}
        >
          {tlMode === 'full' && <span className="hud-label !text-[9px] !text-muted">Note ring</span>}
          <span className={cn('whitespace-nowrap font-mono text-secondary', tlMode === 'full' ? 'text-[11px]' : 'text-[10px]')}>
            <CountText l={data.vaults} render={() => <span className="text-paper">{formatInt(notesTotal ?? 0)}</span>} /> notes
            {tlMode === 'full' && vaults && vaults.length > 0 && <span className="text-muted"> · {vaults.length} vaults</span>}
          </span>
          {tlMode === 'full' && (
            <span className="whitespace-nowrap font-mono text-[10px] text-muted">
              {ringItems.length > 0 ? `${ringItems.length} recent` : data.notes.status === 'loading' ? 'loading…' : 'none'} · <span className="text-orange">/</span> search
            </span>
          )}
        </div>
        <div
          ref={boxRef.tr}
          data-corner="tr"
          data-corner-mode={trMode === 'full' ? 'full' : 'dense'}
          aria-hidden={trMode === 'hidden'}
          title={capturesTitle}
          className={cn(cornerCls(trMode), 'flex flex-col items-end gap-0.5')}
          style={{ right: CORNER_X, top: CORNER_Y }}
        >
          {trMode === 'full' && <span className="hud-label !text-[9px] !text-muted">LTM captures</span>}
          <span className={cn('whitespace-nowrap font-mono text-secondary', trMode === 'full' ? 'text-[11px]' : 'text-[10px]')}>
            <CountText l={data.ltm} render={() => <span className="text-paper">{formatInt(capturesTotal ?? 0)}</span>} /> captures
            {trMode !== 'full' && data.ltm.status === 'error' && ltm && <span className="text-amber"> · stale</span>}
          </span>
          {trMode === 'full' && ltmAgo && (
            <span className="whitespace-nowrap font-mono text-[10px] text-muted">
              last {ltmAgo}
              {data.ltm.status === 'error' && <span className="text-amber"> · stale</span>}
            </span>
          )}
        </div>
        <ul
          ref={boxRef.lg}
          data-corner="lg"
          data-corner-mode={lgMode === 'full' ? 'full' : 'dense'}
          aria-hidden={lgMode === 'hidden'}
          className={cn(cornerCls(lgMode), 'flex flex-col gap-1')}
          style={{ left: CORNER_X, bottom: fit.reserve + CORNER_Y }}
          aria-label="Second brain legend"
        >
          {SPHERE_GROUPS.map((g) => {
            const c = counts[g.id];
            const offline = c === SPHERE_OFFLINE;
            return (
              <li
                key={g.id}
                className={cn('flex items-center gap-1.5 whitespace-nowrap font-mono text-[9px] uppercase tracking-[0.1em] text-muted', offline && 'opacity-60')}
                title={`${g.label}: ${typeof c === 'number' ? formatInt(c) : offline ? 'source offline' : 'loading'} · ${g.part} · ${g.source}`}
              >
                <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={offline ? { background: '#4A4740' } : { background: g.color, boxShadow: `0 0 6px ${g.color}` }} />
                {lgMode === 'full' ? g.label : <span className="sr-only">{g.label}</span>}
                <span className="normal-case tracking-normal text-secondary">
                  <CountText l={legendLoad[g.id]} render={() => (typeof c === 'number' ? formatInt(c) : '—')} />
                </span>
              </li>
            );
          })}
        </ul>

        <div
          className={cn('absolute inset-x-0 top-0 flex items-center justify-center transition-opacity duration-500', fit.measured ? 'opacity-100' : 'opacity-0')}
          style={{ bottom: fit.reserve }}
        >
          <div style={{ width: S * fit.scale, height: S * fit.scale }}>
            <div style={{ width: S, height: S, transform: `scale(${fit.scale})`, transformOrigin: 'top left' }}>
              <ArtifactRing
                items={ringItems}
                status={ringStatus}
                errorMessage={data.notes.status === 'error' ? data.notes.message : undefined}
                now={now}
                radius={settings.ringRadius}
                onToast={toast}
                onRetry={() => void refresh()}
                reduceMotion={settings.reduceMotion}
                onSearchActiveChange={setSearchActive}
                center={
                  <div className="relative" style={{ width: SPHERE, height: SPHERE }}>
                    <div
                      aria-hidden
                      className="pointer-events-none absolute inset-[-8%] rounded-full transition-opacity duration-500"
                      style={{
                        background: 'radial-gradient(circle, rgba(245,242,235,0.07) 0%, rgba(255,85,0,0.05) 32%, transparent 62%)',
                        opacity: sphereHover ? 1 : 0.75,
                      }}
                    />
                    <SecondBrainSphere3D size={SPHERE} speed={settings.rotationSpeed} reduceMotion={settings.reduceMotion} onHoverChange={setSphereHover} counts={counts} />
                    {!searchActive && (
                      <button
                        type="button"
                        onClick={openBrain}
                        className={cn(
                          'absolute left-1/2 top-[calc(100%-4px)] flex -translate-x-1/2 items-center gap-2 whitespace-nowrap rounded-full border px-3 py-[5px]',
                          'font-mono text-[9.5px] font-semibold uppercase tracking-[0.22em] transition-[color,border-color,box-shadow] duration-200',
                          sphereHover
                            ? 'border-orange/60 bg-obsidian/80 text-paper shadow-[0_0_18px_rgba(255,85,0,0.25)]'
                            : 'border-subtle bg-obsidian/70 text-secondary hover:border-highlight hover:text-paper',
                        )}
                      >
                        <span className={cn('h-1.5 w-1.5 rounded-full bg-orange', !settings.reduceMotion && 'robo-pulse')} />
                        Click to open second brain
                      </button>
                    )}
                  </div>
                }
              />
            </div>
          </div>
        </div>
      </div>

      {editMode && (
        <div className="absolute left-1/2 top-[84px] z-40 flex -translate-x-1/2 items-center gap-2 rounded-full border border-dashed border-orange/60 bg-obsidian/85 px-3 py-1 font-mono text-[9px] uppercase tracking-[0.14em] text-orange backdrop-blur">
          Edit layout
          <button type="button" onClick={toggleEdit} className="rounded-full bg-orange px-2 py-[1px] font-bold text-obsidian hover:brightness-110">
            Done
          </button>
        </div>
      )}

      <OrbitalToastViewport toasts={toasts} onDismiss={dismiss} />
    </div>
  );
}

export default CenterOrbitalCore;
