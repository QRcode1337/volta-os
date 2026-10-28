import 'server-only';
import fsp from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import type { RealSkill } from '@/types/sources';
import { parseFrontmatter } from '@/lib/text';
import { cached } from './cache';
import { getPluginState } from './plugins';
import { getSkillUsage } from './transcripts';

const CLAUDE_DIR = path.join(os.homedir(), '.claude');

async function readSkill(file: string): Promise<{ name: string; description: string } | null> {
  try {
    const fm = parseFrontmatter(await fsp.readFile(file, 'utf8'));
    return { name: fm.get('name') || path.basename(path.dirname(file)), description: fm.get('description') || '' };
  } catch {
    return null;
  }
}

async function isDir(p: string): Promise<boolean> {
  try {
    return (await fsp.stat(p)).isDirectory();
  } catch {
    return false;
  }
}

async function dirs(p: string): Promise<string[]> {
  try {
    return (await fsp.readdir(p, { withFileTypes: true })).filter((e) => e.isDirectory() || e.isSymbolicLink()).map((e) => e.name);
  } catch {
    return [];
  }
}

/**
 * User skills (~/.claude/skills) + plugin skills on disk (~/.claude/plugins/cache/<market>/<plugin>/<ver>/skills).
 * A plugin's version is the one installed_plugins.json names (else the newest folder); `enabled` follows
 * enabledPlugins in ~/.claude/settings.json — a disabled plugin's skills are on disk but not invocable.
 */
type CatalogSkill = Omit<RealSkill, 'uses30d' | 'lastUsedAt' | 'installed'>;

const numericVersion = (v: string) => v.split(/[.-]/).map((x) => (/^\d+$/.test(x) ? x.padStart(6, '0') : x)).join('.');

async function loadSkillCatalog(): Promise<CatalogSkill[]> {
  const out: CatalogSkill[] = [];
  const userRoot = path.join(CLAUDE_DIR, 'skills');
  for (const d of await dirs(userRoot)) {
    const file = path.join(userRoot, d, 'SKILL.md');
    const s = await readSkill(file);
    if (s) out.push({ id: d, name: s.name, source: 'user', plugin: null, description: s.description, path: file, enabled: true });
  }
  const { enabled, installPath } = await getPluginState();
  const cacheRoot = path.join(CLAUDE_DIR, 'plugins', 'cache');
  for (const market of await dirs(cacheRoot))
    for (const plugin of await dirs(path.join(cacheRoot, market))) {
      const key = `${plugin}@${market}`;
      const registered = installPath.get(key);
      // The registered version can be missing on disk (an orphaned cache); Claude Code can't load it then.
      const installed = registered && (await isDir(registered)) ? registered : null;
      const versions = (await dirs(path.join(cacheRoot, market, plugin))).sort((a, b) => numericVersion(a).localeCompare(numericVersion(b)));
      const root = installed ?? (versions.length ? path.join(cacheRoot, market, plugin, versions[versions.length - 1]) : null);
      if (!root) continue;
      const on = !!installed && enabled.get(key) === true;
      const skillsDir = path.join(root, 'skills');
      for (const d of await dirs(skillsDir)) {
        const file = path.join(skillsDir, d, 'SKILL.md');
        const s = await readSkill(file);
        if (s) {
          out.push({ id: `${plugin}:${d}`, name: s.name, source: 'plugin', plugin, description: s.description, path: file, enabled: on });
        }
      }
    }
  return out;
}

export async function getSkills(): Promise<RealSkill[]> {
  const [catalog, usage] = await Promise.all([cached('skill-catalog:v3', 10 * 60_000, loadSkillCatalog), getSkillUsage()]);
  const byId = new Map(catalog.map((s) => [s.id, s]));
  const byName = new Map<string, CatalogSkill[]>();
  for (const s of catalog) byName.set(s.name, [...(byName.get(s.name) ?? []), s]);

  // Credit each transcript invocation name to exactly one installed skill: an exact id match, else the only
  // skill with that frontmatter name. A bare name shared by several skills is not guessed (see below).
  const credit = new Map<string, { uses: number; last: number }>();
  const unattributed: { key: string; u: { uses: number; last: number }; matches: CatalogSkill[] }[] = [];
  for (const [key, u] of usage) {
    const named = byName.get(key) ?? [];
    const owner = byId.get(key) ?? (named.length === 1 ? named[0] : undefined);
    if (!owner) {
      unattributed.push({ key, u, matches: named });
      continue;
    }
    const c = credit.get(owner.id) ?? { uses: 0, last: 0 };
    c.uses += u.uses;
    c.last = Math.max(c.last, u.last);
    credit.set(owner.id, c);
  }

  const skills: RealSkill[] = catalog.map((s) => {
    const u = credit.get(s.id);
    return { ...s, installed: true, uses30d: u?.uses ?? 0, lastUsedAt: u?.last ? new Date(u.last).toISOString() : null };
  });
  // Seen in transcripts but not attributable to one installed skill (built-ins, removed plugins, or a bare
  // name several installed skills share) — listed once, as not installed, so no call is counted twice.
  for (const { key, u, matches } of unattributed) {
    skills.push({
      id: key,
      name: key,
      source: key.includes(':') ? 'plugin' : 'user',
      plugin: key.includes(':') ? key.split(':')[0] : null,
      description: matches.length ? `Invoked as "${key}", which ${matches.length} installed skills share: ${matches.map((m) => m.id).join(', ')}` : '',
      path: '',
      installed: false,
      enabled: false,
      uses30d: u.uses,
      lastUsedAt: new Date(u.last).toISOString(),
    });
  }
  return skills.sort((a, b) => b.uses30d - a.uses30d || a.name.localeCompare(b.name));
}
