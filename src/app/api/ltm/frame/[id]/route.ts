import fs from 'node:fs/promises';
import path from 'node:path';
import { NextResponse } from 'next/server';
import { resolveFrame } from '@/lib/server/ltm';
import { rejectNonLocalRead } from '@/lib/server/local-only';
import { intParam, ltmError } from '../../_shared';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const MIME: Record<string, string> = { '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp' };

// Streams the screenshot for a capture. Only files inside the LTM frames dir are served.
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const denied = rejectNonLocalRead(req);
  if (denied) return denied;
  const id = intParam((await params).id);
  if (id == null) return NextResponse.json({ error: 'invalid id' }, { status: 400 });
  try {
    const abs = resolveFrame(id);
    if (!abs) return NextResponse.json({ error: 'frame not available (pruned or missing)' }, { status: 404 });
    const buf = await fs.readFile(abs);
    return new NextResponse(new Uint8Array(buf), {
      headers: {
        'Content-Type': MIME[path.extname(abs).toLowerCase()] ?? 'application/octet-stream',
        // Screenshots of the user's screen: keep them out of the browser's disk cache.
        'Cache-Control': 'no-store',
        'X-Content-Type-Options': 'nosniff',
      },
    });
  } catch (err) {
    return ltmError(err);
  }
}
