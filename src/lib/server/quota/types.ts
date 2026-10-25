// Normalised quota payload for GET /api/quota. No 'server-only': the UsageRoboBar client component imports these types.

export interface QuotaWindow {
  /** primary | secondary | tertiary for CodexBar windows, the provider's own key for OmniRoute snapshots. */
  id: string;
  /** "Session", "Weekly", "Fable only", "premium_interactions", … */
  label: string;
  usedPercent: number | null;
  remainingPercent: number | null;
  windowMinutes: number | null;
  /** ISO timestamp the window resets. */
  resetsAt: string | null;
  /** CodexBar's human reset text ("Oct 25 at 8:00AM"), when it gave one. */
  resetLabel?: string | null;
  exhausted?: boolean;
  /** CodexBar's pace line ("9% in reserve | Expected 46% used | Lasts until reset"). */
  pace?: string | null;
}

export type LimitsStatus = 'ok' | 'stale' | 'error' | 'pending';

/** One provider's subscription limits as CodexBar reads them (session %, weekly %, reset times). */
export interface LimitsProvider {
  id: string;
  label: string;
  plan: string | null;
  /** codexbar source that answered: web | cli | oauth | api | auto | history (last recorded sample, may be old). */
  source: string;
  status: LimitsStatus;
  /** ISO time these numbers were read (history source: when CodexBar last recorded them). */
  fetchedAt: string | null;
  windows: QuotaWindow[];
  /** Extra lines such as credits balance. */
  extras: { label: string; value: string }[];
  error?: string;
}

export interface CodexBarSection {
  available: boolean;
  cli: string | null;
  providers: LimitsProvider[];
  note?: string;
}

export type OmniState = 'ok' | 'limited' | 'exhausted' | 'cooldown' | 'expired' | 'inactive' | 'unknown';

export interface TokenCounts {
  requests: number;
  tokensIn: number;
  tokensOut: number;
  failures: number;
}

export interface OmniProvider {
  id: string;
  label: string;
  /** subscription = OAuth connection(s); api = API-key (can bill); local = on this Mac. */
  kind: 'subscription' | 'api' | 'local';
  connections: { total: number; active: number };
  state: OmniState;
  stateDetail: string | null;
  today: TokenCounts;
  week: TokenCounts;
  /** Traffic from the volta-os key only, this week. */
  voltaWeek: TokenCounts;
  lastUsedAt: string | null;
  /** The volta-os key is allowed to use at least one connection of this provider. */
  voltaAllowed: boolean | null;
  /** Latest OmniRoute quota snapshots (remaining %, exhausted, reset). */
  windows: QuotaWindow[];
}

export interface OmniSection {
  available: boolean;
  gateway: 'up' | 'down' | 'unknown';
  gatewayUrl: string;
  /** Local-midnight start of "today" (ISO) and the 7-day cut-off used for the token sums. */
  todayFrom: string;
  weekFrom: string;
  providers: OmniProvider[];
  /** Open or half-open circuit breakers, per `omniroute resilience breakers`. */
  breakers: { name: string; state: string; detail?: string }[];
  cooldowns: { name: string; detail?: string }[];
  volta: { today: TokenCounts; week: TokenCounts } | null;
  note?: string;
  error?: string;
}

export interface QuotaPayload {
  generatedAt: string;
  cacheTtlSec: number;
  codexbar: CodexBarSection;
  omniroute: OmniSection;
}
