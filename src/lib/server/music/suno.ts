import 'server-only';
import { HttpError } from '../http-error';
import fs from 'node:fs/promises';
import { createWriteStream } from 'node:fs';
import path from 'node:path';
import { Readable, Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { SUNO_CREDIT_CHOICES } from '@/components/music/suno-types';
import type { SunoClip, SunoCredit, SunoMissing, SunoSaveContext, SunoSaveResult, SunoStatus } from '@/components/music/suno-types';
import { bustIndex } from './library';
import { loadConfig, saveRoots } from './config';
import { readMeta, sanitizeMeta, writeTrackMeta } from './meta';

// Bridge from VOLTA Music to the local gcui-art/suno-api service (a LaunchAgent on 127.0.0.1).
//   status   -> GET  /api/get_limit            (credits left, and whether the service is configured)
//   generate -> POST /api/custom_generate      (SPENDS SUNO CREDITS, so it needs an explicit confirm flag)
//   poll     -> GET  /api/get?ids=             (clip status + audio URLs)
//   save     -> downloads the finished mp3s to the Suno library folder on Windsor and records credits in meta.json
// The service holds the Suno cookie and the 2Captcha key in its own .env. This code only ever sees whether they are
// set (never their values), and never returns them.

const MOUNT = '/Volumes/Windsor';
export const SUNO_DIR = `${MOUNT}/VOLTA/services/suno-api`;
export const SUNO_ENV_PATH = `${SUNO_DIR}/.env`;
export const SUNO_OUT_DIR = `${MOUNT}/VOLTA/music/suno`;
const SUNO_LOG = '~/Library/Logs/suno-api.log';
const RESTART_CMD = 'launchctl kickstart -k gui/$(id -u)/com.epsilon.suno-api';
const DEFAULT_URL = 'http://127.0.0.1:3010';

const LIMITS = { title: 100, tags: 500, lyrics: 5000, clips: 6, maxBytes: 80 * 1024 * 1024, minBytes: 10 * 1024 };
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const LOOPBACK = new Set(['127.0.0.1', 'localhost', '[::1]']);
/** Suno serves finished audio from its own CDN; never fetch anything else. */
const AUDIO_HOST_RE = /(^|\.)suno\.(ai|com)$/i;

// ───────────────────────── plumbing ─────────────────────────

function baseUrl(): string {
  const raw = (process.env.SUNO_API_URL || DEFAULT_URL).replace(/\/+$/, '');
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    throw new HttpError(`SUNO_API_URL is not a valid URL: ${raw}`, 500);
  }
  if (!LOOPBACK.has(u.hostname)) throw new HttpError('SUNO_API_URL must point at this machine (127.0.0.1 or localhost).', 500);
  return raw;
}

async function windsorMounted(): Promise<boolean> {
  try {
    const [m, v] = await Promise.all([fs.stat(MOUNT), fs.stat('/Volumes')]);
    return m.isDirectory() && m.dev !== v.dev;
  } catch {
    return false;
  }
}

class ServiceDown extends Error {}

interface SvcReply {
  ok: boolean;
  status: number;
  data: unknown;
}

async function svc(pathAndQuery: string, init: RequestInit = {}, timeoutMs = 20_000): Promise<SvcReply> {
  let res: Response;
  try {
    res = await fetch(`${baseUrl()}${pathAndQuery}`, { ...init, cache: 'no-store', signal: AbortSignal.timeout(timeoutMs) });
  } catch (err) {
    if (err instanceof HttpError) throw err;
    if ((err as Error).name === 'TimeoutError') throw new HttpError('The Suno service did not answer in time. If a generation was just submitted, check again in a minute before retrying.', 504);
    throw new ServiceDown((err as Error).message);
  }
  const text = await res.text();
  let data: unknown = text;
  try {
    data = JSON.parse(text);
  } catch {
    // non-JSON body (HTML error page etc.)
  }
  return { ok: res.ok, status: res.status, data };
}

const asObj = (v: unknown): Record<string, unknown> => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {});
const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : typeof v === 'string' && v.trim() !== '' && Number.isFinite(Number(v)) ? Number(v) : null);

/** The service's own error text, trimmed and flattened; safe to show (it never contains the cookie). */
function serviceError(data: unknown): string {
  const raw = typeof data === 'string' ? data : (asObj(data).error ?? asObj(data).detail ?? '');
  const t = (typeof raw === 'string' ? raw : JSON.stringify(raw)).replace(/\s+/g, ' ').trim();
  return t.length > 300 ? `${t.slice(0, 300)}...` : t;
}

/** Which of the two secrets are filled in. Reads the service .env but returns only booleans. */
async function envFlags(): Promise<{ readable: boolean; cookie: boolean; captcha: boolean }> {
  try {
    const text = await fs.readFile(SUNO_ENV_PATH, 'utf8');
    const set = (key: string) => {
      const line = text.split(/\r?\n/).find((l) => l.trimStart().startsWith(`${key}=`));
      if (!line) return false;
      const v = line.slice(line.indexOf('=') + 1).trim();
      return v !== '' && !v.startsWith('#');
    };
    return { readable: true, cookie: set('SUNO_COOKIE'), captcha: set('TWOCAPTCHA_KEY') };
  } catch {
    return { readable: false, cookie: false, captcha: false };
  }
}

// ───────────────────────── status ─────────────────────────

export async function sunoStatus(): Promise<SunoStatus> {
  const [mounted, flags] = await Promise.all([windsorMounted(), envFlags()]);
  const serviceUrl = baseUrl();
  const base: Omit<SunoStatus, 'state' | 'ready' | 'credits' | 'missing' | 'message'> = {
    serviceUrl,
    envPath: SUNO_ENV_PATH,
    restartCommand: RESTART_CMD,
    logPath: SUNO_LOG,
    outDir: SUNO_OUT_DIR,
    windsorMounted: mounted,
  };
  const missing: SunoMissing[] = [];
  if (flags.readable) {
    if (!flags.cookie) missing.push('SUNO_COOKIE');
    if (!flags.captcha) missing.push('TWOCAPTCHA_KEY');
  }

  let reply: SvcReply;
  try {
    reply = await svc('/api/get_limit', {}, 25_000);
  } catch (err) {
    if (err instanceof HttpError) throw err;
    return {
      ...base,
      state: 'down',
      ready: false,
      credits: null,
      missing,
      message: mounted
        ? `The Suno service is not answering on ${serviceUrl}. Start it with: launchctl kickstart gui/$(id -u)/com.epsilon.suno-api (log: ${SUNO_LOG}).`
        : `The Windsor drive is not mounted, so the Suno service (which lives on it) cannot run. Plug it in, then run: ${RESTART_CMD}`,
    };
  }

  const d = asObj(reply.data);
  const left = num(d.credits_left);
  if (reply.ok && left !== null) {
    const credits = { left, monthlyLimit: num(d.monthly_limit), monthlyUsage: num(d.monthly_usage), period: typeof d.period === 'string' ? d.period : null };
    if (missing.length) {
      return { ...base, state: 'needs_setup', ready: false, credits, missing, message: `${missing.join(' and ')} ${missing.length > 1 ? 'are' : 'is'} still empty in ${SUNO_ENV_PATH}.` };
    }
    return { ...base, state: 'ready', ready: true, credits, missing, message: 'Suno service is ready.' };
  }

  const err = serviceError(reply.data);
  if (/provide a cookie/i.test(err) || missing.includes('SUNO_COOKIE')) {
    if (!missing.includes('SUNO_COOKIE')) missing.unshift('SUNO_COOKIE');
    return { ...base, state: 'needs_setup', ready: false, credits: null, missing, message: `${missing.join(' and ')} ${missing.length > 1 ? 'are' : 'is'} still empty in ${SUNO_ENV_PATH}.` };
  }
  return {
    ...base,
    state: 'auth_error',
    ready: false,
    credits: null,
    missing,
    message: `Suno or the service rejected the request${err ? `: ${err}` : ''}. The cookie has probably expired. Paste a fresh one into ${SUNO_ENV_PATH} and restart the service.`,
  };
}

// ───────────────────────── clips ─────────────────────────

function toClip(raw: unknown): SunoClip {
  const a = asObj(raw);
  const err = typeof a.error_message === 'string' && a.error_message.trim() ? a.error_message.trim().slice(0, 300) : null;
  return {
    id: String(a.id ?? ''),
    status: typeof a.status === 'string' ? a.status : 'submitted',
    title: typeof a.title === 'string' ? a.title : '',
    audioUrl: typeof a.audio_url === 'string' && a.audio_url ? a.audio_url : null,
    imageUrl: typeof a.image_url === 'string' && a.image_url ? a.image_url : null,
    durationSec: num(a.duration),
    error: err,
  };
}

function cleanIds(raw: unknown): string[] {
  const list = Array.isArray(raw) ? raw : typeof raw === 'string' ? raw.split(',') : [];
  const ids = list.map((s) => (typeof s === 'string' ? s.trim() : '')).filter(Boolean);
  if (!ids.length) throw new HttpError('ids is required.', 400);
  if (ids.length > LIMITS.clips) throw new HttpError(`At most ${LIMITS.clips} ids at a time.`, 400);
  if (ids.some((i) => !UUID_RE.test(i))) throw new HttpError('ids must be Suno clip ids (UUIDs).', 400);
  return [...new Set(ids.map((i) => i.toLowerCase()))];
}

async function fetchClips(ids: string[]): Promise<SunoClip[]> {
  let reply: SvcReply;
  try {
    reply = await svc(`/api/get?ids=${encodeURIComponent(ids.join(','))}`, {}, 25_000);
  } catch (err) {
    if (err instanceof HttpError) throw err;
    throw new HttpError('The Suno service is not answering. Check the setup panel.', 503);
  }
  if (!reply.ok || !Array.isArray(reply.data)) throw new HttpError(`Could not read clip status from Suno${serviceError(reply.data) ? `: ${serviceError(reply.data)}` : ''}.`, 502);
  return (reply.data as unknown[]).map(toClip).filter((c) => c.id);
}

export async function pollClips(rawIds: unknown): Promise<{ clips: SunoClip[] }> {
  return { clips: await fetchClips(cleanIds(rawIds)) };
}

// ───────────────────────── generate (spends credits) ─────────────────────────

const g = globalThis as unknown as { __voltaSunoBusy?: boolean };

function str(v: unknown, field: string, max: number, required: boolean): string {
  if (v === undefined || v === null) v = '';
  if (typeof v !== 'string') throw new HttpError(`${field} must be text.`, 400);
  const t = v.replace(/\r\n/g, '\n').trim();
  if (required && !t) throw new HttpError(`${field} is required.`, 400);
  if (t.length > max) throw new HttpError(`${field} is too long (max ${max} characters).`, 400);
  return t;
}

export async function generate(body: Record<string, unknown>): Promise<{ clips: SunoClip[]; credits: SunoStatus['credits'] }> {
  if (body.confirm !== true) throw new HttpError('Generating spends Suno credits. Confirm in the panel first.', 400);
  const instrumental = body.instrumental === true;
  const title = str(body.title, 'Title', LIMITS.title, true);
  const tags = str(body.tags, 'Style tags', LIMITS.tags, true);
  const lyrics = instrumental ? '' : str(body.lyrics, 'Lyrics', LIMITS.lyrics, true);

  if (g.__voltaSunoBusy) throw new HttpError('A generation is already being submitted. Wait for it to finish.', 409);
  g.__voltaSunoBusy = true;
  try {
    const st = await sunoStatus();
    if (!st.ready) throw new HttpError(st.message, 503, { status: st });
    if (st.credits && st.credits.left <= 0) throw new HttpError('Suno reports 0 credits left, so nothing was submitted.', 402);

    let reply: SvcReply;
    try {
      reply = await svc(
        '/api/custom_generate',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ prompt: lyrics, tags, title, make_instrumental: instrumental, wait_audio: false }),
        },
        170_000,
      );
    } catch (err) {
      if (err instanceof HttpError) throw err;
      throw new HttpError('The Suno service stopped answering while submitting. Nothing was confirmed; check your Suno library before retrying.', 503);
    }
    if (!reply.ok || !Array.isArray(reply.data)) {
      throw new HttpError(`Suno did not accept the generation${serviceError(reply.data) ? `: ${serviceError(reply.data)}` : ''}.`, reply.status >= 400 && reply.status < 600 ? reply.status : 502);
    }
    const clips = (reply.data as unknown[]).map(toClip).filter((c) => c.id);
    if (!clips.length) throw new HttpError('Suno returned no clips. Check your Suno library before retrying.', 502);
    const after = await sunoStatus().catch(() => null);
    return { clips, credits: after?.credits ?? st.credits };
  } finally {
    g.__voltaSunoBusy = false;
  }
}

// ───────────────────────── save: download mp3s + record credits ─────────────────────────

/** The library root for the Suno folder; adds it to config/music.json when it is missing. */
function ensureSunoRoot(): { id: string; enabled: boolean } {
  const cfg = loadConfig();
  const hit = cfg.roots.find((r) => r.path === SUNO_OUT_DIR);
  if (hit) return { id: hit.id, enabled: hit.enabled };
  let id = 'suno';
  for (let i = 2; cfg.roots.some((r) => r.id === id); i++) id = `suno-${i}`;
  saveRoots([...cfg.roots, { id, label: 'Suno', path: SUNO_OUT_DIR, enabled: true, depth: 0 }]);
  bustIndex();
  return { id, enabled: true };
}

const slug = (s: string) =>
  s
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48) || 'untitled';

function allowedAudioUrl(raw: string | null): URL | null {
  if (!raw) return null;
  try {
    const u = new URL(raw);
    return u.protocol === 'https:' && AUDIO_HOST_RE.test(u.hostname) ? u : null;
  } catch {
    return null;
  }
}

async function download(url: URL, dest: string): Promise<number> {
  const res = await fetch(url, { signal: AbortSignal.timeout(180_000), cache: 'no-store' });
  if (!res.ok || !res.body) throw new Error(`download failed (HTTP ${res.status})`);
  if (!allowedAudioUrl(res.url)) throw new Error('download was redirected away from Suno');
  const type = (res.headers.get('content-type') ?? '').toLowerCase();
  if (!type.startsWith('audio/') && !type.includes('octet-stream')) throw new Error(`unexpected content type: ${type || 'none'}`);
  const declared = Number(res.headers.get('content-length') ?? 0);
  if (declared > LIMITS.maxBytes) throw new Error('file is larger than the 80 MB safety limit');
  let bytes = 0;
  const guard = new Transform({
    transform(chunk: Buffer, _enc, cb) {
      bytes += chunk.length;
      if (bytes > LIMITS.maxBytes) cb(new Error('file is larger than the 80 MB safety limit'));
      else cb(null, chunk);
    },
  });
  const tmp = `${dest}.${process.pid}.part`;
  try {
    await pipeline(Readable.fromWeb(res.body as import('node:stream/web').ReadableStream), guard, createWriteStream(tmp));
    if (bytes < LIMITS.minBytes) throw new Error('downloaded file is too small to be a song');
    await fs.rename(tmp, dest);
    return bytes;
  } catch (err) {
    await fs.rm(tmp, { force: true });
    throw err;
  }
}

function tagList(tags: string): string[] {
  const out: string[] = [];
  for (const raw of tags.split(',')) {
    const t = raw.trim().replace(/\s+/g, ' ').slice(0, 40).trim();
    if (t && !out.some((o) => o.toLowerCase() === t.toLowerCase())) out.push(t);
    if (out.length >= 20) break;
  }
  return out;
}

function cleanContext(raw: unknown): SunoSaveContext {
  const c = asObj(raw);
  const credits = (Array.isArray(c.credits) ? c.credits : []).filter((x): x is SunoCredit => SUNO_CREDIT_CHOICES.includes(x as SunoCredit));
  // Patrick and Suno are always credited; Seraphim of the Void only when ticked.
  const merged = SUNO_CREDIT_CHOICES.filter((x) => x === 'Patrick' || x === 'Suno' || credits.includes(x));
  return {
    title: str(c.title, 'title', LIMITS.title, false),
    tags: str(c.tags, 'tags', LIMITS.tags, false),
    lyrics: str(c.lyrics, 'lyrics', LIMITS.lyrics, false),
    instrumental: c.instrumental === true,
    credits: merged,
  };
}

export async function saveClips(body: Record<string, unknown>): Promise<{ results: SunoSaveResult[]; rootEnabled: boolean; dir: string }> {
  const ids = cleanIds(body.ids);
  const ctx = cleanContext(body);
  if (!(await windsorMounted())) throw new HttpError(`${MOUNT} is not mounted, so the songs cannot be saved. Plug in the Windsor drive; Suno keeps the clips, so nothing is lost.`, 507);
  const clips = await fetchClips(ids);
  const root = ensureSunoRoot();
  await fs.mkdir(SUNO_OUT_DIR, { recursive: true });
  const store = await readMeta();
  const results: SunoSaveResult[] = [];

  for (const id of ids) {
    const clip = clips.find((c) => c.id.toLowerCase() === id);
    if (!clip) {
      results.push({ id, state: 'error', message: 'Suno does not list this clip.' });
      continue;
    }
    if (clip.status === 'error') {
      results.push({ id, state: 'error', message: clip.error ?? 'Suno reported an error for this clip.' });
      continue;
    }
    if (clip.status !== 'complete') {
      results.push({ id, state: 'pending', message: `Still ${clip.status}.` });
      continue;
    }
    const url = allowedAudioUrl(clip.audioUrl);
    if (!url) {
      results.push({ id, state: 'error', message: 'Suno gave no usable audio URL for this clip.' });
      continue;
    }
    const title = clip.title || ctx.title || 'untitled';
    const fileName = `${slug(title)}-${id.slice(0, 8)}.mp3`;
    const dest = path.join(SUNO_OUT_DIR, fileName);
    try {
      let existed = false;
      try {
        existed = (await fs.stat(dest)).size >= LIMITS.minBytes;
      } catch {
        existed = false;
      }
      if (!existed) await download(url, dest);
      const metaKey = `${root.id}/${fileName}`;
      if (!store.tracks[metaKey]) {
        const meta = sanitizeMeta({
          title,
          lyrics: ctx.instrumental ? '' : ctx.lyrics,
          credits: ctx.credits,
          tags: tagList(ctx.tags),
          sunoUrl: `https://suno.com/song/${id}`,
          notes: `Generated with Suno via the local suno-api service on ${new Date().toISOString().slice(0, 10)}.${ctx.instrumental ? ' Instrumental.' : ''} Clip ${id}.`,
        });
        await writeTrackMeta(metaKey, meta);
      }
      results.push({ id, state: existed ? 'exists' : 'saved', file: fileName });
    } catch (err) {
      results.push({ id, state: 'error', message: (err as Error).message });
    }
  }
  bustIndex();
  return { results, rootEnabled: root.enabled, dir: SUNO_OUT_DIR };
}
