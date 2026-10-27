'use client';

// VOLTA Editor — Edit mode preview: CapCut-style bounding box for the selected visual layer. Purely presentational:
// the handles carry data-handle="move | scale-nw | scale-ne | scale-se | scale-sw | rotate" and the viewer's pointer
// handler does the maths, so a drag keeps working when the pointer leaves the box.
import { RotateCw } from 'lucide-react';
import { cn } from '@/lib/cn';

export type HandleKind = 'move' | 'scale-nw' | 'scale-ne' | 'scale-se' | 'scale-sw' | 'rotate';

export interface TransformHandlesProps {
  cx: number;
  cy: number;
  /** Scaled box size in display px. */
  w: number;
  h: number;
  rot: number;
  locked: boolean;
  /** Show the transformEnd badge (editing the end keyframe). */
  editingEnd: boolean;
  label: string;
}

const CORNERS: { k: HandleKind; x: 0 | 1; y: 0 | 1; cursor: string }[] = [
  { k: 'scale-nw', x: 0, y: 0, cursor: 'nwse-resize' },
  { k: 'scale-ne', x: 1, y: 0, cursor: 'nesw-resize' },
  { k: 'scale-se', x: 1, y: 1, cursor: 'nwse-resize' },
  { k: 'scale-sw', x: 0, y: 1, cursor: 'nesw-resize' },
];

export function TransformHandles(p: TransformHandlesProps) {
  const w = Math.max(2, Math.abs(p.w));
  const h = Math.max(2, Math.abs(p.h));
  return (
    <div
      className="pointer-events-none absolute left-0 top-0"
      style={{ width: w, height: h, transform: `translate(${p.cx.toFixed(2)}px, ${p.cy.toFixed(2)}px) translate(-50%, -50%) rotate(${p.rot.toFixed(3)}deg)` }}
    >
      <div
        data-handle={p.locked ? undefined : 'move'}
        className={cn('absolute inset-0 rounded-[2px] border', p.locked ? 'border-dashed border-secondary' : 'pointer-events-auto cursor-move border-orange')}
        style={{ boxShadow: p.locked ? undefined : '0 0 0 1px rgba(0,0,0,0.45)' }}
      />
      <div className="absolute -top-5 left-0 max-w-[220px] truncate rounded-sm bg-orange px-1 font-mono text-[9px] font-bold leading-4 text-obsidian" style={{ transform: `rotate(${(-p.rot).toFixed(3)}deg)`, transformOrigin: 'bottom left' }}>
        {p.label}
        {p.editingEnd ? ' · END KEY' : ''}
        {p.locked ? ' · LOCKED' : ''}
      </div>
      {!p.locked &&
        CORNERS.map((c) => (
          <div
            key={c.k}
            data-handle={c.k}
            className="pointer-events-auto absolute h-3 w-3 rounded-[2px] border border-obsidian bg-paper shadow"
            style={{ left: c.x ? '100%' : 0, top: c.y ? '100%' : 0, transform: 'translate(-50%, -50%)', cursor: c.cursor }}
          />
        ))}
      {!p.locked && (
        <>
          <div className="absolute left-1/2 top-0 h-6 w-px -translate-x-1/2 -translate-y-full bg-orange" />
          <div
            data-handle="rotate"
            title="Rotate (⇧ snaps to 15°)"
            className="pointer-events-auto absolute left-1/2 top-0 flex h-5 w-5 -translate-x-1/2 items-center justify-center rounded-full border border-obsidian bg-orange text-obsidian shadow"
            style={{ marginTop: -34, cursor: 'grab' }}
          >
            <RotateCw size={11} strokeWidth={2.5} />
          </div>
        </>
      )}
    </div>
  );
}
