'use client';
// Client data hooks for the Second Brain: vault wikilink graph, LTM capture total, vault list,
// full note index (for search beyond the capped graph) and a post-mount clock.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { BrainGraph } from '@/types/sources';
import type { LtmStatus, ObsidianVault } from '@/types/ltm';
import { ApiError, getJson } from '@/components/ltm/ltm-client';
import { useSharedJson } from '@/components/dashboard/widgets/shared-json';
import { buildGraphModel, searchKey, type GraphModel } from './graph-model';
import { useNow } from './analytics-shared';

export { useNow };

const isAbort = (e: unknown) => (e as { name?: string } | null)?.name === 'AbortError';
const errMsg = (e: unknown) => (e instanceof ApiError ? e.message : e instanceof Error ? e.message : 'request failed');

// ───────── Graph (/api/brain/graph) ─────────

export type GraphState =
  | { status: 'loading'; model: GraphModel | null }
  | { status: 'ready'; model: GraphModel }
  | { status: 'error'; model: GraphModel | null; message: string };

// Module-level cache: survives client-side navigation away from /second-brain and back.
let graphCache: { at: number; model: GraphModel } | null = null;
const CLIENT_TTL_MS = 10 * 60_000; // matches the server cache
const LAST_INDEX_KEY = 'volta.secondBrain.lastIndex';

export interface LastIndex {
  notes: number;
  vaults: number;
}

export function useBrainGraph(max = 700) {
  const [state, setState] = useState<GraphState>(() =>
    graphCache ? { status: 'ready', model: graphCache.model } : { status: 'loading', model: null },
  );
  const [nonce, setNonce] = useState(0);
  const retry = useCallback(() => setNonce((n) => n + 1), []);

  useEffect(() => {
    if (nonce === 0 && graphCache && Date.now() - graphCache.at < CLIENT_TTL_MS) return;
    const ctrl = new AbortController();
    setState((s) => (s.model ? s : { status: 'loading', model: null }));
    getJson<BrainGraph>(`/api/brain/graph?max=${max}`, ctrl.signal)
      .then((g) => {
        if (!g || !Array.isArray(g.nodes) || !Array.isArray(g.edges)) throw new Error('malformed graph response');
        const model = buildGraphModel(g);
        graphCache = { at: Date.now(), model };
        try {
          localStorage.setItem(LAST_INDEX_KEY, JSON.stringify({ notes: g.totalNotes, vaults: g.vaults.length } satisfies LastIndex));
        } catch {
          /* storage blocked — the hint just falls back to the vault list */
        }
        setState({ status: 'ready', model });
      })
      .catch((e: unknown) => {
        if (isAbort(e)) return;
        setState((s) => ({ status: 'error', model: s.model, message: errMsg(e) }));
      });
    return () => ctrl.abort();
  }, [max, nonce]);

  return { state, retry };
}

/** Totals from the last successful index (per-viewer convenience for the loading hint). */
export function useLastIndex(): LastIndex | null {
  const [v, setV] = useState<LastIndex | null>(null);
  useEffect(() => {
    try {
      const raw = localStorage.getItem(LAST_INDEX_KEY);
      if (raw) {
        const p = JSON.parse(raw) as LastIndex;
        if (typeof p.notes === 'number' && typeof p.vaults === 'number') setV(p);
      }
    } catch {
      /* ignore */
    }
  }, []);
  return v;
}

// ───────── Vault list (/api/vaults) ─────────

/** Registered vaults, or null while loading / when the request failed (callers fall back, never show "0"). */
export function useVaults() {
  const [vaults, setVaults] = useState<ObsidianVault[] | null>(null);
  useEffect(() => {
    const ctrl = new AbortController();
    getJson<{ vaults: ObsidianVault[] }>('/api/vaults', ctrl.signal)
      .then((r) => {
        if (Array.isArray(r.vaults)) setVaults(r.vaults);
      })
      .catch(() => {
        /* unknown ≠ zero: stay null so the badge shows "— VAULTS" or the last known count */
      });
    return () => ctrl.abort();
  }, []);
  return vaults;
}

// ───────── LTM status (/api/ltm/status), polled every 60s (shared store, paused while the tab is hidden) ─────────

/** `apps` = distinct apps across every capture (all time). */
export type LtmBadge =
  | { status: 'loading' }
  | { status: 'ok'; total: number; last: string | null; apps: number }
  | { status: 'offline'; reason: string };

const LTM_STATUS_URL = '/api/ltm/status';
const LTM_LOADING: LtmBadge = { status: 'loading' };

/**
 * One poll for the whole page: the header badge and the Timeline both read this (useSharedJson keys the store by
 * URL, so a second caller joins the same request/timer). The latest request failing means "offline" — the last good
 * total is not shown as if it were current.
 */
export function useLtmStatus(): LtmBadge {
  const { data, error, loading } = useSharedJson<LtmStatus>(LTM_STATUS_URL, 60_000);
  return useMemo<LtmBadge>(() => {
    if (error) return { status: 'offline', reason: errMsg(error) };
    if (data) {
      return data.available
        ? { status: 'ok', total: data.total, last: data.last, apps: data.apps }
        : { status: 'offline', reason: data.reason ?? 'unavailable' };
    }
    return loading ? LTM_LOADING : { status: 'offline', reason: 'no response' };
  }, [data, error, loading]);
}

// ───────── Full note index (/second-brain/notes-index), lazy ─────────

export interface IndexedNote {
  id: string; // `${vaultId}:${relPath}`
  vaultId: string;
  relPath: string;
  title: string;
  lower: string; // searchKey(title, relPath) — same rule as the graph (graph-model noteMatches)
  mtime: string; // ISO
}

export interface NotesIndex {
  notes: IndexedNote[];
  byId: Map<string, IndexedNote>;
  byVaultTitle: Map<string, string>; // `${vaultId}|${title.toLowerCase()}` → id
}

interface NotesIndexResponse {
  vaultIds: string[];
  notes: [number, string, number][]; // [vault index, relPath, mtime seconds]
  total: number;
}

export type IndexStatus = 'idle' | 'loading' | 'ready' | 'error';

// Module cache with the same TTL as the graph, so notes created after the first search show up.
let indexCache: { at: number; index: NotesIndex } | null = null;
const INDEX_TTL_MS = 10 * 60_000;

function buildIndex(r: NotesIndexResponse): NotesIndex {
  const notes: IndexedNote[] = r.notes.map(([vi, relPath, mt]) => {
    const vaultId = r.vaultIds[vi] ?? '';
    const title = (relPath.split('/').pop() ?? relPath).replace(/\.md$/, '');
    return { id: `${vaultId}:${relPath}`, vaultId, relPath, title, lower: searchKey(title, relPath), mtime: new Date(mt * 1000).toISOString() };
  });
  const byId = new Map<string, IndexedNote>();
  const byVaultTitle = new Map<string, string>();
  for (const n of notes) {
    byId.set(n.id, n);
    const k = `${n.vaultId}|${n.title.toLowerCase()}`;
    if (!byVaultTitle.has(k)) byVaultTitle.set(k, n.id);
  }
  return { notes, byId, byVaultTitle };
}

/**
 * Full note index for search. Loads when `enabled`; every change of `nonce` (bumped on search focus /
 * note selection) re-checks freshness, refetching a stale index and retrying after an error. A stale
 * index keeps serving results while the refresh is in flight.
 */
export function useNotesIndex(enabled: boolean, nonce = 0) {
  const [index, setIndex] = useState<NotesIndex | null>(indexCache?.index ?? null);
  const [status, setStatus] = useState<IndexStatus>(indexCache ? 'ready' : 'idle');
  const ctrlRef = useRef<AbortController | null>(null);

  useEffect(
    () => () => {
      ctrlRef.current?.abort();
      ctrlRef.current = null;
    },
    [],
  );

  useEffect(() => {
    if (!enabled) return;
    if (indexCache && Date.now() - indexCache.at < INDEX_TTL_MS) {
      setIndex(indexCache.index);
      setStatus('ready');
      return;
    }
    if (ctrlRef.current) return; // a load is already in flight
    const ctrl = new AbortController();
    ctrlRef.current = ctrl;
    if (!indexCache) setStatus('loading');
    getJson<NotesIndexResponse>('/second-brain/notes-index', ctrl.signal)
      .then((r) => {
        if (!r || !Array.isArray(r.notes) || !Array.isArray(r.vaultIds)) throw new Error('malformed notes index');
        const built = buildIndex(r);
        indexCache = { at: Date.now(), index: built };
        setIndex(built);
        setStatus('ready');
      })
      .catch((e: unknown) => {
        if (!isAbort(e)) setStatus(indexCache ? 'ready' : 'error');
      })
      .finally(() => {
        if (ctrlRef.current === ctrl) ctrlRef.current = null;
      });
  }, [enabled, nonce]);

  return { index, status };
}

// Clock: useNow (re-exported above from analytics-shared) is set after mount → hydration-safe relative times,
// and stops ticking while the tab is hidden.

/** Whole seconds since `active` became true (for "indexing… 7s"). */
export function useElapsed(active: boolean): number {
  const [s, setS] = useState(0);
  useEffect(() => {
    if (!active) return;
    setS(0);
    const t0 = Date.now();
    const id = window.setInterval(() => setS(Math.round((Date.now() - t0) / 1000)), 1000);
    return () => window.clearInterval(id);
  }, [active]);
  return s;
}
