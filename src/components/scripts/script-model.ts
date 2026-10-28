// VOLTA Scripts: timing math, outline -> teleprompter/editor conversion. The text always comes from a Notion
// "Script Outline" page (read-only); nothing here is seeded or generated.
import type { NotionPageDoc } from '@/types/notion';
import type { EditorInboxItem } from '@/types/os';
import { parseTables } from '@/lib/notion-md';
import { stripMarkdown } from '@/lib/text';
import { makeInboxItem } from '@/lib/media-ids';

export const WPM = 150;

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
  url: string;
  chapters: ScriptChapter[];
  rows: ScriptRow[];
}

// ───────────────────────── timing ─────────────────────────

export function wordCount(text: string): number {
  const m = text.trim().match(/\S+/g);
  return m ? m.length : 0;
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
  chapters: TimedChapter[];
  flat: TimedRow[];
  totalWords: number;
  totalSec: number;
}

/** Everything is timed at WPM words per minute, chapter by chapter in document order. */
export function computeTiming(doc: ScriptDoc): ScriptTiming {
  let t = 0;
  const flat: TimedRow[] = [];
  const chapters: TimedChapter[] = doc.chapters.map((c, index) => {
    const startSec = t;
    let words = 0;
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
  return { chapters, flat, totalWords: flat.reduce((a, r) => a + r.words, 0), totalSec: t };
}

// ───────────────────────── outline -> script ─────────────────────────

/** Voiceover for the teleprompter: no Markdown, no [SRC: …] tags, no "Loop:" style labels. */
function cleanVo(s: string): string {
  return stripMarkdown(s).replace(/^(loop|bridge|tag|cta|button|setup|payoff)\s*:\s*/i, '').trim();
}

/** Stage directions in the outline are whole-line italics that start with "On-screen" or a timecode. */
const isStageDirection = (line: string) => /^\*+\s*(on-screen|on screen|~?\d{1,2}:\d{2}|~\d)/i.test(line.trim()) && /\*+\s*$/.test(line.trim());

interface RawRow {
  vo: string;
  cue: string;
}

/** Paragraphs and bullets of a chapter body as voiceover rows; italic stage directions become the next row's visual cue. */
function rowsFromBody(md: string): RawRow[] {
  const out: RawRow[] = [];
  let cue = '';
  let para: string[] = [];
  const flush = () => {
    if (!para.length) return;
    const text = cleanVo(para.join(' '));
    para = [];
    if (text) {
      out.push({ vo: text, cue });
      cue = '';
    }
  };
  for (const raw of md.split('\n')) {
    const line = raw.trim();
    if (!line) {
      flush();
      continue;
    }
    if (/^#{1,6}\s/.test(line) || /^\|/.test(line) || /^-{3,}$/.test(line)) {
      flush();
      continue;
    }
    if (isStageDirection(line)) {
      flush();
      cue = [cue, stripMarkdown(line)].filter(Boolean).join(' ');
      continue;
    }
    if (/^([-*]|\d+\.)\s+/.test(line)) {
      flush();
      para = [line.replace(/^([-*]|\d+\.)\s+/, '')];
      flush();
      continue;
    }
    if (/^>/.test(line)) {
      flush();
      continue;
    }
    para.push(line);
  }
  flush();
  return out;
}

function beatCues(page: NotionPageDoc): Map<number, string> {
  const map = new Map<number, string>();
  const sheet = page.sections.find((s) => /beat sheet/i.test(s.title));
  const table = sheet ? parseTables(sheet.markdown)[0] : undefined;
  if (!table) return map;
  const beatCol = table.headers.findIndex((h) => /beat/i.test(h));
  const screenCol = table.headers.findIndex((h) => /on-?screen|visual/i.test(h));
  if (beatCol < 0 || screenCol < 0) return map;
  for (const r of table.rows) {
    const n = /^\W*(\d+)\./.exec(stripMarkdown(r[beatCol] ?? ''));
    if (n && r[screenCol]) map.set(Number(n[1]), stripMarkdown(r[screenCol]));
  }
  return map;
}

/**
 * The voiceover chapters of an outline page: "Cold open", each "### N. beat" under "Draft VO by beat", and "Ending".
 * Returns null for pages without voiceover sections (ledgers, playbooks, idea notes).
 */
export function docFromOutline(page: NotionPageDoc): ScriptDoc | null {
  const cues = beatCues(page);
  const chapters: ScriptChapter[] = [];
  const rows: ScriptRow[] = [];
  const add = (title: string, body: string, firstCue: string) => {
    const raw = rowsFromBody(body);
    if (!raw.length) return;
    const id = `ch-${chapters.length + 1}`;
    chapters.push({ id, title });
    raw.forEach((r, i) => rows.push({ id: `${id}-r${i + 1}`, chapterId: id, voiceover: r.vo, visualCue: r.cue || (i === 0 ? firstCue : '') }));
  };
  for (const s of page.sections) {
    if (/^cold open/i.test(s.title)) add('Cold open', s.markdown, cues.get(0) ?? '');
    else if (/draft vo|voice-?over by beat/i.test(s.title)) {
      const parts = s.markdown.split(/^### +/m);
      if (parts.length === 1) add(stripMarkdown(s.title), s.markdown, '');
      for (const part of parts.slice(1)) {
        const nl = part.indexOf('\n');
        const head = stripMarkdown(nl < 0 ? part : part.slice(0, nl));
        const n = /^(\d+)\./.exec(head);
        add(head, nl < 0 ? '' : part.slice(nl + 1), n ? (cues.get(Number(n[1])) ?? '') : '');
      }
    } else if (/^ending/i.test(s.title)) add('Ending', s.markdown, '');
  }
  if (!rows.length) return null;
  return { id: page.id, title: stripMarkdown(page.title), url: page.url, chapters, rows };
}

// ───────────────────────── editor hand-off ─────────────────────────

/** One fileless Editor hand-off per chapter, with the chapter's rows as cues (atSec relative to the chapter start). */
export function buildEditorItems(doc: ScriptDoc, timing: ScriptTiming, at: number): EditorInboxItem[] {
  return timing.chapters
    .filter((c) => c.rows.length > 0)
    .map((c) =>
      makeInboxItem({
        source: 'scripts',
        ref: `${doc.id}-${c.id}`,
        title: `${doc.title} · Ch ${String(c.index + 1).padStart(2, '0')} ${c.title}`,
        kind: 'ANIMATION',
        durationSec: Math.max(1, Math.round(c.durationSec)),
        cues: c.rows.map((r) => ({ atSec: Math.round((r.startSec - c.startSec) * 10) / 10, voiceover: r.voiceover, visualCue: r.visualCue })),
        notion: { title: doc.title, url: doc.url },
        at,
      }),
    );
}
