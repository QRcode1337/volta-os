'use client';
import { useState } from 'react';
import { Check } from 'lucide-react';
import { cn } from '@/lib/cn';
import { copyText } from '../kit/clipboard';
import { Specimen, useNotify } from '../Specimen';
import type { SpecimenCode } from '../Specimen';

interface Token {
  name: string;
  cssVar: string;
  hex: string;
  usage: string;
  tw?: string;
}

/** Mirrors :root in src/app/globals.css. */
export const TOKEN_GROUPS: { group: string; tokens: Token[] }[] = [
  {
    group: 'Surfaces · Ink Well Soft',
    tokens: [
      { name: 'Obsidian', cssVar: '--bg-obsidian', hex: '#0A0A0A', usage: 'App background, video letterbox', tw: 'bg-obsidian' },
      { name: 'Panel', cssVar: '--bg-panel', hex: '#141413', usage: 'HUD cards & bento panels', tw: 'bg-panel' },
      { name: 'Panel Elevated', cssVar: '--bg-panel-elevated', hex: '#1C1B19', usage: 'Rows, inputs, pills', tw: 'bg-panel-elevated' },
      { name: 'Panel Hover', cssVar: '--bg-panel-hover', hex: '#24221F', usage: 'Hover / pressed surface', tw: 'bg-panel-hover' },
      { name: 'Border Subtle', cssVar: '--border-subtle', hex: '#262522', usage: '1px card + divider lines', tw: 'border-subtle' },
      { name: 'Border Highlight', cssVar: '--border-highlight', hex: '#3A3834', usage: 'Hover borders, scrollbars', tw: 'border-highlight' },
    ],
  },
  {
    group: 'Text · Paper',
    tokens: [
      { name: 'Paper', cssVar: '--text-paper', hex: '#F5F2EB', usage: 'Primary text, Doto numerals', tw: 'text-paper' },
      { name: 'Secondary', cssVar: '--text-secondary', hex: '#A39E93', usage: 'HUD labels, body copy', tw: 'text-secondary' },
      { name: 'Muted', cssVar: '--text-muted', hex: '#6E6A61', usage: 'Meta, timestamps, hints', tw: 'text-muted' },
    ],
  },
  {
    group: 'Brand accents',
    tokens: [
      { name: 'Robo Orange', cssVar: '--accent-orange', hex: '#FF5500', usage: 'Primary CTA, pins, active state', tw: 'bg-orange' },
      { name: 'Amber', cssVar: '--accent-amber', hex: '#F5A623', usage: 'Routines, warnings, FABLE', tw: 'text-amber' },
      { name: 'Green', cssVar: '--accent-green', hex: '#22C55E', usage: 'RL toggles, HAIKU, success', tw: 'text-green' },
      { name: 'Purple', cssVar: '--accent-purple', hex: '#A855F7', usage: 'OPUS, /wildcard lane', tw: 'text-purple' },
      { name: 'Teal', cssVar: '--accent-teal', hex: '#14B8A6', usage: 'SONNET, A-roll cuts', tw: 'text-teal' },
    ],
  },
  {
    group: 'Departments · Second Brain',
    tokens: [
      { name: 'Business', cssVar: '--dept-business', hex: '#FF6B2B', usage: 'Business node + mix', tw: 'text-dept-business' },
      { name: 'Content', cssVar: '--dept-content', hex: '#EF4444', usage: 'Content node + mix', tw: 'text-dept-content' },
      { name: 'Personal', cssVar: '--dept-personal', hex: '#06B6D4', usage: 'Personal node + mix', tw: 'text-dept-personal' },
      { name: 'Product', cssVar: '--dept-product', hex: '#3B82F6', usage: 'Product node, Apps recos', tw: 'text-dept-product' },
      { name: 'Community', cssVar: '--dept-community', hex: '#10B981', usage: 'Community node + mix', tw: 'text-dept-community' },
      { name: 'Routines', cssVar: '--dept-routines', hex: '#F5A623', usage: 'Routine nodes', tw: 'text-dept-routines' },
      { name: 'Apps', cssVar: '--dept-apps', hex: '#8B5CF6', usage: 'Application nodes', tw: 'text-dept-apps' },
    ],
  },
];

const ALL = TOKEN_GROUPS.flatMap((g) => g.tokens);

const CODE: SpecimenCode = {
  tsx: `// tokens.ts — /robo "Ink Well Soft" palette
export const ROBO = {
${ALL.map((t) => `  '${t.cssVar.slice(2)}': '${t.hex}',`).join('\n')}
} as const;

export type RoboToken = keyof typeof ROBO;

// Swatch.tsx — click to copy the hex value
export function Swatch({ token }: { token: RoboToken }) {
  const hex = ROBO[token];
  return (
    <button
      type="button"
      onClick={() => navigator.clipboard.writeText(hex)}
      style={{
        display: 'grid', gap: 8, padding: 8, width: 160, textAlign: 'left',
        background: '#141413', border: '1px solid #262522', borderRadius: 10, cursor: 'pointer',
      }}
    >
      <span style={{ height: 56, borderRadius: 6, background: hex, border: '1px solid #3A3834' }} />
      <span style={{ font: '600 11px/1 "JetBrains Mono", monospace', color: '#F5F2EB' }}>{hex}</span>
      <span style={{ font: '500 10px/1 "JetBrains Mono", monospace', color: '#6E6A61' }}>--{token}</span>
    </button>
  );
}

// <Swatch token="accent-orange" />`,
  html: `<style>
  :root {
${ALL.map((t) => `    ${t.cssVar}: ${t.hex};`).join('\n')}
  }
  .swatch {
    display: grid; gap: 8px; width: 160px; padding: 8px; text-align: left; cursor: pointer;
    background: var(--bg-panel); border: 1px solid var(--border-subtle); border-radius: 10px;
  }
  .swatch__chip { height: 56px; border-radius: 6px; border: 1px solid var(--border-highlight); }
  .swatch__hex { font: 600 11px/1 'JetBrains Mono', monospace; color: var(--text-paper); }
  .swatch__var { font: 500 10px/1 'JetBrains Mono', monospace; color: var(--text-muted); }
</style>

<button class="swatch" data-hex="#FF5500">
  <span class="swatch__chip" style="background: var(--accent-orange)"></span>
  <span class="swatch__hex">#FF5500</span>
  <span class="swatch__var">--accent-orange</span>
</button>

<script>
  document.querySelectorAll('.swatch').forEach((el) =>
    el.addEventListener('click', () => navigator.clipboard.writeText(el.dataset.hex)),
  );
</script>`,
};

export function ColorsSection() {
  const notify = useNotify();
  const [copied, setCopied] = useState<string | null>(null);

  const copy = async (t: Token) => {
    const ok = await copyText(t.hex);
    if (ok) {
      setCopied(t.cssVar);
      setTimeout(() => setCopied((c) => (c === t.cssVar ? null : c)), 1200);
      notify(`Copied ${t.hex} · var(${t.cssVar})`, 'success');
    } else notify('Clipboard unavailable', 'error');
  };

  return (
    <Specimen
      id="colors-swatches"
      title="Brand swatches & CSS tokens"
      description={
        <>
          Every surface, text and accent token from <code className="font-mono text-[11px] text-orange">globals.css</code>. Click a swatch to copy its hex.
        </>
      }
      code={CODE}
    >
      <div className="flex flex-col gap-6">
        {TOKEN_GROUPS.map((g) => (
          <div key={g.group}>
            <div className="hud-label mb-2.5">{g.group}</div>
            <div className="grid grid-cols-[repeat(auto-fill,minmax(176px,1fr))] gap-2.5">
              {g.tokens.map((t) => {
                const isCopied = copied === t.cssVar;
                return (
                  <button
                    key={t.cssVar}
                    type="button"
                    onClick={() => copy(t)}
                    className={cn(
                      'group flex flex-col gap-2 rounded-[10px] border bg-panel p-2 text-left transition-all hover:-translate-y-0.5 hover:border-highlight hover:shadow-[0_8px_24px_rgba(0,0,0,0.45)]',
                      isCopied ? 'border-green/60' : 'border-subtle',
                    )}
                    title={`Copy ${t.hex}`}
                  >
                    <span className="relative h-14 rounded-md border border-highlight" style={{ background: t.hex }}>
                      <span
                        className={cn(
                          'absolute right-1.5 top-1.5 flex h-5 items-center gap-1 rounded-full bg-obsidian/80 px-1.5 font-mono text-[9px] font-semibold text-paper transition-opacity',
                          isCopied ? 'opacity-100' : 'opacity-0 group-hover:opacity-100',
                        )}
                      >
                        {isCopied ? (
                          <>
                            <Check className="h-2.5 w-2.5 text-green" /> COPIED
                          </>
                        ) : (
                          'COPY'
                        )}
                      </span>
                    </span>
                    <span className="flex items-baseline justify-between gap-2 px-0.5">
                      <span className="truncate text-[12px] font-semibold text-paper">{t.name}</span>
                      <span className="font-mono text-[10.5px] font-semibold text-secondary">{t.hex}</span>
                    </span>
                    <span className="px-0.5 font-mono text-[9.5px] text-orange/90">var({t.cssVar})</span>
                    <span className="px-0.5 pb-0.5 text-[11px] leading-snug text-muted">{t.usage}</span>
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </Specimen>
  );
}
