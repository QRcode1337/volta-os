import 'server-only';
import { HttpError } from '../http-error';
import { complete, llmHttp } from '../llm';
import { DRAFT_LIMITS, EXAMPLE_LYRICS_SKELETON, EXAMPLE_STYLE, LYRIC_CUES, type DraftKind } from '@/components/music/suno-formulas';
import type { SunoDraftResult } from '@/components/music/suno-types';

// "Draft with AI" for the Suno panel: style prompts, lyric sheets with bracketed composition cues, speech tone and
// script, and Sounds descriptions. Runs on the long-write route (OAuth subscriptions, then local), so it spends no
// Suno credits and no API-billed tokens.

const KINDS: readonly DraftKind[] = ['style', 'lyrics', 'tone', 'script', 'sound'];
const MAX_IN = { brief: 2000, current: 6000, context: 3000 };

const cueList = LYRIC_CUES.map((g) => `${g.label}: ${g.chips.join(', ')}`).join('\n');

const SYSTEM: Record<DraftKind, string> = {
  style: [
    'You write the "Styles" prompt for Suno (AI music).',
    'Output ONE line: 15 to 30 comma-separated descriptors covering genre fusion, mood, signature instruments, textures/FX, rhythm/groove, vocal character and production.',
    `Concrete sonic words, no artist or band names, no sentences, max ${DRAFT_LIMITS.style} characters. Output only the line.`,
    `Example of Patrick's taste and format:\n${EXAMPLE_STYLE}`,
  ].join('\n'),
  lyrics: [
    'You write lyric sheets for Suno (AI music) in Patrick\'s bracketed composition format:',
    '- Optional opening sigil line, then a header block: [⟟ “TITLE” ⟟], then [BPM] [Genre] [Key: ...] [Meter], then vocal roles and character, then [Use ...] arrangement directions.',
    '- Each section starts with [Section – short descriptor] (Intro, Verse 1, Pre-Hook, Hook, Post-Hook, Verse 2, Bridge, Final Hook, Outro...).',
    '- Directly under it, one line of production cues, each in its own square brackets: drums, vocal delivery, instruments, FX, a chord progression like [Dm–C–Bb–A], and a dynamic marking (Pianissimo, Piano, Mezzo-forte, Forte, Fortissimo, Crescendo).',
    '- Then the sung lines. Hooks are short, singable and repeat. Use … for held or whispered lines.',
    `Cue vocabulary to draw from (invent fitting new cues too):\n${cueList}`,
    `Stay under ${DRAFT_LIMITS.lyrics} characters. Output only the lyric sheet, no commentary.`,
    `Format example (an excerpt of Patrick's "Forbidden Names"):\n${EXAMPLE_LYRICS_SKELETON}`,
  ].join('\n'),
  tone: [
    'You write the "Tone" field for Suno Speech (AI voice for video narration).',
    'One or two sentences describing the delivery: voice (gender, age, timbre), pacing and pauses, mood and intent, and the setting or mic (close mic, radio, phone line, room reverb).',
    `Max ${DRAFT_LIMITS.tone} characters. Output only the tone description.`,
  ].join('\n'),
  script: [
    'You write narration scripts for Suno Speech, used as voiceover in Patrick\'s videos.',
    'Write for the ear: short sentences, concrete images, natural rhythm. Use line breaks for breaths and an ellipsis (…) for a held pause. No stage directions, no brackets, no speaker labels.',
    `Max ${DRAFT_LIMITS.script} characters. Output only the script.`,
  ].join('\n'),
  sound: [
    'You write prompts for Suno Sounds (short one-shot sound effects and loops for video audio).',
    'One sentence: the source and action, the material or texture, the space and perspective (close, distant, through a wall), the character (cinematic, eerie, lo-fi...), and how it evolves or ends.',
    `Max ${DRAFT_LIMITS.sound} characters. No music genres unless it is a musical loop. Output only the description.`,
  ].join('\n'),
};

function text(v: unknown, field: string, max: number): string {
  if (v === undefined || v === null) return '';
  if (typeof v !== 'string') throw new HttpError(`${field} must be text.`, 400);
  const t = v.replace(/\r\n/g, '\n').trim();
  if (t.length > max) throw new HttpError(`${field} is too long (max ${max} characters).`, 400);
  return t;
}

/** Models sometimes wrap the answer in a code fence or quotes; Suno wants the bare text. */
function clean(out: string, kind: DraftKind): string {
  let t = out.trim().replace(/^```[a-z]*\n?|\n?```$/g, '').trim();
  if (kind !== 'lyrics' && kind !== 'script') t = t.replace(/^["“]|["”]$/g, '').trim();
  if (kind === 'style') t = t.replace(/\s*\n+\s*/g, ' ');
  return t.slice(0, DRAFT_LIMITS[kind]);
}

export async function draftSuno(body: Record<string, unknown>): Promise<SunoDraftResult> {
  const kind = body.kind as DraftKind;
  if (!KINDS.includes(kind)) throw new HttpError(`kind must be one of ${KINDS.join(', ')}.`, 400);
  const brief = text(body.brief, 'Brief', MAX_IN.brief);
  const current = text(body.current, 'Current text', MAX_IN.current);
  const context = text(body.context, 'Context', MAX_IN.context);
  if (!brief && !current) throw new HttpError('Write a short brief (or something in the field to improve) first.', 400);

  const user = [
    brief && `What Patrick wants:\n${brief}`,
    context && `The rest of this piece (keep the draft consistent with it):\n${context}`,
    current && `Current text of this field. ${brief ? 'Revise it following the request above' : 'Improve it'}, keeping what works:\n${current}`,
  ]
    .filter(Boolean)
    .join('\n\n');

  try {
    const res = await complete({
      task: 'long-write',
      messages: [
        { role: 'system', content: SYSTEM[kind] },
        { role: 'user', content: user },
      ],
      maxTokens: kind === 'lyrics' || kind === 'script' ? 3000 : 600,
      temperature: 0.9,
    });
    const out = clean(res.text, kind);
    if (!out) throw new HttpError('The model returned an empty draft. Try again.', 502);
    return { text: out, model: res.route.model ?? null };
  } catch (err) {
    if (err instanceof HttpError) throw err;
    llmHttp(err);
  }
}
