import 'server-only';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import type { EditorSkillsResponse, LiveSkillRef, LiveSkillSet } from '@/types/editor';

// Where "Teach my /cut" and "Teach my /animate" should point. There is no live skill literally named /cut or
// /animate, so each directive targets the installed video skills that own that job for the file's project kind.

const SKILLS_DIR = path.join(os.homedir(), '.claude', 'skills');
type Pick = [name: string, why: string];

const CUT: Record<string, Pick[]> = {
  remotion: [
    ['remotion-recuts', 'new Remotion cut beside a finished, frozen one'],
    ['documentary-video-editing', 'dense pacing and cut rhythm'],
  ],
  hyperframes: [
    ['hyperframes', 'HyperFrames entry point (timing and scene structure)'],
    ['documentary-video-editing', 'dense pacing and cut rhythm'],
  ],
  default: [
    ['documentary-video-editing', 'dense pacing and cut rhythm'],
    ['media-ingestion-and-video-processing', 'ffmpeg trims, assembly and frame work'],
    ['general-video', 'general video editing'],
  ],
};
const ANIMATE: Record<string, Pick[]> = {
  remotion: [
    ['remotion-best-practices', 'router for all Remotion skills'],
    ['animated-documentary-motion', 'motion design rules (easing, Ken Burns, transitions)'],
  ],
  hyperframes: [
    ['hyperframes-animation', 'HyperFrames motion rules, blueprints and transitions'],
    ['hyperframes-keyframes', 'HyperFrames keyframes'],
  ],
  default: [
    ['animated-documentary-motion', 'motion design rules (easing, Ken Burns, transitions)'],
    ['hyperframes-animation', 'HyperFrames motion rules'],
  ],
};
const KINDS = ['remotion', 'hyperframes', 'default'];

const display = (name: string) => `~/.claude/skills/${name}/SKILL.md`;

async function installed(): Promise<Set<string>> {
  const out = new Set<string>();
  let entries: import('node:fs').Dirent[] = [];
  try {
    entries = await fs.readdir(SKILLS_DIR, { withFileTypes: true });
  } catch {
    return out;
  }
  await Promise.all(
    entries.map(async (e) => {
      if (e.name.startsWith('.')) return;
      try {
        await fs.access(path.join(SKILLS_DIR, e.name, 'SKILL.md')); // follows symlinked skill folders
        out.add(e.name);
      } catch {
        // not a skill folder
      }
    }),
  );
  return out;
}

export async function resolveLiveSkills(): Promise<EditorSkillsResponse> {
  const have = await installed();
  const ref = ([name, why]: Pick): LiveSkillRef => ({ name, path: display(name), why });
  const byKind: Record<string, LiveSkillSet> = {};
  const used = new Set<string>();
  for (const k of KINDS) {
    byKind[k] = {
      cut: (CUT[k] ?? []).filter(([n]) => have.has(n)).map(ref),
      animate: (ANIMATE[k] ?? []).filter(([n]) => have.has(n)).map(ref),
    };
    for (const r of [...byKind[k].cut, ...byKind[k].animate]) used.add(r.name);
  }
  // /cut- or /animate-like skills that exist but are not in the table (e.g. a future ~/.claude/skills/cut)
  const related: LiveSkillSet = { cut: [], animate: [] };
  for (const name of [...have].sort()) {
    if (used.has(name)) continue;
    if (/^(cut|recut|.*-cut|.*-edit|.*-editing)$/.test(name) && /video|remotion|hyperframes|cut|clip|film/.test(name)) related.cut.push(ref([name, 'looks like a cut / edit skill']));
    else if (/^(animate|.*-animat\w*|.*-motion|.*-keyframes)$/.test(name) && /video|remotion|hyperframes|animate|motion|keyframe/.test(name)) related.animate.push(ref([name, 'looks like an animation skill']));
  }
  return { byKind, related, skillsDir: SKILLS_DIR };
}
