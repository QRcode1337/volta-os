'use client';

import { Clapperboard, Trash2 } from 'lucide-react';
import { memo, useEffect, useRef, useState } from 'react';
import { cn } from '@/lib/cn';
import { getScene } from './scenes';
import { clipMatchesFilter } from './state';
import { STATUS_ORDER, type ClipFilter, type ClipStatus, type EditorClip, type EditorPin } from './types';

const STATUS_STYLE: Record<ClipStatus, string> = {
  'NEEDS REVIEW': 'border-amber/50 bg-amber/10 text-amber',
  'CHANGES REQUESTED': 'border-orange/60 bg-orange/10 text-orange',
  APPROVED: 'border-green/60 bg-green/10 text-green',
};

const mmss = (s: number) => `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

function ClipThumb({ clip }: { clip: EditorClip }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const [fontTick, setFontTick] = useState(0);
  useEffect(() => {
    let alive = true;
    document.fonts?.ready.then(() => alive && setFontTick((n) => n + 1));
    return () => {
      alive = false;
    };
  }, []);
  useEffect(() => {
    const cv = ref.current;
    if (!cv || clip.thumbUrl) return;
    const ctx = cv.getContext('2d');
    if (!ctx) return;
    getScene(clip.sceneKey).draw(ctx, cv.width, cv.height, clip.durationSec / 2, clip.durationSec, clip.origin === 'inbox' ? { heading: clip.title } : undefined);
  }, [clip.sceneKey, clip.durationSec, clip.thumbUrl, clip.title, clip.origin, fontTick]);
  if (clip.thumbUrl) {
    return <img src={clip.thumbUrl} alt="" className="h-[45px] w-[80px] shrink-0 rounded-[3px] bg-black object-cover ring-1 ring-subtle" />;
  }
  if (clip.videoUrl) {
    return <div className="flex h-[45px] w-[80px] shrink-0 items-center justify-center rounded-[3px] bg-black font-mono text-[9px] text-muted ring-1 ring-subtle">VIDEO</div>;
  }
  return <canvas ref={ref} width={192} height={108} className="h-[45px] w-[80px] shrink-0 rounded-[3px] ring-1 ring-subtle" />;
}

interface MenuState {
  clipId: string;
  x: number;
  y: number;
}

export interface ClipSceneBinProps {
  clips: EditorClip[];
  pins: EditorPin[];
  filter: ClipFilter;
  activeClipId: string | null;
  focusClipId: string | null;
  onSelect: (id: string) => void;
  onCycleStatus: (id: string) => void;
  onSetStatus: (id: string, s: ClipStatus) => void;
  onRemove: (id: string) => void;
}

export const ClipSceneBin = memo(function ClipSceneBin({ clips, pins, filter, activeClipId, focusClipId, onSelect, onCycleStatus, onSetStatus, onRemove }: ClipSceneBinProps) {
  const [menu, setMenu] = useState<MenuState | null>(null);
  const activeRef = useRef<HTMLLIElement>(null);
  const shown = clips.filter((c) => clipMatchesFilter(c, pins, filter));

  useEffect(() => {
    if (!menu) return;
    const close = () => setMenu(null);
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && close();
    window.addEventListener('pointerdown', close);
    window.addEventListener('keydown', onKey);
    window.addEventListener('blur', close);
    return () => {
      window.removeEventListener('pointerdown', close);
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('blur', close);
    };
  }, [menu]);

  useEffect(() => {
    activeRef.current?.scrollIntoView({ block: 'nearest' });
  }, [activeClipId]);

  const menuClip = menu ? clips.find((c) => c.id === menu.clipId) : null;

  return (
    <section className="hud-card flex h-full min-h-0 min-w-0 flex-col overflow-hidden">
      <header className="flex h-9 shrink-0 items-center gap-2 border-b border-subtle px-3">
        <Clapperboard size={14} className="text-orange" />
        <h2 className="hud-label truncate">Clips / Scenes</h2>
        <span className="ml-auto font-mono text-[10px] text-muted">
          {shown.length}/{clips.length}
        </span>
      </header>
      <ul className="hud-scroll min-h-0 flex-1 space-y-1.5 overflow-y-auto p-2">
        {shown.length === 0 && <li className="px-2 py-6 text-center font-mono text-[11px] text-muted">No clips match this filter.</li>}
        {shown.map((c) => {
          const count = pins.filter((p) => p.clipId === c.id).length;
          const open = pins.filter((p) => p.clipId === c.id && !p.resolved).length;
          const active = c.id === activeClipId;
          return (
            <li
              key={c.id}
              ref={active ? activeRef : undefined}
              onClick={() => onSelect(c.id)}
              onContextMenu={(e) => {
                e.preventDefault();
                setMenu({ clipId: c.id, x: e.clientX, y: e.clientY });
              }}
              className={cn(
                'group relative cursor-pointer rounded-md border p-2 transition-colors',
                active ? 'border-orange/60 bg-panel-elevated' : 'border-subtle bg-obsidian/40 hover:border-highlight hover:bg-panel-hover',
                focusClipId === c.id && 'ring-1 ring-orange/50',
              )}
            >
              {active && <span className="absolute inset-y-2 left-0 w-[3px] rounded-r bg-orange" />}
              <div className="flex gap-2">
                <ClipThumb clip={c} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline gap-1.5">
                    <span className="font-doto text-[13px] font-bold text-orange">{String(c.number).padStart(2, '0')}</span>
                    <span className="truncate text-[12.5px] font-semibold text-paper" title={c.title}>
                      {c.title}
                    </span>
                  </div>
                  <div className="mt-0.5 font-mono text-[9.5px] text-muted">
                    {mmss(c.startSec)}–{mmss(c.startSec + c.durationSec)} · <span className="text-secondary">{mmss(c.durationSec)}</span>
                  </div>
                  <div className="mt-1 flex flex-wrap items-center gap-1">
                    <span className={cn('rounded px-1 py-px font-mono text-[8.5px] font-bold', c.kind === 'ANIMATION' ? 'bg-orange/15 text-orange' : 'bg-teal/15 text-teal')}>{c.kind}</span>
                    <span className={cn('rounded px-1 py-px font-mono text-[8.5px]', count ? 'bg-panel-hover text-paper' : 'text-muted')} title={`${open} open / ${count} total pins`}>
                      📌 {count}
                    </span>
                  </div>
                </div>
              </div>
              <button
                type="button"
                title="Click to cycle status · right-click the card for all options"
                onClick={(e) => {
                  e.stopPropagation();
                  onCycleStatus(c.id);
                }}
                className={cn('mt-1.5 w-full rounded border px-1.5 py-0.5 text-left font-mono text-[9px] font-semibold tracking-wide', STATUS_STYLE[c.status])}
              >
                ● {c.status}
              </button>
            </li>
          );
        })}
      </ul>
      {menu && menuClip && (
        <div
          className="fixed z-50 w-52 rounded-md border border-highlight bg-panel-elevated p-1 shadow-xl shadow-black/60"
          style={{ left: Math.min(menu.x, typeof window !== 'undefined' ? window.innerWidth - 216 : menu.x), top: menu.y }}
          onPointerDown={(e) => e.stopPropagation()}
        >
          <div className="px-2 py-1 font-mono text-[9.5px] text-muted">CLIP {String(menuClip.number).padStart(2, '0')} · SET STATUS</div>
          {STATUS_ORDER.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => {
                onSetStatus(menuClip.id, s);
                setMenu(null);
              }}
              className={cn('flex w-full items-center gap-2 rounded px-2 py-1 text-left font-mono text-[10.5px] hover:bg-panel-hover', menuClip.status === s ? 'text-paper' : 'text-secondary')}
            >
              <span className={cn('h-1.5 w-1.5 rounded-full', s === 'APPROVED' ? 'bg-green' : s === 'CHANGES REQUESTED' ? 'bg-orange' : 'bg-amber')} />
              {s}
              {menuClip.status === s && <span className="ml-auto text-orange">✓</span>}
            </button>
          ))}
          {menuClip.origin !== 'seed' && (
            <button
              type="button"
              onClick={() => {
                onRemove(menuClip.id);
                setMenu(null);
              }}
              className="mt-1 flex w-full items-center gap-2 rounded border-t border-subtle px-2 py-1 text-left font-mono text-[10.5px] text-[#EF4444] hover:bg-panel-hover"
            >
              <Trash2 size={11} /> Remove clip &amp; its pins
            </button>
          )}
        </div>
      )}
    </section>
  );
});
