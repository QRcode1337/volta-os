// Pure time helpers (Intl-based, timezone-aware). Only call with a Date obtained after mount.

const fmtCache = new Map<string, Intl.DateTimeFormat>();
function fmt(key: string, opts: Intl.DateTimeFormatOptions): Intl.DateTimeFormat {
  let f = fmtCache.get(key);
  if (!f) {
    f = new Intl.DateTimeFormat('en-US', opts);
    fmtCache.set(key, f);
  }
  return f;
}

function parts(d: Date, f: Intl.DateTimeFormat): Record<string, string> {
  const out: Record<string, string> = {};
  for (const p of f.formatToParts(d)) out[p.type] = p.value;
  return out;
}

/** 12h clock parts in a timezone: { hms: "09:01:20", period: "am" } */
export function clock12(d: Date, timeZone: string): { hms: string; period: string } {
  const p = parts(
    d,
    fmt(`c12:${timeZone}`, { timeZone, hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true }),
  );
  const hh = (p.hour ?? '00').padStart(2, '0');
  return { hms: `${hh}:${p.minute}:${p.second}`, period: (p.dayPeriod ?? '').toLowerCase() };
}

/** 24h "HH:MM" in a timezone. */
export function clock24(d: Date, timeZone: string): string {
  const p = parts(d, fmt(`c24:${timeZone}`, { timeZone, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }));
  return `${p.hour === '24' ? '00' : p.hour}:${p.minute}`;
}

/** Calendar date (y, m 1-12, d) as observed in a timezone. */
export function zonedYmd(d: Date, timeZone: string): { y: number; m: number; d: number } {
  const p = parts(d, fmt(`ymd:${timeZone}`, { timeZone, year: 'numeric', month: 'numeric', day: 'numeric' }));
  return { y: Number(p.year), m: Number(p.month), d: Number(p.day) };
}

/** ISO-8601 week number for a calendar date. */
export function isoWeek(y: number, m: number, d: number): number {
  const date = new Date(Date.UTC(y, m - 1, d));
  const dow = date.getUTCDay() || 7; // Mon=1..Sun=7
  date.setUTCDate(date.getUTCDate() + 4 - dow); // Thursday of this week
  const yearStart = Date.UTC(date.getUTCFullYear(), 0, 1);
  return Math.ceil(((date.getTime() - yearStart) / 86_400_000 + 1) / 7);
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/** "W43 · Oct 22 2026 (Thu)" */
export function weekPill(y: number, m: number, d: number): string {
  const dow = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  return `W${isoWeek(y, m, d)} · ${MONTHS[m - 1]} ${d} ${y} (${DOW[dow]})`;
}

/** The next `count` days starting at (y, m, d), as display labels. */
export function dayStrip(y: number, m: number, d: number, count: number): { short: string; long: string; weekend: boolean }[] {
  return Array.from({ length: count }, (_, i) => {
    const dt = new Date(Date.UTC(y, m - 1, d + i));
    const dow = dt.getUTCDay();
    return {
      short: DOW[dow].charAt(0),
      long: `${DOW[dow]} ${dt.getUTCDate()} ${MONTHS[dt.getUTCMonth()]}`,
      weekend: dow === 0 || dow === 6,
    };
  });
}
