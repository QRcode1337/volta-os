'use client';
// Second Brain → Applications: live memory-source health (/api/sources) and the MCP servers configured
// for Claude Code (/api/mcp). Live services, ports and storage health live in VOLTA Systems (/apps/systems).

import Link from 'next/link';
import { useMemo, type ReactNode } from 'react';
import { Activity, ArrowUpRight, Cloud, Database, Info, Server, Terminal, Wrench } from 'lucide-react';
import type { McpServerInfo, MemorySource, SourceStatus } from '@/types/sources';
import { formatInt } from '@/lib/format';
import { cn } from '@/lib/cn';
import { ViewState, apiGate, clockLabel, matchesQuery, useApi, useNow } from './analytics-shared';

// McpServerInfo.reachable is optional: true / false for http/sse servers /api/mcp probed, null when it can't be
// checked from config (stdio servers are spawned per session). Absent = not reported, so nothing is shown.

const SYSTEMS_HREF = '/apps/systems';
const SCOPE_LABEL: Record<McpServerInfo['scope'], string> = { user: 'user-scope', plugin: 'from plugins', project: 'project-scoped' };

interface Props {
  /** Legacy props from SecondBrainApp — accepted, ignored (connector toggles were mock; this view is read-only real data). */
  query?: string;
  enabled?: Record<string, boolean>;
  onToggle?: (id: string, on: boolean) => void;
}

const STATUS: Record<SourceStatus, { label: string; color: string; text: string; border: string; bg: string }> = {
  live: { label: 'LIVE', color: '#22C55E', text: 'text-green', border: 'border-green/40', bg: 'bg-green/10' },
  idle: { label: 'IDLE', color: '#14B8A6', text: 'text-teal', border: 'border-teal/40', bg: 'bg-teal/10' },
  stale: { label: 'STALE', color: '#F5A623', text: 'text-amber', border: 'border-amber/40', bg: 'bg-amber/10' },
  offline: { label: 'OFFLINE', color: '#EF4444', text: 'text-red-400', border: 'border-red-500/40', bg: 'bg-red-500/10' },
  'not-connected': { label: 'NOT CONNECTED', color: '#6E6A61', text: 'text-muted', border: 'border-subtle', bg: 'bg-panel-hover' },
};
const NEEDS_ATTENTION: SourceStatus[] = ['stale', 'offline', 'not-connected'];
const LOCAL_COLOR = '#22C55E';
const REMOTE_COLOR = '#A855F7';

const isLocalHost = (host: string | null) => !!host && /^(localhost|127\.0\.0\.1|\[::1\]|[^.:]+\.local)(:\d+)?$/i.test(host);

export function ApplicationsView({ query = '' }: Props) {
  const sourcesApi = useApi<{ sources: MemorySource[] }>('/api/sources', 60_000);
  const mcpApi = useApi<{ servers: McpServerInfo[] }>('/api/mcp');
  const now = useNow();

  const sources = sourcesApi.data?.sources ?? [];
  const servers = useMemo(() => [...(mcpApi.data?.servers ?? [])].sort((a, b) => a.name.localeCompare(b.name)), [mcpApi.data]);
  const groups = useMemo(
    () => ({
      local: servers.filter((s) => s.transport === 'stdio'),
      remote: servers.filter((s) => s.transport === 'http' || s.transport === 'sse'),
      unknown: servers.filter((s) => s.transport === 'unknown'),
    }),
    [servers],
  );
  const counts = useMemo(() => {
    const c: Partial<Record<SourceStatus, number>> = {};
    for (const s of sources) c[s.status] = (c[s.status] ?? 0) + 1;
    return c;
  }, [sources]);
  const attention = sources.filter((s) => NEEDS_ATTENTION.includes(s.status)).length;
  const scopeCounts = useMemo(() => {
    const c: Record<McpServerInfo['scope'], number> = { user: 0, plugin: 0, project: 0 };
    for (const s of servers) c[s.scope] = (c[s.scope] ?? 0) + 1;
    return c;
  }, [servers]);
  const remoteOnThisMac = groups.remote.filter((s) => isLocalHost(s.host)).length;
  const probe = useMemo(() => {
    const probed = servers.filter((s) => s.reachable !== undefined);
    return probed.length
      ? {
          up: probed.filter((s) => s.reachable === true).length,
          down: probed.filter((s) => s.reachable === false).length,
          unchecked: probed.filter((s) => s.reachable === null).length,
        }
      : null;
  }, [servers]);

  const sourcesGate = apiGate(sourcesApi, { loading: 'PROBING MEMORY SOURCES…', error: 'SOURCES UNAVAILABLE' });
  const mcpGate = apiGate(mcpApi, { loading: 'READING MCP CONFIG…', error: 'MCP CONFIG UNAVAILABLE' });

  return (
    <div className="hud-scroll h-full w-full overflow-y-auto">
      <div className="mx-auto max-w-[1400px] space-y-5 px-5 py-5">
        {/* ── Section 1: Memory sources (status page) ── */}
        <section className="hud-card overflow-hidden">
          <header className="flex flex-wrap items-center gap-x-3 gap-y-1.5 border-b border-subtle px-4 py-3">
            <Database size={14} className="text-orange" />
            <span className="hud-label">MEMORY SOURCES · STATUS</span>
            {sources.length > 0 && (
              <span
                className={cn(
                  'rounded-full border px-2 py-0.5 font-mono text-[9px] font-semibold tracking-widest',
                  attention ? 'border-amber/40 bg-amber/10 text-amber' : 'border-green/40 bg-green/10 text-green',
                )}
              >
                {attention ? `${attention} NEED${attention === 1 ? 'S' : ''} ATTENTION` : 'ALL SOURCES REPORTING'}
              </span>
            )}
            <div className="ml-auto flex flex-wrap items-center gap-3 font-mono text-[9.5px] text-secondary">
              {(Object.keys(STATUS) as SourceStatus[])
                .filter((k) => counts[k])
                .map((k) => (
                  <span key={k} className="flex items-center gap-1.5">
                    <span className="h-2 w-2 rounded-full" style={{ background: STATUS[k].color }} />
                    {counts[k]} {STATUS[k].label.toLowerCase()}
                  </span>
                ))}
              {sourcesApi.updatedAt !== null && now !== null && (
                <span className="text-muted">checked {clockLabel(new Date(sourcesApi.updatedAt).toISOString(), now)} · every 60s</span>
              )}
            </div>
          </header>
          {sourcesGate ? (
            <div className="h-[220px]">{sourcesGate}</div>
          ) : sources.length === 0 ? (
            <ViewState kind="empty" title="NO SOURCES REPORTED" minH="min-h-[160px]" />
          ) : (
            <div className="divide-y divide-subtle">
              {sources.map((s) => (
                <SourceRow key={s.id} s={s} dim={!matchesQuery(query, s.name, s.headline, s.detail, s.status)} />
              ))}
            </div>
          )}
          {sourcesApi.error && sourcesApi.data && (
            <div className="border-t border-subtle px-4 py-1.5 font-mono text-[10px] text-amber">Refresh failed ({sourcesApi.error}) — showing the last good status.</div>
          )}
        </section>

        {/* ── Section 2: MCP servers ── */}
        <section>
          <div className="mb-2.5 flex flex-wrap items-center gap-2">
            <Server size={14} className="text-orange" />
            <span className="hud-label">MCP SERVERS · CLAUDE CODE CONFIG</span>
            {mcpApi.data && (
              <span className="font-mono text-[10px] text-muted">
                {groups.local.length} local · {groups.remote.length} remote{groups.unknown.length ? ` · ${groups.unknown.length} unknown` : ''}
              </span>
            )}
            {probe && (
              <span className="flex items-center gap-2 font-mono text-[10px]">
                <span className="text-green">{probe.up} reachable</span>
                {probe.down > 0 && <span className="text-red-400">{probe.down} unreachable</span>}
                {probe.unchecked > 0 && <span className="text-muted">{probe.unchecked} not checkable</span>}
              </span>
            )}
            <Link
              href={SYSTEMS_HREF}
              className="ml-auto inline-flex h-7 shrink-0 items-center gap-1.5 rounded-full border border-subtle bg-panel-elevated px-3 font-mono text-[9.5px] font-semibold tracking-wide text-secondary transition-colors hover:border-orange hover:text-orange"
              title="Live services, ports and storage health"
            >
              <Activity size={11} /> LIVE SERVICES &amp; STORAGE · SYSTEMS <ArrowUpRight size={11} />
            </Link>
          </div>

          {mcpGate ? (
            <div className="hud-card h-[220px]">{mcpGate}</div>
          ) : servers.length === 0 ? (
            <div className="hud-card">
              <ViewState
                kind="empty"
                title="NO MCP SERVERS FOUND"
                detail="/api/mcp found no MCP servers in the Claude Code config it reads (~/.claude.json user + project scopes, enabled plugins' .mcp.json)."
                minH="min-h-[160px]"
              />
            </div>
          ) : (
            <>
              <div className="mb-3 flex items-start gap-2 rounded-lg border border-subtle bg-panel-elevated px-3 py-2">
                <Info size={13} className="mt-px shrink-0 text-teal" />
                <p className="font-mono text-[10.5px] leading-relaxed text-secondary">
                  {/* /api/mcp reads all three scopes, so a 0 here means none configured (not "not read"). */}
                  <span className="font-semibold text-paper">
                    {formatInt(scopeCounts.user)} {SCOPE_LABEL.user} · {formatInt(scopeCounts.project)} {SCOPE_LABEL.project} · {formatInt(scopeCounts.plugin)}{' '}
                    {SCOPE_LABEL.plugin}
                  </span>{' '}
                  (user + project from ~/.claude.json, plugins from each enabled plugin&apos;s .mcp.json). Per-server context cost isn&apos;t
                  measurable from config — tools load on demand.
                </p>
              </div>
              <div className="grid gap-4 lg:grid-cols-2">
                <McpGroup
                  title="Local"
                  subtitle="stdio · spawned as a child process"
                  color={LOCAL_COLOR}
                  icon={<Terminal size={14} />}
                  servers={groups.local}
                  query={query}
                />
                <McpGroup
                  title="Remote"
                  subtitle={`http / sse · URL transport (local or remote)${remoteOnThisMac ? ` · ${remoteOnThisMac} on this Mac` : ''}`}
                  color={REMOTE_COLOR}
                  icon={<Cloud size={14} />}
                  servers={groups.remote}
                  query={query}
                />
                {groups.unknown.length > 0 && (
                  <McpGroup
                    title="Unrecognised"
                    subtitle="transport not stated in config"
                    color="#6E6A61"
                    icon={<Wrench size={14} />}
                    servers={groups.unknown}
                    query={query}
                  />
                )}
              </div>
            </>
          )}
        </section>
      </div>
    </div>
  );
}

function SourceRow({ s, dim }: { s: MemorySource; dim: boolean }) {
  const st = STATUS[s.status];
  const showHint = !!s.setupHint && NEEDS_ATTENTION.includes(s.status);
  const linkCls =
    'inline-flex h-7 shrink-0 items-center gap-1 rounded-full border border-subtle bg-panel-elevated px-2.5 font-mono text-[9.5px] font-semibold tracking-wide text-secondary transition-colors hover:border-orange hover:text-orange';
  const link = s.href ? (
    s.href.startsWith('/') ? (
      <Link href={s.href} className={linkCls}>
        Open <ArrowUpRight size={11} />
      </Link>
    ) : (
      <a href={s.href} className={linkCls} {...(/^https?:/i.test(s.href) ? { target: '_blank', rel: 'noreferrer' } : {})}>
        Open <ArrowUpRight size={11} />
      </a>
    )
  ) : null;

  return (
    <div className={cn('px-4 py-3 transition-opacity duration-200', dim ? 'opacity-30' : 'opacity-100')}>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 md:flex-nowrap">
        <div className="flex w-[170px] shrink-0 items-center gap-2.5">
          <span className={cn('h-2.5 w-2.5 shrink-0 rounded-full', s.status === 'live' && 'robo-pulse')} style={{ background: st.color, boxShadow: `0 0 6px ${st.color}88` }} />
          <span className="truncate text-[14px] font-semibold text-paper">{s.name}</span>
        </div>
        <span className="w-[200px] shrink-0 truncate font-doto text-[16px] font-bold text-paper" title={s.headline}>
          {s.headline}
        </span>
        <span className="min-w-0 flex-1 truncate font-mono text-[10.5px] text-secondary" title={s.detail}>
          {s.detail}
        </span>
        <span className={cn('shrink-0 rounded-full border px-2 py-0.5 font-mono text-[8.5px] font-bold tracking-widest', st.text, st.border, st.bg)}>{st.label}</span>
        <span className="flex w-[74px] shrink-0 justify-end">{link}</span>
      </div>
      {showHint && (
        <div className="mt-2 flex items-center gap-2 rounded-md border border-amber/25 bg-amber/5 px-2.5 py-1.5 md:ml-[186px]">
          <Wrench size={11} className="shrink-0 text-amber" />
          <span className="selectable font-mono text-[10px] text-secondary">{s.setupHint}</span>
        </div>
      )}
    </div>
  );
}

function McpGroup({
  title,
  subtitle,
  color,
  icon,
  servers,
  query,
}: {
  title: string;
  subtitle: string;
  color: string;
  icon: ReactNode;
  servers: McpServerInfo[];
  query: string;
}) {
  return (
    <section className="hud-card flex flex-col overflow-hidden">
      <div className="h-[3px]" style={{ background: color }} />
      <header className="flex items-center gap-2 border-b border-subtle px-3.5 py-3">
        <span style={{ color }}>{icon}</span>
        <span className="text-[15px] font-semibold text-paper">{title}</span>
        <span className="min-w-0 truncate font-mono text-[10px] text-muted" title={subtitle}>
          {subtitle}
        </span>
        <span className="ml-auto shrink-0 font-doto text-[18px] font-bold" style={{ color }}>
          {servers.length}
        </span>
      </header>
      {servers.length === 0 ? (
        <ViewState kind="empty" title="NONE CONFIGURED" minH="min-h-[110px]" />
      ) : (
        <div className="grid gap-2 p-3 sm:grid-cols-2">
          {servers.map((s) => {
            const match = matchesQuery(query, s.name, s.command, s.host, s.transport, s.scope, s.plugin, s.project);
            const local = isLocalHost(s.host);
            return (
              <div
                key={`${s.scope}:${s.name}`}
                className={cn(
                  'rounded-lg border bg-panel-elevated px-3 py-2 transition-all duration-300',
                  match ? 'border-subtle' : 'border-subtle opacity-25',
                  query.trim() && match && 'border-orange/50',
                )}
              >
                <div className="flex items-center gap-2">
                  <span className="truncate font-mono text-[12px] font-semibold text-paper" title={s.name}>
                    {s.name}
                  </span>
                  {s.scope !== 'user' && (
                    <span
                      className="shrink-0 rounded-full border border-subtle px-1.5 py-px font-mono text-[8px] font-semibold tracking-widest text-muted"
                      title={(s.scope === 'plugin' ? s.plugin : s.project) ?? undefined}
                    >
                      {s.scope === 'plugin' ? 'PLUGIN' : 'PROJECT'}
                    </span>
                  )}
                  {s.transport !== 'stdio' && s.transport !== 'unknown' && (
                    <span className="ml-auto shrink-0 rounded-full border px-1.5 py-px font-mono text-[8px] font-semibold tracking-widest" style={{ borderColor: `${color}66`, color }}>
                      {s.transport.toUpperCase()}
                    </span>
                  )}
                  <ReachChip s={s} />
                </div>
                <div className="mt-1 flex min-w-0 items-center gap-1.5 font-mono text-[10px] text-secondary">
                  {s.transport === 'stdio' ? (
                    <>
                      <span className="text-muted">$</span>
                      <span className="truncate">{s.command ?? 'command not stated'}</span>
                    </>
                  ) : (
                    <>
                      <span className="truncate" title={s.host ?? undefined}>
                        {s.host ?? 'host not stated'}
                      </span>
                      {local && <span className="shrink-0 rounded border border-green/30 px-1 text-[8px] tracking-widest text-green">THIS MAC</span>}
                    </>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}

/** " · checked 09:41" in local time (data arrives after mount, so this never renders on the server). */
function checkedLabel(iso: string | null | undefined): string {
  const t = iso ? new Date(iso) : null;
  if (!t || Number.isNaN(t.getTime())) return '';
  return ` · checked ${String(t.getHours()).padStart(2, '0')}:${String(t.getMinutes()).padStart(2, '0')}`;
}

/** Reachability from /api/mcp's probe; renders nothing until the server reports the field. */
function ReachChip({ s }: { s: McpServerInfo }) {
  if (s.reachable === undefined) return null;
  const pos = s.transport === 'stdio' || s.transport === 'unknown' ? 'ml-auto' : '';
  if (s.reachable === null) {
    const label = s.transport === 'stdio' ? 'not checkable (stdio)' : 'not checked';
    return (
      <span
        className={cn('shrink-0 font-mono text-[8.5px] text-muted', pos)}
        title={s.transport === 'stdio' ? 'stdio servers are spawned by each Claude Code session, so there is nothing to probe from here' : 'This server was not probed'}
      >
        {label}
      </span>
    );
  }
  return (
    <span
      className={cn(
        'shrink-0 rounded-full border px-1.5 py-px font-mono text-[8px] font-semibold tracking-widest',
        s.reachable ? 'border-green/40 bg-green/10 text-green' : 'border-red-500/40 bg-red-500/10 text-red-400',
        pos,
      )}
      title={`${s.reachable ? 'Answered the last probe' : 'Did not answer the last probe (refused, timed out or DNS failure)'}${checkedLabel(s.checkedAt)}`}
    >
      {s.reachable ? 'REACHABLE' : 'UNREACHABLE'}
    </span>
  );
}

export default ApplicationsView;
