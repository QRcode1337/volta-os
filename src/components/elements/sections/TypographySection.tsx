'use client';
import { DotoTicker } from '../library/DotoTicker';
import { DotoTickerSource } from '../snippets/library-sources';
import { Specimen } from '../Specimen';
import type { SpecimenCode } from '../Specimen';

const FONTS_IMPORT =
  "@import url('https://fonts.googleapis.com/css2?family=Doto:wght@600;700;800&family=JetBrains+Mono:wght@400;500;600&family=Newsreader:ital,opsz,wght@0,6..72,400;1,6..72,400&family=Outfit:wght@300;400;500;600;700&display=swap');";

const SCALE = [
  { token: 'display', size: 48, weight: 700, leading: 1.05, tracking: '-0.02em', sample: 'Agentic OS v3' },
  { token: 'h1', size: 32, weight: 600, leading: 1.15, tracking: '-0.015em', sample: 'Your business, as plain text' },
  { token: 'h2', size: 22, weight: 600, leading: 1.25, tracking: '-0.01em', sample: 'Apps · Routines · Memory · Skills' },
  { token: 'body', size: 15, weight: 400, leading: 1.55, tracking: '0', sample: 'Claude reads every file in the workspace and routes each job to the right model.' },
  { token: 'small', size: 12.5, weight: 400, leading: 1.5, tracking: '0', sample: 'Last edited 2 days ago · 1,284 tokens' },
] as const;

const WEIGHTS = [300, 400, 500, 600, 700] as const;

const SCALE_CODE: SpecimenCode = {
  tsx: `// Outfit type scale — size / weight / line-height / tracking
const SCALE = [
${SCALE.map((s) => `  { token: '${s.token}', size: ${s.size}, weight: ${s.weight}, leading: ${s.leading}, tracking: '${s.tracking}' },`).join('\n')}
] as const;

export function TypeScale({ sample = 'Agentic OS v3' }: { sample?: string }) {
  return (
    <div style={{ display: 'grid', gap: 18 }}>
      {SCALE.map((s) => (
        <div key={s.token} style={{ display: 'grid', gridTemplateColumns: '120px 1fr', alignItems: 'baseline', gap: 16 }}>
          <span style={{ font: '600 10px/1 "JetBrains Mono", monospace', letterSpacing: '0.08em', color: '#6E6A61' }}>
            {s.token.toUpperCase()} · {s.size}/{s.weight}
          </span>
          <span
            style={{
              fontFamily: 'Outfit, sans-serif',
              fontSize: s.size,
              fontWeight: s.weight,
              lineHeight: s.leading,
              letterSpacing: s.tracking,
              color: '#F5F2EB',
            }}
          >
            {sample}
          </span>
        </div>
      ))}
    </div>
  );
}`,
  html: `<style>
  ${FONTS_IMPORT}
  .t { font-family: 'Outfit', sans-serif; color: #F5F2EB; margin: 0 0 18px; }
${SCALE.map((s) => `  .t-${s.token} { font-size: ${s.size}px; font-weight: ${s.weight}; line-height: ${s.leading}; letter-spacing: ${s.tracking}; }`).join('\n')}
</style>

${SCALE.map((s) => `<p class="t t-${s.token}">${s.sample}</p>`).join('\n')}`,
};

const MONO_CODE: SpecimenCode = {
  tsx: `import type { ReactNode } from 'react';

const MONO = '"JetBrains Mono", monospace';

/** .hud-label — 11px / 600 / uppercase / 0.08em */
export function HudLabel({ children }: { children: ReactNode }) {
  return (
    <span style={{ font: \`600 11px/1 \${MONO}\`, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#A39E93' }}>
      {children}
    </span>
  );
}

export function Telemetry({ rows }: { rows: [label: string, value: string][] }) {
  return (
    <dl style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '8px 24px', margin: 0 }}>
      {rows.map(([k, v]) => (
        <div key={k} style={{ display: 'contents' }}>
          <dt style={{ font: \`500 10px/1.4 \${MONO}\`, letterSpacing: '0.08em', color: '#6E6A61' }}>{k}</dt>
          <dd style={{ margin: 0, font: \`600 11px/1.4 \${MONO}\`, color: '#F5F2EB' }}>{v}</dd>
        </div>
      ))}
    </dl>
  );
}

// <HudLabel>Prompt cache · warm</HudLabel>
// <Telemetry rows={[['CACHED', '186k tok'], ['NEXT MSG', '$0.14'], ['COLD RELOAD', '$4.92']]} />`,
  html: `<style>
  ${FONTS_IMPORT}
  .hud-label { font: 600 11px/1 'JetBrains Mono', monospace; text-transform: uppercase; letter-spacing: 0.08em; color: #A39E93; }
  .telemetry { display: grid; grid-template-columns: auto 1fr; gap: 8px 24px; margin: 0; }
  .telemetry dt { font: 500 10px/1.4 'JetBrains Mono', monospace; letter-spacing: 0.08em; color: #6E6A61; }
  .telemetry dd { margin: 0; font: 600 11px/1.4 'JetBrains Mono', monospace; color: #F5F2EB; }
</style>

<span class="hud-label">Prompt cache · warm</span>
<dl class="telemetry">
  <dt>CACHED</dt><dd>186k tok</dd>
  <dt>NEXT MSG</dt><dd>$0.14</dd>
  <dt>COLD RELOAD</dt><dd>$4.92</dd>
</dl>`,
};

const SERIF_CODE: SpecimenCode = {
  tsx: `export function EditorialCallout({ quote, cite }: { quote: string; cite: string }) {
  return (
    <figure style={{ margin: 0, padding: '4px 0 4px 20px', borderLeft: '2px solid #FF5500', maxWidth: 560 }}>
      <blockquote
        style={{
          margin: 0,
          fontFamily: 'Newsreader, Georgia, serif',
          fontStyle: 'italic',
          fontSize: 24,
          lineHeight: 1.35,
          color: '#F5F2EB',
        }}
      >
        “{quote}”
      </blockquote>
      <figcaption style={{ marginTop: 12, font: '600 10px/1 "JetBrains Mono", monospace', letterSpacing: '0.1em', color: '#6E6A61' }}>
        — {cite}
      </figcaption>
    </figure>
  );
}

// <EditorialCallout quote="If you only feed it winners, it overfits." cite="/WILDCARD · SKILL.md" />`,
  html: `<style>
  ${FONTS_IMPORT}
  .callout { margin: 0; padding: 4px 0 4px 20px; border-left: 2px solid #FF5500; max-width: 560px; }
  .callout blockquote { margin: 0; font: italic 400 24px/1.35 'Newsreader', Georgia, serif; color: #F5F2EB; }
  .callout figcaption { margin-top: 12px; font: 600 10px/1 'JetBrains Mono', monospace; letter-spacing: 0.1em; color: #6E6A61; }
</style>

<figure class="callout">
  <blockquote>“If you only feed it winners, it overfits.”</blockquote>
  <figcaption>— /WILDCARD · SKILL.md</figcaption>
</figure>`,
};

const DOTO_CODE: SpecimenCode = {
  tsx: `${DotoTickerSource}
// <DotoTicker startTokens={186_420} />`,
  html: `<style>
  ${FONTS_IMPORT}
  .ticker { display: flex; flex-wrap: wrap; gap: 36px; }
  .ticker__cell { display: grid; gap: 8px; }
  .ticker__label { font: 600 10px/1 'JetBrains Mono', monospace; letter-spacing: 0.08em; color: #6E6A61; }
  .ticker__value { font: 700 34px/1 'Doto', monospace; letter-spacing: 0.03em; color: #F5F2EB; font-variant-numeric: tabular-nums; }
</style>

<div class="ticker">
  <div class="ticker__cell"><span class="ticker__label">CONTEXT TOKENS</span><span class="ticker__value" id="tokens">186,420</span></div>
  <div class="ticker__cell"><span class="ticker__label">SESSION</span><span class="ticker__value" id="session" style="color:#FF5500">00:00:00</span></div>
</div>

<script>
  let tokens = 186420, sec = 0;
  const pad = (n) => String(n).padStart(2, '0');
  setInterval(() => {
    tokens += 37 + (tokens % 23);
    document.getElementById('tokens').textContent = tokens.toLocaleString('en-US');
  }, 120);
  setInterval(() => {
    sec += 1;
    document.getElementById('session').textContent =
      pad(Math.floor(sec / 3600)) + ':' + pad(Math.floor((sec % 3600) / 60)) + ':' + pad(sec % 60);
  }, 1000);
</script>`,
};

export function TypographySection() {
  return (
    <>
      <Specimen id="type-outfit" title="Outfit type scale" description="Primary UI face. Tight negative tracking on display sizes, generous leading on body." code={SCALE_CODE}>
        <div className="flex flex-col gap-[18px]">
          {SCALE.map((s) => (
            <div key={s.token} className="grid grid-cols-[120px_1fr] items-baseline gap-4">
              <span className="font-mono text-[10px] font-semibold tracking-[0.08em] text-muted">
                {s.token.toUpperCase()} · {s.size}/{s.weight}
              </span>
              <span className="text-paper" style={{ fontSize: s.size, fontWeight: s.weight, lineHeight: s.leading, letterSpacing: s.tracking }}>
                {s.sample}
              </span>
            </div>
          ))}
        </div>
        <div className="mt-6 flex flex-wrap gap-2 border-t border-subtle pt-5">
          {WEIGHTS.map((w) => (
            <div key={w} className="flex min-w-[96px] flex-1 flex-col items-center gap-1 rounded-lg border border-subtle bg-panel px-3 py-3">
              <span className="text-[30px] leading-none text-paper" style={{ fontWeight: w }}>
                Aa
              </span>
              <span className="font-mono text-[9.5px] text-muted">{w}</span>
            </div>
          ))}
        </div>
      </Specimen>

      <Specimen id="type-doto" title="Doto counters" description="Dot-matrix numerals for every live metric. Always tabular figures so ticking digits never jitter." code={DOTO_CODE}>
        <DotoTicker />
        <div className="mt-6 flex flex-wrap items-end gap-8 border-t border-subtle pt-5">
          {([600, 700, 800] as const).map((w) => (
            <div key={w} className="flex flex-col gap-1.5">
              <span className="font-doto text-[44px] leading-none text-paper" style={{ fontWeight: w }}>
                424,846
              </span>
              <span className="font-mono text-[9.5px] text-muted">DOTO {w}</span>
            </div>
          ))}
        </div>
      </Specimen>

      <Specimen id="type-mono" title="JetBrains Mono HUD labels" description="Uppercase micro-labels, telemetry readouts and file paths." code={MONO_CODE}>
        <div className="flex flex-wrap items-start gap-10">
          <div className="flex flex-col gap-3">
            <span className="hud-label">Prompt cache · warm</span>
            <span className="hud-label !text-orange">Teach my /cut</span>
            <span className="font-mono text-[11px] text-secondary">workspace/skills/animate/SKILL.md</span>
          </div>
          <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-2">
            {[
              ['CACHED', '186k tok'],
              ['NEXT MSG', '$0.14'],
              ['COLD RELOAD', '$4.92'],
            ].map(([k, v]) => (
              <div key={k} className="contents">
                <dt className="font-mono text-[10px] font-medium tracking-[0.08em] text-muted">{k}</dt>
                <dd className="font-mono text-[11px] font-semibold text-paper">{v}</dd>
              </div>
            ))}
          </dl>
        </div>
      </Specimen>

      <Specimen id="type-serif" title="Newsreader editorial callouts" description="Italic serif for quotes, pull-outs and narrative asides — never for UI chrome." code={SERIF_CODE}>
        <figure className="m-0 max-w-[560px] border-l-2 border-orange py-1 pl-5">
          <blockquote className="m-0 font-serif text-[24px] italic leading-[1.35] text-paper">“If you only feed it winners, it overfits.”</blockquote>
          <figcaption className="mt-3 font-mono text-[10px] font-semibold tracking-[0.1em] text-muted">— /WILDCARD · SKILL.md</figcaption>
        </figure>
      </Specimen>
    </>
  );
}
