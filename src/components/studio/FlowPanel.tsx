'use client';
// FLOW tab. Google Flow sends X-Frame-Options, so it cannot be embedded: this panel opens it in its own tab.
import Link from 'next/link';
import { ArrowUpRight, ExternalLink, Sparkles } from 'lucide-react';
import { StudioFolderHint } from './StudioFolderHint';

const FLOW_URL = 'https://labs.google/fx/tools/flow';
const OMNI_VEO_URL = 'https://www.notion.so/3fc5432465df810d8291f353e696697c';

const linkCard = 'group flex items-start gap-3 rounded-lg border border-subtle bg-panel p-4 transition-colors hover:border-orange/50';

export function FlowPanel() {
  return (
    <div className="mx-auto flex h-full w-full max-w-3xl flex-col justify-center gap-6 px-4 py-10">
      <div className="hud-card flex flex-col items-center gap-5 px-6 py-12 text-center">
        <Sparkles className="h-8 w-8 text-orange" />
        <div>
          <h1 className="font-doto text-4xl text-orange">FLOW</h1>
          <p className="mt-2 max-w-md text-[13.5px] leading-snug text-secondary">
            Google Flow blocks embedding (it refuses to load inside an iframe), so it opens in its own browser tab. Generate there, download the clips, then bring them back here to trim, join, reframe and mux.
          </p>
        </div>
        <a
          href={FLOW_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex h-14 items-center gap-3 rounded-full bg-orange px-10 text-[16px] font-bold tracking-tight text-black shadow-[0_0_40px_rgba(255,85,0,0.25)] transition-transform hover:scale-[1.03] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-orange"
        >
          Open Google Flow <ExternalLink className="h-5 w-5" />
        </a>
        <p className="font-mono text-[10.5px] uppercase tracking-[0.06em] text-muted">labs.google/fx/tools/flow · opens in a new tab</p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <Link href="/apps/generations" className={linkCard}>
          <div className="min-w-0 flex-1">
            <p className="text-[14px] font-semibold text-paper">Generations</p>
            <p className="mt-0.5 text-[12.5px] leading-snug text-secondary">xAI image and video plus ElevenLabs voice. Its video and voice items are selectable as ffmpeg inputs here.</p>
          </div>
          <ArrowUpRight className="h-4 w-4 shrink-0 text-muted transition-colors group-hover:text-orange" />
        </Link>
        <a href={OMNI_VEO_URL} target="_blank" rel="noopener noreferrer" className={linkCard}>
          <div className="min-w-0 flex-1">
            <p className="text-[14px] font-semibold text-paper">OMNI_VEO channel plan</p>
            <p className="mt-0.5 text-[12.5px] leading-snug text-secondary">The Notion plan for the OMNI_VEO channel. Opens in Notion in a new tab.</p>
          </div>
          <ExternalLink className="h-4 w-4 shrink-0 text-muted transition-colors group-hover:text-orange" />
        </a>
      </div>
      <StudioFolderHint />
    </div>
  );
}
