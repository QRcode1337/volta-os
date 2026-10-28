import { route } from '@/lib/server/route-helpers';
import { getMcpServers } from '@/lib/server/sources/mcp';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const GET = route(async () => ({ servers: await getMcpServers() }));
