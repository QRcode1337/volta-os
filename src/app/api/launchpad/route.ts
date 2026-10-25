// GET /api/launchpad            -> every section (services, netlify, repos, notion), each {ok,data}|{ok:false,error}
// GET /api/launchpad?section=X  -> one section (the page loads them in parallel so slow ones don't block fast ones)
// ?refresh=1 bypasses the caches (repo re-scans are rate-limited to once a minute).
// Never contains the Netlify token, remote credentials or other secrets (see src/lib/server/launchpad/*).
import { NextResponse } from 'next/server';
import { rejectNonLocalRead } from '@/lib/server/local-only';
import { SECTION_NAMES, loadAll, loadSection } from '@/lib/server/launchpad';
import type { LaunchpadSectionName } from '@/lib/server/launchpad/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const NO_STORE = { 'Cache-Control': 'no-store' };

export async function GET(req: Request) {
  const denied = rejectNonLocalRead(req);
  if (denied) return denied;
  const url = new URL(req.url);
  const force = url.searchParams.get('refresh') === '1';
  const name = url.searchParams.get('section');
  if (!name) return NextResponse.json(await loadAll(force), { headers: NO_STORE });
  if (!(SECTION_NAMES as readonly string[]).includes(name)) {
    return NextResponse.json({ error: `Unknown section "${name}".` }, { status: 400, headers: NO_STORE });
  }
  return NextResponse.json(await loadSection(name as LaunchpadSectionName, force), { headers: NO_STORE });
}
