import 'server-only';
import { createHash } from 'node:crypto';
import { stripMarkdown } from '@/lib/text';
import { redactSecrets } from '../redact';
import { MAX_BODY } from './config';

export const stableId = (prefix: string, key: string): string => `${prefix}_${createHash('sha1').update(key).digest('hex').slice(0, 16)}`;

export const slug = (s: string): string =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48) || 'job';

/** Mask secrets, normalise newlines and cap the length. Every string that leaves the server goes through this. */
export function clean(text: string, max = MAX_BODY): string {
  let t = redactSecrets(String(text ?? '').replace(/\r\n?/g, '\n').replace(/\u0000/g, '')).trim();
  if (t.length > max) t = `${t.slice(0, max).trimEnd()}\n\n...(truncated, ${t.length - max} more characters; open the source file for the rest)`;
  return t;
}

/** First meaningful line of a markdown text, stripped of markup, as a one-line title. */
export function titleFrom(text: string, fallback: string, max = 110): string {
  for (const raw of text.replace(/<!--[\s\S]*?-->/g, '').split('\n')) {
    const line = stripMarkdown(raw, { oneLine: true })
      .replace(/^[\s>#*\-+•]+/, '')
      .trim();
    if (line.length >= 3 && !/^[-=─═_*\s]+$/.test(line)) return line.length > max ? `${line.slice(0, max - 1).trimEnd()}…` : line;
  }
  return fallback;
}

/** Markdown body as one plain-text line, capped at `max`. */
export function excerptOf(body: string, max = 360): string {
  const t = stripMarkdown(body, { oneLine: true });
  return t.length > max ? `${t.slice(0, max).trimEnd()}…` : t;
}

/** "Sentinel — External Signal Monitor" -> "Sentinel"; action-* jobs get readable names. */
export function jobLabel(name: string): string {
  const n = name.trim();
  const named: [RegExp, string][] = [
    [/^action-digest$/i, 'Action Digest'],
    [/^action-weekly-rollup$/i, 'Weekly Rollup'],
    [/^action-orchestrate$/i, 'Action Orchestrate'],
    [/^action-capture$/i, 'Action Capture'],
    [/^quantum_?vault/i, 'Quantum_VAULT Archive'],
  ];
  for (const [re, label] of named) if (re.test(n)) return label;
  return n.split(/\s+[—–]\s+/)[0].trim() || n;
}

export const NOISE_RE = /^\s*(NO_REPLY|HEARTBEAT_OK|\[SILENT\]|NO_UPDATE)\s*$/i;
