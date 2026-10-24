'use client';
// Shared /api/sources store for the home left column: one fetch + one 60s poll no matter how many
// widgets subscribe (CalendarWidget's "What's next" and MemorySourcesWidget both read it). Backed by the
// keyed shared-json store, so polling pauses while the tab is hidden and resumes (if due) when it is shown.

import { useMemo } from 'react';
import type { MemorySource } from '@/types/sources';
import { refreshSharedJson, useSharedJson } from './shared-json';

export interface SourcesState {
  sources: MemorySource[] | null; // last good payload (kept on refresh errors)
  error: string | null; // last fetch error, cleared on success
  loading: boolean; // true while a request is in flight (and before the first response)
}

const SOURCES_URL = '/api/sources';
const POLL_MS = 60_000;

export function refreshSources(): Promise<void> {
  return refreshSharedJson(SOURCES_URL);
}

/** Live memory-source rows from /api/sources (hydration-safe: server + first client render = loading). */
export function useMemorySources(): SourcesState {
  const { data, error, loading, refreshing } = useSharedJson<{ sources: MemorySource[] }>(SOURCES_URL, POLL_MS);
  return useMemo(
    () => ({
      sources: data ? (Array.isArray(data.sources) ? data.sources : []) : null,
      error: error ? error.message || 'request failed' : null,
      loading: loading || refreshing,
    }),
    [data, error, loading, refreshing],
  );
}
