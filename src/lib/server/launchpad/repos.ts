import 'server-only';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { BIN, mapLimit, run } from '../proc';
import { cached } from '../sources/cache';
import { redactSecrets } from '../redact';
import type { RepoInfo, ReposData } from './types';
import { isEvictedFile } from '@/lib/server/icloud';

const HOME = os.homedir();
const ROOTS = [path.join(HOME, 'Documents/PROJECTS'), path.join(HOME, 'ErisMorn'), path.join(HOME, 'Volta-OS')];
const MAX_DEPTH = 3;
const TOP_N = 12;
const TTL_MS = 15 * 60_000;
const GIT_TIMEOUT_MS = 5000;
const WALK_BUDGET_MS = 15_000;
const MAX_DIRS = 30_000;
const CONCURRENCY = 4;
const SKIP_DIRS = new Set(['node_modules', '.venv', 'venv', 'dist', 'build', '.next', '.turbo', 'target', '__pycache__', 'Pods']);
const GIT_ENV = { ...process.env, GIT_TERMINAL_PROMPT: '0', GIT_OPTIONAL_LOCKS: '0', GIT_PAGER: 'cat' };

interface Found {
  dir: string;
  skip?: string;
}

/** iCloud-evicted placeholders: reading them would trigger a download. */
const isDataless = isEvictedFile;

/** Depth-limited walk for `.git` (dir or worktree file). Does not descend into a repo it has found. */
async function findRepos(root: string, deadline: number): Promise<{ found: Found[]; truncated: boolean }> {
  const found: Found[] = [];
  let dirs = 0;
  let truncated = false;
  async function walk(dir: string, depth: number): Promise<void> {
    if (Date.now() > deadline || dirs >= MAX_DIRS) {
      truncated = true;
      return;
    }
    dirs++;
    let entries: import('node:fs').Dirent[];
    try {
      entries = await fs.readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    if (entries.some((e) => e.name === '.git')) {
      const head = path.join(dir, '.git', 'HEAD');
      const dataless = (await isDataless(head)) || (await isDataless(path.join(dir, '.git')));
      found.push({ dir, skip: dataless ? 'iCloud placeholder (not downloaded)' : undefined });
      return;
    }
    if (depth >= MAX_DEPTH) return;
    for (const e of entries) {
      if (!e.isDirectory() || e.name.startsWith('.') || SKIP_DIRS.has(e.name)) continue;
      await walk(path.join(dir, e.name), depth + 1);
    }
  }
  await walk(root, 0);
  return { found, truncated };
}

/** stdout of a read-only git command; throws on failure (`timedOut` set when the timeout killed it). */
async function git(dir: string, args: string[]): Promise<string> {
  const r = await run(BIN.git, ['-C', dir, ...args], { timeoutMs: GIT_TIMEOUT_MS, maxBuffer: 1 << 20, env: GIT_ENV });
  if (r.code !== 0) throw Object.assign(new Error(r.error ?? `exit ${r.code}`), { timedOut: r.code === null && !!r.error?.startsWith('timed out') });
  return r.stdout.trim();
}

/** Strip userinfo/query/fragment from a remote and normalise to host/path (+ a GitHub web URL when applicable). */
export function sanitizeRemote(raw: string): { display: string | null; github: string | null } {
  const s = raw.trim();
  if (!s) return { display: null, github: null };
  let host = '';
  let p = '';
  const scheme = /^[a-z][a-z0-9+.-]*:\/\/(.+)$/i.exec(s);
  if (scheme) {
    try {
      const u = new URL(s);
      host = u.hostname;
      p = u.pathname;
    } catch {
      return { display: null, github: null };
    }
  } else {
    const scp = /^(?:[^@\s/]+@)?([^:\s/]+):(?!\/\/)(.+)$/.exec(s);
    if (!scp) return { display: null, github: null }; // local path remote: nothing useful (or safe) to show
    host = scp[1];
    p = scp[2];
  }
  p = p.replace(/^\/+/, '').replace(/\.git\/?$/, '').replace(/\/+$/, '');
  host = host.toLowerCase();
  const display = redactSecrets(`${host}/${p}`);
  const isGithub = host === 'github.com' || host === 'www.github.com';
  const parts = p.split('/');
  const github = isGithub && parts.length >= 2 && /^[\w.-]+$/.test(parts[0]) && /^[\w.-]+$/.test(parts[1]) ? `https://github.com/${parts[0]}/${parts[1]}` : null;
  return { display, github };
}

const timedOut = (r: PromiseSettledResult<string>) => r.status === 'rejected' && !!(r.reason as { timedOut?: boolean })?.timedOut;

/** Gather the facts for one repo, or a reason to leave it out (no readable history, git timed out). */
async function inspect(f: Found): Promise<{ info: RepoInfo } | { skip: string }> {
  const base: RepoInfo = { name: path.basename(f.dir), path: f.dir, branch: null, remote: null, githubUrl: null, lastCommit: null, commits30: null };
  const [last, count, branch, remote] = await Promise.allSettled([
    git(f.dir, ['log', '-1', '--format=%cI']),
    git(f.dir, ['rev-list', '--count', '--since=30.days.ago', 'HEAD']),
    git(f.dir, ['symbolic-ref', '--short', '-q', 'HEAD']),
    git(f.dir, ['config', '--get', 'remote.origin.url']),
  ]);
  if (timedOut(last) || timedOut(count)) return { skip: 'git timed out (slow or partly evicted repo)' };
  if (last.status !== 'fulfilled' || !last.value || count.status !== 'fulfilled') return { skip: 'no readable commit history (empty or partly evicted)' };
  base.lastCommit = last.value;
  base.commits30 = Number.parseInt(count.value, 10) || 0;
  if (branch.status === 'fulfilled') base.branch = branch.value || null;
  if (base.branch === null) {
    try {
      base.branch = `detached ${await git(f.dir, ['rev-parse', '--short', 'HEAD'])}`;
    } catch {
      // unborn or unreadable
    }
  }
  if (remote.status === 'fulfilled') {
    const r = sanitizeRemote(remote.value);
    base.remote = r.display;
    base.githubUrl = r.github;
  }
  return { info: base };
}

function groupSkipped(skipped: { name: string; reason: string }[]): ReposData['skipped'] {
  const by = new Map<string, string[]>();
  for (const s of skipped) by.set(s.reason, [...(by.get(s.reason) ?? []), s.name]);
  return [...by.entries()].map(([reason, names]) => ({ reason, count: names.length, examples: names.slice(0, 6) })).sort((a, b) => b.count - a.count);
}

async function scan(): Promise<ReposData> {
  const t0 = Date.now();
  const deadline = t0 + WALK_BUDGET_MS;
  const walked = await Promise.all(ROOTS.map((r) => findRepos(r, deadline)));
  const seen = new Set<string>();
  const found: Found[] = [];
  for (const w of walked)
    for (const f of w.found) {
      const real = await fs.realpath(f.dir).catch(() => f.dir);
      if (seen.has(real)) continue;
      seen.add(real);
      found.push(f);
    }
  const skipped = found.filter((f) => f.skip).map((f) => ({ name: path.basename(f.dir), reason: f.skip as string }));
  if (walked.some((w) => w.truncated)) skipped.push({ name: '(scan)', reason: 'directory walk hit its time/size budget; some folders were not visited' });
  const results = await mapLimit(
    found.filter((f) => !f.skip),
    CONCURRENCY,
    async (f) => ({ f, r: await inspect(f) }),
  );
  const infos: RepoInfo[] = [];
  for (const { f, r } of results) {
    if ('info' in r) infos.push(r.info);
    else skipped.push({ name: path.basename(f.dir), reason: r.skip });
  }
  infos.sort((a, b) => (b.commits30 ?? -1) - (a.commits30 ?? -1) || Date.parse(b.lastCommit ?? '') - Date.parse(a.lastCommit ?? '') || a.name.localeCompare(b.name));
  return {
    repos: infos.slice(0, TOP_N).map((r) => ({ ...r, path: r.path.startsWith(HOME) ? `~${r.path.slice(HOME.length)}` : r.path })),
    found: found.length,
    skipped: groupSkipped(skipped),
    skippedCount: skipped.length,
    roots: ROOTS.map((r) => (r.startsWith(HOME) ? `~${r.slice(HOME.length)}` : r)),
    scannedAt: new Date().toISOString(),
    tookMs: Date.now() - t0,
  };
}

let lastForcedAt = 0;
const FORCE_MIN_MS = 60_000;

/** Top repos by recent activity. Cached 15 min (stale-while-revalidate); `force` re-scans at most once a minute. */
export function topRepos(force = false): Promise<ReposData> {
  const doForce = force && Date.now() - lastForcedAt > FORCE_MIN_MS;
  if (doForce) lastForcedAt = Date.now();
  return cached('launchpad:repos', TTL_MS, scan, { maxStaleMs: 6 * 60 * 60_000, force: doForce });
}
