import { route } from '@/lib/server/route-helpers';
import { getInventory } from '@/lib/server/systems/inventory';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Every launchd job (user / global / daemon / app-registered, enabled or disabled) + every TCP listener. Read-only; cached 15 s. */
export const GET = route(() => getInventory());
