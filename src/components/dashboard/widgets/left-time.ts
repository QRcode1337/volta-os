// Timezone + date-string helpers for the home left column. Call only with values obtained after mount.

/** Browser's IANA zone, e.g. "America/New_York" (falls back to UTC). */
export function localTimeZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  } catch {
    return 'UTC';
  }
}

/** "America/Argentina/Buenos_Aires" → "BUENOS AIRES", "UTC" → "UTC". */
export function cityFromTimeZone(tz: string): string {
  const last = tz.split('/').pop() || tz;
  return last.replace(/_/g, ' ').toUpperCase();
}

const abbrevFmt = new Map<string, Intl.DateTimeFormat>();
/** Short zone name at instant `d`, e.g. "EDT", "GMT+11". */
export function tzAbbrev(d: Date, tz: string): string {
  let f = abbrevFmt.get(tz);
  if (!f) {
    try {
      f = new Intl.DateTimeFormat('en-US', { timeZone: tz, timeZoneName: 'short' });
    } catch {
      return '';
    }
    abbrevFmt.set(tz, f);
  }
  return f.formatToParts(d).find((p) => p.type === 'timeZoneName')?.value ?? '';
}

const pad = (n: number) => String(n).padStart(2, '0');

/** (2026, 10, 23) → "2026-10-23" */
export function ymdString(y: number, m: number, d: number): string {
  return `${y}-${pad(m)}-${pad(d)}`;
}

/** "2026-10-23" + -13 → "2026-10-10" (UTC arithmetic, no DST drift). */
export function addDays(ymd: string, n: number): string {
  const [y, m, d] = ymd.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + n));
  return ymdString(dt.getUTCFullYear(), dt.getUTCMonth() + 1, dt.getUTCDate());
}

/** Whole-day difference b − a for two "yyyy-mm-dd" strings. */
export function dayDiff(a: string, b: string): number {
  const toUtc = (s: string) => {
    const [y, m, d] = s.split('-').map(Number);
    return Date.UTC(y, m - 1, d);
  };
  return Math.round((toUtc(b) - toUtc(a)) / 86_400_000);
}
