import 'server-only';
import { HonchoApiError, HonchoOfflineError, listPeers, listSessions, listWorkspaces, searchWorkspace } from '../honcho';
import { getCapture, listCaptures } from '../ltm';
import { cached } from '../sources/cache';
import { CLAUDE_MEM_URL } from '../sources/claude-mem';
import { getMcpServers } from '../sources/mcp';
import { getNotionPages } from '../sources/notion';
import { getRoutines } from '../sources/routines';
import { getSkills } from '../sources/skills';
import { searchNotes } from './notes-index';
import { SourceTimeout, allTermsIn, redact, makeSnippet, makeTitle, nameScore, withTimeout, type ParsedQuery } from './text';
import type { SearchHit, SearchSourceId, SearchSourceState } from './types';

// One read-only search function per memory source. Each returns hits already masked and highlighted.

export interface SourceOutput {
  hits: SearchHit[];
  total: number | null;
  status?: SearchSourceState; // default 'ok'
  note?: string | null;
}

export interface SourceContext {
  pq: ParsedQuery;
  limit: number;
  signal: AbortSignal;
}

/** claude-mem worker unreachable (connection refused etc.). */
export class SourceOffline extends Error {}

const fmt = (n: number) => n.toLocaleString('en-US');

function hit(source: SearchSourceId, id: string, pq: ParsedQuery, p: Omit<SearchHit, 'source' | 'id' | 'title' | 'titleHighlights' | 'snippet' | 'highlights'> & { title: string; text: string | null | undefined; snippetSize?: number }): SearchHit {
  const { title: rawTitle, text, snippetSize, ...rest } = p;
  const title = makeTitle(rawTitle, pq);
  const snippet = makeSnippet(text, pq, snippetSize);
  return { source, id, title: title.text, titleHighlights: title.highlights, snippet: snippet.text, highlights: snippet.highlights, ...rest };
}

// ───────── unvolta LTM (screen OCR) ─────────

export async function searchLtm({ pq, limit }: SourceContext): Promise<SourceOutput> {
  await Promise.resolve(); // node:sqlite is synchronous: let the network sources start first
  const list = listCaptures({ q: pq.q, limit });
  const hits = list.items.map((c) => {
    const full = getCapture(c.id); // full OCR text, so the snippet is masked before it is windowed
    return hit('ltm', String(c.id), pq, {
      title: c.title || c.app,
      text: full?.content ?? c.snippet,
      when: c.ts,
      // LtmApp deep link: opens the capture's day, selects it, and highlights the query (search scoped to that day).
      href: `/apps/ltm?${new URLSearchParams({ date: c.ts.slice(0, 10), capture: String(c.id), q: pq.q })}`,
      external: false,
      secondary: null,
      meta: [c.app, `#${c.id}`],
    });
  });
  return { hits, total: list.total, note: 'Exact phrase in OCR text or window title, newest first' };
}

// ───────── Obsidian vaults ─────────

export async function searchVaultNotes({ pq, limit }: SourceContext): Promise<SourceOutput> {
  const r = await searchNotes(pq, limit);
  return { hits: r.hits, total: r.total, note: r.note };
}

// ───────── claude-mem worker ─────────

interface MemObservation {
  id: number;
  type?: string;
  title?: string | null;
  subtitle?: string | null;
  narrative?: string | null;
  text?: string | null;
  project?: string | null;
  created_at?: string;
}
interface MemSession {
  id: number | string;
  request?: string | null;
  completed?: string | null;
  learned?: string | null;
  investigated?: string | null;
  project?: string | null;
  created_at?: string;
}

export async function searchClaudeMem({ pq, limit, signal }: SourceContext): Promise<SourceOutput> {
  const url = `${CLAUDE_MEM_URL}/api/search?query=${encodeURIComponent(pq.q)}&limit=${limit}&format=json`;
  let res: Response;
  try {
    res = await fetch(url, { signal: AbortSignal.any([signal, AbortSignal.timeout(4_000)]), cache: 'no-store' });
  } catch (err) {
    if ((err as { name?: string }).name === 'TypeError') throw new SourceOffline(`claude-mem worker not reachable at ${CLAUDE_MEM_URL}`);
    throw err;
  }
  if (!res.ok) throw new Error(`claude-mem returned HTTP ${res.status}`);
  const body = (await res.json()) as { observations?: MemObservation[]; sessions?: MemSession[] };
  const viewer = `${CLAUDE_MEM_URL}/viewer`;
  const obs = (body.observations ?? []).map((o) =>
    hit('claude-mem', `obs:${o.id}`, pq, {
      title: o.title || o.subtitle || `Observation #${o.id}`,
      text: [o.subtitle, o.narrative ?? o.text].filter(Boolean).join(' — '),
      when: o.created_at ?? null,
      href: viewer,
      external: true,
      secondary: null,
      meta: [o.type ?? 'observation', o.project ?? '', `#${o.id}`].filter(Boolean),
    }),
  );
  const sessions = (body.sessions ?? []).map((s) =>
    hit('claude-mem', `session:${s.id}`, pq, {
      title: s.request || `Session summary #${s.id}`,
      text: s.completed || s.learned || s.investigated,
      when: s.created_at ?? null,
      href: viewer,
      external: true,
      secondary: null,
      meta: ['session summary', s.project ?? ''].filter(Boolean),
    }),
  );
  return {
    hits: [...obs, ...sessions].slice(0, limit),
    total: null,
    note: 'Semantic search by the claude-mem worker: hits are related by meaning and may not contain your words (prompts not included)',
  };
}

// ───────── Honcho ─────────

interface HonchoIds {
  workspace: string;
  peers: { id: string; created_at: string }[];
  sessions: { id: string; created_at: string; active: boolean }[];
  peersTotal: number;
  sessionsTotal: number;
}

/** Peer + session ids per workspace (first 100 of each), cached 5 min. */
const honchoIds = () =>
  cached('search:honcho-ids', 5 * 60_000, async (): Promise<HonchoIds[]> => {
    const ws = (await listWorkspaces(1, 100)).items;
    return Promise.all(
      ws.map(async (w) => {
        const [peers, sessions] = await Promise.all([listPeers(w.id, 1, 100), listSessions(w.id, 1, 100)]);
        return {
          workspace: w.id,
          peers: peers.items.map((p) => ({ id: p.id, created_at: p.created_at })),
          sessions: sessions.items.map((s) => ({ id: s.id, created_at: s.created_at, active: s.is_active })),
          peersTotal: peers.total,
          sessionsTotal: sessions.total,
        };
      }),
    );
  });

/** Message search that just failed upstream is not retried for 5 min (each attempt costs an embedding call). */
const BREAKER_MS = 5 * 60_000;
const breaker = ((globalThis as unknown as { __voltaSearchHonchoBreaker?: Map<string, { until: number; reason: string }> }).__voltaSearchHonchoBreaker ??= new Map());

const honchoHref = (w: string, p: Record<string, string>) => `/apps/honcho?${new URLSearchParams({ w, ...p }).toString()}`;

export async function searchHoncho({ pq, limit }: SourceContext, semanticOk: boolean): Promise<SourceOutput> {
  let idx: HonchoIds[];
  try {
    idx = await honchoIds();
  } catch (err) {
    if (err instanceof HonchoOfflineError) throw new SourceOffline(err.message);
    throw err;
  }
  const hits: SearchHit[] = [];
  const problems: string[] = [];
  const now = Date.now();

  // Message search (Honcho's own /search; embedding-backed), one call per workspace, under its own budget so
  // the id matches below still return when it is slow.
  const messageRuns = semanticOk
    ? idx.map(async ({ workspace }) => {
        const open = breaker.get(workspace);
        if (open && open.until > now) {
          problems.push(`${workspace}: ${open.reason} — retry in ${Math.ceil((open.until - now) / 60_000)}m`);
          return;
        }
        try {
          const msgs = await withTimeout(searchWorkspace(workspace, pq.q, limit), 2_000);
          breaker.delete(workspace);
          for (const m of msgs)
            hits.push(
              hit('honcho', `msg:${workspace}:${m.id}`, pq, {
                title: `${m.peer_id} · ${m.session_id}`,
                text: m.content,
                when: m.created_at,
                // HonchoApp deep link: opens the thread around the message and highlights the query.
                href: honchoHref(workspace, { tab: 'sessions', session: m.session_id, message: m.id, at: m.created_at, q: pq.q }),
                external: false,
                secondary: null,
                meta: [workspace, 'message'],
              }),
            );
        } catch (err) {
          if (err instanceof SourceTimeout) problems.push(`${workspace}: message search timed out`);
          else if (err instanceof HonchoApiError) {
            const reason = `message search failed (HTTP ${err.status})`;
            breaker.set(workspace, { until: now + BREAKER_MS, reason });
            problems.push(`${workspace}: ${reason}`);
          } else problems.push(`${workspace}: ${(err as Error).message}`);
        }
      })
    : [];

  // Peer / session ids that contain every term.
  const idHits: SearchHit[] = [];
  for (const w of idx) {
    for (const p of w.peers)
      if (allTermsIn(pq.terms, p.id.toLowerCase()))
        idHits.push(
          hit('honcho', `peer:${w.workspace}:${p.id}`, pq, {
            title: p.id,
            text: `Peer in workspace ${w.workspace}`,
            when: p.created_at,
            href: honchoHref(w.workspace, { tab: 'peers', peer: p.id }),
            external: false,
            secondary: null,
            meta: [w.workspace, 'peer'],
          }),
        );
    for (const s of w.sessions)
      if (allTermsIn(pq.terms, s.id.toLowerCase()))
        idHits.push(
          hit('honcho', `session:${w.workspace}:${s.id}`, pq, {
            title: s.id,
            text: `Session in workspace ${w.workspace}${s.active ? ' · active' : ''}`,
            when: s.created_at,
            href: honchoHref(w.workspace, { tab: 'sessions', session: s.id }),
            external: false,
            secondary: null,
            meta: [w.workspace, 'session'],
          }),
        );
  }
  await Promise.all(messageRuns);
  const capped = idx.some((w) => w.peersTotal > w.peers.length || w.sessionsTotal > w.sessions.length);
  const notes = [
    semanticOk ? 'Messages by Honcho search (semantic)' : 'Message search needs 3+ characters',
    `peer/session ids by name across ${idx.length} workspace${idx.length === 1 ? '' : 's'}${capped ? ' (first 100 of each)' : ''}`,
  ];
  if (problems.length) notes.push(problems.join('; '));
  return {
    hits: [...idHits, ...hits].slice(0, limit),
    total: null,
    status: problems.length && semanticOk ? 'partial' : 'ok',
    note: notes.join(' · '),
  };
}

// ───────── Notion (titles ranked from LTM) ─────────

export async function searchNotion({ pq, limit }: SourceContext): Promise<SourceOutput> {
  const pages = await cached('search:notion', 5 * 60_000, () => getNotionPages(300));
  const matches = pages
    .filter((p) => allTermsIn(pq.terms, p.title.toLowerCase()))
    .map((p) => ({ p, score: nameScore(pq, p.title) + Math.min(p.visits, 50) / 10 }))
    .sort((a, b) => b.score - a.score);
  const mapped = pages.filter((p) => p.url).length;
  return {
    hits: matches.slice(0, limit).map(({ p }) =>
      hit('notion', redact(p.title), pq, {
        title: p.title,
        text: `${fmt(p.visits)} LTM capture${p.visits === 1 ? '' : 's'} with this window title${p.url ? '' : ' · no URL mapped yet (config/notion-pages.json)'}`,
        when: null,
        href: p.url,
        external: true,
        secondary: null,
        meta: ['Notion', `${fmt(p.visits)} visits`],
      }),
    ),
    total: matches.length,
    note: `Titles of Notion pages seen in LTM window titles (${fmt(pages.length)} known, ${fmt(mapped)} with a URL)`,
  };
}

// ───────── Skills, routines, MCP servers ─────────

export async function searchSkills({ pq, limit }: SourceContext): Promise<SourceOutput> {
  const skills = await cached('search:skills', 10 * 60_000, getSkills);
  const matches = skills
    .filter((s) => allTermsIn(pq.terms, s.name.toLowerCase(), s.id.toLowerCase(), s.description.toLowerCase(), s.plugin?.toLowerCase()))
    .map((s) => ({ s, score: Math.max(nameScore(pq, s.name, s.description), nameScore(pq, s.id, s.description)) + Math.min(s.uses30d, 20) / 4 }))
    .sort((a, b) => b.score - a.score);
  return {
    hits: matches.slice(0, limit).map(({ s }) =>
      hit('skills', s.id, pq, {
        title: s.id === s.name ? s.name : `${s.name} (${s.id})`,
        text: s.description || 'No description',
        when: s.lastUsedAt,
        href: '/second-brain?view=skills',
        external: false,
        secondary: null,
        meta: [s.plugin ? `plugin · ${s.plugin}` : s.source, `${fmt(s.uses30d)} uses · 30d`, ...(s.installed ? [] : ['not installed'])],
      }),
    ),
    total: matches.length,
    note: `Name, id and description across ${fmt(skills.length)} skills`,
  };
}

export async function searchRoutines({ pq, limit }: SourceContext): Promise<SourceOutput> {
  const routines = await cached('search:routines', 10 * 60_000, getRoutines);
  const matches = routines
    .filter((r) => allTermsIn(pq.terms, r.name.toLowerCase(), r.schedule.toLowerCase(), r.agent?.toLowerCase(), r.source, r.health))
    .map((r) => ({ r, score: nameScore(pq, r.name, r.schedule, r.agent) }))
    .sort((a, b) => b.score - a.score);
  return {
    hits: matches.slice(0, limit).map(({ r }) =>
      hit('routines', r.id, pq, {
        title: r.name,
        text: [r.schedule, r.health, r.lastError].filter(Boolean).join(' · '),
        when: r.lastRunAt,
        href: '/second-brain?view=routines',
        external: false,
        secondary: null,
        meta: [r.source === 'openclaw' ? 'OpenClaw cron' : 'LaunchAgent', r.health, ...(r.agent ? [r.agent] : [])],
      }),
    ),
    total: matches.length,
    note: `Name, schedule and agent across ${fmt(routines.length)} OpenClaw jobs + LaunchAgents (list cached up to 10 min)`,
  };
}

export async function searchMcp({ pq, limit }: SourceContext): Promise<SourceOutput> {
  const servers = await cached('search:mcp', 10 * 60_000, getMcpServers);
  const matches = servers
    .filter((s) => allTermsIn(pq.terms, s.name.toLowerCase(), s.command?.toLowerCase(), s.host?.toLowerCase(), s.transport))
    .map((s) => ({ s, score: nameScore(pq, s.name, s.command, s.host) }))
    .sort((a, b) => b.score - a.score);
  return {
    hits: matches.slice(0, limit).map(({ s }) =>
      hit('mcp', s.name, pq, {
        title: s.name,
        text: [s.transport, s.command, s.host].filter(Boolean).join(' · '),
        when: null,
        href: '/second-brain?view=apps',
        external: false,
        secondary: null,
        meta: [s.scope, s.transport],
      }),
    ),
    total: matches.length,
    note: `Names of ${fmt(servers.length)} MCP servers in ~/.claude.json (no args, env or headers are read)`,
  };
}
