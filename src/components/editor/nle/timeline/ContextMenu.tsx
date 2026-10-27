'use client';
// VOLTA Editor — Edit mode timeline: right-click menu. Closes on outside click, Escape, scroll, wheel, blur, resize.
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode, type RefObject } from 'react';
import { cn } from '@/lib/cn';

export type MenuItem =
  | { label: string; hint?: string; icon?: ReactNode; onSelect: () => void; disabled?: boolean; danger?: boolean }
  | { sep: true }
  | { title: string }
  | { label: string; chips: { label: string; onSelect: () => void; active?: boolean }[] };

export function ContextMenu({ x, y, items, onClose, scrollEl }: { x: number; y: number; items: MenuItem[]; onClose: () => void; scrollEl: RefObject<HTMLDivElement | null> }) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ x, y });
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    setPos({ x: Math.max(4, Math.min(x, window.innerWidth - r.width - 4)), y: Math.max(4, Math.min(y, window.innerHeight - r.height - 4)) });
  }, [x, y]);
  useEffect(() => {
    const down = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node)) onClose();
    };
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        onClose();
      }
    };
    const wheel = (e: WheelEvent) => {
      if (!ref.current?.contains(e.target as Node)) onClose();
    };
    const sc = scrollEl.current;
    window.addEventListener('pointerdown', down, true);
    window.addEventListener('keydown', key, true);
    window.addEventListener('wheel', wheel, { passive: true });
    window.addEventListener('blur', onClose);
    window.addEventListener('resize', onClose);
    sc?.addEventListener('scroll', onClose);
    return () => {
      window.removeEventListener('pointerdown', down, true);
      window.removeEventListener('keydown', key, true);
      window.removeEventListener('wheel', wheel);
      window.removeEventListener('blur', onClose);
      window.removeEventListener('resize', onClose);
      sc?.removeEventListener('scroll', onClose);
    };
  }, [onClose, scrollEl]);

  return (
    <div
      ref={ref}
      role="menu"
      className="fixed z-[200] min-w-[210px] rounded-[8px] border border-highlight bg-panel-elevated py-1 shadow-[0_12px_32px_rgba(0,0,0,0.55)]"
      style={{ left: pos.x, top: pos.y }}
      onContextMenu={(e) => e.preventDefault()}
    >
      {items.map((it, i) => {
        if ('sep' in it) return <div key={i} className="my-1 h-px bg-subtle" />;
        if ('title' in it) return <div key={i} className="px-3 pb-0.5 pt-1 font-mono text-[9px] font-semibold uppercase tracking-[0.08em] text-muted">{it.title}</div>;
        if ('chips' in it)
          return (
            <div key={i} className="flex items-center gap-1 px-3 py-1">
              <span className="mr-auto font-mono text-[11px] text-secondary">{it.label}</span>
              {it.chips.map((c) => (
                <button
                  key={c.label}
                  type="button"
                  onClick={() => {
                    c.onSelect();
                    onClose();
                  }}
                  className={cn('rounded-[4px] px-1.5 py-[2px] font-mono text-[10px]', c.active ? 'bg-orange/20 text-orange' : 'bg-panel-hover text-paper hover:bg-orange/15 hover:text-orange')}
                >
                  {c.label}
                </button>
              ))}
            </div>
          );
        return (
          <button
            key={i}
            type="button"
            role="menuitem"
            disabled={it.disabled}
            onClick={() => {
              it.onSelect();
              onClose();
            }}
            className={cn('flex w-full items-center gap-2 px-3 py-[5px] text-left font-mono text-[11px] disabled:cursor-not-allowed disabled:opacity-35', it.danger ? 'text-[#F87171] hover:bg-[#EF4444]/10' : 'text-paper hover:bg-orange/10 hover:text-orange')}
          >
            <span className="flex w-3.5 shrink-0 justify-center text-secondary">{it.icon}</span>
            <span className="flex-1">{it.label}</span>
            {it.hint && <span className="text-[9.5px] text-muted">{it.hint}</span>}
          </button>
        );
      })}
    </div>
  );
}
