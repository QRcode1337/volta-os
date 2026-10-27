'use client';
// VOLTA Editor — Edit mode inspector controls: scrubbable number field, slider, colour field, segmented control,
// toggle and collapsible section. Values are in display units; callers convert to model units.

import { ChevronDown, ChevronRight, RotateCcw } from 'lucide-react';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { cn } from '@/lib/cn';

const clampN = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));
const roundTo = (n: number, step: number) => {
  const dec = Math.max(0, (String(step).split('.')[1] ?? '').length);
  return Number((Math.round(n / step) * step).toFixed(dec));
};

export const INPUT =
  'h-6 w-full min-w-0 rounded border border-subtle bg-obsidian px-1.5 font-mono text-[10.5px] text-paper outline-none focus:border-orange/60 disabled:opacity-40';
export const BTN =
  'inline-flex h-6 items-center justify-center gap-1 rounded border border-subtle px-2 font-mono text-[10px] text-secondary hover:border-highlight hover:text-paper disabled:pointer-events-none disabled:opacity-40';
export const LABEL = 'font-mono text-[9.5px] font-semibold uppercase tracking-wide text-muted';

// ───────────────────────── ScrubNumber ─────────────────────────

export interface ScrubNumberProps {
  label: ReactNode;
  value: number;
  onChange: (v: number) => void;
  min?: number;
  max?: number;
  /** Increment per arrow key / per scrub pixel unit. Shift = ×10. */
  step?: number;
  /** Pixels of drag per step (default 2). */
  pxPerStep?: number;
  suffix?: string;
  /** Allow dragging on the label (default true). */
  scrub?: boolean;
  disabled?: boolean;
  title?: string;
  className?: string;
  /** Render the label above the field instead of beside it. */
  stacked?: boolean;
}

/** Number field: drag the label horizontally to scrub, type to edit, ↑/↓ ±step (⇧ ×10), Esc reverts. */
export function ScrubNumber({ label, value, onChange, min = -Infinity, max = Infinity, step = 1, pxPerStep = 2, suffix, scrub = true, disabled, title, className, stacked }: ScrubNumberProps) {
  const [draft, setDraft] = useState<string | null>(null);
  const drag = useRef<{ x: number; v: number; moved: boolean } | null>(null);
  const shown = draft ?? fmtNum(value, step);

  const emit = (v: number) => {
    const n = clampN(roundTo(v, step), min, max);
    if (Number.isFinite(n) && n !== value) onChange(n);
  };

  const commitDraft = () => {
    if (draft == null) return;
    const n = parseFloat(draft.replace(',', '.'));
    setDraft(null);
    if (Number.isFinite(n)) emit(n);
  };

  return (
    <div className={cn(stacked ? 'flex flex-col gap-0.5' : 'flex items-center gap-1.5', 'min-w-0', className)} title={title}>
      <span
        className={cn(LABEL, 'shrink-0 select-none', scrub && !disabled && 'cursor-ew-resize hover:text-orange', !stacked && 'w-[62px] truncate')}
        onPointerDown={(e) => {
          if (!scrub || disabled || e.button !== 0) return;
          e.preventDefault();
          (e.target as HTMLElement).setPointerCapture(e.pointerId);
          drag.current = { x: e.clientX, v: value, moved: false };
        }}
        onPointerMove={(e) => {
          const d = drag.current;
          if (!d) return;
          const dx = e.clientX - d.x;
          if (!d.moved && Math.abs(dx) < 2) return;
          d.moved = true;
          emit(d.v + Math.round(dx / pxPerStep) * step * (e.shiftKey ? 10 : 1));
        }}
        onPointerUp={(e) => {
          if (drag.current) (e.target as HTMLElement).releasePointerCapture(e.pointerId);
          drag.current = null;
        }}
        onPointerCancel={() => (drag.current = null)}
      >
        {label}
      </span>
      <span className="relative flex min-w-0 flex-1 items-center">
        <input
          type="text"
          inputMode="decimal"
          aria-label={typeof label === 'string' ? label : undefined}
          disabled={disabled}
          value={shown}
          onFocus={(e) => {
            setDraft(fmtNum(value, step));
            e.target.select();
          }}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commitDraft}
          onKeyDown={(e) => {
            e.stopPropagation(); // keep editor shortcuts (space, arrows, delete) out of the field
            if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
            else if (e.key === 'Escape') {
              setDraft(null);
              (e.target as HTMLInputElement).blur();
            } else if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
              e.preventDefault();
              const base = draft != null && Number.isFinite(parseFloat(draft)) ? parseFloat(draft) : value;
              const n = clampN(roundTo(base + (e.key === 'ArrowUp' ? 1 : -1) * step * (e.shiftKey ? 10 : 1), step), min, max);
              setDraft(fmtNum(n, step));
              if (n !== value) onChange(n);
            }
          }}
          className={cn(INPUT, suffix && 'pr-5')}
        />
        {suffix && <span className="pointer-events-none absolute right-1.5 font-mono text-[9px] text-muted">{suffix}</span>}
      </span>
    </div>
  );
}

function fmtNum(v: number, step: number): string {
  if (!Number.isFinite(v)) return '';
  const dec = Math.min(3, (String(step).split('.')[1] ?? '').length);
  return Number(v.toFixed(dec)).toString();
}

// ───────────────────────── Slider ─────────────────────────

export interface SliderProps {
  label: ReactNode;
  value: number;
  min: number;
  max: number;
  step?: number;
  /** Double-click the label or the track to reset to this. */
  defaultValue?: number;
  onChange: (v: number) => void;
  format?: (v: number) => string;
  /** Logarithmic mapping (min must be > 0). */
  log?: boolean;
  /** Only call onChange when the drag ends (for actions that cannot coalesce into one undo step). */
  commitOnRelease?: boolean;
  disabled?: boolean;
  title?: string;
}

export function Slider({ label, value, min, max, step = 0.01, defaultValue, onChange, format, log, commitOnRelease, disabled, title }: SliderProps) {
  const [draft, setDraft] = useState<number | null>(null);
  const v = draft ?? value;
  const toPos = (x: number) => (log ? Math.log(x / min) / Math.log(max / min) : (x - min) / (max - min));
  const fromPos = (p: number) => (log ? min * Math.pow(max / min, p) : min + p * (max - min));
  const RES = 1000;
  const pos = clampN(toPos(v), 0, 1) * RES;
  const pending = useRef<number | null>(null);

  const set = (x: number) => {
    const n = clampN(roundTo(x, step), min, max);
    if (commitOnRelease) {
      pending.current = n;
      setDraft(n);
    } else if (n !== value) onChange(n);
  };
  const release = () => {
    if (!commitOnRelease) return;
    const n = pending.current;
    pending.current = null;
    setDraft(null);
    if (n != null && n !== value) onChange(n);
  };
  const reset = () => {
    if (defaultValue == null || disabled) return;
    setDraft(null);
    pending.current = null;
    if (defaultValue !== value) onChange(defaultValue);
  };
  const isDefault = defaultValue != null && Math.abs(value - defaultValue) < 1e-9;

  return (
    <div className={cn('min-w-0', disabled && 'opacity-40')} title={title}>
      <div className="mb-0.5 flex items-center gap-1">
        <span className={cn(LABEL, defaultValue != null && 'cursor-pointer')} onDoubleClick={reset} title={defaultValue != null ? 'Double-click to reset' : undefined}>
          {label}
        </span>
        <span className="ml-auto font-mono text-[10px] tabular-nums text-paper">{format ? format(v) : fmtNum(v, step)}</span>
        {defaultValue != null && !isDefault && (
          <button type="button" onClick={reset} disabled={disabled} className="rounded p-0.5 text-muted hover:text-orange" title="Reset" aria-label={`Reset ${typeof label === 'string' ? label : ''}`}>
            <RotateCcw size={9} />
          </button>
        )}
      </div>
      <input
        type="range"
        min={0}
        max={RES}
        step={1}
        value={pos}
        disabled={disabled}
        onChange={(e) => set(fromPos(Number(e.target.value) / RES))}
        onPointerUp={release}
        onKeyUp={(e) => {
          e.stopPropagation();
          release();
        }}
        onKeyDown={(e) => e.stopPropagation()}
        onBlur={release}
        onDoubleClick={reset}
        className="h-3 w-full cursor-pointer accent-[#FF5500]"
      />
    </div>
  );
}

// ───────────────────────── ColorField ─────────────────────────

const HEX = /^#?([0-9a-f]{6})([0-9a-f]{2})?$/i;
const SHORT_HEX = /^#?([0-9a-f])([0-9a-f])([0-9a-f])$/i;

/** Normalise "#abc", "abc", "#aabbcc", "#aabbccdd" → "#AABBCC[DD]"; null when invalid. */
export function normHex(s: string, allowAlpha = false): string | null {
  const t = s.trim();
  const short = SHORT_HEX.exec(t);
  if (short) return `#${short[1]}${short[1]}${short[2]}${short[2]}${short[3]}${short[3]}`.toUpperCase();
  const m = HEX.exec(t);
  if (!m) return null;
  return `#${m[1]}${allowAlpha && m[2] ? m[2] : ''}`.toUpperCase();
}

export function ColorField({ label, value, onChange, allowAlpha, disabled }: { label?: ReactNode; value: string; onChange: (v: string) => void; allowAlpha?: boolean; disabled?: boolean }) {
  const [draft, setDraft] = useState<string | null>(null);
  const m = HEX.exec(value);
  const rgb = m ? `#${m[1]}` : '#000000';
  const alpha = allowAlpha && m?.[2] ? m[2] : '';
  return (
    <div className={cn('flex min-w-0 items-center gap-1.5', disabled && 'pointer-events-none opacity-40')}>
      {label != null && <span className={cn(LABEL, 'w-[62px] shrink-0 truncate')}>{label}</span>}
      <span className="relative h-6 w-7 shrink-0 overflow-hidden rounded border border-subtle" style={{ background: value }}>
        <input
          type="color"
          value={rgb.toLowerCase()}
          disabled={disabled}
          onChange={(e) => onChange(`${e.target.value}${alpha}`.toUpperCase())}
          className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
          aria-label={typeof label === 'string' ? `${label} colour` : 'Colour'}
        />
      </span>
      <input
        type="text"
        value={draft ?? value}
        disabled={disabled}
        spellCheck={false}
        onFocus={(e) => {
          setDraft(value);
          e.target.select();
        }}
        onChange={(e) => {
          setDraft(e.target.value);
          const n = normHex(e.target.value, allowAlpha);
          if (n && n !== value) onChange(n);
        }}
        onBlur={() => setDraft(null)}
        onKeyDown={(e) => {
          e.stopPropagation();
          if (e.key === 'Enter' || e.key === 'Escape') (e.target as HTMLInputElement).blur();
        }}
        className={cn(INPUT, 'uppercase')}
        title={allowAlpha ? 'Hex colour, optional alpha: #RRGGBB or #RRGGBBAA' : 'Hex colour #RRGGBB'}
      />
    </div>
  );
}

// ───────────────────────── Segmented ─────────────────────────

export interface SegOption<T> {
  value: T;
  label: ReactNode;
  title?: string;
}

export function Segmented<T extends string | number | boolean>({ value, options, onChange, disabled, className, ariaLabel }: { value: T; options: SegOption<T>[]; onChange: (v: T) => void; disabled?: boolean; className?: string; ariaLabel?: string }) {
  return (
    <div role="radiogroup" aria-label={ariaLabel} className={cn('flex h-6 min-w-0 rounded border border-subtle bg-obsidian p-0.5', disabled && 'pointer-events-none opacity-40', className)}>
      {options.map((o) => (
        <button
          key={String(o.value)}
          type="button"
          role="radio"
          aria-checked={o.value === value}
          title={o.title}
          onClick={() => o.value !== value && onChange(o.value)}
          className={cn(
            'flex min-w-0 flex-1 items-center justify-center gap-1 truncate rounded-[3px] px-1.5 font-mono text-[10px]',
            o.value === value ? 'bg-orange/15 font-semibold text-orange' : 'text-secondary hover:text-paper',
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

// ───────────────────────── Toggle ─────────────────────────

export function Toggle({ checked, onChange, label, disabled, title }: { checked: boolean; onChange: (v: boolean) => void; label?: ReactNode; disabled?: boolean; title?: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      title={title}
      onClick={() => onChange(!checked)}
      className="flex min-w-0 items-center gap-1.5 text-left disabled:opacity-40"
    >
      <span className={cn('relative h-3.5 w-6 shrink-0 rounded-full border transition-colors', checked ? 'border-orange bg-orange/80' : 'border-highlight bg-obsidian')}>
        <span className={cn('absolute top-[1px] h-2.5 w-2.5 rounded-full bg-paper transition-[left]', checked ? 'left-[11px]' : 'left-[1px]')} />
      </span>
      {label != null && <span className="truncate font-mono text-[10px] text-secondary">{label}</span>}
    </button>
  );
}

// ───────────────────────── Section ─────────────────────────

export function Section({ title, children, defaultOpen = true, right, className }: { title: ReactNode; children: ReactNode; defaultOpen?: boolean; right?: ReactNode; className?: string }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <section className={cn('border-b border-subtle', className)}>
      <div className="flex h-8 items-center gap-1 px-3">
        <button type="button" onClick={() => setOpen((o) => !o)} className="flex min-w-0 flex-1 items-center gap-1 text-left">
          {open ? <ChevronDown size={11} className="shrink-0 text-muted" /> : <ChevronRight size={11} className="shrink-0 text-muted" />}
          <span className="hud-label truncate !text-[10px]">{title}</span>
        </button>
        {right}
      </div>
      {open && <div className="space-y-2 px-3 pb-3">{children}</div>}
    </section>
  );
}

/** Text input that commits on blur / Enter (one undo step per edit). */
export function CommitText({ value, onCommit, className, placeholder, multiline, rows = 3, ariaLabel }: { value: string; onCommit: (v: string) => void; className?: string; placeholder?: string; multiline?: boolean; rows?: number; ariaLabel?: string }) {
  const [draft, setDraft] = useState(value);
  useEffect(() => setDraft(value), [value]);
  const commit = () => {
    if (draft !== value) onCommit(draft);
  };
  if (multiline)
    return (
      <textarea
        aria-label={ariaLabel}
        value={draft}
        rows={rows}
        placeholder={placeholder}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          e.stopPropagation();
          if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) (e.target as HTMLTextAreaElement).blur();
          if (e.key === 'Escape') {
            setDraft(value);
            (e.target as HTMLTextAreaElement).blur();
          }
        }}
        className={cn('w-full resize-y rounded border border-subtle bg-obsidian px-2 py-1.5 text-[12px] text-paper outline-none focus:border-orange/60', className)}
      />
    );
  return (
    <input
      aria-label={ariaLabel}
      type="text"
      value={draft}
      placeholder={placeholder}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        e.stopPropagation();
        if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
        if (e.key === 'Escape') {
          setDraft(value);
          (e.target as HTMLInputElement).blur();
        }
      }}
      className={cn(INPUT, className)}
    />
  );
}
