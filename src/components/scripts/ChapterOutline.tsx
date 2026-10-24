'use client';
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { KeyboardEvent, PointerEvent as ReactPointerEvent } from 'react';
import { GripVertical } from 'lucide-react';
import { cn } from '@/lib/cn';
import type { TimedChapter } from './script-model';
import { fmtClock, fmtDur } from './script-model';

interface ChapterOutlineProps {
  chapters: TimedChapter[];
  totalSec: number;
  /** Move chapter `id` so it ends up at index `to`. */
  onMove: (id: string, to: number) => void;
  onJump: (id: string) => void;
}

/** Pointer-event drag-to-reorder list (no DnD library). Arrow keys on the grip also reorder. */
export function ChapterOutline({ chapters, totalSec, onMove, onJump }: ChapterOutlineProps) {
  const itemRefs = useRef(new Map<string, HTMLLIElement>());
  const [dragId, setDragId] = useState<string | null>(null);
  const [dragDy, setDragDy] = useState(0);
  const anchor = useRef<{ pointerY: number; slotTop: number } | null>(null);
  const lastY = useRef(0);
  const dyRef = useRef(0);
  const dragIdRef = useRef<string | null>(null);
  // Latest props for the window-level listeners (the dragged <li> may be re-inserted by React
  // during a live reorder, which would drop element pointer capture — so we listen on window).
  const chaptersRef = useRef(chapters);
  const onMoveRef = useRef(onMove);
  const cleanupRef = useRef<(() => void) | null>(null);
  chaptersRef.current = chapters;
  onMoveRef.current = onMove;
  useEffect(() => () => cleanupRef.current?.(), []);

  /** Keep the dragged card under the pointer: offset = pointer travel − how far its slot has moved. */
  const recompute = useCallback(() => {
    const id = dragIdRef.current;
    if (!id || !anchor.current) return;
    const el = itemRefs.current.get(id);
    if (!el) return;
    const slotTop = el.getBoundingClientRect().top - dyRef.current;
    const dy = lastY.current - anchor.current.pointerY - (slotTop - anchor.current.slotTop);
    dyRef.current = dy;
    setDragDy(dy);
  }, []);

  // After a live reorder re-renders, the slot moved — re-anchor before paint to avoid a jump.
  useLayoutEffect(() => {
    recompute();
  }, [chapters, recompute]);

  const startDrag = (e: ReactPointerEvent<HTMLElement>, id: string) => {
    if (e.button !== 0) return;
    e.preventDefault();
    const el = itemRefs.current.get(id);
    anchor.current = { pointerY: e.clientY, slotTop: el?.getBoundingClientRect().top ?? e.clientY };
    lastY.current = e.clientY;
    dyRef.current = 0;
    dragIdRef.current = id;
    setDragId(id);
    setDragDy(0);

    const onPointerMove = (ev: PointerEvent) => {
      const dragging = dragIdRef.current;
      if (!dragging || !anchor.current) return;
      lastY.current = ev.clientY;
      const list = chaptersRef.current;
      const from = list.findIndex((c) => c.id === dragging);
      // Swap with a neighbour once the pointer crosses that neighbour's midpoint.
      for (const idx of [from - 1, from + 1]) {
        const nid = list[idx]?.id;
        if (!nid) continue;
        const r = itemRefs.current.get(nid)?.getBoundingClientRect();
        if (!r) continue;
        const mid = r.top + r.height / 2;
        if ((idx < from && ev.clientY < mid) || (idx > from && ev.clientY > mid)) {
          onMoveRef.current(dragging, idx);
          break;
        }
      }
      recompute();
    };
    const detach = () => {
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
      window.removeEventListener('pointercancel', onPointerUp);
      cleanupRef.current = null;
    };
    const onPointerUp = () => {
      detach();
      dragIdRef.current = null;
      anchor.current = null;
      dyRef.current = 0;
      setDragId(null);
      setDragDy(0);
    };
    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
    window.addEventListener('pointercancel', onPointerUp);
    cleanupRef.current = detach;
  };

  const onGripKey = (e: KeyboardEvent<HTMLElement>, id: string, index: number) => {
    if (e.key === 'ArrowUp' && index > 0) {
      e.preventDefault();
      onMove(id, index - 1);
    } else if (e.key === 'ArrowDown' && index < chapters.length - 1) {
      e.preventDefault();
      onMove(id, index + 1);
    }
  };

  return (
    <ol className="flex flex-col gap-1.5">
      {chapters.map((c, i) => {
        const dragging = c.id === dragId;
        const pct = totalSec > 0 ? (c.durationSec / totalSec) * 100 : 0;
        return (
          <li
            key={c.id}
            ref={(el) => {
              if (el) itemRefs.current.set(c.id, el);
              else itemRefs.current.delete(c.id);
            }}
            className={cn(
              'relative flex items-stretch overflow-hidden rounded-lg border bg-panel-elevated',
              dragging ? 'z-10 border-orange shadow-[0_10px_30px_rgba(0,0,0,0.6),0_0_0_1px_rgba(255,85,0,0.4)]' : 'border-subtle transition-transform',
            )}
            style={dragging ? { transform: `translateY(${dragDy}px)` } : undefined}
          >
            <button
              type="button"
              aria-label={`Reorder chapter ${c.title} (drag, or use arrow keys)`}
              onPointerDown={(e) => startDrag(e, c.id)}
              onKeyDown={(e) => onGripKey(e, c.id, i)}
              className={cn(
                'flex w-6 shrink-0 touch-none items-center justify-center border-r border-subtle text-muted hover:bg-panel-hover hover:text-paper focus-visible:text-orange focus-visible:outline-none',
                dragging ? 'cursor-grabbing text-orange' : 'cursor-grab',
              )}
            >
              <GripVertical className="h-3.5 w-3.5" />
            </button>
            <button type="button" onClick={() => onJump(c.id)} className="min-w-0 flex-1 px-2.5 py-2 text-left hover:bg-panel-hover">
              <div className="flex items-center gap-2">
                <span className="font-doto text-[13px] font-bold text-orange">{fmtClock(c.startSec)}</span>
                <span className="font-mono text-[9px] text-muted">CH {String(i + 1).padStart(2, '0')}</span>
                <span className="ml-auto font-mono text-[9px] text-muted">
                  {c.words}w · {fmtDur(c.durationSec)}
                </span>
              </div>
              <p className="mt-0.5 truncate text-[12.5px] font-medium text-paper">{c.title || 'Untitled chapter'}</p>
              <div className="mt-1.5 h-[3px] overflow-hidden rounded-full bg-obsidian">
                <div className="h-full rounded-full bg-orange/70" style={{ width: `${pct}%` }} />
              </div>
            </button>
          </li>
        );
      })}
    </ol>
  );
}
