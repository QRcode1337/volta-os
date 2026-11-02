import { route } from '@/lib/server/route-helpers';
import { HonchoOfflineError, listSessions, listWorkspaces, sessionMessages } from '@/lib/server/honcho';
import { cached } from '@/lib/server/sources/cache';
import { redactDeep, redactSecrets } from '@/lib/server/redact';
import { mapLimit } from '@/lib/server/proc';
import type { HonchoMessage } from '@/types/honcho';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// "Everything your agents heard": per Honcho workspace (one per agent: Hermes, openclaw, pi…), the latest few
// messages across its most recently active sessions. Read-only, secret-masked, cached 30s.
// Honcho lists sessions by creation time only, so the newest SESSIONS_SCANNED are read and ranked by their latest
// message; a session created before those that is still chatting can be missed.

const SESSIONS_SCANNED = 12;
const WORKSPACE_PAGE = 100;
const MESSAGES_PER_AGENT = 3;
const SNIPPET_CHARS = 180;

export interface AgentLine {
  id: string;
  at: string;
  peer: string;
  text: string;
  sessionId: string;
}

export interface AgentCard {
  id: string;
  sessions: number;
  lastActive: string | null;
  lines: AgentLine[];
  /** Set when this agent's sessions/messages could not be read (Honcho itself answered). */
  error?: string;
}

export interface AgentsPayload {
  online: boolean;
  agents: AgentCard[];
  /** When Honcho was actually read (the cache can serve this for a while). */
  fetchedAt: string;
}

/** Masks secrets on the full text first, then flattens and cuts (cutting first can leave unmaskable key fragments). */
const snippet = (s: string) => {
  const flat = redactSecrets(s)
    .replace(/[#*`>|]+/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(/^[\s'"<>:-]+/, '')
    .trim();
  return flat.length > SNIPPET_CHARS ? `${flat.slice(0, SNIPPET_CHARS - 1)}…` : flat;
};

const errText = (err: unknown) => (err instanceof Error ? err.message : 'request failed');

async function loadAgent(id: string): Promise<AgentCard> {
  try {
    const sessions = await listSessions(id, 1, SESSIONS_SCANNED);
    const pages = await mapLimit(sessions.items, 6, (s) => sessionMessages(id, s.id, { order: 'desc', size: MESSAGES_PER_AGENT }));
    const msgs: HonchoMessage[] = pages.flatMap((p) => p.items);
    msgs.sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at));
    const lines = msgs
      .filter((m) => m.content.trim())
      .slice(0, MESSAGES_PER_AGENT)
      .map((m) => ({ id: m.id, at: m.created_at, peer: m.peer_id, text: snippet(m.content), sessionId: m.session_id }));
    return { id, sessions: sessions.total, lastActive: lines[0]?.at ?? null, lines };
  } catch (err) {
    if (err instanceof HonchoOfflineError) throw err; // whole service down → reported as offline, not "no messages"
    return { id, sessions: 0, lastActive: null, lines: [], error: errText(err) };
  }
}

async function loadAgents(): Promise<AgentsPayload> {
  const fetchedAt = new Date().toISOString();
  try {
    const ids: string[] = [];
    for (let page = 1; ; page++) {
      const p = await listWorkspaces(page, WORKSPACE_PAGE);
      ids.push(...p.items.map((w) => w.id));
      if (page >= p.pages) break;
    }
    const agents = await mapLimit(ids, 4, loadAgent);
    agents.sort((a, b) => Date.parse(b.lastActive ?? '0') - Date.parse(a.lastActive ?? '0'));
    return redactDeep({ online: true, agents, fetchedAt });
  } catch (err) {
    if (err instanceof HonchoOfflineError) return { online: false, agents: [], fetchedAt };
    throw err;
  }
}

export const GET = route(({ url }) => cached('brain-agents', 30_000, loadAgents, { force: url.searchParams.get('refresh') === '1' }));
