'use client';
// Second Brain → Skills: real installed user + plugin skills and their invocation counts from
// Claude Code transcripts (/api/skills-real).
//
// Counting note: the API's `uses30d` counts only Skill calls whose own timestamp is inside the last 30 days
// (transcripts.ts getSkillUsage), so it is an exact count and is shown as-is. `lastUsedAt` comes from ANY scanned
// event, so a skill with uses30d = 0 and a lastUsedAt is one whose calls were all before the window.
// The server credits each call to exactly one entry (a name shared by several installed skills becomes a single
// `installed: false` entry), so no client-side de-duplication is needed. `installed` = SKILL.md found on disk;
// `installed: false` entries were only seen in transcripts (built-ins, removed plugins, ambiguous names).

import { memo, useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import * as d3 from 'd3';
import { Search, Sparkles, X } from 'lucide-react';
import type { ModelTier, SkillCardItem } from '@/types/os';
import type { RealSkill } from '@/types/sources';
import { formatInt } from '@/lib/format';
import { cn } from '@/lib/cn';
import { easeInOutCubic } from './shared';
import { HeaderStat, USER_SKILL_COLOR, ViewState, apiGate, matchesQuery, originColor, relTime, useApi, useNow } from './analytics-shared';
import { fitBubbleLabel } from './analytics-bubble-label';
import { JevRoutingBoard, type SkillRoutingBoard } from './JevRoutingBoard';
import { ModelEffortBadge } from '@/components/robo-ui';

interface Props {
  /** Legacy props from SecondBrainApp — accepted, ignored (skills are now read from /api/skills-real). */
  skills?: SkillCardItem[];
  query?: string;
  routes?: Record<string, ModelTier>;
  onRoute?: (id: string, model: ModelTier) => void;
}

type Mode = 'most' | 'recent' | 'all' | 'jev';
const MODES: { id: Mode; label: string }[] = [
  { id: 'most', label: 'Most used' },
  { id: 'recent', label: 'Recently used' },
  { id: 'all', label: 'All skills' },
  { id: 'jev', label: 'JEV routed' },
];
const ROW_H = 58;
/** Skills seen in transcripts with no SKILL.md on disk (built-ins, removed plugins, names several skills share). */
const SEEN_COLOR = '#A39E93';
const SEEN_KEY = 'seen in transcripts';
const SEEN_NOTE = 'No SKILL.md on disk — seen in transcripts only (a built-in, a removed plugin, or a name several skills share).';
const COUNT_NOTE = 'Skill-tool calls timestamped within the last 30 days';

interface Circle {
  x: number;
  y: number;
  r: number;
}

const bareName = (s: RealSkill) => (s.name.includes(':') ? s.name.split(':').pop()! : s.name);
const seenOnly = (s: RealSkill) => !s.installed;
const skillColor = (s: RealSkill) => (seenOnly(s) ? SEEN_COLOR : originColor(s.plugin));
const originKey = (s: RealSkill) => (seenOnly(s) ? SEEN_KEY : (s.plugin ?? 'user'));
const originLabel = (s: RealSkill) => (seenOnly(s) ? 'SEEN IN TRANSCRIPTS' : s.source === 'user' ? 'USER' : (s.plugin ?? 'plugin'));
/** SKILL.md descriptions written as a YAML block scalar sometimes arrive as just ">" or "|" — treat those as missing. */
const descOf = (s: RealSkill) => (/^[>|][-+]?$/.test(s.description.trim()) ? '' : s.description);
const originColorByKey = (key: string) => (key === SEEN_KEY ? SEEN_COLOR : key === 'user' ? USER_SKILL_COLOR : originColor(key));

/** Tween a keyed circle layout toward its target with rAF (bubbles grow in from r=0 on first layout). */
function useTweenedLayout(target: Record<string, Circle>, duration = 800): Record<string, Circle> {
  const [shown, setShown] = useState<Record<string, Circle>>({});
  const shownRef = useRef<Record<string, Circle>>({});
  useEffect(() => {
    const from = shownRef.current;
    const start = performance.now();
    let raf = 0;
    const step = () => {
      const t = Math.min(1, (performance.now() - start) / duration);
      const e = easeInOutCubic(t);
      const next: Record<string, Circle> = {};
      for (const [id, to] of Object.entries(target)) {
        const f = from[id] ?? { x: to.x, y: to.y, r: 0 };
        next[id] = { x: f.x + (to.x - f.x) * e, y: f.y + (to.y - f.y) * e, r: f.r + (to.r - f.r) * e };
      }
      shownRef.current = next;
      setShown(next);
      if (t < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [target, duration]);
  return shown;
}

export function SkillsAnalyticsView({ query = '' }: Props) {
  const api = useApi<{ skills: RealSkill[]; installedCount?: number }>('/api/skills-real');
  const jevApi = useApi<SkillRoutingBoard>('/api/jev-router/skills', 60_000);
  const now = useNow();
  const [mode, setMode] = useState<Mode>('most');
  const [search, setSearch] = useState('');
  const [hoverId, setHoverId] = useState<string | null>(null);
  const [pinnedId, setPinnedId] = useState<string | null>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const skills = useMemo(() => api.data?.skills ?? [], [api.data]);
  /** skill id → JEV's most common pick, for skills JEV has overridden at least once (the JEV ROUTED badge). */
  const jevRouted = useMemo(
    () => new Map((jevApi.data?.rows ?? []).filter((r) => r.skillId && r.routedDown + r.routedUp > 0).map((r) => [r.skillId!, r.jevPick])),
    [jevApi.data],
  );

  const usage = useMemo(() => {
    const uses = new Map(skills.map((s) => [s.id, Math.max(0, s.uses30d)]));
    const byUses = (a: RealSkill, b: RealSkill) => uses.get(b.id)! - uses.get(a.id)! || (b.lastUsedAt ?? '').localeCompare(a.lastUsedAt ?? '');
    const used = skills.filter((s) => uses.get(s.id)! > 0).sort(byUses);
    // Calls found in scanned transcripts, but none inside the window.
    const olderOnly = skills.filter((s) => s.lastUsedAt && uses.get(s.id) === 0).length;
    return { uses, used, olderOnly };
  }, [skills]);
  const { used, uses } = usage;
  const installedCount = api.data?.installedCount;

  const totals = useMemo(() => {
    const installed = skills.filter((s) => s.installed);
    return {
      // The server's own count when it sends one (same rule: SKILL.md on disk), else counted here.
      installed: typeof installedCount === 'number' ? installedCount : installed.length,
      seenOnly: skills.length - installed.length,
      installedUser: installed.filter((s) => s.source === 'user').length,
      installedPlugin: installed.filter((s) => s.source === 'plugin').length,
      plugins: new Set(installed.map((s) => s.plugin).filter(Boolean)).size,
      used: used.length,
      invocations: used.reduce((a, s) => a + uses.get(s.id)!, 0),
      top: used[0] ?? null,
    };
  }, [skills, used, uses, installedCount]);
  const maxUses = Math.max(1, ...used.map((s) => uses.get(s.id)!));

  // ── Leaderboard ──
  const list = useMemo(() => {
    const base =
      mode === 'most'
        ? used
        : mode === 'recent'
          ? skills.filter((s) => s.lastUsedAt).sort((a, b) => b.lastUsedAt!.localeCompare(a.lastUsedAt!))
          : [...skills].sort((a, b) => uses.get(b.id)! - uses.get(a.id)! || (b.lastUsedAt ?? '').localeCompare(a.lastUsedAt ?? '') || a.name.localeCompare(b.name));
    return base.filter((s) => matchesQuery(search, s.id, s.name, s.plugin, descOf(s)));
  }, [mode, used, skills, uses, search]);
  const rank = useMemo(() => new Map(list.map((s, i) => [s.id, i])), [list]);
  const hit = (s: RealSkill) => matchesQuery(query, s.id, s.name, s.plugin, descOf(s));
  const focusId = hoverId ?? pinnedId;

  const pinFromBubble = useCallback(
    (id: string) => {
      setPinnedId((p) => (p === id ? null : id));
      let i = rank.get(id);
      if (i === undefined) {
        // Not in the current list (filtered out) — reset to the default view so the row exists.
        setSearch('');
        setMode('most');
        i = used.findIndex((s) => s.id === id);
      }
      const top = Math.max(0, i * ROW_H - 60);
      requestAnimationFrame(() => listRef.current?.scrollTo({ top, behavior: 'smooth' }));
    },
    [rank, used],
  );

  const gate = apiGate(api, { loading: 'SCANNING SKILLS + TRANSCRIPTS…', error: 'SKILLS UNAVAILABLE' });
  if (gate) return <div className="h-full w-full">{gate}</div>;
  if (now === null) return <ViewState kind="loading" title="SCANNING SKILLS + TRANSCRIPTS…" />;
  if (!skills.length)
    return <ViewState kind="empty" title="NO SKILLS INSTALLED" detail="No SKILL.md files were found in ~/.claude/skills or installed plugins." onRetry={api.reload} />;

  const legend = (() => {
    const counts = new Map<string, number>();
    for (const s of used) counts.set(originKey(s), (counts.get(originKey(s)) ?? 0) + uses.get(s.id)!);
    return [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5);
  })();

  return (
    <div className="flex h-full w-full flex-col overflow-hidden">
      {/* Stats */}
      <div className="flex shrink-0 flex-wrap items-center gap-x-6 gap-y-1 border-b border-subtle px-5 py-2.5">
        <div className="flex items-center gap-2">
          <Sparkles size={14} className="text-orange" />
          <span className="hud-label">SKILLS · CLAUDE CODE TRANSCRIPTS</span>
        </div>
        <HeaderStat label="INSTALLED" value={formatInt(totals.installed)} title="Skills with a SKILL.md on disk (~/.claude/skills and installed plugins)." />
        <HeaderStat label="USER / PLUGIN" value={`${totals.installedUser} / ${totals.installedPlugin}`} tone="muted" />
        <HeaderStat label="USED · 30D" value={formatInt(totals.used)} tone="orange" title="Skills with at least one Skill-tool call in the last 30 days." />
        <HeaderStat label="CALLS · 30D" value={formatInt(totals.invocations)} title={`${COUNT_NOTE}.`} />
        {totals.top && <HeaderStat label="TOP" value={`${bareName(totals.top)} · ${uses.get(totals.top.id)}×`} tone="muted" title={COUNT_NOTE} />}
        <span className="ml-auto font-mono text-[10px] text-muted">
          {totals.plugins} plugins
          {totals.seenOnly > 0 && (
            <span title={SEEN_NOTE}>
              {' '}
              · {totals.seenOnly} seen in transcripts only
            </span>
          )}
          <span title="Skills whose calls in scanned transcripts all fall before the 30-day window.">
            {' '}
            · {usage.olderOnly} skill{usage.olderOnly === 1 ? '' : 's'} used only before the window
          </span>
        </span>
      </div>

      <div className="grid min-h-0 flex-1 gap-4 p-4 lg:grid-cols-2">
        {/* Bubble chart */}
        <section className="hud-card relative flex min-h-[320px] flex-col overflow-hidden">
          <header className="flex h-9 shrink-0 items-center gap-2 border-b border-subtle px-3">
            <span className="hud-label">CIRCLE PACK · AREA = CALLS IN 30D</span>
            <div className="ml-auto flex min-w-0 items-center gap-2.5 overflow-hidden">
              {legend.map(([key]) => (
                <span key={key} className="flex shrink-0 items-center gap-1 font-mono text-[9px] text-muted">
                  <span className="h-2 w-2 rounded-full" style={{ background: originColorByKey(key) }} />
                  {key}
                </span>
              ))}
            </div>
          </header>
          {used.length === 0 ? (
            <ViewState
              kind="empty"
              title="NO SKILL CALLS IN THE LAST 30 DAYS"
              detail={`${totals.installed} skills are installed${usage.olderOnly ? `; ${usage.olderOnly} have calls in scanned transcripts, all older than 30 days` : ''}.`}
            />
          ) : (
            <SkillBubbles
              used={used}
              uses={uses}
              maxUses={maxUses}
              focusId={focusId}
              pinnedId={pinnedId}
              query={query}
              now={now}
              onHover={setHoverId}
              onPin={pinFromBubble}
            />
          )}
        </section>

        {/* Leaderboard */}
        <section className="hud-card flex min-h-[320px] flex-col overflow-hidden">
          <header className="flex h-10 shrink-0 items-center gap-1.5 border-b border-subtle px-3">
            {MODES.map((m) => (
              <button
                key={m.id}
                type="button"
                onClick={() => setMode(m.id)}
                className={cn(
                  'h-6 shrink-0 rounded-full px-3 font-mono text-[10px] font-semibold tracking-wide transition-colors',
                  mode === m.id ? 'bg-paper text-obsidian' : 'border border-subtle text-secondary hover:text-paper',
                )}
              >
                {m.label}
              </button>
            ))}
            <label className="group relative ml-auto flex h-7 w-[180px] min-w-0 items-center">
              <Search size={12} className="pointer-events-none absolute left-2.5 text-muted group-focus-within:text-orange" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Filter skills…"
                aria-label="Filter skills"
                className="h-full w-full rounded-full border border-subtle bg-obsidian pl-7 pr-6 font-mono text-[10.5px] text-paper outline-none transition-colors placeholder:text-muted focus:border-orange/60"
              />
              {search && (
                <button type="button" onClick={() => setSearch('')} className="absolute right-2 rounded-full text-muted hover:text-paper" aria-label="Clear skill filter">
                  <X size={11} />
                </button>
              )}
            </label>
            <span className="shrink-0 font-mono text-[9.5px] text-muted">{mode === 'jev' ? (jevApi.data?.rows.length ?? 0) : list.length}</span>
          </header>
          <div ref={listRef} className="hud-scroll min-h-0 flex-1 overflow-y-auto">
            {mode === 'jev' ? (
              <JevRoutingBoard api={jevApi} search={search} now={now} />
            ) : list.length === 0 ? (
              <ViewState
                kind="empty"
                title={search ? 'NO MATCHING SKILLS' : mode === 'recent' ? 'NO RECENT SKILL CALLS' : 'NO SKILL CALLS IN 30 DAYS'}
                detail={search ? `Nothing matches “${search}” in this list.` : undefined}
              />
            ) : (
              <div className="relative" style={{ height: list.length * ROW_H + 8 }}>
                {list.map((s) => {
                  const i = rank.get(s.id) ?? 0;
                  const active = focusId === s.id;
                  const color = skillColor(s);
                  const n = uses.get(s.id) ?? 0;
                  const older = n === 0 && !!s.lastUsedAt; // calls found, all before the window
                  return (
                    <div
                      key={s.id}
                      onMouseEnter={() => setHoverId(s.id)}
                      onMouseLeave={() => setHoverId(null)}
                      title={s.path || s.id}
                      className={cn(
                        'absolute inset-x-2 flex items-center gap-2.5 rounded-md px-2 transition-[top,opacity,background-color] duration-500',
                        active ? 'bg-panel-hover' : 'bg-transparent',
                        hit(s) ? 'opacity-100' : 'opacity-30',
                        pinnedId === s.id && 'ring-1 ring-orange/50',
                      )}
                      style={{ top: 4 + i * ROW_H, height: ROW_H - 4, transitionTimingFunction: 'cubic-bezier(.2,.8,.2,1)' }}
                    >
                      <span className="w-7 shrink-0 text-right font-doto text-[14px] font-bold text-muted">{i + 1}</span>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="truncate font-mono text-[12px] font-semibold text-paper">{bareName(s)}</span>
                          <OriginBadge s={s} />
                          {jevRouted.has(s.id) && <ModelEffortBadge model={jevRouted.get(s.id)!} label="JEV ROUTED" />}
                          <span className="ml-auto shrink-0 font-mono text-[10px] text-muted">
                            {s.lastUsedAt ? relTime(s.lastUsedAt, now) : 'never'}
                            {older && <span title="Calls found in scanned transcripts, all before the 30-day window"> · before 30d</span>}
                          </span>
                        </div>
                        <div className="mt-1 flex items-center gap-2">
                          <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-panel-hover">
                            <div
                              className="h-full rounded-full transition-[width] duration-700"
                              style={{ width: n ? `${Math.max(2, (n / maxUses) * 100)}%` : '0%', background: color }}
                            />
                          </div>
                          <span className={cn('w-8 shrink-0 text-right font-mono text-[10.5px]', n ? 'text-secondary' : 'text-muted')} title={n ? COUNT_NOTE : 'no calls in the last 30 days'}>
                            {n}×
                          </span>
                        </div>
                        <div className="mt-0.5 truncate text-[10.5px] text-muted">
                          {descOf(s) || (seenOnly(s) ? SEEN_NOTE : 'No description in SKILL.md.')}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}

/**
 * The circle pack + its tooltip. Memoised and owning its own tween / tooltip state, so the 800ms tween and
 * pointer moves re-render only the SVG, never the leaderboard beside it.
 */
const SkillBubbles = memo(function SkillBubbles({
  used,
  uses,
  maxUses,
  focusId,
  pinnedId,
  query,
  now,
  onHover,
  onPin,
}: {
  used: RealSkill[];
  uses: Map<string, number>;
  maxUses: number;
  focusId: string | null;
  pinnedId: string | null;
  query: string;
  now: number | null;
  onHover: (id: string | null) => void;
  onPin: (id: string) => void;
}) {
  const packRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 600, h: 600 });
  const [tip, setTip] = useState<{ id: string; x: number; y: number } | null>(null);

  useEffect(() => {
    const el = packRef.current;
    if (!el) return;
    const measure = () => {
      const w = Math.max(260, el.clientWidth);
      const h = Math.max(260, el.clientHeight);
      setSize((s) => (s.w === w && s.h === h ? s : { w, h })); // same size → same object → no re-layout / re-tween
    };
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    measure();
    return () => ro.disconnect();
  }, []);

  // Area ∝ calls in the last 30 days.
  const target = useMemo(() => {
    const side = Math.min(size.w, size.h);
    type Datum = { children?: RealSkill[] } | RealSkill;
    const root = d3
      .hierarchy<Datum>({ children: used })
      .sum((d) => ('id' in d ? (uses.get(d.id) ?? 0) : 0))
      .sort((a, b) => (b.value ?? 0) - (a.value ?? 0));
    const packed = d3.pack<Datum>().size([side - 8, side - 8]).padding(5)(root);
    const ox = (size.w - side) / 2 + 4;
    const oy = (size.h - side) / 2 + 4;
    const out: Record<string, Circle> = {};
    for (const leaf of packed.leaves()) {
      const d = leaf.data as RealSkill;
      out[d.id] = { x: leaf.x + ox, y: leaf.y + oy, r: leaf.r };
    }
    return out;
  }, [used, uses, size]);
  const shown = useTweenedLayout(target);

  const byId = useMemo(() => new Map(used.map((s) => [s.id, s])), [used]);
  const tipSkill = tip ? byId.get(tip.id) : null;
  const tipUses = tipSkill ? (uses.get(tipSkill.id) ?? 0) : 0;

  const showTipAt = (id: string, x: number, y: number) => setTip((t) => (t && t.id === id && t.x === x && t.y === y ? t : { id, x, y }));
  const onKey = (e: KeyboardEvent, id: string) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onPin(id);
    }
  };

  return (
    <div ref={packRef} className="relative min-h-0 flex-1" onMouseLeave={() => setTip(null)}>
      <svg width={size.w} height={size.h} className="absolute inset-0" onMouseMove={(e) => e.target === e.currentTarget && setTip(null)}>
        <defs>
          <radialGradient id="sb-bubble-shine" cx="35%" cy="30%" r="75%">
            <stop offset="0%" stopColor="#ffffff" stopOpacity="0.16" />
            <stop offset="100%" stopColor="#ffffff" stopOpacity="0" />
          </radialGradient>
        </defs>
        {used.map((s) => {
          const c = shown[s.id];
          if (!c || c.r < 0.5) return null;
          const n = uses.get(s.id) ?? 0;
          const color = skillColor(s);
          const active = focusId === s.id;
          const dim = (focusId && !active) || !matchesQuery(query, s.id, s.name, s.plugin, descOf(s));
          const name = bareName(s);
          const origin = seenOnly(s) ? 'transcripts' : s.source === 'user' ? 'user' : (s.plugin ?? 'plugin');
          const label = fitBubbleLabel(name, c.r, `${n}× · ${origin}`, `${n}×`);
          const lineH = label.fs * 1.08;
          const blockH = label.lines.length * lineH + (label.sub ? label.subFs * 1.25 : 0);
          const firstBaseline = -blockH / 2 + label.fs * 0.82;
          return (
            <g
              key={s.id}
              transform={`translate(${c.x},${c.y})`}
              tabIndex={0}
              role="button"
              aria-label={`${name} (${origin}): ${n} call${n === 1 ? '' : 's'} in the last 30 days; last used ${relTime(s.lastUsedAt, now)}. ${pinnedId === s.id ? 'Press Enter to unpin.' : 'Press Enter to pin in the leaderboard.'}`}
              aria-pressed={pinnedId === s.id}
              className="outline-none"
              style={{ cursor: 'pointer', opacity: dim ? 0.3 : 1, transition: 'opacity 200ms' }}
              onMouseEnter={() => onHover(s.id)}
              onMouseLeave={() => {
                onHover(null);
                setTip(null);
              }}
              onMouseMove={(e) => {
                const rect = packRef.current!.getBoundingClientRect();
                showTipAt(s.id, e.clientX - rect.left, e.clientY - rect.top);
              }}
              onFocus={() => {
                onHover(s.id);
                showTipAt(s.id, c.x, c.y);
              }}
              onBlur={() => {
                onHover(null);
                setTip(null);
              }}
              onKeyDown={(e) => onKey(e, s.id)}
              onClick={() => onPin(s.id)}
            >
              <circle
                r={c.r}
                fill={d3.interpolateRgb('#1C1B19', color)(0.22 + 0.4 * Math.sqrt(n / maxUses))}
                stroke={color}
                strokeOpacity={active ? 1 : 0.6}
                strokeWidth={active ? 2 : 1.2}
                strokeDasharray={seenOnly(s) ? '4 2' : undefined}
              />
              <circle r={c.r} fill="url(#sb-bubble-shine)" pointerEvents="none" />
              {pinnedId === s.id && <circle r={c.r + 3} fill="none" stroke={color} strokeDasharray="3 3" strokeOpacity={0.9} pointerEvents="none" />}
              {label.kind === 'full' ? (
                <g pointerEvents="none">
                  {label.lines.map((line, li) => (
                    <text
                      key={li}
                      textAnchor="middle"
                      y={firstBaseline + li * lineH}
                      fill="#F5F2EB"
                      style={{ fontFamily: 'var(--font-mono)', fontSize: label.fs, fontWeight: 600 }}
                    >
                      {line}
                    </text>
                  ))}
                  {label.sub && (
                    <text
                      textAnchor="middle"
                      y={firstBaseline + (label.lines.length - 1) * lineH + label.subFs * 1.3}
                      fill="#F5F2EB"
                      fillOpacity={0.7}
                      style={{ fontFamily: 'var(--font-mono)', fontSize: label.subFs }}
                    >
                      {label.sub}
                    </text>
                  )}
                </g>
              ) : (
                label.kind === 'short' && (
                  <text textAnchor="middle" dy="0.32em" fill="#F5F2EB" fillOpacity={0.8} pointerEvents="none" style={{ fontFamily: 'var(--font-mono)', fontSize: label.fs }}>
                    {label.lines[0]}
                  </text>
                )
              )}
            </g>
          );
        })}
      </svg>
      {tipSkill && tip && (
        <div
          className="pointer-events-none absolute z-10 w-[250px] rounded-lg border border-subtle bg-panel-elevated/95 p-2.5 shadow-xl shadow-black/50 backdrop-blur"
          style={{ left: Math.min(tip.x + 14, size.w - 260), top: Math.max(6, Math.min(tip.y - 110, size.h - 190)) }}
        >
          <div className="flex items-center gap-2">
            <span className="truncate font-mono text-[12px] font-semibold text-paper">{bareName(tipSkill)}</span>
            <OriginBadge s={tipSkill} />
          </div>
          <div className="mt-1 flex items-baseline gap-2">
            <span className="font-doto text-[20px] font-bold text-orange">{tipUses}×</span>
            <span className="font-mono text-[9.5px] text-secondary">calls · 30d · last {relTime(tipSkill.lastUsedAt, now)}</span>
          </div>
          <p className="mt-1 line-clamp-4 text-[11px] leading-snug text-secondary">
            {descOf(tipSkill) || <span className="text-muted">{seenOnly(tipSkill) ? SEEN_NOTE : 'No description in SKILL.md.'}</span>}
          </p>
          <div className="mt-1 font-mono text-[9px] text-muted">
            {COUNT_NOTE.toLowerCase()} · click to {pinnedId === tipSkill.id ? 'unpin' : 'pin in leaderboard'}
          </div>
        </div>
      )}
    </div>
  );
});

function OriginBadge({ s }: { s: RealSkill }) {
  const color = skillColor(s);
  return (
    <span
      className={cn(
        'shrink-0 truncate rounded-full border px-1.5 py-px font-mono text-[8.5px] font-semibold tracking-wider',
        seenOnly(s) ? 'max-w-[150px] border-dashed' : 'max-w-[120px]',
      )}
      style={{ borderColor: `${color}66`, color }}
      title={seenOnly(s) ? SEEN_NOTE : undefined}
    >
      {originLabel(s)}
    </span>
  );
}

export default SkillsAnalyticsView;
