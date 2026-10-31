'use client';
// VOLTA Launchpad: one page of live links and status for services and projects.
// Data: GET /api/launchpad?section=services|netlify|repos|notion (loaded in parallel, so the slow git scan never
// blocks the status dots) and the existing GET /api/vaults for Obsidian. Every link opens in a new tab.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { BookOpen, Cloud, FlaskConical, GitBranch, Network, Palette, Pin, RefreshCw } from 'lucide-react';
import type { ObsidianVault } from '@/types/ltm';
import type { LaunchpadSectionName, NetlifyData, NotionData, ReposData, Section as ApiSection, ServicesData } from '@/lib/server/launchpad/types';
import { cn } from '@/lib/cn';
import { isLoopbackUrl, useRemoteClient } from '@/lib/remote-client';
import { AppTopBar } from '@/components/elements/kit/AppTopBar';
import { Chip, ErrorNote, GRID, LinkCard, Section, SkeletonGrid, StatusDot, SubHeading, probeLabel, relTime, toneOfProbe, type Tone } from './parts';

interface Loaded<T> {
  data: T | null;
  error: string | null;
  loading: boolean;
  at: number | null;
}

async function getJson<T>(url: string): Promise<T> {
  const res = await fetch(url, { cache: 'no-store' });
  const body = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) throw new Error(body.error ?? `HTTP ${res.status}`);
  return body;
}

/** Loads one /api/launchpad section; `reload(true)` bypasses the server caches. */
function useSection<T>(name: LaunchpadSectionName, pollMs?: number) {
  const [state, setState] = useState<Loaded<T>>({ data: null, error: null, loading: true, at: null });
  const seq = useRef(0);
  const reload = useCallback(
    async (force = false) => {
      const mine = ++seq.current;
      setState((s) => ({ ...s, loading: true }));
      try {
        const r = await getJson<ApiSection<T>>(`/api/launchpad?section=${name}${force ? '&refresh=1' : ''}`);
        if (mine !== seq.current) return;
        setState(r.ok ? { data: r.data, error: null, loading: false, at: Date.now() } : (s) => ({ ...s, error: r.error, loading: false }));
      } catch (err) {
        if (mine !== seq.current) return;
        setState((s) => ({ ...s, error: (err as Error).message, loading: false }));
      }
    },
    [name],
  );
  useEffect(() => {
    void reload();
  }, [reload]);
  useEffect(() => {
    if (!pollMs) return;
    const t = window.setInterval(() => {
      if (document.visibilityState === 'visible') void reload();
    }, pollMs);
    return () => window.clearInterval(t);
  }, [pollMs, reload]);
  return { ...state, reload };
}

function deployTone(state: string | null): Tone {
  if (!state) return 'idle';
  if (state === 'ready') return 'up';
  if (['error', 'failed', 'rejected'].includes(state)) return 'down';
  return 'warn'; // building, enqueued, processing, uploading, ...
}

function ServicesSections({ s }: { s: Loaded<ServicesData> }) {
  const remote = useRemoteClient();
  if (s.loading && !s.data) return <SkeletonGrid n={6} />;
  if (!s.data) return <ErrorNote>Could not load service status: {s.error}</ErrorNote>;
  const { agents, tailnet } = s.data;
  return (
    <>
      {s.error && <div className="mb-3"><ErrorNote tone="warn">Showing the last good status; refresh failed: {s.error}</ErrorNote></div>}
      <div className={GRID}>
        {agents.map((a) => (
          <LinkCard
            key={a.id}
            href={remote ? (a.remoteHref ?? a.href) : a.href}
            label={a.label}
            detail={remote && a.remoteHref ? a.remoteHref.replace(/^https?:\/\//, '') : a.detail}
            note={a.note}
            tone={toneOfProbe(a.probe)}
            statusLabel={probeLabel(a.probe)}
            macOnly={remote && !a.remoteHref && isLoopbackUrl(a.href)}
          />
        ))}
      </div>

      <SubHeading>OpenClaw control panel and tailnet · tailscale serve</SubHeading>
      {tailnet.error && <div className="mb-3"><ErrorNote tone={tailnet.entries.length ? 'warn' : 'error'}>{tailnet.error}{tailnet.entries.length ? ' (showing the last good snapshot)' : ''}</ErrorNote></div>}
      {tailnet.entries.length === 0 && !tailnet.error && <p className="text-[12.5px] text-muted">Nothing is published with tailscale serve.</p>}
      <ul className="grid grid-cols-1 gap-2 lg:grid-cols-2">
        {tailnet.entries.map((e) => (
          <li key={e.id}>
            <a
              href={e.url}
              target="_blank"
              rel="noopener noreferrer"
              className="group flex items-center gap-3 rounded-lg border border-subtle bg-panel px-3 py-2.5 transition-colors hover:border-highlight hover:bg-panel-hover focus-visible:outline focus-visible:outline-1 focus-visible:outline-orange"
            >
              <StatusDot tone={toneOfProbe(e.probe)} label={`${e.label}: ${probeLabel(e.probe)}`} />
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-2">
                  <span className="truncate text-[13px] font-medium text-paper">{e.label}</span>
                  {e.funnel && <Chip tone="down">public funnel</Chip>}
                </span>
                <span className="block truncate font-mono text-[10.5px] text-muted">{e.url.replace(/^https?:\/\//, '')}</span>
              </span>
              <span className="shrink-0 text-right font-mono text-[10.5px] text-secondary">
                <span className="block text-muted">{`→ ${e.target.replace(/^https?:\/\//, '')}`}</span>
                <span className="block text-[9.5px] uppercase tracking-[0.06em] text-muted">{probeLabel(e.probe)}</span>
              </span>
            </a>
          </li>
        ))}
      </ul>
    </>
  );
}

function CreativeSection({ s }: { s: Loaded<ServicesData> }) {
  if (s.loading && !s.data) return <SkeletonGrid n={4} />;
  if (!s.data) return <ErrorNote>Could not load creative links: {s.error}</ErrorNote>;
  return (
    <div className={GRID}>
      {s.data.creative.map((c) => (
        <LinkCard
          key={c.id}
          href={c.href}
          label={c.label}
          detail={c.detail}
          note={c.note}
          tone={toneOfProbe(c.probe)}
          statusLabel={c.internal ? 'served by VOLTA OS' : probeLabel(c.probe)}
          badge={c.internal ? <Chip tone="purple">VOLTA app</Chip> : undefined}
        />
      ))}
    </div>
  );
}

function NetlifySection({ s }: { s: Loaded<NetlifyData> }) {
  if (s.loading && !s.data) return <SkeletonGrid n={3} />;
  if (!s.data) return <ErrorNote>Could not load Netlify sites: {s.error}</ErrorNote>;
  const d = s.data;
  if (d.status !== 'ok') {
    return <ErrorNote tone={d.status === 'unconfigured' ? 'warn' : 'error'}>{d.message}</ErrorNote>;
  }
  if (d.sites.length === 0) return <p className="text-[12.5px] text-muted">No Netlify sites on this account.</p>;
  return (
    <div className={GRID}>
      {d.sites.map((site) => (
        <div key={site.id} className="rounded-lg border border-subtle bg-panel p-3">
          <div className="flex items-center gap-2">
            <StatusDot tone={deployTone(site.deployState)} label={`Deploy ${site.deployState ?? 'unknown'}`} />
            {site.url ? (
              <a href={site.url} target="_blank" rel="noopener noreferrer" className="min-w-0 flex-1 truncate text-[13.5px] font-medium text-paper hover:text-orange">
                {site.name}
              </a>
            ) : (
              <span className="min-w-0 flex-1 truncate text-[13.5px] font-medium text-paper">{site.name}</span>
            )}
            <Chip tone={deployTone(site.deployState)}>{site.deployState ?? 'no deploy'}</Chip>
          </div>
          <p className="mt-1.5 truncate font-mono text-[10.5px] text-muted">{(site.customDomain ?? site.url ?? '').replace(/^https?:\/\//, '') || 'no URL'}</p>
          <p className="mt-1.5 flex items-center justify-between gap-2 font-mono text-[10px] text-secondary">
            <span title={site.deployAt ?? undefined}>published {relTime(site.deployAt)}</span>
            <a href={site.adminUrl} target="_blank" rel="noopener noreferrer" className="uppercase tracking-[0.06em] text-muted hover:text-orange">
              Admin ↗
            </a>
          </p>
        </div>
      ))}
    </div>
  );
}

function RepoCard({ r }: { r: ReposData['repos'][number] }) {
  const active = (r.commits30 ?? 0) > 0;
  const recent = r.lastCommit ? Date.now() - Date.parse(r.lastCommit) < 90 * 86_400_000 : false;
  const tone: Tone = active ? 'up' : recent ? 'warn' : 'idle';
  const body = (
    <>
      <span className="flex items-start gap-2">
        <StatusDot tone={tone} label={active ? 'Active in the last 30 days' : recent ? 'Quiet (committed in the last 90 days)' : 'Dormant'} />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[13.5px] font-medium text-paper">{r.name}</span>
          <span className="block truncate font-mono text-[10.5px] text-muted" title={r.path}>
            {r.path}
          </span>
        </span>
        <span className="shrink-0 text-right">
          <span className={cn('block font-doto text-2xl leading-none', active ? 'text-orange' : 'text-muted')}>{r.commits30 ?? '?'}</span>
          <span className="block font-mono text-[9px] uppercase tracking-[0.06em] text-muted">commits / 30d</span>
        </span>
      </span>
      <span className="mt-2 flex flex-wrap items-center gap-1.5">
        {r.branch && <Chip tone="purple">{r.branch}</Chip>}
        <span className="font-mono text-[10px] text-secondary" title={r.lastCommit ?? undefined}>
          last commit {relTime(r.lastCommit)}
        </span>
        <span className="ml-auto font-mono text-[10px] uppercase tracking-[0.05em] text-muted">{r.githubUrl ? 'GitHub ↗' : r.remote ? 'remote only' : 'local only'}</span>
      </span>
      {r.remote && <span className="mt-1 block truncate font-mono text-[10px] text-muted">{r.remote}</span>}
    </>
  );
  const cls = 'block rounded-lg border border-subtle bg-panel p-3 transition-colors';
  return r.githubUrl ? (
    <a href={r.githubUrl} target="_blank" rel="noopener noreferrer" className={cn(cls, 'hover:border-highlight hover:bg-panel-hover focus-visible:outline focus-visible:outline-1 focus-visible:outline-orange')}>
      {body}
    </a>
  ) : (
    <div className={cls}>{body}</div>
  );
}

function ReposSection({ s }: { s: Loaded<ReposData> }) {
  if (s.loading && !s.data) {
    return (
      <>
        <SkeletonGrid n={6} />
        <p className="mt-2 font-mono text-[10.5px] uppercase tracking-[0.06em] text-muted">Scanning git repositories...</p>
      </>
    );
  }
  if (!s.data) return <ErrorNote>Could not scan repositories: {s.error}</ErrorNote>;
  const d = s.data;
  return (
    <>
      {d.repos.length === 0 ? <p className="text-[12.5px] text-muted">No readable git repositories found.</p> : <div className={GRID}>{d.repos.map((r) => <RepoCard key={r.path} r={r} />)}</div>}
      <details className="mt-3 text-[11.5px] text-muted">
        <summary className="cursor-pointer font-mono uppercase tracking-[0.05em] hover:text-paper">
          {d.found} repos found · {d.skippedCount} skipped · scanned {relTime(d.scannedAt)} in {(d.tookMs / 1000).toFixed(1)}s
        </summary>
        <p className="mt-2 font-mono text-[10.5px]">Roots (depth 3): {d.roots.join(', ')}</p>
        <ul className="mt-1 space-y-1">
          {d.skipped.map((k) => (
            <li key={k.reason}>
              <span className="text-secondary">
                {k.count} x {k.reason}
              </span>
              <span className="font-mono text-[10.5px]">: {k.examples.join(', ')}{k.count > k.examples.length ? ', ...' : ''}</span>
            </li>
          ))}
        </ul>
      </details>
    </>
  );
}

function NotionSection({ s }: { s: Loaded<NotionData> }) {
  if (s.loading && !s.data) return <SkeletonGrid n={3} />;
  if (!s.data) return <ErrorNote>Could not load Notion links: {s.error}</ErrorNote>;
  const d = s.data;
  return (
    <>
      <div className={GRID}>
        {d.pins.map((p) => (
          <LinkCard key={p.url} href={p.url} label={p.label} detail={p.url.replace(/^https?:\/\/(www\.)?/, '')} tone="idle" statusLabel="Notion" badge={p.kind ? <Chip>{p.kind}</Chip> : undefined} />
        ))}
      </div>
      {d.pinsSource === 'fallback' && <p className="mt-2 font-mono text-[10.5px] text-muted">config/notion-links.json not found; showing built-in pins.</p>}
      {d.pages.length > 0 && (
        <>
          <SubHeading>Most visited</SubHeading>
          <ul className="grid gap-x-4 gap-y-1 sm:grid-cols-2">
            {d.pages.map((p) => (
              <li key={p.url} className="min-w-0">
                <a href={p.url} target="_blank" rel="noopener noreferrer" className="block truncate rounded px-1 py-1 text-[12.5px] text-secondary transition-colors hover:bg-panel-hover hover:text-paper" title={p.label}>
                  {p.label}
                </a>
              </li>
            ))}
          </ul>
        </>
      )}
    </>
  );
}

function VaultsBlock() {
  const [vaults, setVaults] = useState<ObsidianVault[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    getJson<{ vaults: ObsidianVault[] }>('/api/vaults')
      .then((r) => setVaults(r.vaults))
      .catch((err: Error) => setError(err.message));
  }, []);
  if (error) return <ErrorNote>Could not load Obsidian vaults: {error}</ErrorNote>;
  if (!vaults) return <SkeletonGrid n={3} />;
  if (vaults.length === 0) return <p className="text-[12.5px] text-muted">No Obsidian vaults registered.</p>;
  return (
    <div className={GRID}>
      {vaults.map((v) => (
        <LinkCard
          key={v.id}
          href={v.obsidianUrl}
          newTab={false}
          label={v.name}
          detail={`${v.notes.toLocaleString()} notes · ${v.location === 'icloud' ? 'iCloud' : 'local'} · edited ${relTime(v.lastEdited)}`}
          tone={v.open ? 'up' : 'idle'}
          statusLabel={v.open ? 'open in Obsidian' : 'closed'}
          badge={<Chip tone="purple">obsidian://</Chip>}
        />
      ))}
    </div>
  );
}

export function LaunchpadApp() {
  const services = useSection<ServicesData>('services', 30_000);
  const netlify = useSection<NetlifyData>('netlify');
  const repos = useSection<ReposData>('repos');
  const notion = useSection<NotionData>('notion');

  const summary = useMemo(() => {
    const d = services.data;
    if (!d) return null;
    const all = [...d.agents, ...d.creative.filter((c) => !c.internal)];
    return { up: all.filter((x) => x.probe.state === 'up').length, total: all.length };
  }, [services.data]);

  const refreshAll = () => {
    void services.reload(true);
    void netlify.reload(true);
    void repos.reload(true);
    void notion.reload(true);
  };
  const busy = services.loading || netlify.loading || repos.loading;

  return (
    <div className="flex h-screen w-screen flex-col overflow-hidden bg-obsidian text-paper">
      <AppTopBar
        accent="Launchpad"
        subtitle="Live links & status · services, projects, notes"
        right={
          <>
            {summary && (
              <span className="hud-label hidden md:inline">
                <span className={summary.up === summary.total ? 'text-green' : 'text-amber'}>{summary.up}</span> / {summary.total} services up
              </span>
            )}
            <button
              type="button"
              onClick={refreshAll}
              aria-label="Refresh"
              className="inline-flex h-7 items-center gap-1.5 rounded-full border border-subtle px-3 font-mono text-[10px] uppercase tracking-[0.06em] text-muted hover:text-paper"
            >
              <RefreshCw className={cn('h-3 w-3', busy && 'animate-spin')} /> Refresh
            </button>
          </>
        }
      />
      <main className="hud-scroll min-h-0 flex-1 overflow-y-auto px-4 pb-24 pt-5">
        <div className="mx-auto max-w-[1280px]">
          <Section icon={<Network className="h-4 w-4" />} title="Agents & gateways" count={services.data?.agents.length} aside={services.data ? `probed ${relTime(services.data.probedAt)}` : undefined}>
            <ServicesSections s={services} />
          </Section>
          <Section icon={<Palette className="h-4 w-4" />} title="Creative" count={services.data?.creative.length}>
            <CreativeSection s={services} />
          </Section>
          <Section icon={<Cloud className="h-4 w-4" />} title="Netlify" count={netlify.data?.status === 'ok' ? netlify.data.total : undefined} aside="published deploy state">
            <NetlifySection s={netlify} />
          </Section>
          <Section icon={<GitBranch className="h-4 w-4" />} title="Top git repos" count={repos.data?.repos.length} aside="ranked by commits in the last 30 days">
            <ReposSection s={repos} />
          </Section>
          <Section icon={<Pin className="h-4 w-4" />} title="Notion pins" count={notion.data?.pins.length}>
            <NotionSection s={notion} />
          </Section>
          <Section icon={<FlaskConical className="h-4 w-4" />} title="Research">
            <div className={GRID}>
              <LinkCard
                href="https://www.anthropic.com/science"
                label="Claude for Science"
                detail="anthropic.com/science"
                note="Placeholder card: this URL has not been checked yet."
                tone="idle"
                statusLabel="not probed"
                badge={<Chip tone="warn">link to confirm</Chip>}
              />
            </div>
            <SubHeading>
              <BookOpen className="mr-1.5 inline h-3 w-3 align-[-1px]" aria-hidden />
              Obsidian vaults
            </SubHeading>
            <VaultsBlock />
          </Section>
        </div>
      </main>
    </div>
  );
}

export default LaunchpadApp;
