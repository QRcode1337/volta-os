// Media file ids, the URLs that serve them, iCloud download hints, the media type table and Editor inbox items.
// Shared by client and server code: no 'use client', no server-only, no node:* imports.
import type { EditorInboxItem } from '@/types/os';

// ───────────────────────── file ids ─────────────────────────

/** o_ Studio output · g_ Generations item · m_ music track · u_ Editor upload. */
export type MediaIdKind = 'o' | 'g' | 'm' | 'u';

export interface MediaId {
  kind: MediaIdKind;
  /** Canonical id (lower case, prefix included): what the registries and feedback files are keyed by. */
  id: string;
  /** The part after the prefix (Generations manifest ids are stored without `g_`). */
  key: string;
}

const MEDIA_ID = /^([ogmu])_([a-z0-9-]{6,40})$/i;
const HEX16 = /^[0-9a-f]{16}$/i;

/** Parse a media file id. The prefix is case-insensitive (`O_…` works); null when the id is not one of ours. */
export function parseMediaId(raw: unknown): MediaId | null {
  if (typeof raw !== 'string') return null;
  const m = MEDIA_ID.exec(raw);
  if (!m) return null;
  const kind = m[1].toLowerCase() as MediaIdKind;
  if (kind !== 'g' && !HEX16.test(m[2])) return null; // o_/m_/u_ are 16 hex; only g_ takes the manifest id shape
  const key = m[2].toLowerCase();
  return { kind, id: `${kind}_${key}`, key };
}

/** A media-bin id (Studio output, Generations item or music track): the files the Editor can review and hand off. */
export function parseBinId(raw: unknown): MediaId | null {
  const p = parseMediaId(raw);
  return p && p.kind !== 'u' ? p : null;
}

// ───────────────────────── file URLs ─────────────────────────

const FILE_ROUTE: Record<MediaIdKind, string> = {
  o: '/api/studio/file',
  g: '/api/media/file',
  m: '/api/music/file',
  u: '/api/editor/nle/file',
};

/** The route that streams a media file, chosen by id prefix. Throws on an id that is not a media id. */
export function mediaFileUrl(id: string): string {
  const p = parseMediaId(id);
  if (!p) throw new Error(`Not a media file id: ${String(id).slice(0, 40)}`);
  return `${FILE_ROUTE[p.kind]}?id=${encodeURIComponent(p.kind === 'g' ? p.key : p.id)}`;
}

/** Inverse of mediaFileUrl for bin files: the file id a /api/{studio,media,music}/file URL points at, or null. */
export function mediaIdFromUrl(url: string | null | undefined): string | null {
  const m = /^\/api\/(studio|media|music)\/file\?id=([A-Za-z0-9_-]+)$/.exec(url ?? '');
  if (!m) return null;
  return m[1] === 'media' ? `g_${m[2]}` : m[2]; // studio: o_<hex>, music: m_<hex> (already prefixed)
}

// ───────────────────────── iCloud hints ─────────────────────────

/** Copyable `brctl download "<path>"` (\ " $ ` escaped inside the double quotes). Never run by the app itself. */
export function brctlCommand(path: string): string {
  return `brctl download "${path.replace(/[\\"$`]/g, '\\$&')}"`;
}

/** User message for a file iCloud has evicted to a placeholder: what it is and how to download it. */
export function icloudHint(name: string, path: string): string {
  return `${name} is an iCloud placeholder (evicted from this Mac) and VOLTA cannot download it. Open it in Finder, or run ${brctlCommand(path)}, then retry.`;
}

// ───────────────────────── media types ─────────────────────────

export type MediaKind = 'video' | 'audio' | 'image';

/** One row per extension: served MIME first, then other Content-Types an upload of that extension may arrive with. */
const MEDIA_TYPES: [ext: string, media: MediaKind, mimes: string[]][] = [
  ['mp4', 'video', ['video/mp4']],
  ['m4v', 'video', ['video/mp4', 'video/x-m4v']],
  ['mov', 'video', ['video/quicktime']],
  ['webm', 'video', ['video/webm']],
  ['mkv', 'video', ['video/x-matroska']],
  ['mp3', 'audio', ['audio/mpeg', 'audio/mp3']],
  ['wav', 'audio', ['audio/wav', 'audio/x-wav', 'audio/wave']],
  ['m4a', 'audio', ['audio/mp4', 'audio/x-m4a']],
  ['aac', 'audio', ['audio/aac']],
  ['flac', 'audio', ['audio/flac']],
  ['ogg', 'audio', ['audio/ogg']],
  ['opus', 'audio', ['audio/ogg', 'audio/opus']],
  ['png', 'image', ['image/png']],
  ['jpg', 'image', ['image/jpeg']],
  ['jpeg', 'image', ['image/jpeg']],
  ['webp', 'image', ['image/webp']],
  ['gif', 'image', ['image/gif']],
  ['heic', 'image', ['image/heic']],
];

/** Extension (no dot, lower case) → MIME type to serve it with. */
export const MIME_BY_EXT: Record<string, string> = Object.fromEntries(MEDIA_TYPES.map(([ext, , mimes]) => [ext, mimes[0]]));
/** Extension (no dot, lower case) → media kind. */
export const MEDIA_BY_EXT: Record<string, MediaKind> = Object.fromEntries(MEDIA_TYPES.map(([ext, media]) => [ext, media]));
/** Content-Type → extension to store it under (the first row that lists the type wins: video/mp4 → mp4, audio/ogg → ogg). */
export const EXT_BY_MIME: Record<string, string> = {};
for (const [ext, , mimes] of MEDIA_TYPES) for (const m of mimes) EXT_BY_MIME[m] ??= ext;

// ───────────────────────── Editor inbox ─────────────────────────

/** localStorage key of the cross-app hand-off queue into VOLTA Editor. */
export const EDITOR_INBOX_KEY = 'rubric:editor-inbox';

type InboxSource = EditorInboxItem['source'];
const INBOX_ID_PREFIX: Record<InboxSource, string> = { generations: 'gen', studio: 'studio', music: 'music', scripts: 'scripts', carousels: 'carousel' };

export interface InboxItemInput {
  source: InboxSource;
  /** What the hand-off is about (file id, deck id, doc + chapter): part of the item id. */
  ref: string;
  title: string;
  kind: EditorInboxItem['kind'];
  durationSec: number;
  /** A real file: its media id (o_/g_/m_) and absolute path. The URL is derived from the id. */
  media?: { id: string; path: string };
  cues?: EditorInboxItem['cues'];
  notion?: EditorInboxItem['notion'];
  /** Creation time in ms (default now): stamps both the id and createdAt. */
  at?: number;
}

/** One Editor inbox hand-off. Every producer builds its items here so the id, timestamp and file URL agree. */
export function makeInboxItem(p: InboxItemInput): EditorInboxItem {
  const at = p.at ?? Date.now();
  return {
    id: `${INBOX_ID_PREFIX[p.source]}-${p.ref}-${at.toString(36)}`,
    title: p.title,
    kind: p.kind,
    durationSec: p.durationSec,
    source: p.source,
    ...(p.cues ? { cues: p.cues } : {}),
    createdAt: new Date(at).toISOString(),
    ...(p.notion ? { notion: p.notion } : {}),
    ...(p.media ? { file: p.media.path, mediaUrl: mediaFileUrl(p.media.id) } : {}),
  };
}
