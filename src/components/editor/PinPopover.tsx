'use client';

import { Mic, MicOff, X } from 'lucide-react';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { cn } from '@/lib/cn';
import { formatTimecode } from '@/lib/format';
import { SKILL_COLORS, SKILL_OPTIONS, type PinDraft, type SkillTag } from './types';
import { useDictation } from './useDictation';

export const POPOVER_W = 304;

function Waveform({ active, live }: { active: boolean; live: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!active) return;
    let raf = 0;
    const bars = ref.current ? Array.from(ref.current.children) as HTMLElement[] : [];
    const loop = (now: number) => {
      const t = now / 1000;
      bars.forEach((b, i) => {
        const v = 0.18 + 0.82 * Math.abs(Math.sin(t * (live ? 7 : 5) + i * 0.55) * Math.sin(t * 2.3 + i * 1.7));
        b.style.transform = `scaleY(${v.toFixed(3)})`;
      });
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [active, live]);
  return (
    <div ref={ref} className="flex h-6 flex-1 items-center gap-[2px]" aria-hidden>
      {Array.from({ length: 28 }, (_, i) => (
        <span key={i} className={cn('h-full w-[3px] origin-center rounded-full', live ? 'bg-orange' : 'bg-orange/60')} style={{ transform: 'scaleY(0.2)' }} />
      ))}
    </div>
  );
}

export interface PinPopoverProps {
  draft: PinDraft;
  pinNumber: number;
  defaultSkill: SkillTag;
  left: number;
  top: number;
  onMeasure: (h: number) => void;
  onSave: (text: string, skill: SkillTag) => void;
  onCancel: () => void;
}

export function PinPopover({ draft, pinNumber, defaultSkill, left, top, onMeasure, onSave, onCancel }: PinPopoverProps) {
  const [text, setText] = useState('');
  const [skill, setSkill] = useState<SkillTag>(defaultSkill);
  const taRef = useRef<HTMLTextAreaElement>(null);
  const boxRef = useRef<HTMLDivElement>(null);
  const textRef = useRef(text);
  textRef.current = text;
  const dict = useDictation(setText);

  useEffect(() => {
    taRef.current?.focus();
  }, [draft.xPercent, draft.yPercent]);

  useLayoutEffect(() => {
    if (boxRef.current) onMeasure(boxRef.current.offsetHeight);
  });

  const save = () => {
    if (!textRef.current.trim()) {
      taRef.current?.focus();
      return;
    }
    dict.stop();
    onSave(textRef.current, skill);
  };
  const cancel = () => {
    dict.stop();
    onCancel();
  };
  const toggleMic = () => {
    if (dict.status === 'idle') dict.start(textRef.current);
    else dict.stop();
    taRef.current?.focus();
  };

  const coords = draft.region
    ? `x:${draft.region.x.toFixed(1)}% y:${draft.region.y.toFixed(1)}% · ${draft.region.w.toFixed(1)}×${draft.region.h.toFixed(1)}%`
    : `x:${draft.xPercent.toFixed(1)}% y:${draft.yPercent.toFixed(1)}%`;

  return (
    <div
      ref={boxRef}
      className="absolute z-30 rounded-lg border border-orange/60 bg-panel-elevated/95 p-3 shadow-2xl shadow-black/70 backdrop-blur"
      style={{ left, top, width: POPOVER_W }}
      onPointerDown={(e) => e.stopPropagation()}
      onClick={(e) => e.stopPropagation()}
    >
      <div className="mb-2 flex items-center gap-2">
        <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-orange px-1 font-mono text-[10px] font-bold text-obsidian">#{pinNumber}</span>
        <span className="font-doto text-[12px] text-paper">{formatTimecode(draft.timestampSec + 1e-6, 30)}</span>
        <span className="truncate font-mono text-[10px] text-secondary">{coords}</span>
        <button type="button" onClick={cancel} className="ml-auto rounded p-0.5 text-muted hover:text-paper" aria-label="Cancel pin">
          <X size={14} />
        </button>
      </div>
      <textarea
        ref={taRef}
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
            e.preventDefault();
            save();
          } else if (e.key === 'Escape') {
            e.preventDefault();
            e.stopPropagation();
            cancel();
          }
        }}
        rows={3}
        placeholder="Describe what Claude should change here..."
        className="hud-scroll w-full resize-none rounded-md border border-subtle bg-obsidian px-2.5 py-2 text-[13px] leading-snug text-paper outline-none placeholder:text-muted focus:border-orange/70"
      />
      <div className="mt-2 grid grid-cols-2 gap-1">
        {SKILL_OPTIONS.map((o) => (
          <button
            key={o.tag}
            type="button"
            onClick={() => setSkill(o.tag)}
            className={cn(
              'h-6 truncate rounded border px-1.5 text-left font-mono text-[10px] transition-colors',
              skill === o.tag ? 'border-transparent text-obsidian' : 'border-subtle text-secondary hover:border-highlight hover:text-paper',
            )}
            style={skill === o.tag ? { background: SKILL_COLORS[o.tag] } : undefined}
          >
            {o.label}
          </button>
        ))}
      </div>
      <div className="mt-2 flex items-center gap-2">
        <button
          type="button"
          onClick={toggleMic}
          title="Dictate with your microphone (browser speech recognition)"
          className={cn(
            'flex h-7 shrink-0 items-center gap-1.5 rounded-md border px-2 font-mono text-[10px] font-semibold',
            dict.status === 'idle' ? 'border-subtle text-secondary hover:border-orange/60 hover:text-paper' : 'border-orange bg-orange/15 text-orange',
          )}
        >
          {dict.status === 'idle' ? <Mic size={13} /> : <MicOff size={13} />}
          {dict.status === 'idle' ? '🎙️ Dictate' : dict.status === 'live' ? 'Listening…' : 'Simulated'}
        </button>
        {dict.status !== 'idle' ? <Waveform active live={dict.status === 'live'} /> : <span className="font-mono text-[10px] text-muted">or type · Shift+Enter = newline</span>}
      </div>
      {dict.notice && dict.status === 'simulated' && <p className="mt-1.5 rounded border border-amber/40 bg-amber/10 px-2 py-1 text-[11px] leading-snug text-amber">{dict.notice}</p>}
      <div className="mt-2.5 flex items-center justify-end gap-1.5">
        <button type="button" onClick={cancel} className="h-7 rounded-md border border-subtle px-2.5 font-mono text-[10px] text-secondary hover:text-paper">
          Cancel (Esc)
        </button>
        <button
          type="button"
          onClick={save}
          disabled={!text.trim()}
          className="h-7 rounded-md bg-orange px-2.5 font-mono text-[10px] font-semibold text-obsidian hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-40"
        >
          Save Pin (Enter)
        </button>
      </div>
    </div>
  );
}
