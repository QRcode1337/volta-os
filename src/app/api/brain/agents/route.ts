import { route } from '@/lib/server/route-helpers';
import { HonchoOfflineError, listSessions, listWorkspaces, sessionMessages } from '@/lib/server/honcho';
import { cached } from '@/lib/server/sources/cache';
import { redactDeep, redactSecrets } from '@/lib/server/redact';
import { mapLimit } from '@/lib/server/proc';
import type { HonchoMessage } from '@/types/honcho';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// "Everything your agents heard": per Honcho workspace (one per agent: Hermes, openclaw, pi…), the latest few
// messages across its most recent sessions. Read-only, secret-masked, cached 30s.

const SESSIONS_PER_AGENT = 3;
const MESSAGES_PER_AGENT = 3;
const SNIPPET_CHARS = 180;

export interface AgentLine {
  id: string;
  at: string;
  peer: string;
  text: string;
  session: string;
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
    const sessions = await listSessions(id, 1, SESSIONS_PER_AGENT);
    const pages = await Promise.all(sessions.items.map((s) => sessionMessages(id, s.id, { order: 'desc', size: MESSAGES_PER_AGENT })));
    const msgs: HonchoMessage[] = pages.flatMap((p) => p.items);
    msgs.sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at));
    const lines = msgs
      .filter((m) => m.content.trim())
      .slice(0, MESSAGES_PER_AGENT)
      .map((m) => ({ id: m.id, at: m.created_at, peer: m.peer_id, text: snippet(m.content), session: m.session_id }));
    return { id, sessions: sessions.total, lastActive: lines[0]?.at ?? null, lines };
  } catch (err) {
    if (err instanceof HonchoOfflineError) throw err; // whole service down → reported as offline, not "no messages"
    return { id, sessions: 0, lastActive: null, lines: [], error: errText(err) };
  }
}

async function loadAgents(): Promise<AgentsPayload> {
  const fetchedAt = new Date().toISOString();
  try {
    const workspaces = await listWorkspaces();
    const agents = await mapLimit(workspaces.items, 4, (w) => loadAgent(w.id));
    agents.sort((a, b) => Date.parse(b.lastActive ?? '0') - Date.parse(a.lastActive ?? '0'));
    return redactDeep({ online: true, agents, fetchedAt });
  } catch (err) {
    if (err instanceof HonchoOfflineError) return { online: false, agents: [], fetchedAt };
    throw err;
  }
}

export const GET = route(({ url }) => cached('brain-agents', 30_000, loadAgents, { force: url.searchParams.get('refresh') === '1' }));
