// Upcoming events merged from the configured iCal feeds (Google secret address, iCloud public calendar), served by
// /api/calendar and summarised in the /api/sources "Calendar" row.

export type CalendarSource = 'Google' | 'iCloud';

export interface CalendarEvent {
  source: CalendarSource;
  id: string; // UID, plus the occurrence start for recurring events
  title: string;
  start: string; // ISO
  end: string; // ISO
  allDay: boolean;
  location: string | null;
  url: string | null;
}

export interface CalendarFeedStatus {
  source: CalendarSource;
  name: string | null; // X-WR-CALNAME
  ok: boolean;
  error?: string; // safe to show (never contains the feed URL)
  events: number; // occurrences in the window
}

export interface CalendarFeed {
  feeds: CalendarFeedStatus[];
  /** Occurrences from every feed that haven't ended yet, within the look-ahead window, soonest first. */
  upcoming: CalendarEvent[];
  windowDays: number;
  fetchedAt: string; // ISO
}
