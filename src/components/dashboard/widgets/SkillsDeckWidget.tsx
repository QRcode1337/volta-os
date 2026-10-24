'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { LoaderCircle, Play, Plus, RotateCw, SlidersHorizontal, Zap } from 'lucide-react';
import { HudPanel, ModelEffortBadge } from '@/components/robo-ui';
import { EFFORT_LEVELS, MODEL_COLORS } from '@/lib/mock-data';
import type { EffortLevel, ModelTier, SkillRunRequest, SkillRunResult } from '@/types/os';
import type { RealSkill } from '@/types/sources';
import { cn } from '@/lib/cn';
import { ModelEffortMatrix } from './ModelEffortMatrix';
import { ExecutionReportModal, type SkillReport } from './ExecutionReportModal';
import { SkillPicker } from './SkillPicker';
import { PanelFlash } from './Overlay';
import { useFlash } from './hooks';
import { errorText, readLocal, useElementWidth, useMeasure, writeLocal } from './right-hooks';
import { useSharedJson } from './shared-json';
import {
  DECK_KEY,
  DECK_MAX,
  DEFAULT_ROUTING,
  ROUTING_KEY,
  ambiguityNote,
  buildCommandIndex,
  commandInfo,
  DISABLED_LABEL,
  DISABLED_NOTE,
  defaultDeck,
  enabledCountOf,
  installedCountOf,
  isDisabled,
  isIdList,
  isNotOnDisk,
  isRoutingMap,
  skillDescription,
  skillOrigin,
  type CommandInfo,
  type Routing,
} from './right-skills';

const RUN_TIMEOUT_MS = 30_000;
const EFFORT_SHORT: Record<EffortLevel, string> = { LOW: 'LOW', MEDIUM: 'MED', HIGH: 'HIGH', XHIGH: 'XHI', MAX: 'MAX' };
// sm ModelEffortBadge ≈ 27px chrome (padding + dot) + 6px per 9px-mono character (measured: 15 chars → 117px).
const badgeWidth = (label: string) => 27 + 6 * label.length;
const METER_W = 17; // ml-[3px] + 5 bars × 2px + 4 × 1px gaps

/**
 * Longest routing label that fits beside the run button: "SONNET · MEDIUM" → "SONNET · MED" →
 * "SONNET" + 5-step effort meter → "SONNET" (effort then only in the tooltip / screen-reader text).
 */
function pickBadge(r: Routing, available: number | null): { label: string; meter: boolean } {
  const full = `${r.model} · ${r.effort}`;
  if (available == null || available >= badgeWidth(full)) return { label: full, meter: false };
  const short = `${r.model} · ${EFFORT_SHORT[r.effort]}`;
  if (available >= badgeWidth(short)) return { label: short, meter: false };
  return { label: r.model, meter: available >= badgeWidth(r.model) + METER_W };
}

/** Card density from the measured grid row height (keeps all 3 rows visible without a scroll). */
type Density = 'normal' | 'compact' | 'tight';
const GRID_GAP = 8;
function densityFor(gridH: number | null): Density {
  if (gridH == null) return 'normal';
  const rowH = (gridH - 2 * GRID_GAP) / 3;
  if (rowH >= 78) return 'normal'; // 2 + py-2 16 + 26 top + gap 6 + run 28
  if (rowH >= 68) return 'compact'; // 2 + py-1.5 12 + 26 top + gap 4 + run 24
  return 'tight'; // 2 + py-1 8 + 20 top (no subline) + gap 4 + run 24 = 58
}

function isSkillRunResult(v: unknown): v is SkillRunResult {
  if (!v || typeof v !== 'object') return false;
  const o = v as Record<string, unknown>;
  return (
    typeof o.ok === 'boolean' &&
    typeof o.command === 'string' &&
    typeof o.markdown === 'string' &&
    typeof o.requestedModel === 'string' &&
    typeof o.routedModel === 'string' &&
    typeof o.tokensIn === 'number' &&
    typeof o.tokensOut === 'number' &&
    typeof o.costUsd === 'number' &&
    typeof o.durationMs === 'number'
  );
}

async function runSkill(req: SkillRunRequest): Promise<Omit<SkillReport, 'clientMs'>> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), RUN_TIMEOUT_MS);
  try {
    const res = await fetch('/api/skills/run', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(req),
      signal: ctrl.signal,
      cache: 'no-store',
    });
    let data: unknown = null;
    try {
      data = await res.json();
    } catch {
      /* non-JSON body handled below */
    }
    if (isSkillRunResult(data)) return { request: req, result: data };
    const apiErr =
      data && typeof data === 'object' && typeof (data as { error?: unknown }).error === 'string'
        ? (data as { error: string }).error
        : null;
    return { request: req, error: apiErr ?? `HTTP ${res.status} ${res.statusText || ''}`.trim() };
  } catch (e) {
    const msg =
      e instanceof DOMException && e.name === 'AbortError'
        ? `Timed out after ${RUN_TIMEOUT_MS / 1000}s waiting for /api/skills/run.`
        : e instanceof Error
          ? e.message
          : 'Network error';
    return { request: req, error: msg };
  } finally {
    clearTimeout(timer);
  }
}

/** Home SKILLS DECK — the user's real skills (/api/skills-real), pinned deck + per-skill routing preference. */
export function SkillsDeckWidget({ className }: { className?: string }) {
  const { data, error, loading, refreshing, reload } = useSharedJson<{
    skills: RealSkill[];
    installedCount?: number;
    enabledCount?: number;
  }>('/api/skills-real', null);
  const skills = data?.skills;
  // "Installed" = has a SKILL.md on disk (server's installedCount / RealSkill.installed, same as Second Brain →
  // Skills). installed:false entries are invocations seen in transcripts (built-ins, removed plugins, shared
  // names): they stay pickable but are not counted. Installed skills of a disabled plugin count as installed
  // but are labelled "plugin disabled" (enabledCount = the invocable ones).
  const installedCount = useMemo(() => installedCountOf(data), [data]);
  const enabledCount = useMemo(() => enabledCountOf(data), [data]);
  const seenCount = useMemo(() => (skills ? skills.filter(isNotOnDisk).length : 0), [skills]);

  // Preferences live in localStorage; read after mount only (hydration-safe).
  const [routing, setRouting] = useState<Record<string, Routing>>({});
  const [pinnedIds, setPinnedIds] = useState<string[] | null>(null); // null = default deck
  const [prefsReady, setPrefsReady] = useState(false);
  useEffect(() => {
    setRouting(readLocal(ROUTING_KEY, isRoutingMap) ?? {});
    setPinnedIds(readLocal(DECK_KEY, isIdList));
    setPrefsReady(true);
  }, []);

  const [running, setRunning] = useState<Record<string, boolean>>({});
  const [matrixFor, setMatrixFor] = useState<string | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [report, setReport] = useState<(SkillReport & { skillId: string }) | null>(null);
  const [flash, setFlash] = useFlash();
  const runningRef = useRef<Record<string, boolean>>({});
  const [fitRef, fitSize] = useMeasure();
  const density = densityFor(fitSize?.height ?? null);

  const byId = useMemo(() => new Map((skills ?? []).map((s) => [s.id, s])), [skills]);
  const cmdIndex = useMemo(() => buildCommandIndex(skills ?? []), [skills]);
  const infoFor = useCallback((s: RealSkill) => commandInfo(s, cmdIndex), [cmdIndex]);
  const deckIds = useMemo(() => {
    if (!skills) return [];
    const ids = pinnedIds ?? defaultDeck(skills);
    return ids.filter((id) => byId.has(id)).slice(0, DECK_MAX);
  }, [skills, pinnedIds, byId]);
  const deck = useMemo(() => deckIds.map((id) => byId.get(id)!), [deckIds, byId]);

  const routingFor = useCallback((id: string): Routing => routing[id] ?? DEFAULT_ROUTING, [routing]);

  const run = useCallback(
    async (skill: RealSkill) => {
      const info = infoFor(skill);
      if (!info.runnable || runningRef.current[skill.id]) return; // ambiguous: the run API can't target it
      runningRef.current[skill.id] = true;
      setRunning((p) => ({ ...p, [skill.id]: true }));
      const r = routingFor(skill.id);
      const req: SkillRunRequest = { command: info.command, model: r.model, effort: r.effort };
      const t0 = performance.now();
      const out = await runSkill(req);
      const clientMs = performance.now() - t0;
      runningRef.current[skill.id] = false;
      setRunning((p) => ({ ...p, [skill.id]: false }));
      setReport({ ...out, clientMs, skillId: skill.id });
    },
    [routingFor, infoFor],
  );

  const select = (skill: RealSkill, model: ModelTier, effort: EffortLevel) => {
    setRouting((p) => {
      const next = { ...p };
      if (model === DEFAULT_ROUTING.model && effort === DEFAULT_ROUTING.effort) delete next[skill.id];
      else next[skill.id] = { model, effort };
      writeLocal(ROUTING_KEY, next);
      return next;
    });
    setMatrixFor(null);
    setFlash(`${infoFor(skill).display} → ${model} · ${effort}`);
  };

  const togglePin = (id: string) => {
    const cur = deckIds;
    let next: string[];
    if (cur.includes(id)) next = cur.filter((x) => x !== id);
    else if (cur.length < DECK_MAX) next = [...cur, id];
    else return;
    setPinnedIds(next);
    writeLocal(DECK_KEY, next);
  };

  const resetDeck = () => {
    setPinnedIds(null);
    try {
      window.localStorage.removeItem(DECK_KEY);
    } catch {
      /* storage unavailable */
    }
    setFlash(`Deck reset to top ${DECK_MAX} by uses`);
  };

  const reportSkill = report ? byId.get(report.skillId) : undefined;
  const ready = !!skills && prefsReady;
  const emptySlots = ready ? Math.max(0, DECK_MAX - deck.length) : 0;
  const gridCls = cn('absolute inset-0 grid grid-cols-2 grid-rows-3', density === 'tight' ? 'gap-1.5' : 'gap-2');

  return (
    <HudPanel
      title="SKILLS DECK"
      icon={<Zap size={14} strokeWidth={2.2} />}
      headerExtra={
        <span
          className="whitespace-nowrap font-mono text-[9px] uppercase tracking-[0.1em] text-muted"
          title={[
            installedCount !== null
              ? `${installedCount} installed${enabledCount !== null ? ` · ${enabledCount} enabled` : ''} (skills with a SKILL.md on disk)`
              : '',
            installedCount !== null && enabledCount !== null && installedCount > enabledCount
              ? `${installedCount - enabledCount} belong to disabled plugins (labelled "${DISABLED_LABEL}")`
              : '',
            seenCount ? `+ ${seenCount} seen in transcripts only (not counted)` : '',
            'Cards show uses in the last 30 days, counted from ~/.claude transcripts',
          ]
            .filter(Boolean)
            .join('\n')}
        >
          {installedCount !== null ? `${installedCount} installed` : ''}
        </span>
      }
      actions={[{ label: '+ ADD', onClick: () => skills && setPickerOpen(true) }]}
      className={cn('relative', className)}
      bodyClassName="flex flex-col p-2"
    >
      {/* Fitted region: the grid fills it exactly (3 rows) and card density follows its measured height. */}
      <div ref={fitRef} className="relative min-h-0 flex-1">
        {!ready && (loading || !error) ? (
          <div aria-label="Loading skills" className={cn(gridCls, 'animate-pulse')}>
            {Array.from({ length: DECK_MAX }, (_, i) => (
              <div
                key={i}
                className={cn(
                  'flex min-h-0 flex-col justify-between overflow-hidden rounded-[10px] border border-subtle bg-panel-elevated px-2.5',
                  density === 'normal' ? 'py-2' : density === 'compact' ? 'py-1.5' : 'py-1',
                )}
              >
                <span className="flex flex-col gap-1">
                  <span className="h-3 w-3/4 rounded bg-panel-hover" />
                  {density !== 'tight' && <span className="h-2 w-1/2 rounded bg-panel-hover" />}
                </span>
                <span className="flex items-end justify-between">
                  <span className="h-5 w-16 rounded-full bg-panel-hover" />
                  <span className="h-6 w-6 rounded-full bg-panel-hover" />
                </span>
              </div>
            ))}
          </div>
        ) : !skills ? (
          <div className="absolute inset-0 flex flex-col items-start justify-center gap-1.5 px-1.5">
            <span className="hud-label text-[10px] text-amber">SKILLS UNAVAILABLE</span>
            <p className="selectable text-[11.5px] leading-snug text-secondary">{errorText(error)}</p>
            <button
              type="button"
              onClick={reload}
              className="inline-flex h-6 items-center gap-1.5 rounded-full border border-subtle bg-panel-elevated px-2.5 font-mono text-[9.5px] font-semibold uppercase tracking-[0.08em] text-secondary transition-colors hover:border-highlight hover:text-paper"
            >
              <RotateCw size={10} className={cn(refreshing && 'robo-spin')} /> RETRY
            </button>
          </div>
        ) : (
          <div className={gridCls}>
            {deck.map((s) => (
              <SkillCard
                key={s.id}
                skill={s}
                info={infoFor(s)}
                density={density}
                routing={routingFor(s.id)}
                running={!!running[s.id]}
                matrixOpen={matrixFor === s.id}
                onToggleMatrix={() => setMatrixFor((cur) => (cur === s.id ? null : s.id))}
                onCloseMatrix={() => setMatrixFor((cur) => (cur === s.id ? null : cur))}
                onSelect={(m, e) => select(s, m, e)}
                onRun={() => run(s)}
              />
            ))}
            {Array.from({ length: emptySlots }, (_, i) => (
              <button
                key={`empty-${i}`}
                type="button"
                onClick={() => setPickerOpen(true)}
                className="flex min-h-0 items-center justify-center gap-1.5 rounded-[10px] border border-dashed border-highlight font-mono text-[10px] font-semibold uppercase tracking-[0.08em] text-muted transition-colors hover:border-orange/60 hover:bg-panel-hover hover:text-orange"
              >
                <Plus size={12} strokeWidth={2.4} /> PIN SKILL
              </button>
            ))}
          </div>
        )}
      </div>
      <PanelFlash message={flash} />
      {skills && (
        <SkillPicker
          open={pickerOpen}
          skills={skills}
          deckIds={deckIds}
          onToggle={togglePin}
          onReset={resetDeck}
          onClose={() => setPickerOpen(false)}
        />
      )}
      <ExecutionReportModal
        report={report}
        rerunning={!!(report && running[report.skillId])}
        onRerun={() => reportSkill && run(reportSkill)}
        onClose={() => setReport(null)}
      />
    </HudPanel>
  );
}

interface SkillCardProps {
  skill: RealSkill;
  info: CommandInfo;
  density: Density;
  routing: Routing;
  running: boolean;
  matrixOpen: boolean;
  onToggleMatrix: () => void;
  onCloseMatrix: () => void;
  onSelect: (m: ModelTier, e: EffortLevel) => void;
  onRun: () => void;
}

/** 5-step effort meter in the model colour (shown when the badge is too narrow to spell the effort). */
function EffortMeter({ model, effort }: Routing) {
  const color = MODEL_COLORS[model];
  const level = EFFORT_LEVELS.indexOf(effort) + 1;
  return (
    <span aria-hidden className="ml-[3px] flex h-5 shrink-0 items-end gap-px pb-[5px]">
      {EFFORT_LEVELS.map((_, i) => (
        <span key={i} className="w-[2px] rounded-[1px]" style={{ height: 3 + i * 1.5, background: color, opacity: i < level ? 0.95 : 0.22 }} />
      ))}
    </span>
  );
}

function SkillCard({ skill, info, density, routing, running, matrixOpen, onToggleMatrix, onCloseMatrix, onSelect, onRun }: SkillCardProps) {
  const gearRef = useRef<HTMLButtonElement>(null);
  const command = info.display;
  const changed = routing.model !== DEFAULT_ROUTING.model || routing.effort !== DEFAULT_ROUTING.effort;
  const badgeBoxRef = useRef<HTMLDivElement>(null);
  const badgeBox = useElementWidth(badgeBoxRef);
  const badge = pickBadge(routing, badgeBox);
  const showsEffort = badge.label !== routing.model;
  const usesLine = `${skill.uses30d} uses/30d · ${skillOrigin(skill)}${isDisabled(skill) ? ` · ${DISABLED_LABEL}` : ''}`;
  const desc = skillDescription(skill);
  const note = ambiguityNote(info);
  const tight = density === 'tight';
  const disabled = isDisabled(skill);
  const titleTip = `${[skill.id, tight ? usesLine : '', disabled ? DISABLED_NOTE : '', note].filter(Boolean).join('\n')}\n\n${desc}`;

  return (
    <div
      className={cn(
        'group relative min-h-0 overflow-hidden rounded-[10px] p-px transition-colors',
        running ? 'bg-orange/25' : matrixOpen ? 'bg-orange/60' : 'bg-subtle hover:bg-highlight',
      )}
    >
      {/* Spinning orange border while running */}
      {running && (
        <span
          aria-hidden
          className="robo-spin pointer-events-none absolute -inset-[70%]"
          style={{
            background: 'conic-gradient(from 0deg, transparent 0deg 220deg, rgba(255,85,0,0.35) 280deg, #FF5500 340deg, transparent 360deg)',
            animationDuration: '1.1s',
          }}
        />
      )}
      <div
        className={cn(
          'relative flex h-full flex-col justify-between rounded-[9px] px-2.5 transition-colors',
          density === 'normal' ? 'gap-1.5 py-2' : density === 'compact' ? 'gap-1 py-1.5' : 'gap-1 py-1',
          running ? 'bg-panel-elevated' : 'bg-panel-elevated group-hover:bg-panel-hover',
        )}
      >
        <div className="flex items-start justify-between gap-1">
          <div className="min-w-0" title={titleTip}>
            <div className="flex min-w-0 items-center gap-1">
              <span className={cn('truncate font-mono text-[11.5px] font-semibold leading-[14px]', disabled ? 'text-paper/70' : 'text-paper')}>
                {command}
              </span>
              {disabled && (
                <span
                  className="shrink-0 rounded-[3px] border border-dashed border-highlight px-[3px] font-mono text-[8px] font-semibold uppercase leading-[12px] tracking-[0.06em] text-muted"
                  aria-label={DISABLED_LABEL}
                  title={DISABLED_NOTE}
                >
                  off
                </span>
              )}
              {info.ambiguous && !info.runnable && (
                <span className="shrink-0 font-mono text-[9px] font-bold leading-[14px] text-amber" aria-label="ambiguous command">
                  ⚠
                </span>
              )}
            </div>
            {!tight && <div className="truncate text-[10px] leading-[12px] text-muted">{usesLine}</div>}
          </div>
          <button
            ref={gearRef}
            type="button"
            onClick={onToggleMatrix}
            aria-label={`Routing preference for ${command}`}
            aria-expanded={matrixOpen}
            aria-haspopup="dialog"
            className={cn(
              '-mr-1 -mt-0.5 flex shrink-0 items-center justify-center rounded-md border transition-all',
              density === 'normal' ? 'h-6 w-6' : 'h-5 w-5',
              matrixOpen
                ? 'border-orange/60 bg-orange/15 text-orange'
                : 'border-transparent text-muted hover:border-subtle hover:bg-obsidian hover:text-paper',
            )}
          >
            <SlidersHorizontal size={12} strokeWidth={2.2} />
          </button>
        </div>

        <div className="flex items-end justify-between gap-1">
          <div
            ref={badgeBoxRef}
            className="flex min-w-0 flex-1 items-end"
            title={`Routing preference: ${routing.model} · ${routing.effort} (stored in this browser)`}
          >
            <span key={`${routing.model}-${routing.effort}`} className="relative inline-block max-w-full align-bottom">
              <ModelEffortBadge model={routing.model} effort={routing.effort} label={badge.label} />
              {changed && <span className="absolute -right-1 -top-1 h-1.5 w-1.5 rounded-full bg-orange" title="Custom routing" />}
            </span>
            {badge.meter && <EffortMeter model={routing.model} effort={routing.effort} />}
            {!showsEffort && <span className="sr-only">, {routing.effort} effort</span>}
          </div>
          <span title={info.runnable ? undefined : note} className="shrink-0">
            <button
              type="button"
              onClick={onRun}
              disabled={running || !info.runnable}
              aria-label={info.runnable ? `Run ${command}` : `Run unavailable for ${command}: ambiguous command`}
              className={cn(
                'flex items-center justify-center rounded-full transition-all',
                density === 'normal' ? 'h-7 w-7' : 'h-6 w-6',
                !info.runnable
                  ? 'cursor-not-allowed border border-subtle bg-obsidian text-muted'
                  : running
                    ? 'cursor-wait bg-orange text-obsidian shadow-[0_0_16px_rgba(255,85,0,0.6)]'
                    : 'bg-orange text-obsidian shadow-[0_0_0_0_rgba(255,85,0,0)] hover:scale-105 hover:shadow-[0_0_14px_rgba(255,85,0,0.55)] active:scale-95',
              )}
            >
              {running ? (
                <LoaderCircle size={13} strokeWidth={2.6} className="robo-spin" />
              ) : (
                <Play size={11} fill="currentColor" strokeWidth={0} className="translate-x-[1px]" />
              )}
            </button>
          </span>
        </div>
      </div>

      <ModelEffortMatrix
        open={matrixOpen}
        anchorRef={gearRef}
        command={command}
        model={routing.model}
        effort={routing.effort}
        onSelect={onSelect}
        onClose={onCloseMatrix}
      />
    </div>
  );
}
