import 'server-only';
// Acting on the OpenClaw action pipeline from VOLTA Tasks. actions.md's own legend says "Tier 2 updates status
// inline", so VOLTA makes the same edits a person would: flip one item's [marker], bump its (YYYY-MM-DD) date, or add
// an indented note under it. Nothing else in the file is touched.
//
// Safety: the item is re-found by its stable id (the client's line number is only a hint), the previous file is
// copied to ~/Library/Application Support/VOLTA/tasks/backups first, the write is atomic (temp file + rename), and it
// is refused when the file changed between read and write (OpenClaw's own runs edit it too).
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import type { ActionStatus } from '@/components/tasks/types';
import { handoffToClaude } from '../claude';
import { HttpError } from '../http-error';
import { isEvicted } from '../icloud';
import { writeAtomic } from '../storage';
import { ACTIONS_DISPLAY_PATH, ACTIONS_EVICTED, ACTIONS_FILE, getActions, parseActionsMarkdown } from './actions';

const STATE_DIR = path.join(os.homedir(), 'Library', 'Application Support', 'VOLTA', 'tasks');
const BACKUP_DIR = path.join(STATE_DIR, 'backups');
const LOG_FILE = path.join(STATE_DIR, 'decisions.jsonl');
const KEEP_BACKUPS = 30;
const MAX_NOTE = 1_000;

const MARKER: Record<ActionStatus, string> = { todo: ' ', progress: '>', done: 'x', blocked: '!', awaiting: '@' };
const LABEL: Record<ActionStatus, string> = { todo: 'open', progress: 'in progress', done: 'done', blocked: 'blocked', awaiting: 'awaiting Patrick' };
const ITEM_RE = /^- \[[ >xX!@]\]\s+/;
const CREATED_RE = /\s*\[\[\d{4}-\d{2}-\d{2}\]\]\s*$/;
const UPDATED_RE = /\s*\(\d{4}-\d{2}-\d{2}\)\s*$/;


const today = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
const stamp = () => new Date().toISOString().replace(/[-:]/g, '').replace(/\..*/, '').replace('T', '-');

async function readFile() {
  const st = await fs.stat(ACTIONS_FILE).catch(() => null);
  if (!st) throw new HttpError(`${ACTIONS_DISPLAY_PATH} does not exist.`, 404);
  if (isEvicted(st)) throw new HttpError(ACTIONS_EVICTED, 503);
  const content = await fs.readFile(ACTIONS_FILE, 'utf8');
  return { content, mtimeMs: st.mtimeMs };
}

/** The item with this id, preferring the one at `line` when ids repeat. */
function findItem(content: string, id: string, line?: number) {
  const { items } = parseActionsMarkdown(content);
  const hits = items.filter((i) => i.id === id);
  const item = hits.find((i) => i.line === line) ?? hits[0];
  if (!item) throw new HttpError('That item is no longer in actions.md (OpenClaw may have moved or reworded it). Refresh and try again.', 409);
  return item;
}

/** Replace the marker and set the trailing "(YYYY-MM-DD)" updated date to today, keeping the [[created]] link. */
function restatus(line: string, status: ActionStatus): string {
  let rest = line.replace(ITEM_RE, '');
  const created = CREATED_RE.exec(rest);
  const tailLink = created ? rest.slice(created.index) : '';
  if (created) rest = rest.slice(0, created.index);
  rest = rest.replace(UPDATED_RE, '');
  return `- [${MARKER[status]}] ${rest.trimEnd()} (${today()})${tailLink}`;
}

async function commit(before: { content: string; mtimeMs: number }, after: string, log: Record<string, unknown>) {
  await writeAtomic(path.join(BACKUP_DIR, `actions-${stamp()}.md`), before.content);
  const backups = (await fs.readdir(BACKUP_DIR)).filter((f) => f.startsWith('actions-')).sort();
  await Promise.all(backups.slice(0, Math.max(0, backups.length - KEEP_BACKUPS)).map((f) => fs.unlink(path.join(BACKUP_DIR, f)).catch(() => {})));

  // 409 when actions.md changed since it was read (an OpenClaw run may be editing it)
  await writeAtomic(ACTIONS_FILE, after, { expectMtimeMs: before.mtimeMs });
  await fs.appendFile(LOG_FILE, JSON.stringify({ at: new Date().toISOString(), ...log }) + '\n');
  await getActions({ refresh: true });
}

export async function setActionStatus(id: string, line: number | undefined, status: ActionStatus): Promise<{ ok: true }> {
  if (!(status in MARKER)) throw new HttpError('Unknown status.', 400);
  const file = await readFile();
  const item = findItem(file.content, id, line);
  if (item.status === status) return { ok: true };
  const lines = file.content.split('\n');
  const idx = item.line - 1;
  lines[idx] = restatus(lines[idx].replace(/\r$/, ''), status) + (lines[idx].endsWith('\r') ? '\r' : '');
  await commit(file, lines.join('\n'), { op: 'status', id, text: item.text, from: item.status, to: status });
  return { ok: true };
}

export async function addActionNote(id: string, line: number | undefined, note: string): Promise<{ ok: true }> {
  const text = note.replace(/\s+/g, ' ').replace(/^[-*]\s+/, '').trim().slice(0, MAX_NOTE);
  if (!text) throw new HttpError('Write a note first.', 400);
  const file = await readFile();
  const item = findItem(file.content, id, line);
  const lines = file.content.split('\n');
  // after the item and the indented note lines that belong to it
  let at = item.line;
  while (at < lines.length && /^\s+\S/.test(lines[at])) at++;
  lines.splice(at, 0, `  - Patrick (${today()}): ${text}`);
  await commit(file, lines.join('\n'), { op: 'note', id, text: item.text, note: text });
  return { ok: true };
}

/** A Claude Code prompt to work the item; with `open`, also started in Terminal on the Mac. */
export async function actionAgentHandoff(id: string, line: number | undefined, open: boolean) {
  const file = await readFile();
  const item = findItem(file.content, id, line);
  const body = [
    `You're helping Patrick resolve an item from his OpenClaw action pipeline.`,
    '',
    `Item (${ACTIONS_DISPLAY_PATH}, line ${item.line}, section "## ${item.section || '(none)'}", status: ${LABEL[item.status]}):`,
    `  ${item.text}`,
    ...(item.notes.length ? ['Notes under it:', ...item.notes.map((n) => `  - ${n}`)] : []),
    ...(item.links.length ? ['Links:', ...item.links.map((l) => `  - ${l.target}`)] : []),
    '',
    'What to do:',
    '1. Read the item, its notes and any linked wiki notes (wiki paths are under ~/.openclaw/) to understand what is being asked.',
    item.status === 'awaiting'
      ? '2. This item is waiting on a decision or action from Patrick. Lay out the options and what you recommend, and wait for his answer before acting.'
      : '2. Propose a concrete plan before acting.',
    '3. Carry out the work with Patrick approving each step; change nothing outside this task.',
    `4. When it is resolved, update only this item inline in ${ACTIONS_DISPLAY_PATH}, following its status legend: change the marker ([x] done, [!] blocked, [>] in progress), set the trailing (YYYY-MM-DD) date to today, and add an indented "  - " note under it saying what was done.`,
  ].join('\n');
  return handoffToClaude({ tag: 'task', cwd: path.join(os.homedir(), '.openclaw'), body, open, log: { id, text: item.text } });
}
