'use client';
import { useState } from 'react';
import { Cloud, Disc3 } from 'lucide-react';
import { cn } from '@/lib/cn';
import { trackCoverUrl } from './format';
import type { MusicTrack } from './types';

function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

const PALETTES: [string, string][] = [
  ['#FF5500', '#A855F7'],
  ['#14B8A6', '#3B82F6'],
  ['#F5A623', '#EF4444'],
  ['#A855F7', '#14B8A6'],
  ['#EF4444', '#FF5500'],
  ['#3B82F6', '#A855F7'],
];

/** Embedded art when the file is local and has any; otherwise a deterministic gradient + sigil from the track id. */
export function Cover({ track, className }: { track: MusicTrack; className?: string }) {
  const [broken, setBroken] = useState(false);
  const h = hash(track.id);
  const [a, b] = PALETTES[h % PALETTES.length];
  const angle = 25 + (h % 140);
  const initials = track.title
    .replace(/[^\p{L}\p{N} ]/gu, '')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase())
    .join('');
  const art = track.storage === 'local' && track.hasCover && !broken;
  return (
    <div className={cn('relative aspect-square w-full overflow-hidden bg-obsidian', className)}>
      {art ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={trackCoverUrl(track.id)} alt="" loading="lazy" onError={() => setBroken(true)} className="h-full w-full object-cover" />
      ) : (
        <div className="absolute inset-0" style={{ background: `linear-gradient(${angle}deg, ${a}33, ${b}22 60%, #0A0A0A)` }}>
          <div
            className="absolute inset-0 opacity-60"
            style={{ background: `radial-gradient(circle at ${20 + (h % 60)}% ${25 + ((h >> 3) % 50)}%, ${a}55, transparent 55%)` }}
          />
          <Disc3 className="absolute right-[8%] top-[8%] h-[22%] w-[22%] opacity-25" style={{ color: b }} aria-hidden />
          <span className="absolute bottom-[8%] left-[9%] font-doto text-[clamp(28px,5vw,46px)] font-bold leading-none" style={{ color: a }}>
            {initials || 'VV'}
          </span>
        </div>
      )}
      {track.storage === 'icloud' && (
        <span className="absolute inset-0 flex items-center justify-center bg-black/45" title="In iCloud: not downloaded to this Mac">
          <Cloud className="h-8 w-8 text-amber/90" aria-hidden />
        </span>
      )}
    </div>
  );
}
