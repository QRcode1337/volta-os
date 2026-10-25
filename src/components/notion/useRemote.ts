'use client';
import { useCallback, useEffect, useRef, useState } from 'react';

export interface Remote<T> {
  status: 'idle' | 'loading' | 'ready' | 'error';
  data: T | null;
  error: string | null;
  /** The server could not see the Notion page (404/403): the page is not shared with the integration. */
  noAccess: boolean;
  notConfigured: boolean;
  reload: (force?: boolean) => void;
}

interface ErrBody {
  error?: string;
  noAccess?: boolean;
  notConfigured?: boolean;
}

/** GET `url` (null = do nothing); refetches when the url changes. `reload(true)` adds `refresh=1` (server rate-limits it). */
export function useRemote<T>(url: string | null): Remote<T> {
  const [state, setState] = useState<Omit<Remote<T>, 'reload'>>({ status: url ? 'loading' : 'idle', data: null, error: null, noAccess: false, notConfigured: false });
  const [tick, setTick] = useState({ n: 0, force: false });
  const keep = useRef<{ url: string | null; data: T | null }>({ url: null, data: null });

  useEffect(() => {
    if (!url) {
      setState({ status: 'idle', data: null, error: null, noAccess: false, notConfigured: false });
      return;
    }
    const ctl = new AbortController();
    // keep the previous data on screen while reloading the same url; drop it when the url changed
    const same = keep.current.url === url;
    setState((s) => ({ status: 'loading', data: same ? s.data : null, error: null, noAccess: false, notConfigured: false }));
    const target = tick.force ? `${url}${url.includes('?') ? '&' : '?'}refresh=1` : url;
    fetch(target, { cache: 'no-store', signal: ctl.signal })
      .then(async (res) => {
        const body = (await res.json().catch(() => ({}))) as T & ErrBody;
        if (!res.ok) {
          setState({ status: 'error', data: null, error: body.error ?? `HTTP ${res.status}`, noAccess: !!body.noAccess, notConfigured: !!body.notConfigured });
          return;
        }
        keep.current = { url, data: body };
        setState({ status: 'ready', data: body, error: null, noAccess: false, notConfigured: false });
      })
      .catch((err: Error) => {
        if (err.name === 'AbortError') return;
        setState({ status: 'error', data: null, error: err.message, noAccess: false, notConfigured: false });
      });
    return () => ctl.abort();
  }, [url, tick]);

  const reload = useCallback((force = false) => setTick((t) => ({ n: t.n + 1, force })), []);
  return { ...state, reload };
}
