// VOLTA Systems — live health of the agent fleet, services, local models, storage and memory (GET /api/systems).
// Read-only: the server only probes, lists and measures; it never starts, stops or changes anything.

/** up = answering normally · degraded = answering but unhealthy (or alive without answering) · down = not answering · unknown = not probed. */
export type SystemStatus = 'up' | 'degraded' | 'down' | 'unknown';
export type Severity = 'ok' | 'warn' | 'critical';
export type FactTone = 'ok' | 'warn' | 'critical' | 'muted';

/**
 * running = has a PID · idle = loaded, not running, last exit 0 (scheduled / one-shot jobs between runs) ·
 * stopped = last instance killed by SIGTERM/SIGKILL · failing = last exit non-zero · not-loaded = plist present but
 * not in `launchctl list` · missing = neither · app-not-running = an app-managed job with no plist (Ollama's,
 * Docker Desktop's) that launchd only lists while its app is running.
 */
export type LaunchAgentHealth = 'running' | 'idle' | 'stopped' | 'failing' | 'not-loaded' | 'missing' | 'app-not-running';

export interface LaunchAgentState {
  label: string;
  /** What the job is for this service, e.g. "service", "scheduled restart". */
  role: string;
  /** plist found in ~/Library/LaunchAgents (app-managed jobs such as Ollama's have none). */
  plist: boolean;
  /** Registered by an app (login item / Docker Desktop), not by a plist — absent from launchd while the app is quit. */
  appManaged: boolean;
  /** From the plist: keep-alive / interval / calendar / at-load / on-demand; null when unreadable or absent. */
  schedule: 'keep-alive' | 'interval' | 'calendar' | 'at-load' | 'on-demand' | null;
  loaded: boolean;
  pid: number | null;
  /** Last exit status from `launchctl list` (negative = killed by that signal). */
  lastExit: number | null;
  health: LaunchAgentHealth;
  /** StandardErrorPath (else StandardOutPath) from the plist, for a "tail the log" command (display path, ~). */
  logPath: string | null;
}

export interface ServiceProcess {
  pid: number;
  /** Executable name only (never arguments — they can hold secrets). */
  name: string;
  uptimeSec: number | null;
  rssBytes: number | null;
}

export interface ServiceFact {
  label: string;
  value: string;
  tone?: FactTone;
}

export interface ContainerInfo {
  name: string;
  service: string;
  state: string; // running / exited / restarting …
  status: string; // "Up About an hour (healthy)"
  health: 'healthy' | 'unhealthy' | 'starting' | null;
  image: string;
}

export interface CopyCommand {
  label: string;
  command: string;
  note?: string;
}

export interface ServiceCheck {
  id: string;
  name: string;
  /** Short role tag, e.g. "gateway", "router", "memory", "models", "capture". */
  kind: string;
  status: SystemStatus;
  /** One line: "live", "connection refused", "3/5 containers healthy". */
  summary: string;
  /** What was probed, e.g. "127.0.0.1:18789/health" (null when nothing is reachable over HTTP). */
  endpoint: string | null;
  port: number | null;
  latencyMs: number | null;
  version: string | null;
  /** Where the version came from ("health endpoint", "package.json", "gateway_state.json"). */
  versionSource: string | null;
  process: ServiceProcess | null;
  /** Listening address class from lsof: loopback only, or every interface (reachable from the LAN). */
  bind: 'loopback' | 'all-interfaces' | null;
  launchAgents: LaunchAgentState[];
  facts: ServiceFact[];
  containers?: ContainerInfo[];
  /** Documented start/restart command for the user to run — VOLTA never runs it. */
  command: CopyCommand | null;
  notes: string[];
  /** Core services raise a critical alert when down; optional ones a warning. */
  core: boolean;
  /** Id of the service whose failure makes this one degraded (its command is the fix). */
  blockedBy?: string;
}

export interface LocalModel {
  id: string;
  /** Display name when the runtime gives one. */
  name: string | null;
  type: string | null; // llm / vlm / embeddings
  loaded: boolean | null; // null = runtime doesn't say (OpenAI-compatible /v1/models only)
  /** Ollama /api/ps: bytes resident for the loaded model. LM Studio: model file size on disk. */
  sizeBytes: number | null;
  sizeKind: 'memory' | 'disk' | null;
  vramBytes: number | null;
  params: string | null;
  quantization: string | null;
  contextLength: number | null;
  /** Ollama: when the loaded model unloads (ISO). */
  expiresAt: string | null;
  /** LM Studio: seconds until an idle loaded model unloads. */
  ttlSec: number | null;
  /** Ollama cloud model: the remote host that runs it (e.g. "ollama.com"); null for a local model. */
  remoteHost: string | null;
}

export interface ModelRuntime {
  id: 'ollama' | 'lmstudio' | 'llmster';
  name: string;
  port: number;
  status: SystemStatus;
  /** Process that owns the port (lsof), e.g. "llmster" answering on LM Studio's port. */
  servedBy: string | null;
  endpoint: string | null;
  /** Local models resident in memory (cloud models are never counted here). */
  loaded: LocalModel[];
  /** Local models installed/downloaded (not loaded). */
  available: LocalModel[];
  /** Ollama cloud models: registry stubs that run remotely (no local disk or memory use). `loaded` = in use now. */
  cloud: LocalModel[];
  error: string | null;
}

export interface VolumeUsage {
  id: string;
  label: string;
  mount: string;
  mounted: boolean;
  totalBytes: number | null;
  freeBytes: number | null;
  usedBytes: number | null;
  usedPct: number | null;
  severity: Severity;
  /** Human threshold, e.g. "warn < 15 GiB free · critical < 8 GiB". */
  thresholds: string;
  note: string | null;
}

export interface PathSize {
  id: string;
  label: string;
  /** Display path (~ for home). */
  path: string;
  /** Allocated bytes on disk (du -sk / stat blocks). */
  bytes: number | null;
  /** Logical size when it differs a lot (sparse Docker.raw). */
  apparentBytes: number | null;
  volume: string;
  note: string | null;
  /** du could not read some entries; the size is a lower bound. */
  partial: boolean;
  error: string | null;
  /** ISO date from which this quarantine may be purged. */
  purgeAfter?: string;
}

export interface StorageSizes {
  status: 'ready' | 'pending' | 'error';
  computedAt: string | null;
  durationMs: number | null;
  ttlMinutes: number;
  items: PathSize[];
  error: string | null;
}

export interface StorageReport {
  volumes: VolumeUsage[];
  sizes: StorageSizes;
}

export interface MemoryReport {
  available: boolean;
  totalBytes: number | null;
  /** `memory_pressure -Q` "System-wide memory free percentage". */
  freePct: number | null;
  /** kern.memorystatus_vm_pressure_level: 1 normal, 2 warn, 4 critical. */
  pressureLevel: 'normal' | 'warn' | 'critical' | null;
  swapUsedBytes: number | null;
  swapTotalBytes: number | null;
  /** vm_stat breakdown (approximate, like Activity Monitor's). */
  appBytes: number | null;
  wiredBytes: number | null;
  compressedBytes: number | null;
  cachedFilesBytes: number | null;
  freeBytes: number | null;
  severity: Severity;
  error: string | null;
}

export interface AttentionItem {
  id: string;
  severity: 'warn' | 'critical';
  title: string;
  detail: string;
  /** DOM id of the card/panel to scroll to. */
  target: string;
  command?: CopyCommand;
}

/** GET /api/systems?summary=1 — the light payload behind SystemsBadge (no folder sizes, no per-service detail). */
export interface SystemsSummary {
  generatedAt: string;
  counts: SystemsReport['counts'];
  services: number;
  attention: Pick<AttentionItem, 'id' | 'severity' | 'title'>[];
}

export interface SystemsReport {
  generatedAt: string; // ISO, when the probes ran
  durationMs: number;
  services: ServiceCheck[];
  models: ModelRuntime[];
  storage: StorageReport;
  memory: MemoryReport;
  attention: AttentionItem[];
  counts: { up: number; degraded: number; down: number; unknown: number };
}
