// Client helpers for VOLTA Research (fetch wrapper, query strings, small formatters).

export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}

export async function api<T>(url: string, signal?: AbortSignal): Promise<T> {
  const res = await fetch(url, { signal, cache: 'no-store' });
  let body: unknown = null;
  try {
    body = await res.json();
  } catch {
    // non-JSON error page
  }
  if (!res.ok) throw new ApiError((body as { error?: string } | null)?.error ?? `${url} failed (${res.status})`, res.status);
  return body as T;
}

export function qs(params: Record<string, string | number | boolean | null | undefined>): string {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v === null || v === undefined || v === '' || v === false) continue;
    p.set(k, v === true ? '1' : String(v));
  }
  const s = p.toString();
  return s ? `?${s}` : '';
}

/** Deterministic UTC date ("2026-10-25"): no locale or timezone drift between server and client render. */
export const fmtDate = (ms: number | string | null | undefined): string => {
  if (ms === null || ms === undefined) return '';
  const d = new Date(ms);
  return Number.isNaN(d.getTime()) ? '' : d.toISOString().slice(0, 10);
};

export const pct = (n: number, d: number) => (d > 0 ? Math.round((n / d) * 100) : 0);

/** A server answer that is still waiting for the first inventory build. */
export const isBuilding = (x: unknown): x is { building: true } => !!x && typeof x === 'object' && (x as { building?: unknown }).building === true;
