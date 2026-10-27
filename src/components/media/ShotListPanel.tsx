'use client';
// Shot-list router UI: paste a shot list, each shot is routed through the video hierarchy (lib/media/shotlist.ts).
// Tier 0 drafts use the APIs; every shot above that defaults to a copy-ready Google Flow prompt (made by hand on
// subscription credits). API buttons build a {kind:'shots'} request for the parent's quote → confirm flow.
import { useEffect, useMemo, useState } from 'react';
import { ClipboardCopy, Clapperboard, Layers } from 'lucide-react';
import type { GenItemRecord, MediaStatus } from '@/types/media';
import { cn } from '@/lib/cn';
import { TIERS, TIER_IDS, availableVideoModels, flowPrompt, flowPrompts, parseShots, planShot, type Shot, type TierId } from '@/lib/media/shotlist';
import { fmtUsd } from './gen-client';

const MAX_BATCH = 12;
const LS_TEXT = 'volta:shotlist:text';
const LS_ASPECT = 'volta:shotlist:aspect';
const LS_TIERS = 'volta:shotlist:tiers';

const selectCls =
  'h-8 rounded-md border border-subtle bg-panel-elevated px-2 font-mono text-[11px] text-paper outline-none transition-colors hover:border-highlight focus:border-orange disabled:opacity-50';
const ghostBtn =
  'inline-flex h-8 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-md border border-subtle px-2.5 font-mono text-[10.5px] font-semibold uppercase tracking-[0.05em] text-secondary transition-colors hover:border-highlight hover:text-paper disabled:cursor-not-allowed disabled:opacity-40';
const primaryBtn =
  'inline-flex h-9 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-md border border-orange bg-orange px-3.5 font-mono text-[11px] font-bold uppercase tracking-[0.07em] text-obsidian transition-[filter] hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-40';

function readLs<T>(key: string, fallback: T): T {
  try {
    const v = window.localStorage.getItem(key);
    return v === null ? fallback : (JSON.parse(v) as T);
  } catch {
    return fallback;
  }
}
function writeLs(key: string, v: unknown) {
  try {
    window.localStorage.setItem(key, JSON.stringify(v));
  } catch {
    /* private mode */
  }
}

const EXAMPLE = `1. Cold open: night sky over a pine forest, a pulsing light drops through the trees (8s)
2. Slow push across an airbase perimeter fence in fog
3. A security officer says "we saw something land" to camera, close-up
4. Archive-style map with a red circle around the landing site
- Thumbnail: glowing triangle hovering above pine trees`;

export function ShotListPanel({
  status,
  items,
  busy,
  onQuote,
  onNotice,
}: {
  status: MediaStatus;
  items: GenItemRecord[];
  busy: boolean;
  /** Quote this request (kind 'shots'); the parent shows the confirm-before-spend dialog. */
  onQuote: (body: unknown, summary: string) => void;
  onNotice: (text: string, tone?: 'success' | 'error') => void;
}) {
  const [text, setText] = useState('');
  const [aspect, setAspect] = useState<'16:9' | '9:16'>('16:9');
  const [overrides, setOverrides] = useState<Record<string, TierId>>({});
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [showTiers, setShowTiers] = useState(false);

  useEffect(() => {
    setText(readLs(LS_TEXT, ''));
    setAspect(readLs(LS_ASPECT, '16:9'));
    setOverrides(readLs(LS_TIERS, {}));
  }, []);

  const shots = useMemo(() => parseShots(text), [text]);
  const models = useMemo(() => availableVideoModels(status), [status]);
  const tierOf = (s: Shot): TierId => overrides[s.id] ?? s.target;

  // Generated clips per shot, by tier (from the manifest's params.shotId / params.tier).
  const doneByShot = useMemo(() => {
    const m = new Map<string, Set<number>>();
    for (const it of items) {
      const sid = it.params?.shotId;
      if (typeof sid !== 'string') continue;
      const t = typeof it.params.tier === 'number' ? it.params.tier : -1;
      if (!m.has(sid)) m.set(sid, new Set());
      m.get(sid)!.add(t);
    }
    return m;
  }, [items]);

  // Keep the selection to shots that still exist.
  useEffect(() => {
    setSelected((prev) => {
      const ids = new Set(shots.map((s) => s.id));
      const next = new Set([...prev].filter((id) => ids.has(id)));
      return next.size === prev.size ? prev : next;
    });
  }, [shots]);

  const updateText = (v: string) => {
    setText(v);
    writeLs(LS_TEXT, v);
  };
  const updateAspect = (v: '16:9' | '9:16') => {
    setAspect(v);
    writeLs(LS_ASPECT, v);
  };
  const setTier = (id: string, t: TierId) => {
    setOverrides((prev) => {
      const next = { ...prev, [id]: t };
      writeLs(LS_TIERS, next);
      return next;
    });
  };
  const toggle = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const chosen = shots.filter((s) => selected.has(s.id));
  const scope = chosen.length ? chosen : shots;
  const scopeLabel = chosen.length ? `${chosen.length} selected` : `all ${shots.length}`;

  /** Build + validate a batch for `list` at `tierFor(shot)`; reports why it can't run instead of failing upstream. */
  function batch(list: Shot[], tierFor: (s: Shot) => TierId) {
    const plans = list.map((s) => ({ s, t: tierFor(s), p: planShot(s, tierFor(s), models, aspect) }));
    const bad = plans.find((x) => !x.p.item);
    const est = plans.reduce((a, x) => a + (x.p.estUsd ?? 0), 0);
    return { plans, bad, est };
  }
  function quote(list: Shot[], tierFor: (s: Shot) => TierId, what: string) {
    if (!list.length) return;
    if (list.length > MAX_BATCH) {
      onNotice(`${list.length} shots is over the ${MAX_BATCH}-per-request limit; select up to ${MAX_BATCH} and run them in batches.`, 'error');
      return;
    }
    const { plans, bad } = batch(list, tierFor);
    if (bad) {
      onNotice(`Shot ${bad.s.n}: ${bad.p.unavailable}.`, 'error');
      return;
    }
    onQuote(
      { kind: 'shots', aspect, items: plans.map((x) => x.p.item) },
      `${what}: ${plans.map((x) => `#${x.s.n} T${x.t}`).join(', ')}`,
    );
  }

  const draftAll = batch(scope, () => 0);
  const flowScope = scope.filter((s) => tierOf(s) > 0);
  const noVideo = !models.length;

  const copy = async (text: string, done: string) => {
    try {
      await navigator.clipboard.writeText(text);
      onNotice(done, 'success');
    } catch {
      onNotice('Clipboard is blocked here; select the shot text and copy it by hand.', 'error');
    }
  };
  const copyFlow = (s: Shot) => copy(flowPrompt(s, aspect, tierOf(s)), `Flow prompt for shot ${s.n} copied. Paste it into Google Flow.`);
  const copyAllFlow = () =>
    copy(
      flowPrompts(flowScope.map((s) => ({ shot: s, tier: tierOf(s) })), aspect),
      `${flowScope.length} Flow prompt${flowScope.length > 1 ? 's' : ''} copied, one block per shot.`,
    );

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-2 md:flex-row">
        <textarea
          value={text}
          onChange={(e) => updateText(e.target.value)}
          placeholder={`Paste a shot list or script, one shot per line (or per paragraph). e.g.\n${EXAMPLE}`}
          rows={5}
          maxLength={20000}
          className="min-h-[112px] flex-1 resize-y rounded-md border border-subtle bg-panel-elevated p-2.5 font-mono text-[12px] leading-relaxed text-paper outline-none placeholder:text-muted focus:border-orange"
        />
        <div className="flex shrink-0 flex-row flex-wrap items-start gap-2 md:w-[220px] md:flex-col">
          <select aria-label="Aspect ratio" value={aspect} onChange={(e) => updateAspect(e.target.value as '16:9' | '9:16')} className={selectCls}>
            <option value="16:9">16:9 widescreen</option>
            <option value="9:16">9:16 vertical</option>
          </select>
          <button type="button" className={ghostBtn} onClick={() => setShowTiers((v) => !v)} aria-expanded={showTiers}>
            <Layers className="h-3.5 w-3.5" /> {showTiers ? 'Hide' : 'Show'} hierarchy
          </button>
          {!text && (
            <button type="button" className={ghostBtn} onClick={() => updateText(EXAMPLE)}>
              Load example
            </button>
          )}
        </div>
      </div>

      {showTiers && (
        <div className="overflow-x-auto rounded-md border border-subtle">
          <table className="w-full min-w-[560px] text-left text-[11.5px]">
            <thead className="font-mono text-[10px] uppercase tracking-[0.05em] text-muted">
              <tr className="border-b border-subtle">
                <th className="px-2.5 py-1.5">Tier</th>
                <th className="px-2.5 py-1.5">For</th>
                <th className="px-2.5 py-1.5">Model</th>
                <th className="px-2.5 py-1.5 text-right">$/s</th>
              </tr>
            </thead>
            <tbody>
              {TIER_IDS.map((t) => {
                const spec = TIERS[t];
                const m = models.find((x) => x.id === spec.model);
                const perSec = m?.perSecondUsd[spec.resolution];
                return (
                  <tr key={t} className="border-b border-subtle/50 last:border-0">
                    <td className="px-2.5 py-1.5 font-mono text-paper">
                      {t} · {spec.name}
                    </td>
                    <td className="px-2.5 py-1.5 text-secondary">{spec.use}</td>
                    <td className="px-2.5 py-1.5 font-mono text-secondary">
                      {spec.flow ? 'Google Flow by hand' : `${spec.model} ${spec.resolution}`}
                      {spec.flow && <span className="text-muted"> (paid API fallback: {spec.model} {spec.resolution})</span>}
                      {!m && <span className="text-amber"> · API unavailable</span>}
                    </td>
                    <td className="px-2.5 py-1.5 text-right font-mono text-paper">
                      {spec.flow ? <span className="text-muted">plan{perSec !== undefined ? ` · API $${perSec.toFixed(2)}` : ''}</span> : perSec !== undefined ? `$${perSec.toFixed(2)}` : '-'}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <p className="border-t border-subtle px-2.5 py-1.5 font-mono text-[10px] text-muted">
            Draft every shot cheaply at tier 0 (API), then make the keepers in Google Flow from the copied prompt. API fallbacks are paid: Omni is quoted at its 10s maximum, every request is capped at $5.
          </p>
        </div>
      )}

      {noVideo && <p className="font-mono text-[11px] text-amber">No video models available: add XAI_API_KEY and/or GEMINI_API_KEY to ~/Volta-OS/.env.local.</p>}

      {shots.length > 0 && (
        <>
          <ul className="flex flex-col divide-y divide-subtle/60 rounded-md border border-subtle">
            {shots.map((s) => {
              const t = tierOf(s);
              const plan = planShot(s, t, models, aspect);
              const draft = planShot(s, 0, models, aspect);
              const done = doneByShot.get(s.id);
              return (
                <li key={s.id} className="flex flex-col gap-2 px-2.5 py-2 md:flex-row md:items-center">
                  <label className="flex min-w-0 flex-1 items-start gap-2">
                    <input type="checkbox" checked={selected.has(s.id)} onChange={() => toggle(s.id)} className="mt-1 h-4 w-4 shrink-0 accent-[#FF5500]" aria-label={`Select shot ${s.n}`} />
                    <span className="min-w-0">
                      <span className="line-clamp-2 text-[12.5px] leading-snug text-paper">
                        <span className="mr-1.5 font-mono text-muted">#{s.n}</span>
                        {s.text}
                      </span>
                      <span className="mt-0.5 flex flex-wrap items-center gap-1.5 font-mono text-[10px] text-muted">
                        <span>{overrides[s.id] !== undefined ? 'tier set by you' : s.reason}</span>
                        {done?.has(0) && <span className="rounded border border-green/40 px-1 text-green">draft ✓</span>}
                        {[...(done ?? [])]
                          .filter((x) => x > 0)
                          .map((x) => (
                            <span key={x} className="rounded border border-orange/50 px-1 text-orange">
                              T{x} ✓
                            </span>
                          ))}
                      </span>
                    </span>
                  </label>
                  <div className="flex shrink-0 flex-wrap items-center gap-1.5 pl-6 md:pl-0">
                    <select aria-label={`Tier for shot ${s.n}`} value={t} onChange={(e) => setTier(s.id, Number(e.target.value) as TierId)} className={selectCls}>
                      {TIER_IDS.map((x) => (
                        <option key={x} value={x}>
                          T{x} {TIERS[x].name}
                        </option>
                      ))}
                    </select>
                    <button type="button" className={ghostBtn} disabled={busy || !draft.item} title={draft.unavailable} onClick={() => quote([s], () => 0, `Draft shot ${s.n}`)}>
                      <Clapperboard className="h-3.5 w-3.5" /> Draft {draft.estUsd !== null ? fmtUsd(draft.estUsd) : ''}
                    </button>
                    {t > 0 && (
                      <>
                        <button type="button" className={cn(ghostBtn, 'border-orange/60 text-orange')} onClick={() => void copyFlow(s)}>
                          <ClipboardCopy className="h-3.5 w-3.5" /> Flow prompt
                        </button>
                        <button
                          type="button"
                          className={cn(ghostBtn, 'border-dashed text-muted')}
                          disabled={busy || !plan.item}
                          title={plan.unavailable ?? `Paid API fallback when Flow isn't an option: ${TIERS[t].model} ${TIERS[t].resolution}`}
                          onClick={() => quote([s], () => t, `Shot ${s.n} at T${t} via API`)}
                        >
                          API {plan.estUsd !== null ? fmtUsd(plan.estUsd) : 'n/a'}
                        </button>
                      </>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>

          <div className="flex flex-wrap items-center gap-2">
            <span className="font-mono text-[10.5px] uppercase tracking-[0.05em] text-muted">
              {shots.length} shot{shots.length > 1 ? 's' : ''} · acting on {scopeLabel}
            </span>
            {chosen.length > 0 && (
              <button type="button" className={ghostBtn} onClick={() => setSelected(new Set())}>
                Clear selection
              </button>
            )}
            <button type="button" className={cn(ghostBtn, 'ml-auto h-9 border-orange/60 text-orange')} disabled={!flowScope.length} onClick={() => void copyAllFlow()}>
              <ClipboardCopy className="h-3.5 w-3.5" /> Copy {flowScope.length} Flow prompt{flowScope.length === 1 ? '' : 's'}
            </button>
            <button
              type="button"
              className={primaryBtn}
              disabled={busy || noVideo || !!draftAll.bad || scope.length > MAX_BATCH}
              title={draftAll.bad?.p.unavailable}
              onClick={() => quote(scope, () => 0, `Draft ${scopeLabel}`)}
            >
              <Clapperboard className="h-3.5 w-3.5" /> Draft {scopeLabel} ~{fmtUsd(draftAll.est)}
            </button>
          </div>
          {scope.length > MAX_BATCH && (
            <p className="font-mono text-[10.5px] text-amber">
              Select up to {MAX_BATCH} shots per request (the $5 cap applies to each request).
            </p>
          )}
        </>
      )}
    </div>
  );
}
