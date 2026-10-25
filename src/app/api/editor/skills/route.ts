// GET /api/editor/skills: which live ~/.claude skills "Teach my /cut" and "Teach my /animate" should target, per project kind.
import { studioGet } from '@/lib/server/studio/http';
import { resolveLiveSkills } from '@/lib/server/editor/skills';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const GET = studioGet(() => resolveLiveSkills());
