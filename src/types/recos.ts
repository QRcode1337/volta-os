// Shared (client + server) shapes for VOLTA Recos: weekly improvement cards built from real signals.

export type RecoBucket = 'Content' | 'Routines' | 'Systems' | 'Memory';
export type RecoSeverity = 'critical' | 'warn' | 'info';
export type RecoStatus = 'pending' | 'in_cart' | 'done' | 'skipped';

export interface RecoSource {
  label: string;
  href: string;
  /** true: opens outside VOLTA OS (Notion). false: an in-app route. */
  external: boolean;
}

export interface Reco {
  /** Stable per signal ("notion:<page>", "routine:<id>", "systems:<attention id>", "memory:<source>"). */
  id: string;
  bucket: RecoBucket;
  priority: boolean;
  severity: RecoSeverity;
  title: string;
  /** What the signal says, in the source's own words. */
  why: string;
  /** Measured values behind the card, e.g. { label: "captures waiting", value: "27" }. */
  evidence: { label: string; value: string }[];
  steps: string[];
  /** A command the source itself suggested (or the documented restart/log command), copyable. */
  command: string | null;
  source: RecoSource;
  observedAt: string;
}

export interface RecoSignal {
  id: 'notion' | 'routines' | 'systems' | 'sources';
  label: string;
  status: 'ok' | 'error';
  detail: string;
  count: number;
}

export interface RecosPayload {
  recos: Reco[];
  signals: RecoSignal[];
  generatedAt: string;
}
