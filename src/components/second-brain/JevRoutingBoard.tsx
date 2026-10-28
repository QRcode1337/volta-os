'use client';
// Second Brain → Skills → "JEV routed": per-skill JEV routing history from /api/jev-router/skills (an append-only log
// written by every dashboard skill run). "Optimize to Haiku" previews exactly what it would change and writes only
// on confirm: this browser's Skills Deck routing (localStorage) and, when VOLTA may write it, the SKILL.md `model:` line.

import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { ArrowRight } from 'lucide-react';
import type { ModelTier } from '@/types/os';
import { MODEL_COLORS } from '@/lib/mock-data';
import { cn } from '@/lib/cn';
import { Modal, ModelEffortBadge } from '@/components/robo-ui';
import { DEFAULT_ROUTING, ROUTING_KEY, isRoutingMap, type Routing } from '@/components/dashboard/widgets/right-skills';
import { readLocal, writeLocal } from '@/components/dashboard/widgets/right-hooks';
import { ViewState, matchesQuery, relTime, type ApiState } from './analytics-shared';

type Tier = Exclude<ModelTier, 'FABLE'>;

interface TierFile {
  path: string | null;
  model: string | null;
  writable: boolean;
  reason?: string;
}
export interface SkillRoutingRow {
  command: string;
  skillId: string | null;
  runs: number;
  routedDown: number;
  routedUp: number;
  lastRequested: ModelTier;
  jevPick: Tier;
  jevPickRuns: number;
  haikuPicks: number;
  avgConfidence: number;
  fallbacks: number;
  lastAt: string;
  tierFile: TierFile;
}
export interface SkillRoutingBoard {
  rows: SkillRoutingRow[];
  totalRuns: number;
  persisted: boolean;
  path: string;
  lastError: string | null;
}
interface TierPlan {
  command: string;
  skillId: string | null;
  file: TierFile & { before: string | null; after: string; changes: boolean; mtimeMs: number | null };
}

const pct = (n: number, d: number) => (d ? Math.round((n / d) * 100) : 0);

async function postJson<T>(body: object): Promise<T> {
  const res = await fetch('/api/jev-router/skills/optimize', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const data = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
  return data;
}

export function JevRoutingBoard({ api, search, now }: { api: ApiState<SkillRoutingBoard>; search: string; now: number | null }) {
  // The deck's per-skill routing lives in this browser (right-skills ROUTING_KEY); read it after mount.
  const [routing, setRouting] = useState<Record<string, Routing>>({});
  useEffect(() => setRouting(readLocal(ROUTING_KEY, isRoutingMap) ?? {}), []);
  const [target, setTarget] = useState<SkillRoutingRow | null>(null);

  const rows = useMemo(() => (api.data?.rows ?? []).filter((r) => matchesQuery(search, r.command, r.skillId)), [api.data, search]);
  const deckTier = (r: SkillRoutingRow): ModelTier => (r.skillId ? (routing[r.skillId] ?? DEFAULT_ROUTING).model : r.lastRequested);

  if (!api.data) return <ViewState kind={api.loading ? 'loading' : 'error'} title={api.loading ? 'READING JEV ROUTING LOG…' : 'JEV ROUTING UNAVAILABLE'} detail={api.error ?? undefined} onRetry={api.reload} />;
  if (!api.data.rows.length)
    return (
      <ViewState
        kind="empty"
        title="NO JEV-ROUTED RUNS YET"
        detail={`Every Skills Deck ▶ run is classified by JEV and logged to ${api.data.path}. Run a skill from the dashboard to start the history.${api.data.lastError ? ` Last write error: ${api.data.lastError}` : ''}`}
      />
    );
  if (!rows.length) return <ViewState kind="empty" title="NO MATCHING SKILLS" detail={`Nothing matches “${search}” in the routing log.`} />;

  return (
    <>
      <div className="grid grid-cols-[minmax(0,1fr)_44px_52px_auto_auto] items-center gap-x-3 px-4 pb-1 pt-2 font-mono text-[9px] tracking-widest text-muted">
        <span>SKILL</span>
        <span className="text-right">RUNS</span>
        <span className="text-right" title="Runs where JEV overrode the requested tier with a cheaper one (≥0.80 confidence)">↓ DOWN</span>
        <span title="Default tier for dashboard runs (this browser's Skills Deck routing) → JEV's most common pick">DEFAULT → JEV</span>
        <span />
      </div>
      {rows.map((r) => {
        const def = deckTier(r);
        const canOptimize = def !== 'HAIKU' && def !== 'FABLE';
        const suggest = canOptimize && r.jevPick === 'HAIKU';
        return (
          <div
            key={r.command}
            className="mx-2 grid grid-cols-[minmax(0,1fr)_44px_52px_auto_auto] items-center gap-x-3 rounded-md px-2 py-2 hover:bg-panel-hover"
            title={`${r.tierFile.path ?? 'no SKILL.md'}${r.tierFile.model ? ` · model: ${r.tierFile.model.toLowerCase()}` : ''}`}
          >
            <div className="min-w-0">
              <div className="truncate font-mono text-[12px] font-semibold text-paper">{r.command}</div>
              <div className="mt-0.5 truncate font-mono text-[10px] text-muted">
                avg {r.avgConfidence.toFixed(2)} conf · {r.haikuPicks}/{r.runs} Haiku picks
                {r.fallbacks > 0 && ` · ${r.fallbacks} heuristic`} · {relTime(r.lastAt, now)}
              </div>
            </div>
            <span className="text-right font-mono text-[11px] text-secondary">{r.runs}</span>
            <span className={cn('text-right font-mono text-[11px]', r.routedDown ? 'text-green' : 'text-muted')}>{pct(r.routedDown, r.runs)}%</span>
            <span className="flex items-center gap-1" title={`JEV picked ${r.jevPick} on ${r.jevPickRuns} of ${r.runs} runs`}>
              <ModelEffortBadge model={def} />
              <ArrowRight size={10} className="text-muted" />
              <ModelEffortBadge model={r.jevPick} label={`${r.jevPick} ${r.jevPickRuns}/${r.runs}`} />
            </span>
            <button
              type="button"
              disabled={!canOptimize}
              onClick={() => setTarget(r)}
              title={canOptimize ? 'Preview the change, then confirm' : 'Already on Haiku (or a FABLE manual pin)'}
              className={cn(
                'h-6 shrink-0 rounded-full border px-2.5 font-mono text-[9.5px] font-semibold tracking-wide transition-colors disabled:cursor-default disabled:opacity-30',
                suggest ? 'border-green/60 text-green hover:bg-green/10' : 'border-subtle text-secondary enabled:hover:text-paper',
              )}
            >
              Optimize to Haiku
            </button>
          </div>
        );
      })}
      <OptimizeModal
        row={target}
        deck={target?.skillId ? (routing[target.skillId] ?? DEFAULT_ROUTING) : null}
        onClose={() => setTarget(null)}
        onApplied={(skillId, next) => {
          if (skillId) setRouting((p) => ({ ...p, [skillId]: next }));
          api.reload();
        }}
      />
    </>
  );
}

function OptimizeModal({
  row,
  deck,
  onClose,
  onApplied,
}: {
  row: SkillRoutingRow | null;
  deck: Routing | null;
  onClose: () => void;
  onApplied: (skillId: string | null, next: Routing) => void;
}) {
  const [plan, setPlan] = useState<TierPlan | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => {
    setPlan(null);
    setError(null);
    setDone(false);
    if (!row) return;
    let alive = true;
    postJson<TierPlan>({ command: row.command, tier: 'HAIKU' }).then(
      (p) => alive && setPlan(p),
      (e: Error) => alive && setError(e.message),
    );
    return () => {
      alive = false;
    };
  }, [row]);

  const nextDeck: Routing | null = deck && deck.model !== 'HAIKU' ? { model: 'HAIKU', effort: deck.effort } : null;
  const writeFile = !!plan && plan.file.writable && plan.file.changes;
  const nothing = !!plan && !nextDeck && !writeFile;

  const apply = async () => {
    if (!row || !plan) return;
    setBusy(true);
    setError(null);
    try {
      if (writeFile) await postJson({ command: row.command, tier: 'HAIKU', apply: true, expectMtimeMs: plan.file.mtimeMs });
      if (nextDeck && row.skillId) {
        const cur = readLocal(ROUTING_KEY, isRoutingMap) ?? {};
        writeLocal(ROUTING_KEY, { ...cur, [row.skillId]: nextDeck });
      }
      setDone(true);
      onApplied(row.skillId, nextDeck ?? deck ?? DEFAULT_ROUTING);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const btn = 'h-7 rounded-full px-3 font-mono text-[10px] font-semibold tracking-wide transition-colors disabled:opacity-40';
  return (
    <Modal
      open={!!row}
      onClose={onClose}
      title={row ? `OPTIMIZE ${row.command} TO HAIKU` : undefined}
      size="md"
      footer={
        done ? (
          <button type="button" onClick={onClose} className={cn(btn, 'bg-paper text-obsidian')}>
            Close
          </button>
        ) : (
          <>
            <button type="button" onClick={onClose} className={cn(btn, 'border border-subtle text-secondary hover:text-paper')}>
              Cancel
            </button>
            <button type="button" disabled={!plan || busy || nothing} onClick={apply} className={cn(btn, 'bg-green text-obsidian')}>
              {busy ? 'Applying…' : 'Apply changes'}
            </button>
          </>
        )
      }
    >
      {!plan && !error && <ViewState kind="loading" title="PREVIEWING…" minH="min-h-[120px]" />}
      {plan && row && (
        <div className="space-y-3 text-[11px] text-secondary">
          <p>
            JEV picked <b style={{ color: MODEL_COLORS[row.jevPick] }}>{row.jevPick}</b> on {row.jevPickRuns} of {row.runs} runs (avg confidence {row.avgConfidence.toFixed(2)}).{' '}
            {done ? 'Applied:' : 'Nothing is written until you confirm. This would change:'}
          </p>
          <Change
            label="Skills Deck routing · this browser (localStorage volta:skill-routing)"
            on={!!nextDeck && !!row.skillId}
            off={!row.skillId ? 'Skill not in the catalog: no deck entry to change.' : 'Already HAIKU.'}
          >
            {nextDeck && deck && (
              <>
                <div className="text-red-400">- {deck.model} · {deck.effort}</div>
                <div className="text-green">+ {nextDeck.model} · {nextDeck.effort}</div>
              </>
            )}
          </Change>
          <Change
            label={`SKILL.md frontmatter · ${plan.file.path ?? 'none'}`}
            on={writeFile}
            off={!plan.file.writable ? `Not changed: ${plan.file.reason}` : 'Already model: haiku.'}
          >
            {plan.file.before ? <div className="text-red-400">- {plan.file.before}</div> : <div className="text-muted">  (new line, just above the closing ---)</div>}
            <div className="text-green">+ {plan.file.after}</div>
          </Change>
          {writeFile && <p className="text-[10.5px] text-muted">Claude Code reads this `model:` line too, so CLI invocations of {row.command} will also run on Haiku. Written atomically; refused if the file changed since this preview.</p>}
        </div>
      )}
      {error && <p className="mt-2 font-mono text-[10.5px] text-red-400">{error}</p>}
    </Modal>
  );
}

function Change({ label, on, off, children }: { label: string; on: boolean; off: string; children?: ReactNode }) {
  return (
    <div className="rounded-md border border-subtle bg-obsidian/60 p-2.5">
      <div className="mb-1 truncate font-mono text-[9px] tracking-widest text-muted" title={label}>
        {label.toUpperCase()}
      </div>
      {on ? <pre className="whitespace-pre-wrap font-mono text-[11px] leading-snug">{children}</pre> : <div className="font-mono text-[10.5px] text-muted">{off}</div>}
    </div>
  );
}
