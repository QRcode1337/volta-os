import 'server-only';
import fs from 'node:fs/promises';
import path from 'node:path';
import type { EditorClipStatus, EditorMediaItem, EditorPinRecord, EditorReviewNoteResponse } from '@/types/editor';
import { coordsLabel, formatClock, frameAt, pixelLabel, regionDescriptor } from '@/components/editor/spatial';
import { getProject, loadConfig } from '../studio/config';
import { StudioError, isInside } from '../studio/storage';
import { describeEditorMedia } from './media';

// "Save notes to project": a dated markdown review note written next to the source project, only for projects listed
// in config/studio-projects.json. Never overwrites: every call creates a NEW file (-HHMMSS / -2 suffixes on clashes).

const NOTES_DIR = 'review-notes';
const pad = (n: number) => String(n).padStart(2, '0');

function stamp(d = new Date()) {
  return { date: `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`, time: `${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}` };
}

function stem(name: string): string {
  const base = name.replace(/\.[^.]+$/, '').replace(/[^\w.-]+/g, '-').replace(/^[-.]+|[-.]+$/g, '').slice(0, 80);
  return base || 'file';
}

export function reviewNoteMarkdown(item: EditorMediaItem, pins: EditorPinRecord[], status: EditorClipStatus, projectName: string, projectPath: string, when: Date): string {
  const fps = item.fps ?? 30;
  const sorted = [...pins].sort((a, b) => a.timestampSec - b.timestampSec || a.number - b.number);
  const open = sorted.filter((p) => !p.resolved);
  const L: string[] = [
    `# Review notes: ${item.name}`,
    '',
    `- **Project:** ${projectName} (\`${projectPath}\`)`,
    `- **File:** \`${item.path}\``,
    `- **Media:** ${item.media}${item.width && item.height ? `, ${item.width}x${item.height}` : ''}${item.fps ? ` @ ${item.fps} fps` : ''}${item.durationSec !== null ? `, ${item.durationSec}s` : ''}`,
    `- **Status:** ${status}`,
    `- **Written:** ${when.toISOString()} by VOLTA Editor`,
    `- **Pins:** ${sorted.length} (${open.length} open, ${sorted.length - open.length} resolved)`,
    '',
    '## Pins',
    '',
  ];
  if (!sorted.length) L.push('_No pins on this file._', '');
  sorted.forEach((p, i) => {
    const px = pixelLabel(p, item.width, item.height);
    L.push(
      `${i + 1}. **${formatClock(p.timestampSec)}** (${p.timestampSec.toFixed(2)}s, frame ${frameAt(p.timestampSec, fps)} @ ${fps} fps)${p.resolved ? ' [resolved]' : ''}`,
      `   - Coordinates: \`${coordsLabel(p)}\` (${regionDescriptor(p.xPercent, p.yPercent)}${p.region ? ' region box' : ''})${px ? `, ${px}` : ''}`,
      `   - Target skill: \`${p.skill}\``,
      ...(p.scriptLine ? [`   - Script line: "${p.scriptLine}"`] : []),
      `   - Note: ${p.commentText.replace(/\s*\n\s*/g, ' ')}`,
      '',
    );
  });
  return `${L.join('\n').replace(/\n+$/, '')}\n`;
}

export async function saveReviewNote(fileKey: string, pins: EditorPinRecord[], status: EditorClipStatus): Promise<EditorReviewNoteResponse> {
  if (!fileKey.startsWith('o_')) {
    throw new StudioError('Only Studio project files can have notes saved to a project. Generations files do not belong to a project.', 422);
  }
  const item = await describeEditorMedia(fileKey);
  const project = item.projectId ? getProject(item.projectId) : null;
  // Re-check against the config file itself (not just the in-memory registry entry).
  if (!project || !loadConfig().projects.some((p) => p.id === project.id)) {
    throw new StudioError('This file is not in a project listed in config/studio-projects.json.', 403);
  }
  let root: string;
  try {
    root = await fs.realpath(project.path);
  } catch {
    throw new StudioError(`The project folder ${project.path} does not exist (is the drive mounted?).`, 404);
  }
  const dir = path.join(root, NOTES_DIR);
  try {
    await fs.mkdir(dir); // single level only: the project folder itself must already exist
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== 'EEXIST') throw new StudioError(`Cannot create ${dir}: ${(err as Error).message}`, 500);
  }
  const st = await fs.lstat(dir);
  if (!st.isDirectory() || st.isSymbolicLink() || !(await isInside(dir, root))) {
    throw new StudioError(`${NOTES_DIR} inside the project must be a real folder (not a link); refusing to write outside the project.`, 403);
  }

  const now = new Date();
  const { date, time } = stamp(now);
  const base = `${stem(item.name)}-${date}`;
  const body = reviewNoteMarkdown(item, pins, status, project.name, project.path, now);
  const candidates = [`${base}.md`, `${base}-${time}.md`, ...Array.from({ length: 20 }, (_, i) => `${base}-${time}-${i + 2}.md`)];
  for (const name of candidates) {
    const dest = path.join(dir, name);
    try {
      await fs.writeFile(dest, body, { encoding: 'utf8', flag: 'wx' }); // wx: fail instead of overwriting
      return { path: dest, relPath: path.join(NOTES_DIR, name), projectId: project.id, projectName: project.name, pinCount: pins.length };
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== 'EEXIST') throw new StudioError(`Could not write the note: ${(err as Error).message}`, 500);
    }
  }
  throw new StudioError('Could not find a free file name for the note.', 409);
}
