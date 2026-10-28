import 'server-only';
import { execFile } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

// Start an *interactive* Claude Code session in a new Terminal window on the Mac, seeded with a prompt. Your normal
// permission prompts apply, so nothing runs unattended. Shared by Systems "Fix with agent" and Tasks "Solve with agent".

/** Prompt files handed to Terminal: tiny, and off iCloud so `cat` never meets an evicted file. */
const PROMPTS_DIR = path.join(os.homedir(), 'Library', 'Application Support', 'VOLTA', 'agent-prompts');
const OSASCRIPT = '/usr/bin/osascript';
const KEEP = 50;

const stamp = () => new Date().toISOString().replace(/[-:]/g, '').replace(/\..*/, '').replace('T', '-');
/** AppleScript string literal. */
const asString = (s: string) => `"${s.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
/** Single-quoted shell word. */
const shQuote = (s: string) => `'${s.replace(/'/g, `'\\''`)}'`;

function prune() {
  try {
    const files = fs.readdirSync(PROMPTS_DIR).filter((f) => f.endsWith('.md')).sort();
    for (const f of files.slice(0, Math.max(0, files.length - KEEP))) fs.unlinkSync(path.join(PROMPTS_DIR, f));
  } catch {
    // best effort
  }
}

export async function openClaudeInTerminal(prompt: string, opts: { cwd: string; tag: string }): Promise<{ opened: boolean; error: string | null }> {
  fs.mkdirSync(PROMPTS_DIR, { recursive: true });
  const file = path.join(PROMPTS_DIR, `${opts.tag}-${stamp()}.md`);
  fs.writeFileSync(file, prompt);
  prune();
  const shell = `cd ${shQuote(opts.cwd)} && claude "$(cat ${shQuote(file)})"`;
  const args = ['-e', `tell application "Terminal" to do script ${asString(shell)}`, '-e', 'tell application "Terminal" to activate'];
  return new Promise((resolve) => {
    execFile(OSASCRIPT, args, { timeout: 10_000 }, (err, _stdout, stderr) => {
      resolve(err ? { opened: false, error: (stderr || err.message).trim().slice(0, 300) } : { opened: true, error: null });
    });
  });
}
