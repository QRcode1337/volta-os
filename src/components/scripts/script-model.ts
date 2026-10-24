// VOLTA Scripts — local types, timing math, hook generation and editor hand-off builders.
import type { EditorInboxItem } from '@/types/os';
import { seededRandom } from '@/lib/mock-data';

export const WPM = 150;

export interface ScriptHook {
  id: string;
  kind: 'tone' | 'wildcard';
  angle: string; // short label, e.g. "Curiosity gap"
  text: string;
  retention: number; // predicted 30s retention %, 0-100
}

export interface ScriptChapter {
  id: string;
  title: string;
}

export interface ScriptRow {
  id: string;
  chapterId: string;
  voiceover: string;
  visualCue: string;
}

export interface ScriptDoc {
  id: string;
  title: string;
  hooks: ScriptHook[];
  activeHookId: string;
  hookCue: string; // visual cue that plays under the active hook
  wildcardSeed: number;
  chapters: ScriptChapter[];
  rows: ScriptRow[];
}

// ───────────────────────── timing ─────────────────────────

export function wordCount(text: string): number {
  const m = text.trim().match(/\S+/g);
  return m ? m.length : 0;
}

export function secondsFor(text: string): number {
  return (wordCount(text) / WPM) * 60;
}

export function fmtClock(sec: number): string {
  const s = Math.max(0, Math.round(sec));
  const m = Math.floor(s / 60);
  return `${String(m).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
}

export function fmtDur(sec: number): string {
  const s = Math.round(sec);
  if (s < 60) return `${s}s`;
  return `${Math.floor(s / 60)}m ${String(s % 60).padStart(2, '0')}s`;
}

export interface TimedRow extends ScriptRow {
  startSec: number;
  durationSec: number;
  words: number;
}

export interface TimedChapter extends ScriptChapter {
  index: number;
  startSec: number;
  durationSec: number;
  words: number;
  rows: TimedRow[];
}

export interface ScriptTiming {
  hookWords: number;
  hookSec: number;
  chapters: TimedChapter[];
  flat: TimedRow[];
  totalWords: number;
  totalSec: number;
}

/** Rows in display order: chapter order first, then array order inside each chapter. */
export function orderedRows(doc: ScriptDoc): ScriptRow[] {
  return doc.chapters.flatMap((c) => doc.rows.filter((r) => r.chapterId === c.id));
}

export function activeHook(doc: ScriptDoc): ScriptHook | undefined {
  return doc.hooks.find((h) => h.id === doc.activeHookId) ?? doc.hooks[0];
}

/** The active hook opens chapter 1 at 00:00; everything after it is timed at 150 wpm. */
export function computeTiming(doc: ScriptDoc): ScriptTiming {
  const hook = activeHook(doc);
  const hookWords = hook ? wordCount(hook.text) : 0;
  const hookSec = (hookWords / WPM) * 60;
  let t = 0;
  const flat: TimedRow[] = [];
  const chapters: TimedChapter[] = doc.chapters.map((c, index) => {
    const startSec = t;
    let words = 0;
    if (index === 0) {
      t += hookSec;
      words += hookWords;
    }
    const rows = doc.rows
      .filter((r) => r.chapterId === c.id)
      .map((r) => {
        const w = wordCount(r.voiceover);
        const d = (w / WPM) * 60;
        const row: TimedRow = { ...r, startSec: t, durationSec: d, words: w };
        t += d;
        words += w;
        flat.push(row);
        return row;
      });
    return { ...c, index, startSec, durationSec: t - startSec, words, rows };
  });
  return { hookWords, hookSec, chapters, flat, totalWords: flat.reduce((a, r) => a + r.words, hookWords), totalSec: t };
}

// ───────────────────────── editor hand-off ─────────────────────────

const SCENE_RULES: { key: string; re: RegExp }[] = [
  { key: 'ring-zoom', re: /\bring\b|\borbit(al)?\b/gi },
  { key: 'arms-stack', re: /\bARMS\b/g },
  { key: 'cache-meter', re: /\bcache\b|\bwarm\b|\bcold reload\b/gi },
  { key: 'wildcard-split', re: /\bwildcards?\b|80\/20/gi },
  { key: 'brain-orb', re: /\bsecond brain\b|\borb\b|\bsphere\b/gi },
  { key: 'jev-router', re: /\bjev\b|\brouter\b|\brouting\b/gi },
  { key: 'outro-cta', re: /\bsubscribe\b|\bCTA\b|\boutro\b|\bend card\b/gi },
];

/** Keyword-scored scene pick; highest match count wins, ties go to rule order. Default 'title-reveal'. */
export function pickSceneKey(text: string): string {
  let best = 'title-reveal';
  let bestScore = 0;
  for (const rule of SCENE_RULES) {
    const score = (text.match(rule.re) ?? []).length;
    if (score > bestScore) {
      best = rule.key;
      bestScore = score;
    }
  }
  return best;
}

export function buildEditorItems(doc: ScriptDoc, timing: ScriptTiming, nowIso: string, stamp: number): EditorInboxItem[] {
  const hook = activeHook(doc);
  return timing.chapters
    .filter((c) => c.rows.length > 0 || c.index === 0)
    .map((c) => {
      const cues: NonNullable<EditorInboxItem['cues']> = [];
      if (c.index === 0 && hook) cues.push({ atSec: 0, voiceover: hook.text, visualCue: doc.hookCue });
      for (const r of c.rows) {
        cues.push({ atSec: Math.round((r.startSec - c.startSec) * 10) / 10, voiceover: r.voiceover, visualCue: r.visualCue });
      }
      const sceneText = [c.title, ...cues.map((q) => q.visualCue)].join(' \n ');
      return {
        id: `scripts-${doc.id}-${c.id}-${stamp}`,
        title: `${doc.title} · Ch ${String(c.index + 1).padStart(2, '0')} ${c.title}`,
        kind: 'ANIMATION' as const,
        durationSec: Math.max(1, Math.round(c.durationSec)),
        source: 'scripts' as const,
        sceneKey: pickSceneKey(sceneText),
        cues,
        createdAt: nowIso,
      };
    });
}

// ───────────────────────── hooks ─────────────────────────

const WILDCARD_OPENERS = [
  'Delete your to-do list.',
  'I fired myself last Tuesday.',
  'This is the most boring screen I own.',
  'My AI has a worse memory than a goldfish — on purpose.',
  'Nobody asked for this, so I built it anyway.',
  'Stop prompting. Start filing.',
  'I let a robot run my calendar for 30 days.',
  'This video costs me eighteen cents to make.',
  'Everything you know about context windows is upside down.',
  'I replaced six apps with one text file.',
];

const WILDCARD_TWISTS = [
  'Here is what happened when {topic} took over.',
  'And {topic} is the reason why.',
  'The weird part? {topic} did it without asking.',
  'Watch what {topic} does in the next sixty seconds.',
  'By the end you will want {topic} too.',
  'It sounds unhinged until you see {topic} in action.',
];

const WILDCARD_ANGLES = ['Pattern interrupt', 'Confession', 'Anti-advice', 'Absurd stakes', 'Cold reversal', 'Deadpan'];

/** Deterministic wildcard pair for a seed — the 20% that keeps /tone from overfitting. */
export function generateWildcards(seed: number, topic: string): ScriptHook[] {
  const rand = seededRandom(seed * 7919 + 13);
  const usedOpeners = new Set<number>();
  const usedTwists = new Set<number>();
  return [0, 1].map((slot) => {
    let o = Math.floor(rand() * WILDCARD_OPENERS.length);
    while (usedOpeners.has(o)) o = (o + 1) % WILDCARD_OPENERS.length;
    usedOpeners.add(o);
    let w = Math.floor(rand() * WILDCARD_TWISTS.length);
    while (usedTwists.has(w)) w = (w + 1) % WILDCARD_TWISTS.length;
    usedTwists.add(w);
    const twist = WILDCARD_TWISTS[w].replace('{topic}', topic);
    return {
      id: `wild-${seed}-${slot}`,
      kind: 'wildcard' as const,
      angle: WILDCARD_ANGLES[Math.floor(rand() * WILDCARD_ANGLES.length)],
      text: `${WILDCARD_OPENERS[o]} ${twist}`,
      retention: Math.round(48 + rand() * 34),
    };
  });
}

// ───────────────────────── seeds ─────────────────────────

type RowSeed = [voiceover: string, visualCue: string];

function makeDoc(
  id: string,
  title: string,
  topic: string,
  toneHooks: [angle: string, text: string, retention: number][],
  hookCue: string,
  chapters: [title: string, rows: RowSeed[]][],
): ScriptDoc {
  const hooks: ScriptHook[] = [
    ...toneHooks.map(([angle, text, retention], i) => ({ id: `${id}-tone-${i + 1}`, kind: 'tone' as const, angle, text, retention })),
    ...generateWildcards(1, topic),
  ];
  const best = hooks.filter((h) => h.kind === 'tone').sort((a, b) => b.retention - a.retention)[0];
  return {
    id,
    title,
    hooks,
    activeHookId: best.id,
    hookCue,
    wildcardSeed: 1,
    chapters: chapters.map(([t], i) => ({ id: `${id}-ch-${i + 1}`, title: t })),
    rows: chapters.flatMap(([, rows], ci) =>
      rows.map(([voiceover, visualCue], ri) => ({ id: `${id}-r-${ci + 1}-${ri + 1}`, chapterId: `${id}-ch-${ci + 1}`, voiceover, visualCue })),
    ),
  };
}

export const SCRIPT_TOPICS: Record<string, string> = {
  'agentic-os-v3': 'my agentic OS',
  'mods-deep-dive': 'one tiny mod',
};

export const SEED_SCRIPTS: ScriptDoc[] = [
  makeDoc(
    'agentic-os-v3',
    'Claude 5.5 Agentic OS v3',
    SCRIPT_TOPICS['agentic-os-v3'],
    [
      ['Big reveal', 'Something big just shipped with Claude 5.5, and I rebuilt my entire business around it in one weekend.', 86],
      ['Curiosity gap', 'There is one file on my laptop that runs my whole company. By the end of this video you will have a copy.', 82],
      ['Proof first', 'Four hundred twenty-four thousand files, one local dashboard, and an AI that actually knows where everything is.', 79],
      ['Cost shock', 'I ran four thousand AI jobs this week for eighteen cents. Here is the routing trick that makes that possible.', 77],
      ['Before / after', 'Six months ago I had fourteen tabs and zero systems. Today Claude opens one screen and runs my morning.', 74],
      ['Contrarian', 'You do not need more AI tools. You need fewer, wired together the right way.', 71],
      ['Framework tease', 'I call it ARMS — four layers that turn Claude from a chatbot into an operating system.', 69],
      ['Direct promise', 'In the next ten minutes I will show you exactly how to build your own agentic OS from scratch.', 66],
    ],
    'Doto title reveal: "AGENTIC OS v3" types on, orange scanline sweep, mascot blinks.',
    [
      [
        'Cold Open',
        [
          ['Let me show you what that actually looks like on a normal Tuesday morning.', 'Hard cut to screen capture of the home dashboard booting, HUD panels stagger in.'],
          ['No tabs. No copy-paste. Just one screen that already knows my day.', 'Push in on the calendar + flagged email widgets, orange highlight pulses.'],
        ],
      ],
      [
        'Home Dashboard Overview',
        [
          ["So what you're seeing is the home dashboard. Everything Claude touches shows up here first.", 'Wide shot of the dashboard, label callouts animate onto each bento card.'],
          ['Every artifact Claude makes lands on this ring — decks, scripts, thumbnails, all of it.', '3D artifact ring zoom: camera orbits the ring and lands on the BETASHARES node.'],
          ['And the skills deck routes each job to the right model, so I am never paying Opus prices for Haiku work.', 'Skills deck popover opens, Haiku / Sonnet / Opus matrix lights up row by row.'],
        ],
      ],
      [
        'The ARMS Framework',
        [
          ['I call it ARMS. Apps, Routines, Memory, Skills.', 'ARMS stack diagram builds bottom-up, one layer per word, Doto labels.'],
          ['Each layer is just plain text files that Claude can read, route and rewrite.', 'Folder tree slides in beside the ARMS stack; files glow as they are named.'],
          ['Apps are the doors. Routines are the clock. Memory is the context. Skills are the hands.', 'Each ARMS layer flashes its accent color in sync with the line.'],
        ],
      ],
      [
        'Database Skills & Wildcards',
        [
          ['Database skills are memory with taste. They learn what I like from every approval.', 'Grid of approved thumbnails fills in, green check stamps on each.'],
          ['But if you only feed it winners, it overfits and every output starts to look the same.', 'Thumbnails morph into near-identical copies, desaturate to grey.'],
          ['So twenty percent of every batch is a wildcard — deliberately weird, deliberately different.', 'Wildcard 80/20 split: the bar cracks open and the 20% slice animates in after the 80% block.'],
        ],
      ],
      [
        'Second Brain',
        [
          ['This is four hundred twenty-four thousand files, rendered as one living map.', 'Second brain orb fly-through, dotted sphere rotating slowly.'],
          ['Every dot is something Claude can read, link and cite back to me.', 'Zoom into a cluster, edge lines draw between related notes.'],
        ],
      ],
      [
        'Prompt Cache Math',
        [
          ['Here is the bit nobody talks about: the prompt cache.', 'Cache meter enters from the right, needle sitting in the WARM zone.'],
          ['Keep it warm and the next message costs fourteen cents. Let it go cold and a reload costs almost five dollars on Opus.', 'Meter flips from WARM to COLD, numbers count up in Doto, red flash.'],
        ],
      ],
      [
        'Jev Router',
        [
          ['Jev decides which model gets every single job before a token is spent.', 'Jev router stats panel: requests fan out into Haiku, Sonnet and Opus lanes.'],
          ['This week that was four thousand four hundred calls for eighteen cents total.', 'Counter ticks to 4,451 routes · $0.18, Haiku share bar fills to 41%.'],
        ],
      ],
      [
        'Outro & CTA',
        [
          ['Grab the full template in the community — every file you saw today is in there.', 'End card with template preview, subscribe button pulses orange.'],
          ['See you in the next one.', 'Mascot waves, hard cut to black.'],
        ],
      ],
    ],
  ),
  makeDoc(
    'mods-deep-dive',
    'Claude Mods Deep Dive',
    SCRIPT_TOPICS['mods-deep-dive'],
    [
      ['Hidden feature', 'Claude has a feature almost nobody uses, and it quietly saves me five dollars every single morning.', 84],
      ['Curiosity gap', 'This little bar at the bottom of my screen is the most valuable thing I have ever built with Claude.', 80],
      ['Proof first', 'Eleven hours idle, cache still warm, next message fourteen cents. Let me show you how.', 76],
      ['Mistake', 'I was burning money on cold cache reloads for months before I built this one mod.', 75],
      ['Speed', 'You can build your first Claude mod in under ten minutes, and you will never go back.', 72],
      ['Contrarian', 'Stop asking Claude for features. Build them yourself — it takes one text file.', 68],
      ['List', 'Three mods, one status line and a single hook that changed how I work with Claude.', 65],
      ['Direct promise', 'By the end of this you will have a working usage monitor running on your own machine.', 63],
    ],
    'Close-up of the usage bar sliding up from the bottom edge, cache dot breathing green.',
    [
      [
        'Cold Open',
        [
          ['This is the usage bar. It lives at the bottom of every screen I use.', 'Macro shot of the usage bar, HUD labels tick in.'],
          ['It tells me one thing: whether my next message is cheap or expensive.', 'Split screen: WARM $0.14 on the left, COLD $4.92 on the right.'],
        ],
      ],
      [
        'What Is a Mod?',
        [
          ['A mod is a small piece of interface or behaviour you bolt onto Claude yourself.', 'Exploded diagram of the Claude window with mod slots highlighted.'],
          ['Panels, status lines, slash commands, hooks — all of it is just files you own.', 'File icons stack into a neat column with Doto labels.'],
        ],
      ],
      [
        'The Cache Monitor',
        [
          ['The first mod I built watches the prompt cache in real time.', 'Cache meter scene: needle sweeps from COLD up to WARM.'],
          ['When the cache is about to go cold, it nudges me to send one tiny message and keep it warm.', 'Warm timer counts down from 51 minutes, amber warning glow at 5.'],
          ['That single nudge is the five dollars a day I mentioned in the intro.', 'Coin stack grows beside the meter, $4.92 saved label.'],
        ],
      ],
      [
        'Routing With Jev',
        [
          ['The second mod is a router. I named it Jev.', 'Jev router stats scene: request dots enter and split into three model lanes.'],
          ['It reads each job and sends it to the cheapest model that can actually do it.', 'Lanes light up Haiku green, Sonnet teal, Opus purple.'],
        ],
      ],
      [
        'Hooks That Teach',
        [
          ['The last one is a hook that turns my feedback into permanent rules.', 'Pinned comments fly from a video frame into a SKILL.md file.'],
          ['Every correction I make gets written into the skill, so I never make it twice.', 'Diff view: green lines append under Learned Preferences.'],
        ],
      ],
      [
        'Outro & CTA',
        [
          ['All three mods are in the community, ready to copy.', 'End card with the three mod icons, subscribe button pulses.'],
          ['Build one tonight, and tell me what you made.', 'Mascot thumbs-up, cut to black.'],
        ],
      ],
    ],
  ),
];

export function seedById(id: string): ScriptDoc | undefined {
  return SEED_SCRIPTS.find((s) => s.id === id);
}

let rowCounter = 0;
/** Unique row id — only called from event handlers (never during render). */
export function newRowId(): string {
  rowCounter += 1;
  return `row-${Date.now().toString(36)}-${rowCounter}`;
}
