'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { ComponentType, ReactNode } from 'react';
import { Crosshair, Gauge, Grid3x3, LayoutGrid, Palette, Type } from 'lucide-react';
import { cn } from '@/lib/cn';
import { AppTopBar } from './kit/AppTopBar';
import { ToastStack, useToasts } from './kit/toast';
import { NotifyContext } from './Specimen';
import { ColorsSection } from './sections/ColorsSection';
import { HudSection } from './sections/HudSection';
import { MetricsSection, PinsTogglesSection, RoutingSection } from './sections/InteractiveSections';
import { TypographySection } from './sections/TypographySection';

interface SectionDef {
  id: string;
  num: string;
  title: string;
  blurb: string;
  icon: ComponentType<{ className?: string }>;
  specimens: { id: string; label: string }[];
  render: () => ReactNode;
}

const SECTIONS: SectionDef[] = [
  {
    id: 'colors',
    num: '01',
    title: 'Color swatches & CSS tokens',
    blurb: 'The "Ink Well Soft" surfaces, Paper text ramp, brand accents and department colors.',
    icon: Palette,
    specimens: [{ id: 'colors-swatches', label: 'Swatches & tokens' }],
    render: () => <ColorsSection />,
  },
  {
    id: 'typography',
    num: '02',
    title: 'Typography scale',
    blurb: 'Outfit for UI, Doto for numerals, JetBrains Mono for HUD labels, Newsreader for editorial asides.',
    icon: Type,
    specimens: [
      { id: 'type-outfit', label: 'Outfit scale' },
      { id: 'type-doto', label: 'Doto counters' },
      { id: 'type-mono', label: 'Mono HUD labels' },
      { id: 'type-serif', label: 'Newsreader callouts' },
    ],
    render: () => <TypographySection />,
  },
  {
    id: 'hud',
    num: '03',
    title: 'HUD bento cards & header bars',
    blurb: 'The shared HudPanel / HudPill / ModelEffortBadge primitives every widget is built from.',
    icon: LayoutGrid,
    specimens: [
      { id: 'hud-bento', label: 'Bento cards' },
      { id: 'hud-headers', label: 'Header bars & badges' },
    ],
    render: () => <HudSection />,
  },
  {
    id: 'routing',
    num: '04',
    title: 'Model × Effort routing matrix',
    blurb: 'An interactive selector for the 4 model tiers × 5 effort levels that the skills deck routes on.',
    icon: Grid3x3,
    specimens: [{ id: 'routing-matrix', label: 'Routing matrix' }],
    render: () => <RoutingSection />,
  },
  {
    id: 'metrics',
    num: '05',
    title: 'Doto metric heroes & mix bars',
    blurb: 'Count-up hero numbers and editable segmented proportion bars.',
    icon: Gauge,
    specimens: [
      { id: 'metric-heroes', label: 'Hero counters' },
      { id: 'mix-bars', label: 'Segmented mix bars' },
    ],
    render: () => <MetricsSection />,
  },
  {
    id: 'pins',
    num: '06',
    title: 'Spatial video pin & RL toggles',
    blurb: 'The review primitives from VOLTA Editor: click-to-pin frames and glowing teach switches.',
    icon: Crosshair,
    specimens: [
      { id: 'spatial-pin', label: 'Spatial video pin' },
      { id: 'rl-toggles', label: 'RL toggle switches' },
    ],
    render: () => <PinsTogglesSection />,
  },
];

const SPECIMEN_COUNT = SECTIONS.reduce((a, s) => a + s.specimens.length, 0);

export function ElementsApp() {
  const { toasts, push, dismiss } = useToasts(2600);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [activeSection, setActiveSection] = useState(SECTIONS[0].id);
  const [activeSpecimen, setActiveSpecimen] = useState(SECTIONS[0].specimens[0].id);

  const notify = useCallback((message: string, tone?: 'default' | 'success' | 'error') => push(message, { tone }), [push]);

  // Scroll-spy: the last section/specimen whose top has passed 30% of the viewport is active.
  useEffect(() => {
    const root = scrollRef.current;
    if (!root) return;
    const onScroll = () => {
      const line = root.getBoundingClientRect().top + root.clientHeight * 0.3;
      let sec = SECTIONS[0].id;
      let spec = SECTIONS[0].specimens[0].id;
      for (const s of SECTIONS) {
        const el = document.getElementById(`section-${s.id}`);
        if (el && el.getBoundingClientRect().top <= line) sec = s.id;
        for (const sp of s.specimens) {
          const e2 = document.getElementById(sp.id);
          if (e2 && e2.getBoundingClientRect().top <= line) spec = sp.id;
        }
      }
      if (root.scrollTop + root.clientHeight >= root.scrollHeight - 4) {
        const lastSec = SECTIONS[SECTIONS.length - 1];
        sec = lastSec.id;
        spec = lastSec.specimens[lastSec.specimens.length - 1].id;
      }
      setActiveSection(sec);
      setActiveSpecimen(spec);
    };
    onScroll();
    root.addEventListener('scroll', onScroll, { passive: true });
    return () => root.removeEventListener('scroll', onScroll);
  }, []);

  const scrollTo = (id: string) => {
    const root = scrollRef.current;
    const el = document.getElementById(id);
    if (!root || !el) return;
    const top = el.getBoundingClientRect().top - root.getBoundingClientRect().top + root.scrollTop - 20;
    root.scrollTo({ top, behavior: 'smooth' });
  };

  return (
    <NotifyContext.Provider value={notify}>
      <div className="flex h-screen w-screen flex-col overflow-hidden bg-obsidian text-paper">
        <AppTopBar
          accent="Elements"
          subtitle="/robo reusable UI component library"
          right={
            <div className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.08em] text-muted">
              <span className="rounded-full border border-subtle bg-panel-elevated px-2.5 py-1">
                <span className="text-paper">{SECTIONS.length}</span> sections
              </span>
              <span className="rounded-full border border-subtle bg-panel-elevated px-2.5 py-1">
                <span className="text-paper">{SPECIMEN_COUNT}</span> live specimens
              </span>
              <span className="rounded-full border border-orange/40 bg-orange/10 px-2.5 py-1 text-orange">TSX + HTML/CSS</span>
            </div>
          }
        />

        <div className="flex min-h-0 flex-1 max-md:flex-col max-md:overflow-y-auto">
          {/* Left nav */}
          <nav className="hud-scroll flex w-[248px] shrink-0 flex-col gap-1 overflow-y-auto border-r border-subtle bg-panel/40 px-3 py-4 max-md:max-h-[40dvh] max-md:overflow-y-auto max-md:w-full max-md:shrink-0 max-md:border-r-0 max-md:border-b" aria-label="Elements sections">
            <span className="hud-label mb-2 px-2 !text-[10px] !text-muted">Library</span>
            {SECTIONS.map((s) => {
              const Icon = s.icon;
              const on = activeSection === s.id;
              return (
                <div key={s.id} className="flex flex-col">
                  <button
                    type="button"
                    onClick={() => scrollTo(`section-${s.id}`)}
                    aria-current={on ? 'true' : undefined}
                    className={cn(
                      'group flex items-center gap-2.5 rounded-lg px-2 py-2 text-left transition-colors',
                      on ? 'bg-panel-elevated text-paper' : 'text-secondary hover:bg-panel-elevated/60 hover:text-paper',
                    )}
                  >
                    <span
                      className={cn(
                        'flex h-6 w-6 shrink-0 items-center justify-center rounded-md border transition-colors',
                        on ? 'border-orange/50 bg-orange/10 text-orange' : 'border-subtle text-muted group-hover:text-secondary',
                      )}
                    >
                      <Icon className="h-3.5 w-3.5" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block font-mono text-[9px] text-muted">{s.num}</span>
                      <span className="block truncate text-[12.5px] font-medium leading-tight">{s.title}</span>
                    </span>
                  </button>
                  {on && (
                    <div className="mb-1 ml-[19px] mt-0.5 flex flex-col border-l border-subtle pl-3">
                      {s.specimens.map((sp) => (
                        <button
                          key={sp.id}
                          type="button"
                          onClick={() => scrollTo(sp.id)}
                          className={cn(
                            'relative py-1 text-left text-[11.5px] transition-colors',
                            activeSpecimen === sp.id ? 'text-orange' : 'text-muted hover:text-paper',
                          )}
                        >
                          {activeSpecimen === sp.id && <span className="absolute -left-[13px] top-1/2 h-3.5 w-[2px] -translate-y-1/2 rounded-full bg-orange" />}
                          {sp.label}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
            <div className="mt-auto rounded-lg border border-subtle bg-panel p-3">
              <p className="font-mono text-[9.5px] uppercase leading-relaxed tracking-[0.06em] text-muted">
                Every snippet is self-contained. TSX panels are generated from the exact component that renders the specimen.
              </p>
            </div>
          </nav>

          {/* Content */}
          <div ref={scrollRef} className="hud-scroll min-w-0 flex-1 overflow-y-auto max-md:min-h-[80dvh] max-md:shrink-0">
            <div className="mx-auto flex max-w-[1080px] flex-col gap-14 px-8 pb-24 pt-8">
              <div>
                <span className="font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-orange">/robo design system</span>
                <h1 className="mt-2 text-[34px] font-bold leading-tight tracking-[-0.02em] text-paper">
                  Elements <span className="font-doto text-orange">v3</span>
                </h1>
                <p className="mt-2 max-w-[640px] text-[14px] leading-relaxed text-secondary">
                  Live, interactive specimens of the components behind VOLTA Agentic OS. Poke them, then copy the React/TSX or framework-free HTML/CSS straight into your own build.
                </p>
              </div>
              {SECTIONS.map((s) => (
                <section key={s.id} id={`section-${s.id}`} className="flex scroll-mt-4 flex-col gap-5">
                  <header className="flex items-end gap-4 border-b border-subtle pb-3">
                    <span className="font-doto text-[34px] font-bold leading-none text-orange/80">{s.num}</span>
                    <div>
                      <h2 className="text-[20px] font-semibold tracking-tight text-paper">{s.title}</h2>
                      <p className="mt-0.5 text-[12.5px] text-muted">{s.blurb}</p>
                    </div>
                  </header>
                  {s.render()}
                </section>
              ))}
            </div>
          </div>
        </div>
        <ToastStack toasts={toasts} onDismiss={dismiss} />
      </div>
    </NotifyContext.Provider>
  );
}
