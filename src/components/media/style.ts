// Deterministic style profile for a generation (seed → composition choices).
// Pure module, shared by the canvas renderer (client) and POST /api/media/promote (server).
import { ASPECT_BY_ID, MODEL_BY_ID, headlineFromPrompt, type GenItem } from './data';

export type WildcardStyle = 'risograph' | 'vaporwave' | 'swiss' | 'acid' | 'bauhaus';
export type StandardSubject = 'terminal' | 'mascot' | 'chart' | 'orb';

export const WILDCARD_STYLES: Record<
  WildcardStyle,
  { label: string; palette: string[]; layout: string; typography: string; texture: string }
> = {
  risograph: {
    label: 'Risograph Two-Ink',
    palette: ['#F3EAD7', '#FF48B0', '#0078BF', '#1A1A1A'],
    layout: 'Centered overlapping halftone discs, headline set low',
    typography: 'Newsreader italic serif, misregistered pink offset',
    texture: 'Halftone dots + paper grain, multiply blend',
  },
  vaporwave: {
    label: 'Vaporwave Sunset',
    palette: ['#2B0A3D', '#FF2E88', '#FFB86B', '#8EE3FF'],
    layout: 'Striped sun on horizon over perspective grid floor',
    typography: 'Outfit 700 chrome gradient with outline stroke',
    texture: 'Scanline gradient sky, neon grid',
  },
  swiss: {
    label: 'Swiss International',
    palette: ['#EDEBE6', '#E30613', '#111111', '#9A968E'],
    layout: 'Asymmetric 12-col grid, giant numeral, red block offset right',
    typography: 'Outfit 600 lowercase, tight tracking, flush-left rag',
    texture: 'Flat ink, hairline grid rules',
  },
  acid: {
    label: 'Acid Y2K',
    palette: ['#050505', '#C6FF00', '#FF00E5', '#FFFFFF'],
    layout: 'Radial wobble rings with star bursts, centered lockup',
    typography: 'Outlined Outfit 700 with magenta drop shadow',
    texture: 'Concentric strokes, sparkle glyphs',
  },
  bauhaus: {
    label: 'Bauhaus Primaries',
    palette: ['#F0E6D2', '#E63946', '#1D3557', '#F4A261'],
    layout: 'Primitive shapes (circle, triangle, quarter-disc) on a cream field',
    typography: 'Outfit 700 uppercase, bottom-left block',
    texture: 'Flat geometric fills, no gradients',
  },
};

const WILDCARD_ORDER: WildcardStyle[] = ['risograph', 'vaporwave', 'swiss', 'acid', 'bauhaus'];
const SUBJECT_ORDER: StandardSubject[] = ['terminal', 'mascot', 'chart', 'orb'];
const SUBJECT_LABEL: Record<StandardSubject, string> = {
  terminal: 'glowing terminal window',
  mascot: 'pixel mascot hero',
  chart: 'rising bar chart + arrow',
  orb: 'orbital ring core',
};
const BADGES = ['NEW', 'FREE', 'LIVE', '5.5', 'v3', '#1'];

export function pickWildcardStyle(seed: number): WildcardStyle {
  return WILDCARD_ORDER[seed % WILDCARD_ORDER.length];
}
export function pickSubject(seed: number): StandardSubject {
  return SUBJECT_ORDER[(seed >>> 3) % SUBJECT_ORDER.length];
}
export function pickBadge(seed: number): string {
  return BADGES[(seed >>> 5) % BADGES.length];
}
/** Index of the headline word painted orange (prefers the longest word). */
export function accentWordIndex(words: string[]): number {
  let best = 0;
  words.forEach((w, i) => {
    if (w.length >= words[best].length) best = i;
  });
  return best;
}

export interface StyleProfile {
  styleName: string;
  palette: string[];
  layout: string;
  typography: string;
  texture: string;
  subject: string;
  rules: string[];
}

type ProfileInput = Pick<GenItem, 'prompt' | 'seed' | 'variant' | 'aspect' | 'mediaType' | 'model'>;

export function styleProfile(item: ProfileInput): StyleProfile {
  const headline = headlineFromPrompt(item.prompt);
  const aspect = ASPECT_BY_ID[item.aspect];
  const landscape = aspect.w > aspect.h;
  const motion =
    item.mediaType === 'animation'
      ? `Motion: ${MODEL_BY_ID[item.model].clipSec ?? 5}s seamless loop (glow pulse + subject drift), first frame must read as a still`
      : null;

  if (item.variant === 'wildcard') {
    const ws = WILDCARD_STYLES[pickWildcardStyle(item.seed)];
    return {
      styleName: `WILDCARD · ${ws.label}`,
      palette: ws.palette,
      layout: ws.layout,
      typography: ws.typography,
      texture: ws.texture,
      subject: 'abstract / style-led',
      rules: [
        `Exploration slot (20% quota): deliberately breaks the /robo palette — ${ws.label}`,
        `Palette ${ws.palette.join(' · ')}`,
        `Layout: ${ws.layout}`,
        `Type: ${ws.typography} — headline "${headline}"`,
        `Texture: ${ws.texture}`,
        ...(motion ? [motion] : []),
        'Do not converge: keep at most one promoted wildcard per style family per week',
      ],
    };
  }

  const subject = pickSubject(item.seed);
  const words = headline.split(' ');
  const accent = words[accentWordIndex(words)];
  const layout = landscape
    ? 'Headline left 55% / subject right, orange arrow bridging the two'
    : 'Stacked: headline top 45%, subject bottom, arrow pointing down';
  return {
    styleName: 'STANDARD · /robo Ink Well',
    palette: ['#0A0A0A', '#FF5500', '#F5F2EB', '#262522'],
    layout,
    typography: `Outfit 700 uppercase, ≤4 words, accent word "${accent}" in #FF5500`,
    texture: 'HUD grid at 5% + radial orange glow behind subject',
    subject: SUBJECT_LABEL[subject],
    rules: [
      'Background #0A0A0A with a radial #FF5500 glow (~35%) centred on the subject',
      `Headline "${headline}" in Outfit 700 uppercase; accent word "${accent}" in #FF5500, rest #F5F2EB`,
      `Layout: ${layout}`,
      `Subject: ${SUBJECT_LABEL[subject]}; corner badge "${pickBadge(item.seed)}"`,
      'Thin orange underline bar under headline; max 2 colours + paper white',
      ...(motion ? [motion] : []),
    ],
  };
}
