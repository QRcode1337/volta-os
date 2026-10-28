// GET /api/editor/skills: which live ~/.claude skills "Teach my /cut" and "Teach my /animate" should target, per project kind.
import { route } from '@/lib/server/route-helpers';
import { resolveLiveSkills } from '@/lib/server/editor/skills';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const GET = route(() => resolveLiveSkills());
