import 'server-only';
import os from 'node:os';
import path from 'node:path';
import { WINDSOR_VOLTA } from '@/lib/server/storage';

const HOME = os.homedir();
const env = process.env;

export const OPENCLAW_DIR = env.VOLTA_FEEDS_OPENCLAW_DIR ?? path.join(HOME, '.openclaw');
export const OPENCLAW_STATE_DB = path.join(OPENCLAW_DIR, 'state', 'openclaw.sqlite');
export const HEALTH_DIR = path.join(OPENCLAW_DIR, 'cron', 'health');
export const ERISMORN_MEMORY = env.VOLTA_FEEDS_ERISMORN_MEMORY ?? path.join(HOME, 'ErisMorn', 'memory');
export const HERMES_DIR = env.VOLTA_FEEDS_HERMES_DIR ?? path.join(HOME, '.hermes');

/** Persistent feed state (read marks, triage labels) lives on the Windsor drive, never the boot disk. */
export const FEEDS_DIR = env.VOLTA_FEEDS_DIR ?? path.join(WINDSOR_VOLTA, 'feeds');
export const READ_PATH = path.join(FEEDS_DIR, 'read.json');
export const TRIAGE_PATH = path.join(FEEDS_DIR, 'triage.json');

/** Only files under these roots may be inlined into an item body (summary text can mention arbitrary paths). */
export const READABLE_ROOTS = [OPENCLAW_DIR, ERISMORN_MEMORY, path.join(HOME, 'Documents', 'PROJECTS', 'ErisMornCloud'), HERMES_DIR];

/** Caps. */
export const MAX_BODY = 14_000;
export const FILE_ITEMS_PER_DIR = 30;
export const HERMES_ITEMS = 50;
export const REFRESH_TTL_MS = 20_000;
