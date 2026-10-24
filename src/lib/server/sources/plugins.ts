import 'server-only';
import fsp from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { cached } from './cache';

// Claude Code plugin state, read-only: which plugins are enabled (~/.claude/settings.json enabledPlugins)
// and where each installed plugin's active version lives (~/.claude/plugins/installed_plugins.json).
// Only user-level settings are read; a project's .claude/settings.json can enable more inside that project.

const CLAUDE_DIR = path.join(os.homedir(), '.claude');
const USER_SETTINGS = path.join(CLAUDE_DIR, 'settings.json');
const INSTALLED_PLUGINS = path.join(CLAUDE_DIR, 'plugins', 'installed_plugins.json');

export interface PluginState {
  /** "<plugin>@<marketplace>" (the enabledPlugins key) → true only when enabled. */
  enabled: Map<string, boolean>;
  /** "<plugin>@<marketplace>" → absolute path of the installed (active) version. */
  installPath: Map<string, string>;
}

async function readJson<T>(p: string): Promise<T | null> {
  try {
    return JSON.parse(await fsp.readFile(p, 'utf8')) as T;
  } catch {
    return null;
  }
}

async function load(): Promise<PluginState> {
  const [settings, installed] = await Promise.all([
    readJson<{ enabledPlugins?: Record<string, unknown> }>(USER_SETTINGS),
    readJson<{ plugins?: Record<string, { installPath?: unknown }[]> }>(INSTALLED_PLUGINS),
  ]);
  const enabled = new Map<string, boolean>();
  for (const [id, on] of Object.entries(settings?.enabledPlugins ?? {})) enabled.set(id, on === true);
  const installPath = new Map<string, string>();
  for (const [id, list] of Object.entries(installed?.plugins ?? {})) {
    const p = Array.isArray(list) ? list[0]?.installPath : undefined;
    if (typeof p === 'string' && path.isAbsolute(p)) installPath.set(id, p);
  }
  return { enabled, installPath };
}

/** Cached 30s (both files are small). */
export function getPluginState(): Promise<PluginState> {
  return cached('claude-plugin-state', 30_000, load);
}
