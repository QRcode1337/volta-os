// Compiles the exact §2.4 clipboard payload. Pure — safe to unit-test or call anywhere.
import { EDITOR_FPS, formatHMS } from '@/lib/mock-data';
import { deriveLesson, type RlPinInput, type SkillLesson } from './rl-rules';
import { hotspotAt } from './scenes';
import type { EditorClip, EditorPin } from './types';

const pad2 = (n: number) => String(n).padStart(2, '0');
const pct = (n: number) => `${n.toFixed(1)}%`;

/** 3×3 region name: Top/Center/Bottom × Left/Center/Right ("Center" when both central). */
export function regionDescriptor(x: number, y: number): string {
  const h = x < 40 ? 'Left' : x > 60 ? 'Right' : 'Center';
  const v = y < 33.3 ? 'Top' : y > 66.6 ? 'Bottom' : 'Center';
  if (h === 'Center' && v === 'Center') return 'Center';
  if (v === 'Center') return `Center-${h}`;
  if (h === 'Center') return `${v}-Center`;
  return `${v}-${h}`;
}

export function spatialDescription(pin: EditorPin, clip: EditorClip | undefined): string {
  const region = regionDescriptor(pin.xPercent, pin.yPercent);
  const spot = clip && !clip.videoUrl ? hotspotAt(clip.sceneKey, pin.xPercent, pin.yPercent) : '';
  const kind = pin.region ? ' region box' : '';
  return `${region}${spot ? ` ${spot}` : ''}${kind}`;
}

export function coordsLabel(pin: EditorPin): string {
  if (pin.region) return `x: ${pct(pin.xPercent)}, y: ${pct(pin.yPercent)}, w: ${pct(pin.region.w)}, h: ${pct(pin.region.h)}`;
  return `x: ${pct(pin.xPercent)}, y: ${pct(pin.yPercent)}`;
}

export function clipHeading(c: EditorClip): string {
  return `Clip ${pad2(c.number)}: ${c.title} (\`${c.sourcePath}\` | \`${formatHMS(c.startSec)} - ${formatHMS(c.startSec + c.durationSec)}\`)`;
}

function pinBlock(pin: EditorPin, clip: EditorClip | undefined, idx: number): string {
  const lines = [
    `${idx}. **[Pin #${pin.number} @ ${formatHMS(pin.timestampSec)} (Frame ${Math.round(pin.timestampSec * EDITOR_FPS)})]**`,
    `   - **Spatial Coordinates:** \`${coordsLabel(pin)}\` (${spatialDescription(pin, clip)})`,
  ];
  if (pin.scriptLine) lines.push(`   - **Script Line:** "${pin.scriptLine}"`);
  lines.push(`   - **Target Skill:** \`${pin.skill}\``);
  lines.push(`   - **Feedback:** ${pin.commentText.replace(/\s*\n\s*/g, ' ')}`);
  return lines.join('\n');
}

export function toRlInputs(pins: EditorPin[], clips: EditorClip[]): RlPinInput[] {
  const byId = new Map(clips.map((c) => [c.id, c]));
  return pins.map((p) => ({
    number: p.number,
    clipNumber: byId.get(p.clipId)?.number ?? 0,
    clipTitle: byId.get(p.clipId)?.title ?? 'Unknown clip',
    timestampSec: p.timestampSec,
    skill: p.skill,
    commentText: p.commentText,
  }));
}

export interface CompileInput {
  project: string;
  clips: EditorClip[];
  pins: EditorPin[]; // already filtered to unresolved
  teachCut: boolean;
  teachAnimate: boolean;
}

export function lessonsFor(input: CompileInput): { animate: SkillLesson | null; cut: SkillLesson | null } {
  const rl = toRlInputs(input.pins, input.clips);
  return {
    animate: input.teachAnimate ? deriveLesson('/animate', rl) : null,
    cut: input.teachCut ? deriveLesson('/cut', rl) : null,
  };
}

export function compilePrompt(input: CompileInput): string {
  const { project, clips, pins, teachCut, teachAnimate } = input;
  const byClip = new Map<string, EditorPin[]>();
  for (const p of pins) byClip.set(p.clipId, [...(byClip.get(p.clipId) ?? []), p]);
  const orderedClips = clips.filter((c) => byClip.has(c.id)).sort((a, b) => a.number - b.number);
  const clipCount = orderedClips.length;
  const out: string[] = [
    '# VOLTA EDITOR — VIDEO & ANIMATION REVISION BATCH',
    `**Project:** ${project}`,
    `**Total Revision Pins:** ${pins.length} across ${clipCount} ${clipCount === 1 ? 'clip' : 'clips'}`,
    '',
    '## CLIP REVISIONS',
    '',
  ];
  if (!orderedClips.length) out.push('_No unresolved pins in this batch._', '');
  for (const c of orderedClips) {
    out.push(`### ${clipHeading(c)}`);
    const list = (byClip.get(c.id) ?? []).sort((a, b) => a.timestampSec - b.timestampSec || a.number - b.number);
    list.forEach((p, i) => out.push(pinBlock(p, c, i + 1)));
    out.push('');
  }

  if (teachCut || teachAnimate) {
    const toggles = [teachCut && '`Teach my /cut`', teachAnimate && '`Teach my /animate`'].filter(Boolean) as string[];
    const { animate, cut } = lessonsFor(input);
    out.push('---', '', '## 🧠 SELF-IMPROVEMENT REINFORCEMENT LEARNING DIRECTIVES');
    out.push(`*(Auto-attached because ${toggles.join(' and ')} ${toggles.length > 1 ? 'were' : 'was'} toggled ON in VOLTA Editor)*`, '');
    out.push(
      'After applying the clip revisions above, you MUST generalize the lessons from my feedback and permanently update my skills so I never have to make these same corrections again:',
      '',
    );
    let n = 1;
    const block = (skill: '/animate' | '/cut', lesson: SkillLesson | null) => {
      out.push(`${n}. **Update \`${skill}\` (\`workspace/skills/${skill.slice(1)}/SKILL.md\`):**`);
      out.push(lesson ? `   - ${lesson.directive}` : `   - No \`${skill}\`-tagged pins in this batch — keep the existing rules under \`## Learned Preferences (RL Log)\` unchanged.`);
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
  const head = clip ? `### ${clipHeading(clip)}` : '### Unknown clip';
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
