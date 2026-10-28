import { route } from '@/lib/server/route-helpers';
import { getSkills } from '@/lib/server/sources/skills';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// `installedCount` = skills with a SKILL.md on disk; `enabledCount` = those Claude Code can invoke now (user skills +
// enabled plugins); `skills` also lists transcript-only entries (installed: false).
export const GET = route(async () => {
  const skills = await getSkills();
  return { skills, installedCount: skills.filter((s) => s.installed).length, enabledCount: skills.filter((s) => s.enabled).length };
});
