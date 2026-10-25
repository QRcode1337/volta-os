import 'server-only';
import { redactSecrets } from '../redact';

// Minimal Notion REST client for VOLTA OS. Read-only by construction: only GET and the database `query` POST are
// exposed, and the token is read from the environment here and nowhere else (it never reaches the client, logs or
// error messages). Notion allows an average of ~3 requests/second, so every call goes through one small queue.
//
// Notion-Version 2022-06-28 is deliberate: `POST /databases/{id}/query` and block children behave as documented there,
// and the databases we read (Dreams, My Life Wiki) are single-source. The 2025-09-03 version only matters for
// multi-source databases (it moves queries to /data_sources/{id}/query).

const API = 'https://api.notion.com/v1';
const VERSION = '2022-06-28';
const MIN_GAP_MS = 350; // ≈ 2.9 req/s
const TIMEOUT_MS = 25_000;
const MAX_ATTEMPTS = 4;

export class NotionError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code: string,
  ) {
    super(message);
    this.name = 'NotionError';
  }
  /** Page/database exists but is not shared with the integration (Notion answers 404 object_not_found for both). */
  get noAccess(): boolean {
    return this.status === 404 || this.status === 403;
  }
}

export function notionConfigured(): boolean {
  return !!process.env.NOTION_TOKEN;
}

const g = globalThis as unknown as { __voltaNotionSlot?: number };
const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/** Reserve the next request slot (survives hot reload: the slot clock lives on globalThis). */
async function takeSlot(): Promise<void> {
  const now = Date.now();
  const at = Math.max(now, g.__voltaNotionSlot ?? 0);
  g.__voltaNotionSlot = at + MIN_GAP_MS;
  if (at > now) await sleep(at - now);
}

async function request<T>(method: 'GET' | 'POST', path: string, body?: unknown): Promise<T> {
  const token = process.env.NOTION_TOKEN;
  if (!token) throw new NotionError('NOTION_TOKEN is not set in .env.local.', 503, 'not_configured');
  let lastErr: NotionError | null = null;
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    await takeSlot();
    let res: Response;
    try {
      res = await fetch(`${API}${path}`, {
        method,
        cache: 'no-store',
        signal: AbortSignal.timeout(TIMEOUT_MS),
        headers: {
          Authorization: `Bearer ${token}`,
          'Notion-Version': VERSION,
          ...(body ? { 'Content-Type': 'application/json' } : {}),
        },
        body: body ? JSON.stringify(body) : undefined,
      });
    } catch (err) {
      lastErr = new NotionError(`Notion request failed: ${redactSecrets((err as Error).message)}`, 502, 'network');
      await sleep(600 * (attempt + 1));
      continue;
    }
    if (res.ok) return (await res.json()) as T;
    let code = 'error';
    let message = res.statusText;
    try {
      const j = (await res.json()) as { code?: string; message?: string };
      code = j.code ?? code;
      message = j.message ?? message;
    } catch {
      // non-JSON error body
    }
    lastErr = new NotionError(redactSecrets(message), res.status, code);
    if (res.status === 429) {
      const wait = Number(res.headers.get('retry-after')) || 2;
      g.__voltaNotionSlot = Math.max(g.__voltaNotionSlot ?? 0, Date.now() + wait * 1000);
      continue;
    }
    if (res.status >= 500) {
      await sleep(800 * (attempt + 1));
      continue;
    }
    throw lastErr; // 4xx other than 429: retrying will not help
  }
  throw lastErr ?? new NotionError('Notion request failed.', 502, 'unknown');
}

export const notionGet = <T>(path: string) => request<T>('GET', path);
export const notionQuery = <T>(databaseId: string, body: unknown) => request<T>('POST', `/databases/${databaseId}/query`, body);

// ───────────── raw API shapes (only the fields we read) ─────────────

export interface RichText {
  type: 'text' | 'mention' | 'equation';
  plain_text: string;
  href: string | null;
  annotations?: { bold?: boolean; italic?: boolean; strikethrough?: boolean; underline?: boolean; code?: boolean };
  text?: { content: string; link: { url: string } | null };
  mention?: {
    type: string;
    page?: { id: string };
    database?: { id: string };
    user?: { name?: string };
    date?: { start: string; end?: string | null };
    link_mention?: { href: string; title?: string };
    link_preview?: { url: string };
  };
  equation?: { expression: string };
}

export interface RawBlock {
  id: string;
  type: string;
  has_children: boolean;
  [key: string]: unknown;
}

export interface RawPage {
  id: string;
  url?: string;
  last_edited_time?: string;
  created_time?: string;
  icon?: { type: string; emoji?: string } | null;
  properties: Record<string, { type: string; [k: string]: unknown }>;
}

export const stripDashes = (id: string) => id.replace(/-/g, '').toLowerCase();
export const pageUrl = (id: string) => `https://www.notion.so/${stripDashes(id)}`;

/** Title of a page from its title-typed property. */
export function pageTitle(p: RawPage): string {
  for (const prop of Object.values(p.properties ?? {})) {
    if (prop.type === 'title') return ((prop.title as RichText[]) ?? []).map((t) => t.plain_text).join('').trim();
  }
  return '';
}

export interface ListResp<T> {
  results: T[];
  has_more: boolean;
  next_cursor: string | null;
}

/** Every child block of `blockId` (follows pagination). */
export async function listChildren(blockId: string): Promise<RawBlock[]> {
  const out: RawBlock[] = [];
  let cursor: string | null = null;
  do {
    const q: string = `?page_size=100${cursor ? `&start_cursor=${encodeURIComponent(cursor)}` : ''}`;
    const r: ListResp<RawBlock> = await notionGet(`/blocks/${stripDashes(blockId)}/children${q}`);
    out.push(...r.results);
    cursor = r.has_more ? r.next_cursor : null;
  } while (cursor);
  return out;
}
