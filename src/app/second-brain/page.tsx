import { Suspense } from 'react';
import type { Metadata } from 'next';
import { SecondBrainApp } from '@/components/second-brain/SecondBrainApp';

export const metadata: Metadata = {
  title: 'VOLTA Second Brain',
  description: 'Wikilink graph of your Obsidian vaults — 3D orb, 2D map, LTM timeline, routines, skills and applications analytics.',
};

function Fallback() {
  return (
    <div className="flex h-screen w-screen items-center justify-center overflow-hidden bg-obsidian">
      <span className="hud-label robo-pulse rounded-full px-3 py-1">LOADING SECOND BRAIN…</span>
    </div>
  );
}

export default function SecondBrainPage() {
  return (
    <Suspense fallback={<Fallback />}>
      <SecondBrainApp />
    </Suspense>
  );
}
