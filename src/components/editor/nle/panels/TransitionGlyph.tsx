'use client';
// VOLTA Editor — Edit mode: a tiny looping illustration of a transition (clip A → clip B) for the asset panel and
// the inspector. Pure CSS: hold A, transition, hold B, repeat.

import type { CSSProperties } from 'react';
import type { NleTransitionType } from '@/types/nle';
import { cn } from '@/lib/cn';

// 0–25% hold A · 25–75% transition · 75–100% hold B
const CSS = `
@keyframes nleT-in { 0%,25% { opacity: 0 } 75%,100% { opacity: 1 } }
@keyframes nleT-outHalf { 0%,25% { opacity: 1 } 50%,100% { opacity: 0 } }
@keyframes nleT-inHalf { 0%,50% { opacity: 0 } 75%,100% { opacity: 1 } }
@keyframes nleT-wash { 0%,25% { opacity: 0 } 50% { opacity: 1 } 75%,100% { opacity: 0 } }
@keyframes nleT-inFromR { 0%,25% { transform: translateX(100%) } 75%,100% { transform: translateX(0) } }
@keyframes nleT-outToL { 0%,25% { transform: translateX(0) } 75%,100% { transform: translateX(-100%) } }
@keyframes nleT-inFromL { 0%,25% { transform: translateX(-100%) } 75%,100% { transform: translateX(0) } }
@keyframes nleT-outToR { 0%,25% { transform: translateX(0) } 75%,100% { transform: translateX(100%) } }
@keyframes nleT-inFromB { 0%,25% { transform: translateY(100%) } 75%,100% { transform: translateY(0) } }
@keyframes nleT-outToT { 0%,25% { transform: translateY(0) } 75%,100% { transform: translateY(-100%) } }
@keyframes nleT-inFromT { 0%,25% { transform: translateY(-100%) } 75%,100% { transform: translateY(0) } }
@keyframes nleT-outToB { 0%,25% { transform: translateY(0) } 75%,100% { transform: translateY(100%) } }
@keyframes nleT-zoomIn { 0%,25% { opacity: 0; transform: scale(0.6) } 75%,100% { opacity: 1; transform: scale(1) } }
@keyframes nleT-zoomOut { 0%,25% { transform: scale(1) } 75%,100% { transform: scale(1.25) } }
@keyframes nleT-wipeL { 0%,25% { clip-path: inset(0 0 0 100%) } 75%,100% { clip-path: inset(0 0 0 0) } }
@keyframes nleT-wipeR { 0%,25% { clip-path: inset(0 100% 0 0) } 75%,100% { clip-path: inset(0 0 0 0) } }
@media (prefers-reduced-motion: reduce) { .nleT-anim { animation: none !important; } }
`;

const SPEC: Record<NleTransitionType, { a?: string; b: string; wash?: string }> = {
  dissolve: { b: 'nleT-in' },
  'dip-black': { a: 'nleT-outHalf', b: 'nleT-inHalf', wash: '#000000' },
  'dip-white': { a: 'nleT-outHalf', b: 'nleT-inHalf', wash: '#FFFFFF' },
  'slide-left': { a: 'nleT-outToL', b: 'nleT-inFromR' },
  'slide-right': { a: 'nleT-outToR', b: 'nleT-inFromL' },
  'slide-up': { a: 'nleT-outToT', b: 'nleT-inFromB' },
  'slide-down': { a: 'nleT-outToB', b: 'nleT-inFromT' },
  'zoom-in': { a: 'nleT-zoomOut', b: 'nleT-zoomIn' },
  'wipe-left': { b: 'nleT-wipeL' },
  'wipe-right': { b: 'nleT-wipeR' },
};

const anim = (name: string | undefined, dur: number): CSSProperties | undefined => (name ? { animation: `${name} ${dur}s ease-in-out infinite` } : undefined);

export function TransitionGlyph({ type, className, duration = 2.4, paused }: { type: NleTransitionType; className?: string; duration?: number; paused?: boolean }) {
  const s = SPEC[type];
  const play = (st: CSSProperties | undefined): CSSProperties | undefined => (st && paused ? { ...st, animationPlayState: 'paused' } : st);
  return (
    <div className={cn('relative overflow-hidden rounded bg-obsidian', className)} aria-hidden>
      <style href="nle-transition-glyphs" precedence="default">
        {CSS}
      </style>
      {/* dips: the wash sits between A and B so the backdrop of the dip is the wash colour */}
      <div className="nleT-anim absolute inset-0 flex items-center justify-center bg-gradient-to-br from-[#FF7A33] to-[#C23F00] font-mono text-[11px] font-bold text-obsidian/70" style={play(anim(s.a, duration))}>
        A
      </div>
      {s.wash && <div className="nleT-anim absolute inset-0" style={{ background: s.wash, ...play(anim('nleT-wash', duration)) }} />}
      <div className="nleT-anim absolute inset-0 flex items-center justify-center bg-gradient-to-br from-[#2DD4BF] to-[#0F766E] font-mono text-[11px] font-bold text-obsidian/70" style={play(anim(s.b, duration))}>
        B
      </div>
    </div>
  );
}
