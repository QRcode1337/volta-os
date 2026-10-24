'use client';
import { useState } from 'react';
import type { KeyboardEvent } from 'react';

const MODELS = ['HAIKU', 'SONNET', 'OPUS', 'FABLE'] as const;
const EFFORTS = ['LOW', 'MEDIUM', 'HIGH', 'XHIGH', 'MAX'] as const;
export type RouteModel = (typeof MODELS)[number];
export type RouteEffort = (typeof EFFORTS)[number];
export interface Route {
  model: RouteModel;
  effort: RouteEffort;
}

const COLOR: Record<RouteModel, string> = { HAIKU: '#22C55E', SONNET: '#14B8A6', OPUS: '#A855F7', FABLE: '#F5A623' };
const BASE_USD: Record<RouteModel, number> = { HAIKU: 0.004, SONNET: 0.018, OPUS: 0.09, FABLE: 0.032 };
const BASE_SEC: Record<RouteModel, number> = { HAIKU: 1.2, SONNET: 3.4, OPUS: 7.8, FABLE: 4.6 };
const EFFORT_X: Record<RouteEffort, number> = { LOW: 0.6, MEDIUM: 1, HIGH: 1.8, XHIGH: 3, MAX: 5 };
const MONO = '"JetBrains Mono", monospace';

/** Illustrative per-run estimate: model base × effort multiplier. */
export function estimateRoute({ model, effort }: Route) {
  return { usd: BASE_USD[model] * EFFORT_X[effort], sec: BASE_SEC[model] * Math.pow(EFFORT_X[effort], 0.8) };
}

const usd = (n: number) => `$${n.toFixed(n < 0.01 ? 4 : 3)}`;

/** 4 models × 5 effort levels. Click a cell or use arrow keys; hover shows a row/column crosshair. */
export function RoutingMatrix({ defaultValue = { model: 'SONNET', effort: 'HIGH' }, onChange }: { defaultValue?: Route; onChange?: (r: Route) => void }) {
  const [sel, setSel] = useState<Route>(defaultValue);
  const [hover, setHover] = useState<Route | null>(null);
  const pick = (r: Route) => {
    setSel(r);
    onChange?.(r);
  };

  const onKey = (e: KeyboardEvent<HTMLDivElement>) => {
    const mi = MODELS.indexOf(sel.model);
    const ei = EFFORTS.indexOf(sel.effort);
    const moves: Record<string, [number, number]> = { ArrowUp: [-1, 0], ArrowDown: [1, 0], ArrowLeft: [0, -1], ArrowRight: [0, 1] };
    const m = moves[e.key];
    if (!m) return;
    e.preventDefault();
    const nm = MODELS[Math.min(MODELS.length - 1, Math.max(0, mi + m[0]))];
    const ne = EFFORTS[Math.min(EFFORTS.length - 1, Math.max(0, ei + m[1]))];
    pick({ model: nm, effort: ne });
  };

  const est = estimateRoute(sel);
  const c = COLOR[sel.model];

  return (
    <div style={{ display: 'grid', gap: 14 }}>
      <div
        role="grid"
        aria-label="Model by effort routing matrix"
        tabIndex={0}
        onKeyDown={onKey}
        onMouseLeave={() => setHover(null)}
        style={{ display: 'grid', gridTemplateColumns: '84px repeat(5, minmax(0, 1fr))', gap: 4, outline: 'none' }}
      >
        <span />
        {EFFORTS.map((e) => (
          <span
            key={e}
            style={{ textAlign: 'center', padding: '4px 0', font: `600 9.5px/1 ${MONO}`, letterSpacing: '0.08em', color: hover?.effort === e || sel.effort === e ? '#F5F2EB' : '#6E6A61' }}
          >
            {e}
          </span>
        ))}
        {MODELS.map((m) => (
          <div key={m} role="row" style={{ display: 'contents' }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: 6, font: `600 10px/1 ${MONO}`, letterSpacing: '0.06em', color: hover?.model === m || sel.model === m ? '#F5F2EB' : '#A39E93' }}>
              <span style={{ width: 7, height: 7, borderRadius: 999, background: COLOR[m] }} />
              {m}
            </span>
            {EFFORTS.map((e) => {
              const active = sel.model === m && sel.effort === e;
              const cross = !!hover && (hover.model === m || hover.effort === e);
              return (
                <button
                  key={e}
                  type="button"
                  role="gridcell"
                  aria-selected={active}
                  onClick={() => pick({ model: m, effort: e })}
                  onMouseEnter={() => setHover({ model: m, effort: e })}
                  style={{
                    height: 38,
                    borderRadius: 6,
                    cursor: 'pointer',
                    border: `1px solid ${active ? COLOR[m] : cross ? '#3A3834' : '#262522'}`,
                    background: active ? `${COLOR[m]}2E` : cross ? '#24221F' : '#1C1B19',
                    boxShadow: active ? `0 0 16px ${COLOR[m]}55` : 'none',
                    color: active ? '#F5F2EB' : '#6E6A61',
                    font: `600 10px/1 ${MONO}`,
                    transition: 'all 150ms',
                  }}
                >
                  {usd(estimateRoute({ model: m, effort: e }).usd)}
                </button>
              );
            })}
          </div>
        ))}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '10px 12px', borderRadius: 8, border: '1px solid #262522', background: '#0A0A0A' }}>
        <span
          style={{ display: 'inline-flex', alignItems: 'center', gap: 6, height: 24, padding: '0 10px', borderRadius: 999, border: `1px solid ${c}55`, background: `${c}14`, color: c, font: `600 10px/1 ${MONO}`, letterSpacing: '0.06em' }}
        >
          <span style={{ width: 6, height: 6, borderRadius: 999, background: c }} />
          {sel.model} · {sel.effort}
        </span>
        <span style={{ font: '700 22px/1 Doto, monospace', color: '#F5F2EB' }}>{usd(est.usd)}</span>
        <span style={{ font: `500 10px/1 ${MONO}`, color: '#6E6A61' }}>/ run · ~{est.sec.toFixed(1)}s</span>
      </div>
    </div>
  );
}
