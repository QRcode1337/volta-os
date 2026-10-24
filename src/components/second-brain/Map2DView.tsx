'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Loader2, Maximize2 } from 'lucide-react';
import { formatInt } from '@/lib/format';
import { cn } from '@/lib/cn';
import type { GraphModel } from './graph-model';
import { cachedForceLayout, circleLayout, forceLayout2D, hexLayout, ringsLayout, storeForceLayout, type Layout2D, type MapMode } from './graph-layout';
import { createMapEngine, type MapEngine } from './graph-map-engine';

const MODES: { id: MapMode; label: string }[] = [
  { id: 'force', label: 'Force' },
  { id: 'circle', label: 'Circle' },
  { id: 'hex', label: 'Hex' },
  { id: 'rings', label: 'Rings' },
];

interface MapProps {
  model: GraphModel;
  matches: Set<string> | null;
  selectedId: string | null;
  onSelect: (id: string) => void;
  /** Pixels covered by the inspector drawers on each side (0 when closed). */
  insetLeft?: number;
  insetRight?: number;
  /** Deep-link target to zoom to and centre once (a note in `model`); `onFocused` is called after it's handled. */
  focusId?: string | null;
  onFocused?: () => void;
}

/** A settled force layout tagged with the model it was computed for (never applied to another model). */
interface ForceResult {
  model: GraphModel;
  layout: Layout2D;
}

const folderName = (folder: string, vault: string) => (folder === '(root)' ? `${vault} root` : folder);

export function Map2DView({ model, matches, selectedId, onSelect, insetLeft = 0, insetRight = 0, focusId = null, onFocused }: MapProps) {
  const [mode, setMode] = useState<MapMode>('rings');
  const [hoverIdx, setHoverIdx] = useState(-1);
  const [zoomK, setZoomK] = useState(1);
  const [forceRes, setForceRes] = useState<ForceResult | null>(() => {
    const cached = cachedForceLayout(model);
    return cached ? { model, layout: cached } : null;
  });
  // Only a layout computed for THIS model counts (after a background graph refresh the old one is stale).
  const force = forceRes && forceRes.model === model ? forceRes.layout : null;
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const engineRef = useRef<MapEngine | null>(null);
  const onSelectRef = useRef(onSelect);
  onSelectRef.current = onSelect;
  const live = useRef({ matches, selectedId, mode, force, insetLeft, insetRight });
  live.current = { matches, selectedId, mode, force, insetLeft, insetRight };

  const rings = useMemo(() => ringsLayout(model), [model]);
  const circle = useMemo(() => circleLayout(model), [model]);
  const hex = useMemo(() => hexLayout(model), [model]);

  // Force layout runs in small chunks so the main thread stays responsive; cached per model for the session.
  useEffect(() => {
    if (cachedForceLayout(model)) {
      setForceRes((f) => (f && f.model === model ? f : { model, layout: cachedForceLayout(model)! }));
      return;
    }
    const job = forceLayout2D(model);
    let timer = 0;
    let cancelled = false;
    const run = () => {
      if (cancelled) return;
      if (job.step(6)) {
        const layout = job.result();
        storeForceLayout(model, layout);
        setForceRes({ model, layout });
      } else timer = window.setTimeout(run, 0);
    };
    timer = window.setTimeout(run, 150);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [model]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    let lastK = -1;
    const engine = createMapEngine(canvas, model, { rings, circle, hex, force: live.current.force }, live.current.mode, {
      onHover: setHoverIdx,
      onClick: (i) => onSelectRef.current(model.nodes[i].id),
      onZoom: (k) => {
        if (Math.abs(k - lastK) > 0.02) {
          lastK = k;
          setZoomK(k);
        }
      },
    });
    engine.setHighlight(live.current.matches, live.current.selectedId);
    engine.setInsets(live.current.insetLeft, live.current.insetRight);
    engineRef.current = engine;
    return () => {
      engine.destroy();
      engineRef.current = null;
    };
  }, [model, rings, circle, hex]);

  useEffect(() => {
    if (force) engineRef.current?.setForce(force);
  }, [force]);

  useEffect(() => {
    engineRef.current?.setInsets(insetLeft, insetRight);
  }, [insetLeft, insetRight]);

  useEffect(() => {
    engineRef.current?.setMode(mode);
  }, [mode]);

  useEffect(() => {
    engineRef.current?.setHighlight(matches, selectedId);
  }, [matches, selectedId]);

  // Deep link (?node=…): runs after the engine exists and has the selection + insets, so it centres in the gap.
  const onFocusedRef = useRef(onFocused);
  onFocusedRef.current = onFocused;
  useEffect(() => {
    if (!focusId || !engineRef.current) return;
    engineRef.current.focus(focusId);
    onFocusedRef.current?.();
  }, [focusId, model, rings, circle, hex]);

  const hovered = hoverIdx >= 0 ? model.nodes[hoverIdx] : null;
  const computingForce = mode === 'force' && !force;
  // With the inspector open the drawers cover the sides: the legend steps aside, FIT/zoom move to the free
  // strip above the right drawer and the readout centres in the visible gap.
  const inspecting = insetLeft > 0 || insetRight > 0;

  return (
    <div className="sb-grid-bg relative h-full w-full overflow-hidden">
      <canvas ref={canvasRef} className="absolute inset-0 block h-full w-full" style={{ touchAction: 'none' }} aria-label="2D map of linked notes" />

      {/* Sub-mode pills */}
      <div className="absolute left-4 top-4 z-10 flex items-center gap-1 rounded-full border border-subtle bg-panel/85 p-1 backdrop-blur">
        {MODES.map((m) => (
          <button
            key={m.id}
            type="button"
            onClick={() => setMode(m.id)}
            className={cn(
              'inline-flex h-7 items-center gap-1 rounded-full px-3 font-mono text-[10.5px] font-semibold tracking-wide transition-colors',
              mode === m.id ? 'bg-paper text-obsidian' : 'text-secondary hover:bg-panel-hover hover:text-paper',
            )}
          >
            {m.id === 'force' && !force && <Loader2 size={10} className="robo-spin" />}
            {m.label}
          </button>
        ))}
      </div>

      {computingForce && (
        <div className="pointer-events-none absolute left-1/2 top-4 z-10 -translate-x-1/2 rounded-full border border-subtle bg-panel/90 px-3 py-1 font-mono text-[10px] tracking-[0.12em] text-secondary backdrop-blur">
          <Loader2 size={10} className="robo-spin mr-1.5 inline" />
          SETTLING FORCE LAYOUT · {formatInt(model.edges.length)} LINKS
        </div>
      )}

      {/* Hover readout */}
      <div
        className="pointer-events-none absolute bottom-4 z-10 flex justify-center text-center"
        style={inspecting ? { left: insetLeft + 16, right: insetRight + 16 } : { left: '15%', right: '15%' }}
      >
        {hovered ? (
          <div className="max-w-full truncate rounded-full border border-subtle bg-panel/90 px-3 py-1 font-mono text-[11px] text-paper backdrop-blur">
            <span style={{ color: hovered.color }}>●</span> {hovered.label}
            <span className="ml-2 text-muted">
              {hovered.vault} / {folderName(hovered.folder, hovered.vault)} · {formatInt(hovered.degree)} links
            </span>
          </div>
        ) : (
          <div className="max-w-full truncate font-mono text-[9.5px] tracking-[0.16em] text-muted">
            {inspecting ? 'DRAG TO PAN · SCROLL TO ZOOM · CLICK A NOTE' : 'DRAG TO PAN · SCROLL TO ZOOM · ZOOM IN FOR MORE LABELS · CLICK A NOTE'}
          </div>
        )}
      </div>

      <div className={cn('absolute right-4 z-10 flex items-center gap-2', inspecting ? 'top-4' : 'bottom-4')}>
        <span className="rounded-full border border-subtle bg-panel/80 px-2.5 py-1 font-mono text-[10px] text-secondary">{zoomK.toFixed(2)}×</span>
        <button
          type="button"
          onClick={() => engineRef.current?.fit(true)}
          className="inline-flex h-7 items-center gap-1 rounded-full border border-subtle bg-panel-elevated px-2.5 font-mono text-[10px] font-semibold text-secondary hover:border-highlight hover:text-paper"
        >
          <Maximize2 size={11} /> FIT
        </button>
      </div>

      {/* Legend: vaults → top folders (by notes in view). Counts are whole-vault / whole-folder note totals, the same
          scope as the on-canvas labels; the in-view count is the footer line. */}
      <div
        className={cn(
          'pointer-events-none absolute right-4 top-4 z-10 hidden w-[200px] flex-col gap-1.5 rounded-lg border border-subtle bg-panel/80 p-2.5 backdrop-blur transition-opacity duration-200 md:flex',
          inspecting && 'opacity-0',
        )}
        aria-hidden={inspecting}
      >
        {model.vaults
          .filter((v) => v.shown > 0)
          .map((v) => (
            <div key={v.id}>
              <div className="flex items-center gap-2 font-mono text-[10px] text-paper">
                <span className="h-2 w-2 rounded-full" style={{ background: v.color, boxShadow: `0 0 6px ${v.color}` }} />
                <span className="flex-1 truncate font-semibold">{v.name}</span>
                <span className="text-muted">{formatInt(v.total)}</span>
              </div>
              {v.clusters.slice(0, 3).map((ci) => {
                const c = model.clusters[ci];
                return (
                  <div key={c.key} className="ml-4 flex items-center gap-1.5 font-mono text-[9px] text-secondary">
                    <span className="h-1.5 w-1.5 rounded-full" style={{ background: c.color }} />
                    <span className="flex-1 truncate">{folderName(c.folder, c.vault)}</span>
                    <span className="text-muted">{formatInt(c.total)}</span>
                  </div>
                );
              })}
              {v.clusters.length > 3 && <div className="ml-4 font-mono text-[8.5px] text-muted">+{v.clusters.length - 3} folders</div>}
            </div>
          ))}
        <div className="border-t border-subtle pt-1.5 font-mono text-[8.5px] leading-snug text-muted">
          {formatInt(model.nodes.length)} of {formatInt(model.totalNotes)} notes in view · most-linked first · counts = all notes · edges = wikilinks
        </div>
      </div>
    </div>
  );
}

export default Map2DView;
