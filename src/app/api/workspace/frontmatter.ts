/** Minimal YAML-ish frontmatter reader: `---\nkey: value\n---`. Values stay strings; quotes are stripped. */
export function parseFrontmatter(src: string): Record<string, string> {
  const m = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/.exec(src);
  if (!m) return {};
  const out: Record<string, string> = {};
  for (const line of m[1].split(/\r?\n/)) {
    const kv = /^([A-Za-z0-9_-]+)\s*:\s*(.*)$/.exec(line);
    if (!kv) continue;
    out[kv[1].toLowerCase()] = kv[2].trim().replace(/^(['"])(.*)\1$/, '$2');
  }
  return out;
}
