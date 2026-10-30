import 'server-only';
import ICAL from 'ical.js';
import type { CalendarEvent, CalendarFeed, CalendarFeedStatus, CalendarSource } from '@/types/calendar';
import { HttpError } from './http-error';
import { breaker, cached } from './sources/cache';

// Upcoming events merged from the configured iCal feeds: GOOGLE_CALENDAR_ICS_URL (Google Calendar's "secret address
// in iCal format") and ICLOUD_CALENDAR_ICS_URL (an iCloud calendar shared as "Public Calendar"; webcal:// is fine).
// Read-only feeds, no OAuth. ical.js does the parsing, VTIMEZONE handling and RRULE/EXDATE/override expansion.
// The URLs are credentials: never logged or put in an error message.

const TTL_MS = 5 * 60_000;
const MIN_FORCE_MS = 30_000;
const TIMEOUT_MS = 10_000;
const MAX_BYTES = 5 * 1024 * 1024;
const WINDOW_DAYS = 30;
const MAX_UPCOMING = 25;
/** Per-series cap on generated occurrences (a daily rule from years ago walks forward from its first date). */
const MAX_ITERATIONS = 20_000;
const gate = breaker('calendar', { failures: 2, coolMs: 5 * 60_000 });

const FEEDS: readonly { source: CalendarSource; env: string }[] = [
  { source: 'Google', env: 'GOOGLE_CALENDAR_ICS_URL' },
  { source: 'iCloud', env: 'ICLOUD_CALENDAR_ICS_URL' },
];

function configuredFeeds(): { source: CalendarSource; url: string }[] {
  return FEEDS.flatMap((f) => {
    const url = process.env[f.env]?.trim().replace(/^webcals?:\/\//i, 'https://');
    return url ? [{ source: f.source, url }] : [];
  });
}

export function calendarConfigured(): boolean {
  return configuredFeeds().length > 0;
}

async function fetchIcs(url: string): Promise<string> {
  let res: Response;
  try {
    res = await fetch(url, { signal: AbortSignal.timeout(TIMEOUT_MS), cache: 'no-store', headers: { Accept: 'text/calendar' } });
  } catch (err) {
    const name = (err as Error)?.name;
    throw new HttpError(name === 'TimeoutError' ? 'iCal feed timed out' : 'iCal feed unreachable', 503);
  }
  if (!res.ok) {
    throw new HttpError(
      res.status === 404 ? 'iCal feed not found (404): the secret address may have been reset' : `iCal feed HTTP ${res.status}`,
      res.status === 404 ? 502 : 503,
    );
  }
  const text = await res.text();
  if (text.length > MAX_BYTES) throw new HttpError('iCal feed larger than 5 MB', 502);
  if (!text.startsWith('BEGIN:VCALENDAR')) throw new HttpError('iCal feed did not return a calendar', 502);
  return text;
}

const str = (v: unknown): string | null => (typeof v === 'string' && v.trim() ? v.trim() : null);

function toEvent(source: CalendarSource, ev: ICAL.Event, start: ICAL.Time, end: ICAL.Time, recurring: boolean): CalendarEvent {
  const s = start.toJSDate();
  return {
    source,
    id: recurring ? `${ev.uid}@${s.toISOString()}` : ev.uid,
    title: str(ev.summary) ?? '(no title)',
    start: s.toISOString(),
    end: end.toJSDate().toISOString(),
    allDay: start.isDate,
    location: str(ev.location),
    url: str(ev.component.getFirstPropertyValue('url')),
  };
}

/** Occurrences ending after `from` and starting before `to`, soonest first. Exported for tests. */
export function parseUpcoming(ics: string, from: Date, to: Date, source: CalendarSource = 'Google'): { name: string | null; events: CalendarEvent[] } {
  const cal = new ICAL.Component(ICAL.parse(ics));
  for (const tz of cal.getAllSubcomponents('vtimezone')) ICAL.TimezoneService.register(tz);

  const masters = new Map<string, ICAL.Event>();
  const orphans: ICAL.Event[] = [];
  const exceptions: ICAL.Event[] = [];
  for (const v of cal.getAllSubcomponents('vevent')) {
    const ev = new ICAL.Event(v);
    if (ev.isRecurrenceException()) exceptions.push(ev);
    else masters.set(ev.uid, ev);
  }
  for (const ex of exceptions) {
    const master = masters.get(ex.uid);
    if (master) master.relateException(ex);
    else orphans.push(ex); // a moved occurrence whose series isn't in the feed: show it as a one-off
  }

  const fromMs = from.getTime();
  const toMs = to.getTime();
  const cancelled = (e: ICAL.Event) => String(e.component.getFirstPropertyValue('status') ?? '').toUpperCase() === 'CANCELLED';
  const out: CalendarEvent[] = [];

  for (const ev of [...masters.values(), ...orphans]) {
    if (cancelled(ev)) continue;
    if (!ev.isRecurring()) {
      if (ev.endDate.toJSDate().getTime() > fromMs && ev.startDate.toJSDate().getTime() < toMs) {
        out.push(toEvent(source, ev, ev.startDate, ev.endDate, false));
      }
      continue;
    }
    const it = ev.iterator();
    for (let i = 0, next = it.next(); next && i < MAX_ITERATIONS; i++, next = it.next()) {
      const occ = ev.getOccurrenceDetails(next);
      if (occ.startDate.toJSDate().getTime() >= toMs) break;
      if (occ.endDate.toJSDate().getTime() <= fromMs || cancelled(occ.item)) continue;
      out.push(toEvent(source, occ.item, occ.startDate, occ.endDate, true));
    }
  }

  out.sort((a, b) => Date.parse(a.start) - Date.parse(b.start));
  return { name: str(cal.getFirstPropertyValue('x-wr-calname')), events: out };
}

/** Every configured feed in parallel; one failing feed is reported in `feeds`, all failing throws. */
async function load(): Promise<CalendarFeed> {
  const feeds = configuredFeeds();
  if (!feeds.length) throw new HttpError('Calendar not configured: add GOOGLE_CALENDAR_ICS_URL or ICLOUD_CALENDAR_ICS_URL to .env.local', 503);
  const now = new Date();
  const to = new Date(now.getTime() + WINDOW_DAYS * 86_400_000);
  const results = await Promise.allSettled(feeds.map(async (f) => parseUpcoming(await fetchIcs(f.url), now, to, f.source)));
  const statuses: CalendarFeedStatus[] = results.map((r, i) =>
    r.status === 'fulfilled'
      ? { source: feeds[i].source, name: r.value.name, ok: true, events: r.value.events.length }
      : {
          source: feeds[i].source,
          name: null,
          ok: false,
          // HttpError messages are written URL-free above; anything else (an ical.js parse error) gets a generic label.
          error: r.reason instanceof HttpError ? r.reason.message : 'iCal feed could not be parsed',
          events: 0,
        },
  );
  if (statuses.every((s) => !s.ok)) throw new HttpError(statuses.map((s) => `${s.source}: ${s.error}`).join(' · '), 503);
  const upcoming = results
    .flatMap((r) => (r.status === 'fulfilled' ? r.value.events : []))
    .sort((a, b) => Date.parse(a.start) - Date.parse(b.start))
    .slice(0, MAX_UPCOMING);
  return { feeds: statuses, upcoming, windowDays: WINDOW_DAYS, fetchedAt: now.toISOString() };
}

/** Cached feed (5 min, stale-while-revalidate). Throws HttpError when unconfigured, failing, or while the breaker is open. */
export async function getCalendar({ force = false } = {}): Promise<CalendarFeed> {
  return cached(
    'calendar:upcoming',
    TTL_MS,
    async () => {
      const b = gate.state();
      if (b.open) throw new HttpError(`Calendar paused for ${Math.ceil(b.retryInMs / 60_000)}m after: ${b.reason}`, 503);
      try {
        const value = await load();
        gate.ok();
        return value;
      } catch (err) {
        gate.fail('', (err as Error).message);
        throw err;
      }
    },
    { force, minForceMs: MIN_FORCE_MS, maxStaleMs: 6 * 3_600_000 },
  );
}
