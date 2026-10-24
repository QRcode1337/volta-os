import 'server-only';
import type { MemoryReport, Severity } from '@/types/systems';
import { BIN, run } from './run';

// RAM pressure: `memory_pressure -Q` (free %), the kernel's pressure level and swap (sysctl), and a vm_stat
// breakdown. Three tiny commands (~10 ms each).

const LEVELS: Record<string, MemoryReport['pressureLevel']> = { '1': 'normal', '2': 'warn', '4': 'critical' };
/** Free-percentage thresholds (the Mac recently hit 3% free). */
const FREE_WARN_PCT = 15;
const FREE_CRITICAL_PCT = 5;

const MB = 1024 * 1024;

function sizeMb(s: string | undefined): number | null {
  const m = s?.match(/([\d.]+)M/);
  return m ? Math.round(Number(m[1]) * MB) : null;
}

export async function getMemory(): Promise<MemoryReport> {
  const [mp, sc, vm] = await Promise.all([
    run(BIN.memoryPressure, ['-Q'], 3_000),
    run(BIN.sysctl, ['kern.memorystatus_vm_pressure_level', 'vm.swapusage', 'hw.memsize'], 3_000),
    run(BIN.vmStat, [], 3_000),
  ]);

  const freePctMatch = mp.stdout.match(/free percentage:\s*(\d+)%/i);
  const freePct = freePctMatch ? Number(freePctMatch[1]) : null;

  const sys: Record<string, string> = {};
  for (const line of sc.stdout.split('\n')) {
    const i = line.indexOf(':');
    if (i > 0) sys[line.slice(0, i).trim()] = line.slice(i + 1).trim();
  }
  const pressureLevel = LEVELS[sys['kern.memorystatus_vm_pressure_level']] ?? null;
  const swap = sys['vm.swapusage'] ?? '';
  const swapTotalBytes = sizeMb(swap.match(/total\s*=\s*([\d.]+M)/)?.[1]);
  const swapUsedBytes = sizeMb(swap.match(/used\s*=\s*([\d.]+M)/)?.[1]);
  const totalBytes = Number(sys['hw.memsize']) || null;

  // vm_stat: "Pages free:  19287." with the page size in the header.
  const pageSize = Number(vm.stdout.match(/page size of (\d+) bytes/)?.[1]) || 16_384;
  const pages = (label: string): number | null => {
    const m = vm.stdout.match(new RegExp(`^${label}:\\s+(\\d+)\\.`, 'm'));
    return m ? Number(m[1]) * pageSize : null;
  };
  const anonymous = pages('Anonymous pages');
  const purgeable = pages('Pages purgeable');
  const wiredBytes = pages('Pages wired down');
  const compressedBytes = pages('Pages occupied by compressor');
  const cachedFilesBytes = pages('File-backed pages');
  const freeBytes = pages('Pages free');
  const appBytes = anonymous != null ? Math.max(0, anonymous - (purgeable ?? 0)) : null;

  const available = freePct != null || pressureLevel != null;
  let severity: Severity = 'ok';
  if (pressureLevel === 'critical' || (freePct != null && freePct < FREE_CRITICAL_PCT)) severity = 'critical';
  else if (pressureLevel === 'warn' || (freePct != null && freePct < FREE_WARN_PCT)) severity = 'warn';

  return {
    available,
    totalBytes,
    freePct,
    pressureLevel,
    swapUsedBytes,
    swapTotalBytes,
    appBytes,
    wiredBytes,
    compressedBytes,
    cachedFilesBytes,
    freeBytes,
    severity,
    error: available ? null : (mp.error ?? sc.error ?? 'memory stats unavailable'),
  };
}

export const MEMORY_THRESHOLDS = { freeWarnPct: FREE_WARN_PCT, freeCriticalPct: FREE_CRITICAL_PCT };
