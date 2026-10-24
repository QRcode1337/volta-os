'use client';
import { useLayoutEffect, useRef } from 'react';
import type { ReactNode, RefObject } from 'react';
import { ChevronDown, ChevronUp, Plus, Trash } from 'lucide-react';
import { cn } from '@/lib/cn';
import type { ScriptHook, ScriptTiming } from './script-model';
import { fmtClock, fmtDur, pickSceneKey } from './script-model';

interface AvScriptTableProps {
  timing: ScriptTiming;
  hook?: ScriptHook;
  hookCue: string;
  onHookCue: (v: string) => void;
  onRowChange: (id: string, field: 'voiceover' | 'visualCue', value: string) => void;
  onAddRow: (chapterId: string, afterRowId?: string) => void;
  onDeleteRow: (id: string) => void;
  onMoveRow: (id: string, dir: -1 | 1) => void;
  onRenameChapter: (id: string, title: string) => void;
  onAddChapter: () => void;
  chapterRefs: RefObject<Map<string, HTMLElement>>;
  flashChapterId?: string | null;
}

/** Textarea that grows with its content. */
function AutoTextarea({
  value,
  onChange,
  placeholder,
  className,
  ariaLabel,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  className?: string;
  ariaLabel: string;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = '0px';
    el.style.height = `${el.scrollHeight}px`;
  }, [value]);
  return (
    <textarea
      ref={ref}
      rows={1}
      value={value}
      aria-label={ariaLabel}
      placeholder={placeholder}
      onChange={(e) => onChange(e.target.value)}
      className={cn(
        'block w-full resize-none overflow-hidden rounded-md border border-transparent bg-transparent px-2 py-1.5 leading-relaxed text-paper outline-none transition-colors placeholder:text-muted hover:border-subtle focus:border-highlight focus:bg-obsidian',
        className,
      )}
    />
  );
}

const SCENE_LABEL: Record<string, string> = {
  'title-reveal': 'Title Reveal',
  'ring-zoom': 'Ring Zoom',
  'arms-stack': 'ARMS Stack',
  'cache-meter': 'Cache Meter',
  'wildcard-split': 'Wildcard Split',
  'brain-orb': 'Brain Orb',
  'jev-router': 'Jev Router',
  'outro-cta': 'Outro CTA',
};

export function AvScriptTable({
  timing,
  hook,
  hookCue,
  onHookCue,
  onRowChange,
  onAddRow,
  onDeleteRow,
  onMoveRow,
  onRenameChapter,
  onAddChapter,
  chapterRefs,
  flashChapterId,
}: AvScriptTableProps) {
  const flatIndex = new Map(timing.flat.map((r, i) => [r.id, i]));
  const lastIndex = timing.flat.length - 1;

  return (
    <div className="min-w-0">
      {/* Column header */}
      <div className="sticky top-0 z-10 grid grid-cols-[84px_minmax(0,1fr)_minmax(0,1fr)_64px] border-b border-subtle bg-panel/95 backdrop-blur">
        <div className="px-3 py-2 hud-label !text-[10px]">Time</div>
        <div className="flex items-center gap-1.5 border-l border-subtle px-3 py-2">
          <span className="hud-label !text-[10px] !text-paper">Spoken Voiceover</span>
          <span className="font-mono text-[10px] font-semibold text-orange">(/tone)</span>
        </div>
        <div className="flex items-center gap-1.5 border-l border-subtle px-3 py-2">
          <span className="hud-label !text-[10px] !text-paper">Visual &amp; Animation Cue</span>
          <span className="font-mono text-[10px] font-semibold text-amber">(/animate)</span>
        </div>
        <div />
      </div>

      {timing.chapters.map((c) => {
        const scene = pickSceneKey([c.title, ...(c.index === 0 ? [hookCue] : []), ...c.rows.map((r) => r.visualCue)].join(' \n '));
        return (
          <section
            key={c.id}
            ref={(el) => {
              if (el) chapterRefs.current.set(c.id, el);
              else chapterRefs.current.delete(c.id);
            }}
            className={cn('border-b border-subtle transition-colors duration-700', flashChapterId === c.id && 'bg-[rgba(255,85,0,0.06)]')}
          >
            {/* Chapter header */}
            <div className="flex items-center gap-3 border-b border-subtle/70 bg-panel-elevated/60 px-3 py-1.5">
              <span className="font-doto text-[14px] font-bold text-orange">{fmtClock(c.startSec)}</span>
              <span className="font-mono text-[9.5px] font-semibold uppercase tracking-[0.1em] text-muted">CH {String(c.index + 1).padStart(2, '0')}</span>
              <input
                value={c.title}
                onChange={(e) => onRenameChapter(c.id, e.target.value)}
                aria-label="Chapter title"
                placeholder="Untitled chapter"
                className="min-w-0 flex-1 rounded border border-transparent bg-transparent px-1.5 py-0.5 text-[13.5px] font-semibold text-paper outline-none hover:border-subtle focus:border-highlight focus:bg-obsidian"
              />
              <span
                className="hidden items-center gap-1 rounded-full border border-orange/30 bg-orange/10 px-2 py-0.5 font-mono text-[9px] font-semibold uppercase tracking-[0.08em] text-orange md:inline-flex"
                title="Scene the VOLTA Editor will render for this chapter (picked from cue keywords)"
              >
                scene · {SCENE_LABEL[scene] ?? scene}
              </span>
              <span className="font-mono text-[10px] text-secondary">
                {c.words}w · {fmtDur(c.durationSec)}
              </span>
            </div>

            {/* Active hook row (chapter 1 only) */}
            {c.index === 0 && hook && (
              <div className="grid grid-cols-[84px_minmax(0,1fr)_minmax(0,1fr)_64px] border-b border-subtle/60 bg-[rgba(255,85,0,0.035)]">
                <div className="px-3 py-2.5">
                  <div className="font-doto text-[13px] font-bold text-paper">{fmtClock(0)}</div>
                  <div className="mt-0.5 font-mono text-[9px] text-muted">{fmtDur(timing.hookSec)}</div>
                </div>
                <div className="border-l border-subtle/60 px-1 py-1">
                  <div className="flex items-center gap-1.5 px-2 pt-1">
                    <span className="rounded-full bg-orange px-1.5 py-px font-mono text-[8.5px] font-bold uppercase tracking-[0.1em] text-obsidian">Hook</span>
                    {hook.kind === 'wildcard' && <span className="font-mono text-[9px] font-semibold uppercase text-purple">/wildcard</span>}
                    <span className="font-mono text-[9px] text-muted">edit in Hook Lab</span>
                  </div>
                  <p className="px-2 py-1.5 text-[13px] font-medium leading-relaxed text-paper">{hook.text}</p>
                </div>
                <div className="border-l border-subtle/60 px-1 py-1">
                  <AutoTextarea value={hookCue} onChange={onHookCue} ariaLabel="Hook visual cue" placeholder="Visual cue for the hook…" className="font-mono text-[11.5px] text-secondary focus:text-paper" />
                </div>
                <div />
              </div>
            )}

            {c.rows.map((r) => {
              const fi = flatIndex.get(r.id) ?? 0;
              return (
                <div key={r.id} className="group grid grid-cols-[84px_minmax(0,1fr)_minmax(0,1fr)_64px] border-b border-subtle/40 last:border-b-0 hover:bg-panel-elevated/40">
                  <div className="px-3 py-2.5">
                    <div className="font-doto text-[13px] font-bold text-paper">{fmtClock(r.startSec)}</div>
                    <div className="mt-0.5 font-mono text-[9px] text-muted">
                      {fmtDur(r.durationSec)} · {r.words}w
                    </div>
                  </div>
                  <div className="border-l border-subtle/60 px-1 py-1">
                    <AutoTextarea
                      value={r.voiceover}
                      onChange={(v) => onRowChange(r.id, 'voiceover', v)}
                      ariaLabel="Spoken voiceover"
                      placeholder="What you say on camera…"
                      className="text-[13px]"
                    />
                  </div>
                  <div className="border-l border-subtle/60 px-1 py-1">
                    <AutoTextarea
                      value={r.visualCue}
                      onChange={(v) => onRowChange(r.id, 'visualCue', v)}
                      ariaLabel="Visual and animation cue"
                      placeholder="What the viewer sees…"
                      className="font-mono text-[11.5px] text-secondary focus:text-paper"
                    />
                  </div>
                  <div className="flex flex-col items-center justify-start gap-0.5 py-1.5 opacity-40 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100">
                    <div className="flex gap-0.5">
                      <IconBtn label="Move row up" disabled={fi === 0} onClick={() => onMoveRow(r.id, -1)}>
                        <ChevronUp className="h-3.5 w-3.5" />
                      </IconBtn>
                      <IconBtn label="Move row down" disabled={fi === lastIndex} onClick={() => onMoveRow(r.id, 1)}>
                        <ChevronDown className="h-3.5 w-3.5" />
                      </IconBtn>
                    </div>
                    <div className="flex gap-0.5">
                      <IconBtn label="Insert row below" onClick={() => onAddRow(c.id, r.id)}>
                        <Plus className="h-3.5 w-3.5" />
                      </IconBtn>
                      <IconBtn label="Delete row" danger onClick={() => onDeleteRow(r.id)}>
                        <Trash className="h-3.5 w-3.5" />
                      </IconBtn>
                    </div>
                  </div>
                </div>
              );
            })}

            <button
              type="button"
              onClick={() => onAddRow(c.id)}
              className="flex w-full items-center gap-1.5 px-3 py-1.5 font-mono text-[9.5px] font-semibold uppercase tracking-[0.08em] text-muted transition-colors hover:bg-panel-elevated/60 hover:text-orange"
            >
              <Plus className="h-3 w-3" /> Add row to {c.title || 'chapter'}
            </button>
          </section>
        );
      })}

      <button
        type="button"
        onClick={onAddChapter}
        className="m-3 inline-flex h-8 items-center gap-1.5 rounded-lg border border-dashed border-highlight px-3 font-mono text-[10px] font-semibold uppercase tracking-[0.08em] text-secondary transition-colors hover:border-orange hover:text-orange"
      >
        <Plus className="h-3.5 w-3.5" /> New chapter
      </button>
    </div>
  );
}

function IconBtn({
  label,
  onClick,
  disabled,
  danger,
  children,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  danger?: boolean;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        'flex h-6 w-6 items-center justify-center rounded text-muted transition-colors disabled:pointer-events-none disabled:opacity-25',
        danger ? 'hover:bg-[#EF4444]/15 hover:text-[#EF4444]' : 'hover:bg-panel-hover hover:text-paper',
      )}
    >
      {children}
    </button>
  );
}
