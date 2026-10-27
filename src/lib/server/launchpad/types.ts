// Shared shapes for VOLTA Launchpad. Type-only: safe to `import type` from client components.

export type ProbeState = 'up' | 'down' | 'unknown';

export interface ProbeResult {
  state: ProbeState;
  httpStatus?: number;
  ms?: number;
}

export interface LinkItem {
  id: string;
  label: string;
  href: string;
  /** Short mono caption under the label (host, port, path). */
  detail?: string;
  note?: string;
  /** Opens inside VOLTA OS (still in a new tab). */
  internal?: boolean;
  /** The same loopback service through a `tailscale serve` entry, for opening it from another device. */
  remoteHref?: string;
  probe: ProbeResult;
}

export interface TailnetEntry {
  id: string;
  url: string;
  /** What `tailscale serve` forwards to (e.g. http://127.0.0.1:18790), or a short description for static handlers. */
  target: string;
  port: number;
  path: string;
  label: string;
  /** Reachable from the public internet (tailscale funnel), not just the tailnet. */
  funnel: boolean;
  probe: ProbeResult;
}

export interface ServicesData {
  agents: LinkItem[];
  tailnet: { entries: TailnetEntry[]; host: string | null; error: string | null; fetchedAt: string };
  creative: LinkItem[];
  probedAt: string;
}

export interface NetlifySite {
  id: string;
  name: string;
  url: string | null;
  adminUrl: string;
  deployState: string | null;
  deployAt: string | null;
  customDomain: string | null;
}

export type NetlifyData =
  | { status: 'ok'; sites: NetlifySite[]; total: number; fetchedAt: string }
  | { status: 'unconfigured' | 'invalid' | 'error'; message: string; fetchedAt: string };

export interface RepoInfo {
  name: string;
  /** Absolute local path. */
  path: string;
  branch: string | null;
  /** Credential-free remote, e.g. github.com/owner/repo. */
  remote: string | null;
  githubUrl: string | null;
  lastCommit: string | null;
  commits30: number | null;
}

export interface ReposData {
  repos: RepoInfo[];
  found: number;
  skipped: { reason: string; count: number; examples: string[] }[];
  skippedCount: number;
  roots: string[];
  scannedAt: string;
  tookMs: number;
}

export interface NotionPin {
  label: string;
  url: string;
  kind?: string;
}

export interface NotionData {
  pins: NotionPin[];
  pinsSource: 'config' | 'fallback';
  pages: NotionPin[];
}

export type Section<T> = { ok: true; data: T } | { ok: false; error: string };

export type LaunchpadSectionName = 'services' | 'netlify' | 'repos' | 'notion';

export interface LaunchpadPayload {
  generatedAt: string;
  services: Section<ServicesData>;
  netlify: Section<NetlifyData>;
  repos: Section<ReposData>;
  notion: Section<NotionData>;
}
