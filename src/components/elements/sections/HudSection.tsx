'use client';
import { ArrowLeft, CalendarDays, Gauge, Layers, PlaySquare } from 'lucide-react';
import { HudPanel, HudPill, ModelEffortBadge, PixelMascotLogo } from '@/components/robo-ui';
import { Specimen, useNotify } from '../Specimen';
import type { SpecimenCode } from '../Specimen';

const HUD_CARD_CSS = `  .hud-card { display: flex; flex-direction: column; min-height: 0; overflow: hidden;
    background: #141413; border: 1px solid #262522; border-radius: 10px; }
  .hud-card__head { display: flex; align-items: center; gap: 8px; height: 36px; padding: 0 12px;
    border-bottom: 1px solid #262522; }
  .hud-card__icon { width: 16px; height: 16px; color: #FF5500; }
  .hud-label { font: 600 11px/1 'JetBrains Mono', monospace; text-transform: uppercase;
    letter-spacing: 0.08em; color: #A39E93; margin: 0; }
  .hud-pill { display: inline-flex; align-items: center; height: 24px; padding: 0 10px; border-radius: 999px;
    border: 1px solid #262522; background: #1C1B19; color: #A39E93; cursor: pointer;
    font: 600 10px/1 'JetBrains Mono', monospace; text-transform: uppercase; letter-spacing: 0.08em; }
  .hud-pill:hover { border-color: #3A3834; color: #F5F2EB; }
  .hud-pill--primary { border-color: #FF5500; background: #FF5500; color: #0A0A0A; }
  .hud-card__actions { margin-left: auto; display: flex; gap: 6px; }
  .hud-card__body { flex: 1; min-height: 0; padding: 12px; }`;

const BENTO_CODE: SpecimenCode = {
  tsx: `import { CalendarDays, Gauge, Layers, PlaySquare } from 'lucide-react';
import { HudPanel, ModelEffortBadge } from '@/components/robo-ui';

export function HudBento() {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 12 }}>
      {/* 1 · default: icon + secondary action */}
      <HudPanel title="Calendar" icon={<CalendarDays size={14} />} actions={[{ label: 'Open cal', href: '#' }]} bodyClassName="p-3">
        <EventRow time="10:00" title="BetaShares sync" />
        <EventRow time="13:30" title="Record: Agentic OS v3" />
        <EventRow time="16:00" title="Community office hours" />
      </HudPanel>

      {/* 2 · live badge in headerExtra + primary action */}
      <HudPanel
        title="Prompt cache"
        icon={<Gauge size={14} />}
        headerExtra={<span className="robo-pulse h-1.5 w-1.5 rounded-full bg-green" />}
        actions={[{ label: 'Warm up', primary: true, onClick: () => {} }]}
        bodyClassName="p-3"
      >
        <div className="font-doto text-[36px] font-bold leading-none text-paper">51m</div>
        <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-obsidian">
          <div className="h-full w-[85%] rounded-full bg-green" />
        </div>
      </HudPanel>

      {/* 3 · badge header extra + dense rows */}
      <HudPanel title="Skills deck" icon={<Layers size={14} />} headerExtra={<ModelEffortBadge model="SONNET" label="JEV ROUTED" />} bodyClassName="flex flex-col gap-2 p-3">
        <SkillRow cmd="/clean-up" model="HAIKU" effort="LOW" />
        <SkillRow cmd="/animate" model="SONNET" effort="HIGH" />
        <SkillRow cmd="/strategy" model="OPUS" effort="MAX" />
      </HudPanel>

      {/* 4 · wide card */}
      <HudPanel title="YouTube · 48h" icon={<PlaySquare size={14} />} actions={[{ label: 'Expand' }]} className="col-span-3" bodyClassName="p-3">
        <Bars values={[42, 68, 31, 87, 55, 74, 96, 63]} />
      </HudPanel>
    </div>
  );
}

function EventRow({ time, title }: { time: string; title: string }) {
  return (
    <div className="flex items-center gap-3 border-b border-subtle py-1.5 last:border-0">
      <span className="font-doto text-[13px] font-bold text-orange">{time}</span>
      <span className="text-[12.5px] text-paper">{title}</span>
    </div>
  );
}

function SkillRow({ cmd, model, effort }: { cmd: string; model: 'HAIKU' | 'SONNET' | 'OPUS'; effort: 'LOW' | 'HIGH' | 'MAX' }) {
  return (
    <div className="flex items-center justify-between">
      <span className="font-mono text-[11.5px] text-paper">{cmd}</span>
      <ModelEffortBadge model={model} effort={effort} />
    </div>
  );
}

function Bars({ values }: { values: number[] }) {
  return (
    <div className="flex h-16 items-end gap-1.5">
      {values.map((v, i) => (
        <div key={i} className="flex-1 rounded-sm bg-orange/80" style={{ height: \`\${v}%\` }} />
      ))}
    </div>
  );
}`,
  html: `<style>
${HUD_CARD_CSS}
  .bento { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 12px; }
  .doto { font: 700 36px/1 'Doto', monospace; color: #F5F2EB; }
  .meter { margin-top: 8px; height: 6px; border-radius: 999px; background: #0A0A0A; overflow: hidden; }
  .meter > span { display: block; height: 100%; width: 85%; border-radius: 999px; background: #22C55E; }
  .live { width: 6px; height: 6px; border-radius: 999px; background: #22C55E; animation: pulse 1.6s ease-in-out infinite; }
  @keyframes pulse { 0%, 100% { box-shadow: 0 0 0 0 rgba(34,197,94,.4); } 50% { box-shadow: 0 0 0 6px rgba(34,197,94,0); } }
</style>

<div class="bento">
  <section class="hud-card">
    <header class="hud-card__head">
      <svg class="hud-card__icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/></svg>
      <h2 class="hud-label">Calendar</h2>
      <div class="hud-card__actions"><a class="hud-pill" href="#">Open cal</a></div>
    </header>
    <div class="hud-card__body">10:00 BetaShares sync</div>
  </section>

  <section class="hud-card">
    <header class="hud-card__head">
      <h2 class="hud-label">Prompt cache</h2>
      <span class="live"></span>
      <div class="hud-card__actions"><button class="hud-pill hud-pill--primary">Warm up</button></div>
    </header>
    <div class="hud-card__body">
      <div class="doto">51m</div>
      <div class="meter"><span></span></div>
    </div>
  </section>
</div>`,
};

const HEADER_CODE: SpecimenCode = {
  tsx: `import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { HudPill, ModelEffortBadge, PixelMascotLogo } from '@/components/robo-ui';

/** Micro-app top bar: back link · mascot · VOLTA + Doto accent word · right-side pills. */
export function MicroAppHeader({ accent }: { accent: string }) {
  return (
    <header className="flex h-14 items-center gap-4 border-b border-subtle bg-panel px-4">
      <Link
        href="/"
        className="inline-flex h-8 items-center gap-1.5 rounded-full border border-subtle bg-panel-elevated px-3 font-mono text-[10px] font-semibold uppercase tracking-[0.08em] text-secondary hover:text-paper"
      >
        <ArrowLeft size={14} /> Back to VOLTA OS
      </Link>
      <PixelMascotLogo size={24} />
      <span className="flex items-baseline gap-2">
        <span className="text-[17px] font-bold text-paper">VOLTA</span>
        <span className="font-doto text-[18px] font-bold text-orange">{accent}</span>
      </span>
      <div className="ml-auto flex items-center gap-1.5">
        <ModelEffortBadge model="OPUS" effort="HIGH" size="md" />
        <HudPill label="Preview" />
        <HudPill label="Copy all (7)" primary />
      </div>
    </header>
  );
}`,
  html: `<style>
  .app-bar { display: flex; align-items: center; gap: 16px; height: 56px; padding: 0 16px;
    background: #141413; border-bottom: 1px solid #262522; font-family: 'Outfit', sans-serif; }
  .back { display: inline-flex; align-items: center; gap: 6px; height: 32px; padding: 0 12px; border-radius: 999px;
    border: 1px solid #262522; background: #1C1B19; color: #A39E93; text-decoration: none;
    font: 600 10px/1 'JetBrains Mono', monospace; text-transform: uppercase; letter-spacing: 0.08em; }
  .brand { display: flex; align-items: baseline; gap: 8px; }
  .brand b { font-size: 17px; font-weight: 700; color: #F5F2EB; }
  .brand em { font: normal 700 18px/1 'Doto', monospace; color: #FF5500; }
  .app-bar__right { margin-left: auto; display: flex; gap: 6px; }
  .pill { display: inline-flex; align-items: center; height: 24px; padding: 0 10px; border-radius: 999px;
    border: 1px solid #262522; background: #1C1B19; color: #A39E93;
    font: 600 10px/1 'JetBrains Mono', monospace; text-transform: uppercase; letter-spacing: 0.08em; }
  .pill--primary { border-color: #FF5500; background: #FF5500; color: #0A0A0A; }
  .pill--opus { color: #A855F7; border-color: #A855F755; background: #A855F714; }
</style>

<header class="app-bar">
  <a class="back" href="/">← Back to VOLTA OS</a>
  <span class="brand"><b>VOLTA</b><em>Editor</em></span>
  <div class="app-bar__right">
    <span class="pill pill--opus">● OPUS · HIGH</span>
    <button class="pill">Preview</button>
    <button class="pill pill--primary">Copy all (7)</button>
  </div>
</header>`,
};

export function HudSection() {
  const notify = useNotify();
  return (
    <>
      <Specimen
        id="hud-bento"
        title="HUD bento cards"
        description={
          <>
            The real <code className="font-mono text-[11px] text-orange">&lt;HudPanel /&gt;</code> in four variants: default, live badge + primary action, badge header, and a wide spanning card.
          </>
        }
        code={BENTO_CODE}
      >
        <div className="grid grid-cols-3 gap-3">
          <HudPanel title="Calendar" icon={<CalendarDays size={14} />} actions={[{ label: 'Open cal', onClick: () => notify('HudPill · "Open cal" clicked') }]} bodyClassName="p-3">
            {[
              ['10:00', 'BetaShares sync'],
              ['13:30', 'Record: Agentic OS v3'],
              ['16:00', 'Community office hours'],
            ].map(([t, title]) => (
              <div key={t} className="flex items-center gap-3 border-b border-subtle py-1.5 last:border-0">
                <span className="font-doto text-[13px] font-bold text-orange">{t}</span>
                <span className="truncate text-[12.5px] text-paper">{title}</span>
              </div>
            ))}
          </HudPanel>
          <HudPanel
            title="Prompt cache"
            icon={<Gauge size={14} />}
            headerExtra={<span className="robo-pulse h-1.5 w-1.5 rounded-full bg-green" />}
            actions={[{ label: 'Warm up', primary: true, onClick: () => notify('Primary HudPill · cache warmed (demo)', 'success') }]}
            bodyClassName="p-3"
          >
            <div className="font-doto text-[36px] font-bold leading-none text-paper">51m</div>
            <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-obsidian">
              <div className="h-full w-[85%] rounded-full bg-green" />
            </div>
            <p className="mt-2 font-mono text-[9.5px] uppercase tracking-[0.08em] text-muted">Warm · next msg $0.14</p>
          </HudPanel>
          <HudPanel title="Skills deck" icon={<Layers size={14} />} headerExtra={<ModelEffortBadge model="SONNET" label="JEV ROUTED" />} bodyClassName="flex flex-col gap-2 p-3">
            {(
              [
                ['/clean-up', 'HAIKU', 'LOW'],
                ['/animate', 'SONNET', 'HIGH'],
                ['/strategy', 'OPUS', 'MAX'],
              ] as const
            ).map(([cmd, m, e]) => (
              <div key={cmd} className="flex items-center justify-between">
                <span className="font-mono text-[11.5px] text-paper">{cmd}</span>
                <ModelEffortBadge model={m} effort={e} />
              </div>
            ))}
          </HudPanel>
          <HudPanel title="YouTube · 48h" icon={<PlaySquare size={14} />} actions={[{ label: 'Expand', onClick: () => notify('HudPill · "Expand" clicked') }]} className="col-span-3" bodyClassName="p-3">
            <div className="flex h-16 items-end gap-1.5">
              {[42, 68, 31, 87, 55, 74, 96, 63].map((v, i) => (
                <div key={i} className="flex-1 rounded-sm bg-orange/80" style={{ height: `${v}%` }} />
              ))}
            </div>
          </HudPanel>
        </div>
      </Specimen>

      <Specimen id="hud-headers" title="Header bars, pills & model badges" description="Micro-app chrome (contract §7), HudPill states and the color-coded ModelEffortBadge." code={HEADER_CODE}>
        <div className="flex flex-col gap-5">
          <div className="flex h-14 min-w-0 items-center gap-2 rounded-lg border border-subtle bg-panel px-3 md:gap-4 md:px-4">
            <span
              className="inline-flex h-9 w-9 shrink-0 items-center justify-center gap-1.5 rounded-full border border-subtle bg-panel-elevated font-mono text-[10px] font-semibold uppercase tracking-[0.08em] text-secondary md:h-8 md:w-auto md:justify-start md:px-3"
              title="Back to VOLTA OS"
            >
              <ArrowLeft size={14} /> <span className="max-md:sr-only">Back to VOLTA OS</span>
            </span>
            <PixelMascotLogo size={24} className="max-[400px]:hidden" />
            <span className="flex items-baseline gap-2 max-md:shrink-0">
              <span className="text-[17px] font-bold text-paper">VOLTA</span>
              <span className="font-doto text-[18px] font-bold text-orange">Editor</span>
            </span>
            <div className="ml-auto flex items-center gap-1.5 max-md:min-w-0 max-md:overflow-x-auto max-md:[scrollbar-width:none] max-md:[&::-webkit-scrollbar]:hidden [&>*]:max-md:shrink-0">
              <ModelEffortBadge model="OPUS" effort="HIGH" size="md" />
              <HudPill label="Preview" onClick={() => notify('HudPill · "Preview"')} />
              <HudPill label="Copy all (7)" primary onClick={() => notify('Primary HudPill · "Copy all (7)"', 'success')} />
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-6">
            <div className="flex flex-col gap-2">
              <span className="hud-label">HudPill</span>
              <div className="flex gap-1.5">
                <HudPill label="Default" onClick={() => notify('HudPill · default')} />
                <HudPill label="Primary" primary onClick={() => notify('HudPill · primary')} />
                <HudPill label="+ Add" onClick={() => notify('HudPill · "+ Add"')} />
              </div>
            </div>
            <div className="flex flex-col gap-2">
              <span className="hud-label">ModelEffortBadge · sm / md</span>
              <div className="flex flex-wrap gap-1.5">
                {(['HAIKU', 'SONNET', 'OPUS', 'FABLE'] as const).map((m) => (
                  <ModelEffortBadge key={m} model={m} />
                ))}
                <ModelEffortBadge model="OPUS" effort="MAX" size="md" />
              </div>
            </div>
          </div>
        </div>
      </Specimen>
    </>
  );
}
