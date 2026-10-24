'use client';
import { createContext, useContext, useEffect, useState } from 'react';
import { hGet, isAbort, isOffline } from './honcho-client';

/** Lets deep components report "Honcho went away" to the app shell. */
export const HonchoOfflineContext = createContext<(reason: string) => void>(() => {});
export const useReportOffline = () => useContext(HonchoOfflineContext);

export interface Resource<T> {
  data: T | null;
  error: string | null;
  loading: boolean;
}

/** GET a proxy URL (null = idle). Aborts on change/unmount; reports offline to the shell. */
export function useHonchoGet<T>(url: string | null, reloadKey = 0): Resource<T> {
  const reportOffline = useReportOffline();
  const [state, setState] = useState<Resource<T>>({ data: null, error: null, loading: !!url });

  useEffect(() => {
    if (!url) {
      setState({ data: null, error: null, loading: false });
      return;
    }
    const ac = new AbortController();
    setState({ data: null, error: null, loading: true });
    hGet<T>(url, ac.signal)
      .then((data) => setState({ data, error: null, loading: false }))
      .catch((err) => {
        if (isAbort(err)) return;
        if (isOffline(err)) reportOffline((err as Error).message);
        setState({ data: null, error: (err as Error).message, loading: false });
      });
    return () => ac.abort();
  }, [url, reloadKey, reportOffline]);

  return state;
}
