'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { ArrowLeftRight, Minus, Pause, Play, Plus, RotateCcw, X } from 'lucide-react';
import { cn } from '@/lib/cn';
import type { ScriptHook, ScriptTiming } from './script-model';
import { WPM, fmtClock } from './script-model';

interface TeleprompterProps {
  title: string;
  hook?: ScriptHook;
  timing: ScriptTiming;
  onClose: () => void;
}

interface Segment {
  key: string;
  chapter?: string;
  text: string;
  hook?: boolean;
}

const SPEED_MIN = 0.25;
const SPEED_MAX = 3;
const SPEED_STEP = 0.25;

/**
 * Full-screen auto-scrolling prompter. 1.0× is calibrated so the whole script scrolls past the
 * reading line in exactly its computed 150 wpm runtime.
 * Keys: Space play/pause · ↑/↓ speed · M mirror · R restart · Esc exit.
 */
export function Teleprompter({ title, hook, timing, onClose }: TeleprompterProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const segRefs = useRef<(HTMLParagraphElement | null)[]>([]);
  const pos = useRef(0);
  const playingRef = useRef(false);
  const speedRef = useRef(1);

  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(1);
  const [mirror, setMirror] = useState(false);
  const [fontPx, setFontPx] = useState(52);
  const [progress, setProgress] = useState(0);
  const [activeIdx, setActiveIdx] = useState(0);

  const segments: Segment[] = [];
  timing.chapters.forEach((c) => {
    let first = true;
    if (c.index === 0 && hook) {
      segments.push({ key: 'hook', chapter: c.title, text: hook.text, hook: true });
      first = false;
    }
    c.rows.forEach((r) => {
      if (r.voiceover.trim()) {
        segments.push({ key: r.id, chapter: first ? c.title : undefined, text: r.voiceover });
        first = false;
      }
    });
  });

  playingRef.current = playing;
  speedRef.current = speed;

  const changeSpeed = useCallback((delta: number) => {
    setSpeed((s) => Math.min(SPEED_MAX, Math.max(SPEED_MIN, Math.round((s + delta) / SPEED_STEP) * SPEED_STEP)));
  }, []);

  const restart = useCallback(() => {
    pos.current = 0;
    if (scrollRef.current) scrollRef.current.scrollTop = 0;
    setProgress(0);
  }, []);

  // Animation loop.
  useEffect(() => {
    let raf = 0;
    let last = performance.now();
    let lastActive = -1;
    const tick = (now: number) => {
      const dt = Math.min(0.1, (now - last) / 1000);
      last = now;
      const el = scrollRef.current;
      if (el) {
        const max = el.scrollHeight - el.clientHeight;
        if (playingRef.current && max > 0) {
          const pxPerSec = max / Math.max(1, timing.totalSec);
          pos.current = Math.min(max, pos.current + pxPerSec * speedRef.current * dt);
          el.scrollTop = pos.current;
          if (pos.current >= max) setPlaying(false);
        }
        const p = max > 0 ? el.scrollTop / max : 0;
        setProgress((prev) => (Math.abs(prev - p) > 0.002 ? p : prev));
        // Which paragraph sits on the reading line?
        const mid = el.getBoundingClientRect().top + el.clientHeight / 2;
        let idx = lastActive;
        for (let i = 0; i < segRefs.current.length; i++) {
          const r = segRefs.current[i]?.getBoundingClientRect();
          if (r && r.top <= mid + 4 && r.bottom >= mid - 4) {
            idx = i;
            break;
          }
          if (r && r.top > mid) {
            idx = Math.max(0, i - 1);
            break;
          }
        }
        if (idx !== lastActive && idx >= 0) {
          lastActive = idx;
          setActiveIdx(idx);
        }
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [timing.totalSec]);

  // Manual wheel/trackpad scroll re-syncs the float position.
  const onScroll = () => {
    const el = scrollRef.current;
    if (el && Math.abs(el.scrollTop - pos.current) > 2) pos.current = el.scrollTop;
  };

  // Keyboard (capture phase so nothing underneath reacts).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const k = e.key;
      if (k === ' ' || k === 'Spacebar') setPlaying((p) => !p);
      else if (k === 'ArrowUp') changeSpeed(SPEED_STEP);
      else if (k === 'ArrowDown') changeSpeed(-SPEED_STEP);
      else if (k === 'Escape') onClose();
      else if (k === 'm' || k === 'M') setMirror((m) => !m);
      else if (k === 'r' || k === 'R') restart();
      else if (k === '+' || k === '=') setFontPx((f) => Math.min(96, f + 4));
      else if (k === '-' || k === '_') setFontPx((f) => Math.max(28, f - 4));
      else return;
      e.preventDefault();
      e.stopPropagation();
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [changeSpeed, onClose, restart]);

  const elapsed = progress * timing.totalSec;

  return (
    <div className="fixed inset-0 z-[60] flex flex-col bg-[#050505]" role="dialog" aria-modal="true" aria-label="Teleprompter">
      {/* Control strip */}
      <div className="relative z-20 flex h-14 shrink-0 items-center gap-3 border-b border-subtle bg-obsidian/90 px-5">
        <span className="hud-label !text-orange">Teleprompter</span>
        <span className="truncate text-[13px] font-semibold text-paper">{title}</span>
        <div className="mx-auto flex items-center gap-2">
          <CtrlBtn label="Restart (R)" onClick={restart}>
            <RotateCcw className="h-4 w-4" />
          </CtrlBtn>
          <CtrlBtn label="Slower (↓)" onClick={() => changeSpeed(-SPEED_STEP)}>
            <Minus className="h-4 w-4" />
          </CtrlBtn>
          <button
            type="button"
            onClick={() => setPlaying((p) => !p)}
            className="inline-flex h-9 items-center gap-2 rounded-full bg-orange px-4 font-mono text-[11px] font-bold uppercase tracking-[0.08em] text-obsidian hover:brightness-110"
          >
            {playing ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
            {playing ? 'Pause' : 'Roll'}
          </button>
          <CtrlBtn label="Faster (↑)" onClick={() => changeSpeed(SPEED_STEP)}>
            <Plus className="h-4 w-4" />
          </CtrlBtn>
          <div className="ml-1 flex flex-col items-center leading-none">
            <span className="font-doto text-[20px] font-bold text-paper">{speed.toFixed(2)}×</span>
            <span className="mt-0.5 font-mono text-[9px] text-muted">≈{Math.round(WPM * speed)} wpm</span>
          </div>
          <div className="mx-2 h-6 w-px bg-subtle" />
          <button
            type="button"
            onClick={() => setMirror((m) => !m)}
            aria-pressed={mirror}
            className={cn(
              'inline-flex h-8 items-center gap-1.5 rounded-full border px-3 font-mono text-[10px] font-semibold uppercase tracking-[0.08em] transition-colors',
              mirror ? 'border-green/60 bg-green/10 text-green shadow-[0_0_14px_rgba(34,197,94,0.25)]' : 'border-subtle text-secondary hover:text-paper',
            )}
          >
            <ArrowLeftRight className="h-3.5 w-3.5" /> Mirror (M)
          </button>
          <div className="flex items-center gap-1">
            <CtrlBtn label="Smaller text (−)" onClick={() => setFontPx((f) => Math.max(28, f - 4))}>
              <span className="text-[11px] font-bold">A</span>
            </CtrlBtn>
            <CtrlBtn label="Larger text (+)" onClick={() => setFontPx((f) => Math.min(96, f + 4))}>
              <span className="text-[15px] font-bold">A</span>
            </CtrlBtn>
          </div>
        </div>
        <span className="font-doto text-[16px] font-bold text-secondary">
          {fmtClock(elapsed)} <span className="text-muted">/ {fmtClock(timing.totalSec)}</span>
        </span>
        <CtrlBtn label="Exit (Esc)" onClick={onClose}>
          <X className="h-4 w-4" />
        </CtrlBtn>
      </div>
      <div className="h-[2px] w-full shrink-0 bg-subtle">
        <div className="h-full bg-orange" style={{ width: `${progress * 100}%` }} />
      </div>

      {/* Prompter body */}
      <div className="relative min-h-0 flex-1">
        <div
          ref={scrollRef}
          onScroll={onScroll}
          className="absolute inset-0 overflow-y-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        >
          <div
            className="mx-auto max-w-[1100px] px-10 py-[50vh]"
            style={{ transform: mirror ? 'scaleX(-1)' : undefined }}
          >
            {segments.map((s, i) => (
              <div key={s.key}>
                {s.chapter && (
                  <div className="mb-4 mt-14 flex items-center gap-3 first:mt-0">
                    <span className="h-px w-10 bg-orange/60" />
                    <span className="font-mono text-[13px] font-semibold uppercase tracking-[0.16em] text-orange">{s.chapter}</span>
                  </div>
                )}
                <p
                  ref={(el) => {
                    segRefs.current[i] = el;
                  }}
                  className={cn('mb-8 font-semibold transition-colors duration-300', i === activeIdx ? 'text-paper' : 'text-[#5b5850]')}
                  style={{ fontFamily: 'var(--font-sans)', fontSize: fontPx, lineHeight: 1.3, letterSpacing: '-0.01em' }}
                >
                  {s.hook && <span className="mr-3 align-middle font-mono text-[0.32em] font-bold uppercase tracking-[0.12em] text-orange">Hook</span>}
                  {s.text}
                </p>
              </div>
            ))}
            <p className="pt-10 text-center font-mono text-[14px] uppercase tracking-[0.2em] text-muted">— end of script —</p>
          </div>
        </div>

        {/* Fades + center reading line */}
        <div className="pointer-events-none absolute inset-x-0 top-0 h-[30%] bg-gradient-to-b from-[#050505] to-transparent" />
        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-[30%] bg-gradient-to-t from-[#050505] to-transparent" />
        <div className="pointer-events-none absolute inset-x-0 top-1/2 flex -translate-y-1/2 items-center">
          <span className="h-0 w-0 border-y-[9px] border-l-[14px] border-y-transparent border-l-orange" />
          <span className="h-px flex-1 bg-gradient-to-r from-orange/80 via-orange/25 to-orange/80" />
          <span className="h-0 w-0 border-y-[9px] border-r-[14px] border-y-transparent border-r-orange" />
        </div>

        {!playing && progress === 0 && (
          <div className="pointer-events-none absolute inset-x-0 bottom-8 flex justify-center">
            <span className="rounded-full border border-subtle bg-obsidian/90 px-4 py-2 font-mono text-[11px] uppercase tracking-[0.12em] text-secondary">
              <b className="text-orange">Space</b> roll · <b className="text-paper">↑ ↓</b> speed · <b className="text-paper">M</b> mirror · <b className="text-paper">Esc</b> exit
            </span>
          </div>
        )}
      </div>
    </div>
  );
}

function CtrlBtn({ label, onClick, children }: { label: string; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className="flex h-8 w-8 items-center justify-center rounded-full border border-subtle text-secondary transition-colors hover:border-highlight hover:text-paper"
    >
      {children}
    </button>
  );
}
