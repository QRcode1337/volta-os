'use client';

import { Scissors, Sparkles } from 'lucide-react';
import { memo, useCallback, useEffect, useRef, useState } from 'react';
import { cn } from '@/lib/cn';
import { formatClock } from './spatial';
import type { EditorClip, EditorPin } from './types';

interface Sel {
  text: string;
  clipId: string;
  atSec: number; // absolute
  x: number;
  y: number;
}

export interface ScriptCuesTabProps {
  clips: EditorClip[];
  pins: EditorPin[];
  activeLineKey: string | null;
  focusClipId: string | null;
  onSeek: (t: number) => void;
  onAddCue: (clipId: string, atSec: number, line: string, kind: 'animate' | 'cut') => void;
}

export const ScriptCuesTab = memo(function ScriptCuesTab({ clips, pins, activeLineKey, focusClipId, onSeek, onAddCue }: ScriptCuesTabProps) {
  const boxRef = useRef<HTMLDivElement>(null);
  const [sel, setSel] = useState<Sel | null>(null);
  const shown = focusClipId ? clips.filter((c) => c.id === focusClipId) : clips;

  const readSelection = useCallback(() => {
    const s = window.getSelection();
    const box = boxRef.current;
    if (!s || s.isCollapsed || !box || s.rangeCount === 0) {
      setSel(null);
      return;
    }
    const text = s.toString().replace(/\s+/g, ' ').trim();
    const anchor = (s.anchorNode instanceof Element ? s.anchorNode : s.anchorNode?.parentElement)?.closest<HTMLElement>('[data-line]');
    if (!text || !anchor || !box.contains(anchor)) {
      setSel(null);
      return;
    }
    const rect = s.getRangeAt(0).getBoundingClientRect();
    const br = box.getBoundingClientRect();
    setSel({
      text: text.slice(0, 280),
      clipId: anchor.dataset.clip ?? '',
      atSec: Number(anchor.dataset.at ?? 0),
      x: Math.max(8, Math.min(rect.left - br.left + rect.width / 2, br.width - 8)),
      y: rect.top - br.top + box.scrollTop,
    });
  }, []);

  useEffect(() => {
    const onDown = (e: PointerEvent) => {
      if (!(e.target as HTMLElement).closest?.('[data-cue-toolbar]')) setSel(null);
    };
    window.addEventListener('pointerdown', onDown);
    return () => window.removeEventListener('pointerdown', onDown);
  }, []);

  const add = (kind: 'animate' | 'cut') => {
    if (!sel) return;
    onAddCue(sel.clipId, sel.atSec, sel.text, kind);
    window.getSelection()?.removeAllRanges();
    setSel(null);
  };

  return (
    <div ref={boxRef} className="hud-scroll relative h-full overflow-y-auto p-2" onMouseUp={() => requestAnimationFrame(readSelection)} onKeyUp={readSelection}>
      <p className="mb-2 px-1 font-mono text-[10px] leading-snug text-muted">Highlight any words in a line to attach a visual cue or mark a cut — it lands in the comment queue.</p>
      {shown.map((c) => {
        const cueCount = pins.filter((p) => p.clipId === c.id && p.scriptLine).length;
        return (
          <div key={c.id} className="mb-3">
            <div className="sticky top-0 z-[1] mb-1 flex items-center gap-1.5 bg-panel/95 px-1 py-1 backdrop-blur">
              <span className="font-doto text-[12px] font-bold text-orange">{String(c.number).padStart(2, '0')}</span>
              <span className="truncate text-[12px] font-semibold text-paper">{c.title}</span>
              <span className="ml-auto shrink-0 font-mono text-[9.5px] text-muted">
                {cueCount ? ` · ${cueCount} cue${cueCount === 1 ? '' : 's'}` : ''}
              </span>
            </div>
            {c.voiceover.length === 0 && <div className="px-2 py-1 font-mono text-[10.5px] leading-snug text-muted">No script lines are attached to this file.</div>}
            {c.voiceover.map((v, i) => {
              const key = `${c.id}:${i}`;
              const abs = c.startSec + v.atSec;
              const active = key === activeLineKey;
              return (
                <div key={key} className={cn('flex gap-2 rounded px-1.5 py-1.5', active ? 'bg-orange/10 ring-1 ring-orange/40' : 'hover:bg-panel-hover/60')}>
                  <button
                    type="button"
                    onClick={() => onSeek(abs)}
                    className={cn('h-5 shrink-0 rounded border px-1.5 font-doto text-[10.5px] font-bold', active ? 'border-orange bg-orange text-obsidian' : 'border-subtle text-secondary hover:text-paper')}
                  >
                    {formatClock(v.atSec)}
                  </button>
                  <p data-line data-clip={c.id} data-at={abs} className="selectable min-w-0 cursor-text font-serif text-[14px] leading-snug text-paper">
                    {v.text}
                  </p>
                </div>
              );
            })}
          </div>
        );
      })}
      {sel && (
        <div
          data-cue-toolbar
          className="absolute z-20 flex -translate-x-1/2 -translate-y-full gap-1 rounded-md border border-highlight bg-panel-elevated p-1 shadow-xl shadow-black/60"
          style={{ left: sel.x, top: sel.y - 6 }}
          onMouseDown={(e) => e.preventDefault()}
        >
          <button type="button" onClick={() => add('animate')} className="flex h-7 items-center gap-1 whitespace-nowrap rounded bg-orange px-2 font-mono text-[10px] font-semibold text-obsidian hover:brightness-110">
            <Sparkles size={11} /> + Attach Visual / Animation Cue
          </button>
          <button type="button" onClick={() => add('cut')} className="flex h-7 items-center gap-1 whitespace-nowrap rounded border border-teal/60 bg-teal/15 px-2 font-mono text-[10px] font-semibold text-teal hover:bg-teal/25">
            <Scissors size={11} /> ✂️ Mark Cut / Trim Here
          </button>
        </div>
      )}
    </div>
  );
});
