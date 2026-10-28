import { route } from '@/lib/server/route-helpers';
import { listVaults } from '@/lib/server/vaults';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Registered Obsidian vaults (from Obsidian's own config) with note counts and obsidian:// links.
export const GET = route(async ({ url }) => ({ vaults: await listVaults(url.searchParams.get('refresh') === '1') }));
