'use client';
import { useState, type CSSProperties, type KeyboardEvent } from 'react';
import type { Slide } from './data';
import {
  BODY_LH,
  BODY_SIZE,
  HEAD_LH,
  PAD,
  SLIDE_H,
  SLIDE_W,
  WILD_HEAD_LH,
  headlineSize,
  pad2,
  slideNumeral,
  slidePalette,
} from './slide-render';
import { PixelMascotLogo } from '@/components/robo-ui';
import { cn } from '@/lib/cn';

export type EditableField = 'kicker' | 'headline' | 'body';

export interface SlidePin {
  id: string;
  n: number;
  slideId: string;
  x: number; // 0..1
  y: number; // 0..1
  text: string;
}

/** contentEditable text that re-mounts (via key) whenever the committed value changes. */
function Editable({
  value,
  editable,
  multiline,
  onCommit,
  className,
  style,
}: {
  value: string;
  editable: boolean;
  multiline?: boolean;
  onCommit: (v: string) => void;
  className?: string;
  style?: CSSProperties;
}) {
  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    e.stopPropagation();
    if (e.key === 'Enter' && (!multiline || e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      e.currentTarget.blur();
    } else if (e.key === 'Escape') {
      e.currentTarget.innerText = value;
      e.currentTarget.blur();
    }
  };
  return (
    <div
      key={value}
      contentEditable={editable ? 'plaintext-only' : false}
      suppressContentEditableWarning
      spellCheck={false}
      onKeyDown={editable ? onKeyDown : undefined}
      onBlur={
        editable
          ? (e) => {
              const v = e.currentTarget.innerText.replace(/ /g, ' ').replace(/\n{3,}/g, '\n\n').trim();
              if (v && v !== value) onCommit(v);
              else e.currentTarget.innerText = value;
            }
          : undefined
      }
      className={cn(
        'whitespace-pre-wrap outline-none',
        editable && 'selectable cursor-text rounded-[10px] transition-shadow hover:shadow-[0_0_0_3px_rgba(255,85,0,0.45)] focus:shadow-[0_0_0_4px_#FF5500]',
        className,
      )}
      style={style}
    >
      {value}
    </div>
  );
}

export interface SlideViewProps {
  slide: Slide; // edits already applied
  index: number;
  total: number;
  handle: string;
  wildcard: boolean;
  width: number; // css px
  editable?: boolean;
  onEdit?: (field: EditableField, value: string) => void;
}

const mono = "'JetBrains Mono', monospace";
/** Doto glyphs are ~0.62em wide — mirror the canvas exporter's fit-to-width. */
const numeralSize = (text: string, max: number, maxW: number) => Math.min(max, Math.floor(maxW / (0.62 * Math.max(1, text.length))));

/** 1080×1350 /robo slide scaled into `width` css px. */
export function SlideView({ slide, index, total, handle, wildcard, width, editable = false, onEdit }: SlideViewProps) {
  const p = slidePalette(slide, index, wildcard);
  const scale = width / SLIDE_W;
  const last = index === total - 1;
  const commit = (f: EditableField) => (v: string) => onEdit?.(f, v);
  const numeral = slideNumeral(slide, index);
  const hs = headlineSize(slide, wildcard);

  return (
    <div className="relative overflow-hidden" style={{ width, height: width * (SLIDE_H / SLIDE_W), background: p.bg }}>
      <div className="absolute left-0 top-0 origin-top-left" style={{ width: SLIDE_W, height: SLIDE_H, transform: `scale(${scale})`, color: p.fg }}>
        {!wildcard ? (
          <>
            {slide.theme === 'dark' && (
              <div
                className="absolute inset-0"
                style={{
                  backgroundImage:
                    'radial-gradient(900px circle at 100% 0%, rgba(255,85,0,0.16), transparent 70%), linear-gradient(rgba(245,242,235,0.035) 1px, transparent 1px), linear-gradient(90deg, rgba(245,242,235,0.035) 1px, transparent 1px)',
                  backgroundSize: '100% 100%, 60px 60px, 60px 60px',
                }}
              />
            )}
            <div className="absolute flex items-center gap-5" style={{ left: PAD, top: PAD - 4 }}>
              <PixelMascotLogo size={40} color={p.accent} />
              <span style={{ fontFamily: mono, fontSize: 26, fontWeight: 600, color: p.sub }}>{handle}</span>
            </div>
            <span className="font-doto absolute" style={{ right: PAD, top: PAD - 10, fontSize: 44, fontWeight: 800, color: p.accent, lineHeight: 1 }}>
              {pad2(index + 1)}/{pad2(total)}
            </span>
            <div className="absolute" style={{ left: PAD, right: PAD, top: 170, height: 2, background: p.line }} />
            <div className="absolute flex flex-col" style={{ left: PAD, right: PAD, top: 232 }}>
              {numeral ? (
                <span
                  className="font-doto block whitespace-nowrap"
                  style={{ fontSize: slide.kind === 'stat' ? numeralSize(numeral, 230, SLIDE_W - PAD * 2) : 180, fontWeight: 800, lineHeight: 1, color: p.numeral, marginLeft: -6, marginBottom: 28 }}
                >
                  {numeral}
                </span>
              ) : (
                <div style={{ height: 80 }} />
              )}
              <Editable
                value={slide.kicker}
                editable={editable}
                onCommit={commit('kicker')}
                style={{ fontFamily: mono, fontSize: 28, fontWeight: 600, letterSpacing: '0.12em', textTransform: 'uppercase', color: p.accent, marginBottom: 28, lineHeight: 1 }}
              />
              <Editable
                value={slide.headline}
                editable={editable}
                onCommit={commit('headline')}
                style={{ fontSize: hs, fontWeight: 700, lineHeight: HEAD_LH, letterSpacing: '-0.02em', color: p.fg, marginBottom: 36 }}
              />
              <Editable
                value={slide.body}
                editable={editable}
                multiline
                onCommit={commit('body')}
                style={{ fontSize: BODY_SIZE, fontWeight: 400, lineHeight: BODY_LH, color: p.sub, maxWidth: 860 }}
              />
            </div>
            <div className="absolute flex" style={{ left: PAD, right: PAD, top: 1196, height: 8, gap: 10 }}>
              {Array.from({ length: total }, (_, i) => (
                <span key={i} className="flex-1" style={{ background: i <= index ? p.accent : p.line }} />
              ))}
            </div>
            <span className="absolute" style={{ left: PAD, top: 1238, fontFamily: mono, fontSize: 24, fontWeight: 600, color: p.sub }}>
              VOLTA · /robo
            </span>
            <span className="absolute" style={{ right: PAD, top: 1236, fontFamily: mono, fontSize: 28, fontWeight: 600, color: p.accent }}>
              {last ? 'SAVE + SHARE ↺' : 'SWIPE →'}
            </span>
          </>
        ) : (
          <>
            <span
              className="font-doto absolute whitespace-nowrap"
              style={{ left: 60, top: 40, fontSize: numeralSize(slide.stat ?? pad2(index + 1), 560, SLIDE_W - 120), fontWeight: 800, lineHeight: 1, color: p.numeral }}
            >
              {slide.stat ?? pad2(index + 1)}
            </span>
            <span className="absolute" style={{ right: PAD, top: PAD - 6, fontFamily: mono, fontSize: 30, fontWeight: 600, color: p.fg }}>
              {pad2(index + 1)} — {pad2(total)}
            </span>
            <div className="absolute flex flex-col items-start justify-end" style={{ left: PAD, right: PAD, bottom: 230, top: 300 }}>
              <span className="inline-flex items-center rounded-full" style={{ background: p.pillBg, color: p.pillFg, padding: '0 20px', height: 52, marginBottom: 32 }}>
                <Editable
                  value={slide.kicker}
                  editable={editable}
                  onCommit={commit('kicker')}
                  style={{ fontFamily: mono, fontSize: 26, fontWeight: 600, textTransform: 'uppercase', lineHeight: 1 }}
                />
              </span>
              <Editable
                value={slide.headline}
                editable={editable}
                onCommit={commit('headline')}
                style={{ fontSize: hs, fontWeight: 700, lineHeight: WILD_HEAD_LH, letterSpacing: '-0.02em', textTransform: 'uppercase', color: p.fg, marginBottom: 32 }}
              />
              <Editable value={slide.body} editable={editable} multiline onCommit={commit('body')} style={{ fontSize: 38, lineHeight: 1.4, color: p.sub }} />
            </div>
            <div className="absolute" style={{ left: PAD, right: PAD, top: 1180, height: 2, background: p.line }} />
            <span className="absolute" style={{ left: PAD, top: 1222, fontSize: 44, fontWeight: 700, color: p.fg }}>
              {last ? 'SAVE THIS ↺' : 'SWIPE ⟶'}
            </span>
            <span className="absolute" style={{ right: PAD, top: 1236, fontFamily: mono, fontSize: 24, fontWeight: 600, color: p.sub }}>
              {handle}
            </span>
          </>
        )}
      </div>
    </div>
  );
}

/** Numbered comment pin + inline comment box, positioned in slide-percent space. */
export function PinMarker({
  pin,
  active,
  onOpen,
  onSave,
  onDelete,
  onClose,
}: {
  pin: SlidePin;
  active: boolean;
  onOpen: () => void;
  onSave: (text: string) => void;
  onDelete: () => void;
  onClose: () => void;
}) {
  const [draft, setDraft] = useState(pin.text);
  const below = pin.y < 0.58;
  return (
    <>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onOpen();
        }}
        className={cn(
          'absolute z-20 flex h-6 w-6 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border-2 font-mono text-[11px] font-bold shadow-[0_4px_14px_rgba(0,0,0,0.5)] transition-transform hover:scale-110',
          active ? 'border-paper bg-orange text-obsidian' : 'border-obsidian bg-orange text-obsidian',
          !pin.text && !active && 'robo-pulse',
        )}
        style={{ left: `${pin.x * 100}%`, top: `${pin.y * 100}%` }}
        aria-label={`Comment pin ${pin.n}`}
      >
        {pin.n}
      </button>
      {active && (
        <div
          className="absolute z-30 w-[230px] rounded-lg border border-orange/60 bg-panel-elevated p-2.5 shadow-[0_18px_40px_rgba(0,0,0,0.6)]"
          style={{
            left: `clamp(6px, calc(${pin.x * 100}% - 115px), calc(100% - 236px))`,
            ...(below ? { top: `calc(${pin.y * 100}% + 16px)` } : { bottom: `calc(${(1 - pin.y) * 100}% + 16px)` }),
          }}
          onClick={(e) => e.stopPropagation()}
          onMouseDown={(e) => e.stopPropagation()}
        >
          <p className="hud-label mb-1.5">📍 Pin {pin.n}</p>
          <textarea
            autoFocus
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              e.stopPropagation();
              if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) onSave(draft.trim());
              if (e.key === 'Escape') onClose();
            }}
            placeholder="What should Claude change here?"
            rows={3}
            className="w-full resize-none rounded-md border border-subtle bg-obsidian p-2 text-[12px] leading-snug text-paper outline-none placeholder:text-muted focus:border-orange"
          />
          <div className="mt-1.5 flex items-center gap-1.5">
            <button type="button" onClick={() => onSave(draft.trim())} className="h-6 rounded-full bg-orange px-2.5 font-mono text-[9.5px] font-bold uppercase text-obsidian">
              Save ⌘↵
            </button>
            <button type="button" onClick={onDelete} className="h-6 rounded-full border border-subtle px-2.5 font-mono text-[9.5px] uppercase text-muted hover:text-[#EF4444]">
              Delete
            </button>
            <button type="button" onClick={onClose} className="ml-auto font-mono text-[10px] text-muted hover:text-paper">
              ✕
            </button>
          </div>
        </div>
      )}
    </>
  );
}
