import { NextResponse } from 'next/server';
import { listVaults } from '@/lib/server/vaults';
import { rejectNonLocalRead } from '@/lib/server/local-only';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Registered Obsidian vaults (from Obsidian's own config) with note counts and obsidian:// links.
export async function GET(req: Request) {
  const denied = rejectNonLocalRead(req);
  if (denied) return denied;
  const force = new URL(req.url).searchParams.get('refresh') === '1';
  return NextResponse.json({ vaults: await listVaults(force) }, { headers: { 'Cache-Control': 'no-store' } });
}
