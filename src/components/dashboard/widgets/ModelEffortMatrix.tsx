'use client';

import { Fragment, useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent, type RefObject } from 'react';
import { createPortal } from 'react-dom';
import { Check } from 'lucide-react';
import { EFFORT_LEVELS, MODEL_COLORS, MODEL_TIERS } from '@/lib/mock-data';
import type { EffortLevel, ModelTier } from '@/types/os';
import { cn } from '@/lib/cn';
import { useDismiss, useMounted } from './hooks';
import { RUN_EFFORT_MULT, RUN_RATE, runCostWeight } from './right-skills';

// Relative cost uses the same estimate tables as /api/skills/run (RATE × EFFORT_MULT), so the hint
// agrees with the Execution Report's cost figure. Display only — not measured spend.
const MAX_COST = runCostWeight('FABLE', 'MAX');
const RATE_NOTE = `Ratio of /api/skills/run estimate tables: $/MTok ${MODEL_TIERS.map((m) => `${m} ${RUN_RATE[m]}`).join(' · ')} × effort ${EFFORT_LEVELS.map((e) => `${e} ${RUN_EFFORT_MULT[e]}`).join(' · ')}. Jev may reroute the model; estimate, not measured spend.`;
const EFFORT_SHORT: Record<EffortLevel, string> = { LOW: 'LOW', MEDIUM: 'MED', HIGH: 'HIGH', XHIGH: 'XHI', MAX: 'MAX' };

interface ModelEffortMatrixProps {
  open: boolean;
  anchorRef: RefObject<HTMLElement | null>;
  command: string;
  model: ModelTier;
  effort: EffortLevel;
  onSelect: (model: ModelTier, effort: EffortLevel) => void;
  onClose: () => void;
}

/** Model × Effort routing grid, portaled + viewport-clamped next to its anchor. */
export function ModelEffortMatrix({ open, anchorRef, command, model, effort, onSelect, onClose }: ModelEffortMatrixProps) {
  const mounted = useMounted();
  const popRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const [hover, setHover] = useState<{ m: ModelTier; e: EffortLevel } | null>(null);
  useDismiss(open, onClose, [popRef, anchorRef]);

  // Keyboard: focus the selected cell once placed; on close, hand focus back to the anchor (gear) if it
  // was left nowhere (the popover unmounted under it). A pointer click elsewhere keeps its own focus.
  const focusedRef = useRef(false);
  useEffect(() => {
    if (!open) return;
    if (!pos || focusedRef.current) return;
    focusedRef.current = true;
    popRef.current?.querySelector<HTMLButtonElement>('button[aria-pressed="true"]')?.focus({ preventScroll: true });
  }, [open, pos]);
  const wasOpen = useRef(false);
  useEffect(() => {
    if (open) {
      wasOpen.current = true;
      return;
    }
    focusedRef.current = false;
    if (!wasOpen.current) return;
    wasOpen.current = false;
    const active = document.activeElement;
    if (!active || active === document.body) anchorRef.current?.focus({ preventScroll: true });
  }, [open, anchorRef]);

  useLayoutEffect(() => {
    if (!open || !mounted) {
      setPos(null);
      return;
    }
    const place = () => {
      const a = anchorRef.current?.getBoundingClientRect();
      const p = popRef.current;
      if (!a || !p) return;
      const w = p.offsetWidth;
      const h = p.offsetHeight;
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      let left = a.right - w;
      left = Math.max(8, Math.min(left, vw - w - 8));
      let top = a.bottom + 6;
      if (top + h > vh - 8) top = a.top - h - 6;
      top = Math.max(8, Math.min(top, vh - h - 8));
      setPos({ top, left });
    };
    place();
    window.addEventListener('resize', place);
    window.addEventListener('scroll', place, true);
    return () => {
      window.removeEventListener('resize', place);
      window.removeEventListener('scroll', place, true);
    };
  }, [open, mounted, anchorRef]);

  if (!mounted || !open) return null;

  const preview = hover ?? { m: model, e: effort };
  const mult = runCostWeight(preview.m, preview.e) / runCostWeight(model, effort);

  // Arrow keys move across the 4×5 grid (roving tabindex); Tab / Shift+Tab close and return to the gear.
  const onGridKey = (ev: KeyboardEvent<HTMLDivElement>) => {
    if (ev.key === 'Tab') {
      ev.preventDefault();
      onClose();
      return;
    }
    const el = ev.target as HTMLElement;
    const mi = Number(el.dataset.mi);
    const ei = Number(el.dataset.ei);
    if (Number.isNaN(mi) || Number.isNaN(ei)) return;
    let nm = mi;
    let ne = ei;
    if (ev.key === 'ArrowRight') ne = Math.min(EFFORT_LEVELS.length - 1, ei + 1);
    else if (ev.key === 'ArrowLeft') ne = Math.max(0, ei - 1);
    else if (ev.key === 'ArrowDown') nm = Math.min(MODEL_TIERS.length - 1, mi + 1);
    else if (ev.key === 'ArrowUp') nm = Math.max(0, mi - 1);
    else if (ev.key === 'Home') ne = 0;
    else if (ev.key === 'End') ne = EFFORT_LEVELS.length - 1;
    else return;
    ev.preventDefault();
    popRef.current?.querySelector<HTMLButtonElement>(`button[data-mi="${nm}"][data-ei="${ne}"]`)?.focus();
  };

  return createPortal(
    <div
      ref={popRef}
      role="dialog"
      aria-label={`Model and effort routing for ${command}`}
      className="hud-card fixed z-[70] w-[300px] border-highlight p-3 shadow-[0_18px_60px_-12px_rgba(0,0,0,0.9),0_0_0_1px_rgba(255,85,0,0.06)]"
      style={pos ? { top: pos.top, left: pos.left } : { top: -9999, left: -9999, visibility: 'hidden' }}
    >
      <div className="mb-2.5 flex items-center justify-between">
        <span className="hud-label shrink-0 text-[10px]">ROUTING PREF · MODEL × EFFORT</span>
        <span className="ml-2 min-w-0 truncate font-mono text-[10px] font-semibold text-orange" title={command}>
          {command}
        </span>
      </div>

      <div
        role="group"
        aria-label="Model rows × effort columns · arrow keys to move, Enter to choose, Esc or Tab to close"
        className="grid grid-cols-[54px_repeat(5,1fr)] gap-1"
        onMouseLeave={() => setHover(null)}
        onKeyDown={onGridKey}
      >
        <span />
        {EFFORT_LEVELS.map((e) => (
          <span
            key={e}
            className={cn(
              'text-center font-mono text-[8.5px] font-semibold tracking-[0.06em] transition-colors',
              preview.e === e ? 'text-paper' : 'text-muted',
            )}
          >
            {EFFORT_SHORT[e]}
          </span>
        ))}
        {MODEL_TIERS.map((m, mi) => {
          const color = MODEL_COLORS[m];
          return (
            <Fragment key={m}>
              <span
                className="flex items-center gap-1 font-mono text-[9.5px] font-semibold tracking-[0.06em]"
                style={{ color: preview.m === m ? color : `${color}AA` }}
              >
                <span className="h-1.5 w-1.5 rounded-full" style={{ background: color }} />
                {m}
              </span>
              {EFFORT_LEVELS.map((e, ei) => {
                const selected = m === model && e === effort;
                const intensity = runCostWeight(m, e) / MAX_COST;
                return (
                  <button
                    key={e}
                    type="button"
                    aria-label={`${m} · ${e}`}
                    aria-pressed={selected}
                    tabIndex={selected ? 0 : -1}
                    data-mi={mi}
                    data-ei={ei}
                    onMouseEnter={() => setHover({ m, e })}
                    onFocus={() => setHover({ m, e })}
                    onClick={() => onSelect(m, e)}
                    className={cn(
                      'group relative flex h-7 items-center justify-center rounded-md border outline-none transition-all duration-150 focus-visible:ring-2 focus-visible:ring-orange/60',
                      selected ? 'scale-[1.04]' : 'border-subtle bg-obsidian hover:border-highlight hover:bg-panel-hover',
                    )}
                    style={
                      selected
                        ? { background: `${color}26`, borderColor: color, boxShadow: `0 0 0 1px ${color}55, 0 0 14px ${color}40` }
                        : undefined
                    }
                  >
                    {selected ? (
                      <Check size={12} strokeWidth={3} style={{ color }} />
                    ) : (
                      <span
                        className="rounded-full transition-transform group-hover:scale-125"
                        style={{
                          width: 3 + intensity * 7,
                          height: 3 + intensity * 7,
                          background: color,
                          opacity: 0.25 + intensity * 0.6,
                        }}
                      />
                    )}
                  </button>
                );
              })}
            </Fragment>
          );
        })}
      </div>

      <div className="mt-3 flex items-center justify-between border-t border-subtle pt-2 font-mono text-[9.5px] tracking-[0.04em]">
        <span className="text-secondary">
          <span style={{ color: MODEL_COLORS[preview.m] }}>{preview.m}</span> · {preview.e}
        </span>
        <span
          className={cn(mult > 1.01 ? 'text-amber' : mult < 0.99 ? 'text-green' : 'text-muted')}
          title={RATE_NOTE}
        >
          {hover && !(hover.m === model && hover.e === effort) ? `≈ ${mult < 1 ? mult.toFixed(2) : mult.toFixed(1)}× est. cost` : 'CURRENT'}
        </span>
      </div>
    </div>,
    document.body,
  );
}
