import fs from 'node:fs/promises';
import path from 'node:path';
import { NextResponse } from 'next/server';
import { HttpError, route } from '@/lib/server/route-helpers';
import { resolveFrame } from '@/lib/server/ltm';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const MIME: Record<string, string> = { '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp' };

// Streams the screenshot for a capture. Only files inside the LTM frames dir are served.
export const GET = route<{ id: string }>(
  async ({ params }) => {
    const id = Number(params.id);
    if (!Number.isInteger(id) || id < 0) throw new HttpError('invalid id', 400);
    const abs = resolveFrame(id);
    if (!abs) throw new HttpError('frame not available (pruned or missing)', 404);
    const buf = await fs.readFile(abs);
    return new NextResponse(new Uint8Array(buf), {
      headers: {
        'Content-Type': MIME[path.extname(abs).toLowerCase()] ?? 'application/octet-stream',
        // Screenshots of the user's screen: keep them out of the browser's disk cache.
        'Cache-Control': 'no-store',
        'X-Content-Type-Options': 'nosniff',
      },
    });
  },
  { tag: 'ltm' },
);
