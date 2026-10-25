import 'server-only';
import { cached } from '../sources/cache';
import { safeHttpUrl, safeMessage } from './safe';
import type { NetlifyData, NetlifySite } from './types';

// The personal access token is read from the server environment only. It goes in the Authorization header of one
// request to api.netlify.com and is never returned, logged or interpolated into an error message. Site objects from
// Netlify carry build env vars, so only an explicit allowlist of fields is copied out.

interface RawSite {
  id?: string;
  name?: string;
  url?: string;
  ssl_url?: string;
  admin_url?: string;
  custom_domain?: string | null;
  published_deploy?: { state?: string; published_at?: string; created_at?: string } | null;
  updated_at?: string;
}

async function load(): Promise<NetlifyData> {
  const fetchedAt = new Date().toISOString();
  const key = process.env.NETLIFY_API_KEY?.trim();
  if (!key) return { status: 'unconfigured', message: 'NETLIFY_API_KEY is not set on the VOLTA OS server (add it to .env.local and restart).', fetchedAt };
  try {
    const res = await fetch('https://api.netlify.com/api/v1/sites?per_page=100', {
      headers: { Authorization: `Bearer ${key}`, Accept: 'application/json' },
      cache: 'no-store',
      signal: AbortSignal.timeout(10_000),
    });
    if (res.status === 401 || res.status === 403) {
      return { status: 'invalid', message: `Netlify rejected the token (HTTP ${res.status}). Create a new personal access token and update NETLIFY_API_KEY.`, fetchedAt };
    }
    if (!res.ok) return { status: 'error', message: `Netlify API answered HTTP ${res.status}.`, fetchedAt };
    const raw = (await res.json()) as RawSite[];
    if (!Array.isArray(raw)) return { status: 'error', message: 'Unexpected response from the Netlify API.', fetchedAt };
    const sites: NetlifySite[] = raw.map((s) => {
      const name = typeof s.name === 'string' ? s.name : 'unnamed';
      const d = s.published_deploy;
      return {
        id: String(s.id ?? name),
        name,
        url: safeHttpUrl(s.ssl_url) ?? safeHttpUrl(s.url),
        adminUrl: safeHttpUrl(s.admin_url) ?? `https://app.netlify.com/sites/${encodeURIComponent(name)}`,
        deployState: typeof d?.state === 'string' ? d.state : null,
        deployAt: d?.published_at ?? d?.created_at ?? s.updated_at ?? null,
        customDomain: typeof s.custom_domain === 'string' ? s.custom_domain : null,
      };
    });
    sites.sort((a, b) => Date.parse(b.deployAt ?? '') - Date.parse(a.deployAt ?? '') || a.name.localeCompare(b.name));
    return { status: 'ok', sites, total: sites.length, fetchedAt };
  } catch (err) {
    return { status: 'error', message: `Could not reach Netlify: ${safeMessage(err, 120)}`, fetchedAt };
  }
}

/** Sites with their published-deploy state, cached 3 min. Always resolves (problems are a status, not a throw). */
export function netlifySites(force = false): Promise<NetlifyData> {
  return cached('launchpad:netlify', 3 * 60_000, load, { force, maxStaleMs: 30 * 60_000 });
}
