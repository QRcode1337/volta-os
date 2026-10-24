'use client';

import { useEffect, useRef } from 'react';
import { RotateCcw } from 'lucide-react';
import { OS_EVENTS } from '@/lib/events';
import { cn } from '@/lib/cn';

export interface OrbitalSettingsValue {
  rotationSpeed: number; // multiplier, 0–3
  reduceMotion: boolean;
  ringRadius: number; // 225–265
}

export const ORBITAL_DEFAULTS: OrbitalSettingsValue = { rotationSpeed: 1, reduceMotion: false, ringRadius: 235 };
export const RING_RADIUS_RANGE = { min: 225, max: 265, step: 5 } as const;
const STORAGE_KEY = 'rubric.orbital.settings.v1';

export function loadOrbitalSettings(prefersReduced: boolean): OrbitalSettingsValue {
  const base = { ...ORBITAL_DEFAULTS, reduceMotion: prefersReduced };
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return base;
    const p = JSON.parse(raw) as Partial<OrbitalSettingsValue>;
    return {
      rotationSpeed: typeof p.rotationSpeed === 'number' ? Math.min(3, Math.max(0, p.rotationSpeed)) : base.rotationSpeed,
      reduceMotion: typeof p.reduceMotion === 'boolean' ? p.reduceMotion : base.reduceMotion,
      ringRadius:
        typeof p.ringRadius === 'number' ? Math.min(RING_RADIUS_RANGE.max, Math.max(RING_RADIUS_RANGE.min, p.ringRadius)) : base.ringRadius,
    };
  } catch {
    return base;
  }
}

export function saveOrbitalSettings(v: OrbitalSettingsValue): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(v));
  } catch {
    /* storage unavailable (private mode) — settings stay session-only */
  }
}

interface Props {
  value: OrbitalSettingsValue;
  onChange: (v: OrbitalSettingsValue) => void;
  onClose: () => void;
  className?: string;
}

function Row({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-baseline justify-between">
        <span className="hud-label !text-[10px]">{label}</span>
        {hint && <span className="font-mono text-[10px] text-orange">{hint}</span>}
      </div>
      {children}
    </div>
  );
}

/** OS Settings popover for the orbital core. Closes on outside click and OS_EVENTS.escape. */
export function OrbitalSettings({ value, onChange, onClose, className }: Props) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onDown = (e: PointerEvent) => {
      const t = e.target as Node;
      if (ref.current?.contains(t)) return;
      if ((t as HTMLElement).closest?.('[data-orbital-settings-trigger]')) return;
      onClose();
    };
    window.addEventListener('pointerdown', onDown);
    window.addEventListener(OS_EVENTS.escape, onClose);
    return () => {
      window.removeEventListener('pointerdown', onDown);
      window.removeEventListener(OS_EVENTS.escape, onClose);
    };
  }, [onClose]);

  const set = (patch: Partial<OrbitalSettingsValue>) => onChange({ ...value, ...patch });

  return (
    <div
      ref={ref}
      role="dialog"
      aria-label="OS Settings"
      className={cn(
        'orbital-settings w-[248px] rounded-xl border border-highlight bg-panel-elevated/95 p-3.5 shadow-[0_20px_60px_rgba(0,0,0,0.6)] backdrop-blur-md',
        className,
      )}
    >
      <div className="mb-3 flex items-center justify-between">
        <span className="font-mono text-[11px] font-semibold uppercase tracking-[0.12em] text-paper">OS Settings</span>
        <button
          type="button"
          onClick={() => onChange({ ...ORBITAL_DEFAULTS, reduceMotion: value.reduceMotion })}
          className="flex items-center gap-1 font-mono text-[9px] uppercase tracking-[0.1em] text-muted hover:text-paper"
        >
          <RotateCcw size={10} /> Reset
        </button>
      </div>
      <div className="flex flex-col gap-3.5">
        <Row label="Sphere rotation" hint={value.rotationSpeed === 0 ? 'PAUSED' : `${value.rotationSpeed.toFixed(1)}×`}>
          <input
            type="range"
            min={0}
            max={3}
            step={0.1}
            value={value.rotationSpeed}
            disabled={value.reduceMotion}
            onChange={(e) => set({ rotationSpeed: Number(e.target.value) })}
            className="orbital-range w-full disabled:opacity-40"
            aria-label="Sphere rotation speed"
          />
        </Row>
        <Row label="Ring radius" hint={`${value.ringRadius}px`}>
          <input
            type="range"
            min={RING_RADIUS_RANGE.min}
            max={RING_RADIUS_RANGE.max}
            step={RING_RADIUS_RANGE.step}
            value={value.ringRadius}
            onChange={(e) => set({ ringRadius: Number(e.target.value) })}
            className="orbital-range w-full"
            aria-label="Note ring radius"
          />
        </Row>
        <label className="flex cursor-pointer items-center justify-between">
          <span className="hud-label !text-[10px]">Reduce motion</span>
          <button
            type="button"
            role="switch"
            aria-checked={value.reduceMotion}
            onClick={() => set({ reduceMotion: !value.reduceMotion })}
            className={cn('relative h-5 w-9 rounded-full border transition-colors', value.reduceMotion ? 'border-orange bg-orange/25' : 'border-highlight bg-obsidian')}
          >
            <span className={cn('absolute top-1/2 h-3.5 w-3.5 -translate-y-1/2 rounded-full transition-all', value.reduceMotion ? 'left-[18px] bg-orange' : 'left-[2px] bg-secondary')} />
          </button>
        </label>
      </div>
      <style>{`
        @keyframes orbital-settings-in { from { opacity: 0; transform: translateY(-6px) scale(0.98); } }
        .orbital-settings { animation: orbital-settings-in 180ms cubic-bezier(.2,.8,.2,1) both; transform-origin: top center; }
        .orbital-range { -webkit-appearance: none; appearance: none; height: 4px; border-radius: 9999px; background: #262522; outline: none; }
        .orbital-range::-webkit-slider-thumb { -webkit-appearance: none; width: 14px; height: 14px; border-radius: 9999px; background: #FF5500; border: 2px solid #0A0A0A; box-shadow: 0 0 10px rgba(255,85,0,0.5); cursor: pointer; }
        .orbital-range::-moz-range-thumb { width: 12px; height: 12px; border-radius: 9999px; background: #FF5500; border: 2px solid #0A0A0A; cursor: pointer; }
      `}</style>
    </div>
  );
}
