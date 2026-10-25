// Pure helpers shared by the music server code and the client UI (no 'use client', no server-only).

/** Shell-safe double-quoted string (escapes \ " $ `). */
export function shellDq(s: string): string {
  return `"${s.replace(/([\\"$`])/g, '\\$1')}"`;
}

/** Copyable command that asks iCloud to materialise a file or folder. Never run by the app itself. */
export const brctlCommand = (p: string) => `brctl download ${shellDq(p)}`;

export function fmtBytes(n: number): string {
  if (n >= 1024 ** 3) return `${(n / 1024 ** 3).toFixed(1)} GiB`;
  if (n >= 1024 ** 2) return `${(n / 1024 ** 2).toFixed(1)} MB`;
  if (n >= 1024) return `${Math.round(n / 1024)} KB`;
  return `${n} B`;
}

export function fmtClock(sec: number | null | undefined): string {
  if (sec === null || sec === undefined || !Number.isFinite(sec) || sec < 0) return '--:--';
  const s = Math.round(sec);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const r = s % 60;
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${String(r).padStart(2, '0')}` : `${m}:${String(r).padStart(2, '0')}`;
}

/** Filename -> display title: drops the extension, underscores and a trailing "Suno" marker, tidies spacing. */
export function cleanTitle(fileName: string): string {
  let t = fileName.replace(/\.[a-z0-9]{2,5}$/i, '');
  t = t.replace(/_+/g, ' ');
  t = t.replace(/[\s\-–]*\(?\bsuno(?:ai)?\b\)?\s*$/i, '');
  t = t.replace(/\(\s+/g, '(').replace(/\s+\)/g, ')').replace(/\s+/g, ' ').trim();
  return t || fileName;
}

export const trackStreamUrl = (id: string) => `/api/music/file?id=${encodeURIComponent(id)}`;
export const trackCoverUrl = (id: string) => `/api/music/cover?id=${encodeURIComponent(id)}`;
