// Compiles the clipboard payload. Pure: safe to unit-test or call anywhere.
// Every pin is stated against the REAL file (path, project, fps, frame size), with file-local timestamps.
import type { EditorSkillsResponse, LiveSkillRef } from '@/types/editor';
import type { NotionSection } from '@/types/notion';
import { outlineText } from '@/lib/notion-md';
import { deriveLesson, type RlPinInput, type SkillLesson } from './rl-rules';
import { coordsLabel, formatClock, frameAt, pixelLabel, regionDescriptor } from './spatial';
import type { EditorClip, EditorPin } from './types';

const pad2 = (n: number) => String(n).padStart(2, '0');
const localSec = (pin: EditorPin, clip: EditorClip | undefined) => Math.max(0, pin.timestampSec - (clip?.startSec ?? 0));
const fmtFps = (c: EditorClip) => `${Number.isInteger(c.fps) ? c.fps : c.fps.toFixed(3)} fps${c.fpsKnown ? '' : ' (assumed)'}`;

export function spatialDescription(pin: EditorPin, clip: EditorClip | undefined): string {
  const px = pixelLabel(pin, clip?.width ?? null, clip?.height ?? null);
  return `${regionDescriptor(pin.xPercent, pin.yPercent)}${pin.region ? ' region box' : ''}${px ? `; ${px}` : ''}`;
}

export function clipHeading(c: EditorClip): string {
  const where = c.projectId ? `project \`${c.projectName}\` (${c.projectKind}${c.projectPath ? `, \`${c.projectPath}\`` : ''})` : c.origin === 'local' ? 'local import (not on disk in a project)' : `source \`${c.projectName}\``;
  const geom = c.width && c.height ? `${c.width}x${c.height} | ` : '';
  const dur = c.media === 'image' ? 'still image' : `${formatClock(c.durationSec)} long`;
  return `File ${pad2(c.number)}: ${c.name} (\`${c.path}\` | ${where} | ${c.media} | ${geom}${fmtFps(c)} | ${dur})`;
}

function applyHint(c: EditorClip): string | null {
  if (c.projectKind === 'remotion' || c.projectKind === 'hyperframes') {
    return `This file is a render. Make the change in the ${c.projectKind} source composition under \`${c.projectPath}\` and re-render; do not edit the rendered file.`;
  }
  if (c.projectKind === 'ffmpeg' || c.projectKind === 'pipeline') {
    return `This file is an output of the \`${c.projectName}\` project (\`${c.projectPath}\`); change it through that project's pipeline or an ffmpeg pass.`;
  }
  if (c.projectId === null && c.origin === 'server') return 'This is a VOLTA Generations output; regenerate it or edit it with ffmpeg.';
  return null;
}

function pinBlock(pin: EditorPin, clip: EditorClip | undefined, idx: number): string {
  const t = localSec(pin, clip);
  const fps = clip?.fps ?? 30;
  const lines = [
    `${idx}. **[Pin #${pin.number} @ ${formatClock(t)} (Frame ${frameAt(t, fps)} @ ${Number.isInteger(fps) ? fps : fps.toFixed(3)} fps)]**`,
    `   - **Spatial Coordinates:** \`${coordsLabel(pin)}\` (${spatialDescription(pin, clip)})`,
  ];
  if (pin.scriptLine) lines.push(`   - **Script Line:** "${pin.scriptLine}"`);
  lines.push(`   - **Target Skill:** \`${pin.skill}\``);
  lines.push(`   - **Feedback:** ${pin.commentText.replace(/\s*\n\s*/g, ' ')}`);
  return lines.join('\n');
}

export function toRlInputs(pins: EditorPin[], clips: EditorClip[]): RlPinInput[] {
  const byId = new Map(clips.map((c) => [c.id, c]));
  return pins.map((p) => {
    const c = byId.get(p.clipId);
    return { number: p.number, clipNumber: c?.number ?? 0, clipTitle: c?.name ?? 'Unknown file', timestampSec: localSec(p, c), skill: p.skill, commentText: p.commentText };
  });
}

export interface CompileInput {
  clips: EditorClip[];
  pins: EditorPin[]; // already filtered to unresolved
  teachCut: boolean;
  teachAnimate: boolean;
  /** From GET /api/editor/skills; null while loading or when the route failed. */
  skills: EditorSkillsResponse | null;
  /** Outline chapters per Notion outline page id (for files tagged with an episode). Missing = not loaded. */
  outlines?: Record<string, NotionSection[]>;
}

export function lessonsFor(input: Pick<CompileInput, 'clips' | 'pins' | 'teachCut' | 'teachAnimate'>): { animate: SkillLesson | null; cut: SkillLesson | null } {
  const rl = toRlInputs(input.pins, input.clips);
  return {
    animate: input.teachAnimate ? deriveLesson('/animate', rl) : null,
    cut: input.teachCut ? deriveLesson('/cut', rl) : null,
  };
}

/** Live skills for a directive: union over the project kinds of the files in the batch. */
export function pickLiveSkills(skills: EditorSkillsResponse | null, clips: EditorClip[], which: 'cut' | 'animate'): LiveSkillRef[] {
  if (!skills) return [];
  const kinds = new Set(clips.map((c) => (c.projectKind === 'remotion' || c.projectKind === 'hyperframes' ? c.projectKind : 'default')));
  if (!kinds.size) kinds.add('default');
  const out = new Map<string, LiveSkillRef>();
  for (const k of kinds) for (const r of skills.byKind[k]?.[which] ?? []) out.set(r.name, r);
  for (const r of skills.related[which]) out.set(r.name, r);
  return [...out.values()];
}

const OUTLINE_CAP = 2400;

/** Episode context for a tagged file: title, Notion links and the outline chapter it belongs to (blockquote lines). */
export function episodeLines(c: EditorClip, outlines: Record<string, NotionSection[]> | undefined): string[] {
  const e = c.episode;
  if (!e) return [];
  const links = [e.outlineUrl ? `[${e.outlineTitle ?? 'Script outline'}](${e.outlineUrl})` : null, e.ledgerUrl ? `[Source ledger](${e.ledgerUrl})` : null].filter(Boolean);
  const out = [`> **Notion episode:** ${e.title}${links.length ? ` | ${links.join(' | ')}` : ''}`];
  const sections = e.outlineId ? outlines?.[e.outlineId] : undefined;
  const wanted = e.section ?? (sections?.some((s) => /beat sheet/i.test(s.title)) ? sections.find((s) => /beat sheet/i.test(s.title))!.title : null);
  if (!sections) {
    out.push(`> **Outline section:** ${e.section ?? 'whole outline'} (outline text was not available from Notion when this was compiled; open the link above)`);
    return out;
  }
  const text = wanted ? outlineText(sections, wanted) : null;
  if (!wanted || !text) {
    out.push(`> **Outline section:** ${e.section ? `“${e.section}” was not found in the outline anymore` : 'none chosen'}`);
    return out;
  }
  const body = text.length > OUTLINE_CAP ? `${text.slice(0, OUTLINE_CAP).trimEnd()}\n[... cut here; the rest is on the Notion page]` : text;
  out.push(`> **Outline section${e.section ? '' : ' (no part chosen, showing the beat sheet)'}:** ${wanted}`, '', '```md', body, '```');
  return out;
}

function projectLine(clips: EditorClip[]): string {
  const seen = new Map<string, string>();
  for (const c of clips) {
    const key = c.projectId ?? c.projectName;
    if (!seen.has(key)) seen.set(key, c.projectId ? `${c.projectName} (${c.projectKind}${c.projectPath ? `, ${c.projectPath}` : ''})` : c.projectName);
  }
  return [...seen.values()].join('; ') || 'none';
}

const byClipHas = (pins: EditorPin[], id: string) => pins.some((p) => p.clipId === id);

export function compilePrompt(input: CompileInput): string {
  const { clips, pins, teachCut, teachAnimate, skills } = input;
  const episodes = [...new Set(clips.filter((c) => c.episode && byClipHas(pins, c.id)).map((c) => c.episode!.title))];
  const byClip = new Map<string, EditorPin[]>();
  for (const p of pins) byClip.set(p.clipId, [...(byClip.get(p.clipId) ?? []), p]);
  const orderedClips = clips.filter((c) => byClip.has(c.id)).sort((a, b) => a.number - b.number);
  const clipCount = orderedClips.length;
  const out: string[] = [
    '# VOLTA EDITOR: VIDEO & ANIMATION REVISION BATCH',
    `**Project:** ${projectLine(orderedClips)}`,
    ...(episodes.length ? [`**Episode${episodes.length === 1 ? '' : 's'}:** ${episodes.join('; ')}`] : []),
    `**Total Revision Pins:** ${pins.length} across ${clipCount} ${clipCount === 1 ? 'file' : 'files'}`,
    '_Timestamps are local to each file (from its first frame). x/y are percentages of the video frame, origin top-left._',
    '',
    '## FILE REVISIONS',
    '',
  ];
  if (!orderedClips.length) out.push('_No unresolved pins in this batch._', '');
  for (const c of orderedClips) {
    out.push(`### ${clipHeading(c)}`);
    const hint = applyHint(c);
    if (hint) out.push(`> ${hint}`);
    out.push(...episodeLines(c, input.outlines));
    const list = (byClip.get(c.id) ?? []).sort((a, b) => a.timestampSec - b.timestampSec || a.number - b.number);
    list.forEach((p, i) => out.push(pinBlock(p, c, i + 1)));
    out.push('');
  }

  if (teachCut || teachAnimate) {
    const toggles = [teachCut && '`Teach my /cut`', teachAnimate && '`Teach my /animate`'].filter(Boolean) as string[];
    const { animate, cut } = lessonsFor(input);
    out.push('---', '', '## SELF-IMPROVEMENT REINFORCEMENT LEARNING DIRECTIVES');
    out.push(`*(Auto-attached because ${toggles.join(' and ')} ${toggles.length > 1 ? 'were' : 'was'} toggled ON in VOLTA Editor)*`, '');
    out.push(
      'After applying the file revisions above, generalize the lessons from my feedback and permanently update my live skills so I never have to make these same corrections again.',
      'There is no live skill literally named `/cut` or `/animate`; each directive below names the installed skill(s) under `~/.claude/skills/` that own that job for these files.',
      '',
    );
    let n = 1;
    const block = (skill: '/animate' | '/cut', lesson: SkillLesson | null) => {
      const which = skill === '/animate' ? 'animate' : 'cut';
      const live = pickLiveSkills(skills, orderedClips.length ? orderedClips : clips, which);
      out.push(`${n}. **Teach \`${skill}\`:**`);
      if (!lesson) {
        out.push(`   - No \`${skill}\`-tagged pins in this batch. Leave the existing rules under \`## Learned Preferences (RL Log)\` unchanged.`);
      } else {
        if (live.length) {
          out.push('   - Live skill(s) to update (add the rule under a `## Learned Preferences (RL Log)` heading, creating it if missing):');
          for (const r of live) out.push(`     - \`${r.path}\` (${r.why})`);
        } else {
          out.push(`   - No installed live skill matched in \`~/.claude/skills/\`; ask me which skill should own \`${skill}\` before writing anything.`);
        }
        out.push(`   - ${lesson.directive}`);
      }
      out.push(`   - VOLTA's "Apply & Teach (workspace copy)" button separately keeps a **workspace copy** at \`workspace/skills/${which}/SKILL.md\` inside the VOLTA OS repo. That file is a local record, not one of my live skills.`);
      n += 1;
    };
    if (teachAnimate) block('/animate', animate);
    if (teachCut) block('/cut', cut);
  }
  return `${out.join('\n').replace(/\n+$/, '')}\n`;
}

export function copyToastText(count: number, teachCut: boolean, teachAnimate: boolean): string {
  const noun = `${count} timestamped spatial comment${count === 1 ? '' : 's'}`;
  if (teachCut && teachAnimate) return `Copied ${noun} + /cut & /animate self-improvement directives to clipboard!`;
  if (teachCut || teachAnimate) return `Copied ${noun} + ${teachCut ? '/cut' : '/animate'} self-improvement directive to clipboard!`;
  return `Copied ${noun} to clipboard!`;
}

export function singlePinMarkdown(pin: EditorPin, clip: EditorClip | undefined): string {
  const head = clip ? `### ${clipHeading(clip)}` : '### Unknown file';
  return `${head}\n${pinBlock(pin, clip, 1)}\n`;
}

/** Clipboard write with a textarea fallback for non-secure contexts. */
export async function writeClipboard(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // fall through to legacy path
  }
  try {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', '');
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand('copy');
    document.body.removeChild(ta);
    return ok;
  } catch {
    return false;
  }
}
