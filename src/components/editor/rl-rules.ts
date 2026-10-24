// Pure (isomorphic) RL-rule derivation — imported by the client prompt compiler AND the
// /api/editor/apply-feedback route, so the clipboard directive and the on-disk rule always agree.
// No 'use client', no DOM, no server-only imports.

export type TeachSkill = '/cut' | '/animate';

export interface RlPinInput {
  number: number;
  clipNumber: number;
  clipTitle: string;
  timestampSec: number;
  skill: string;
  commentText: string;
}

interface Aspect {
  id: string;
  test: RegExp;
  /** noun phrase used in "Extract the … preference" */
  aspect: string;
  /** phrase used after "specifying" (/animate) or "to" (/cut) */
  spec: string;
  /** concrete rule written to SKILL.md */
  rule: string;
}

const ANIMATE_ASPECTS: Aspect[] = [
  {
    id: 'fast',
    test: /speed up|faster|quicker|snappier|too slow|\b\d(\.\d)?x\b|sluggish/i,
    aspect: 'motion timing',
    spec: 'faster zoom easing (`cubic-bezier(0.16, 1, 0.3, 1)`)',
    rule: 'Default zoom / camera transitions to fast-out easing `cubic-bezier(0.16, 1, 0.3, 1)` at ~1.5x the previous speed; no single transition may exceed 600ms.',
  },
  {
    id: 'slow',
    test: /slow (down|the|it)|slower|calmer|too fast|reduce .*(speed|rotation)|~?\d+% slower/i,
    aspect: 'ambient motion speed',
    spec: '~30% slower ambient rotation / drift while narration is playing',
    rule: 'Reduce ambient rotation / drift speed by ~30% while a voiceover line is playing — motion supports the narration, never competes with it.',
  },
  {
    id: 'contrast',
    test: /glow|brighten|brighter|contrast|highlight|#ff5500|pop more/i,
    aspect: 'highlight contrast',
    spec: 'higher-contrast `#FF5500` active node glow',
    rule: 'Active / matched elements get a high-contrast `#FF5500` glow (≥ 18px blur, 0.9 alpha) while inactive siblings dim to 35% opacity.',
  },
  {
    id: 'sequence',
    test: /\bafter\b|\bbefore\b|stagger|sequence|same time|one by one|in order/i,
    aspect: 'entrance sequencing',
    spec: 'staggered entrances (secondary blocks enter ~150ms after the primary block settles)',
    rule: 'Never animate primary and secondary blocks simultaneously — stagger secondary / wildcard elements to enter ~150ms after the primary block settles.',
  },
  {
    id: 'type',
    test: /kerning|tracking|letter|font|typograph/i,
    aspect: 'kinetic typography',
    spec: 'tighter Doto tracking (`0.02em`) on animated title lockups',
    rule: 'Animated title lockups use Doto at `0.02em` tracking; never animate letter-spacing wider than `0.06em`.',
  },
];

const CUT_ASPECTS: Aspect[] = [
  {
    id: 'deadair',
    test: /dead air|pause|silence|\bgap\b|breath/i,
    aspect: 'pacing',
    spec: 'automatically trim dead-air pauses longer than `0.4s` before UI popover transitions',
    rule: 'Auto-trim any dead-air pause longer than `0.4s`, especially right before UI popovers or scene transitions.',
  },
  {
    id: 'jump',
    test: /jump cut|abrupt|jarring|b-?roll|harsh cut/i,
    aspect: 'cut smoothing',
    spec: 'cover abrupt jump cuts with at least 6 frames (0.2s) of B-roll',
    rule: 'Cover abrupt jump cuts with ≥ 6 frames (0.2s @ 30fps) of B-roll or a 4-frame J-cut; never leave a bare jump cut on a talking head.',
  },
  {
    id: 'tighten',
    test: /tighten|trim|shorter|drags?|too long|faster|speed up/i,
    aspect: 'pacing density',
    spec: 'tighten beats that run past 3s without new information',
    rule: 'Trim any beat that runs longer than 3s without new visual or spoken information.',
  },
  {
    id: 'hold',
    test: /longer|hold|linger|let it breathe|extend/i,
    aspect: 'reveal holds',
    spec: 'hold key reveals for at least 1s before cutting away',
    rule: 'Hold every key reveal (numbers, UI states, title cards) for ≥ 1s before cutting away.',
  },
];

export const SKILL_FILES: Record<TeachSkill, string> = {
  '/cut': 'skills/cut/SKILL.md',
  '/animate': 'skills/animate/SKILL.md',
};

export interface SkillLesson {
  skill: TeachSkill;
  file: string; // workspace-relative
  pinNumbers: number[];
  pinRefs: string; // "Pin #1 & Pin #5"
  aspects: string[];
  directive: string; // sentence for the clipboard prompt
  rules: { aspect: string; rule: string }[];
  evidence: string[];
}

function truncate(s: string, n: number): string {
  const clean = s.replace(/\s+/g, ' ').trim();
  return clean.length > n ? `${clean.slice(0, n - 1).trimEnd()}…` : clean;
}

function joinAnd(parts: string[]): string {
  if (parts.length <= 1) return parts.join('');
  if (parts.length === 2) return `${parts[0]} and ${parts[1]}`;
  return `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}`;
}

export function hmsOf(sec: number): string {
  const s = Math.max(0, Math.floor(sec));
  return [Math.floor(s / 3600), Math.floor((s % 3600) / 60), s % 60].map((n) => String(n).padStart(2, '0')).join(':');
}

/** Generalise every pin tagged with `skill` into a directive + concrete rules. Null when no pins. */
export function deriveLesson(skill: TeachSkill, pins: RlPinInput[]): SkillLesson | null {
  const own = pins.filter((p) => p.skill === skill).sort((a, b) => a.number - b.number);
  if (own.length === 0) return null;
  const table = skill === '/animate' ? ANIMATE_ASPECTS : CUT_ASPECTS;
  const hits: Aspect[] = [];
  const fallbacks: { aspect: string; rule: string; spec: string }[] = [];
  for (const p of own) {
    const matched = table.filter((a) => a.test.test(p.commentText));
    if (matched.length === 0) {
      fallbacks.push({
        aspect: skill === '/animate' ? 'motion' : 'editing',
        spec: `the default behaviour "${truncate(p.commentText, 90)}"`,
        rule: `Apply by default (from Pin #${p.number}): ${truncate(p.commentText, 220)}`,
      });
    }
    for (const a of matched) if (!hits.includes(a)) hits.push(a);
  }
  const aspects = [...hits.map((a) => a.aspect), ...(fallbacks.length && !hits.length ? [fallbacks[0].aspect] : [])];
  const specs = [...hits.map((a) => a.spec), ...fallbacks.map((f) => f.spec)];
  const pinRefs = own.map((p) => `Pin #${p.number}`).join(' & ');
  const verb = skill === '/animate' ? 'append a new rule under `## Learned Preferences (RL Log)` specifying' : 'append a rule under `## Learned Preferences (RL Log)` to';
  const directive = `Extract the ${joinAnd(aspects)} preference from ${pinRefs} and ${verb} ${joinAnd(specs)}.`;
  return {
    skill,
    file: SKILL_FILES[skill],
    pinNumbers: own.map((p) => p.number),
    pinRefs,
    aspects,
    directive,
    rules: [...hits.map((a) => ({ aspect: a.aspect, rule: a.rule })), ...fallbacks.map((f) => ({ aspect: f.aspect, rule: f.rule }))],
    evidence: own.map(
      (p) => `Pin #${p.number} (Clip ${String(p.clipNumber).padStart(2, '0')} ${p.clipTitle} @ ${hmsOf(p.timestampSec)}): "${truncate(p.commentText, 200)}"`,
    ),
  };
}

/** Markdown block appended under `## Learned Preferences (RL Log)`. */
export function lessonMarkdown(lesson: SkillLesson, dateIso: string, project: string): string {
  const lines = [
    `### ${dateIso} · VOLTA Editor feedback (${lesson.pinRefs})`,
    `_Project: ${project}_`,
    '',
    ...lesson.rules.map((r) => `- **Rule (${r.aspect}):** ${r.rule}`),
    ...lesson.evidence.map((e) => `- _Evidence:_ ${e}`),
    '',
  ];
  return lines.join('\n');
}

export const RL_HEADING = '## Learned Preferences (RL Log)';

/** Insert `entry` at the end of the RL Log section (creating the heading if missing). */
export function insertUnderHeading(content: string, entry: string, heading = RL_HEADING): string {
  const lines = content.split('\n');
  const idx = lines.findIndex((l) => l.trim() === heading);
  const entryLines = entry.replace(/\n+$/, '').split('\n');
  if (idx === -1) {
    const base = content.replace(/\s+$/, '');
    return `${base}${base ? '\n\n' : ''}${heading}\n\n${entryLines.join('\n')}\n`;
  }
  let end = lines.length;
  for (let j = idx + 1; j < lines.length; j++) {
    if (/^#{1,2}\s/.test(lines[j])) {
      end = j;
      break;
    }
  }
  // trim trailing blank lines of the section
  let insertAt = end;
  while (insertAt > idx + 1 && lines[insertAt - 1].trim() === '') insertAt--;
  const before = lines.slice(0, insertAt);
  const after = lines.slice(end);
  const out = [...before, '', ...entryLines, ...(after.length ? ['', ...after] : [''])];
  return out.join('\n');
}
