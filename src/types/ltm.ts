// unvolta-ltm + Obsidian vault contracts (served by /api/ltm/* and /api/vaults).

export interface LtmStatus {
  available: boolean;
  reason?: string; // why unavailable (drive not mounted, db missing, …)
  dbPath: string;
  framesDir: string;
  framesAvailable: boolean;
  total: number;
  first: string | null; // ISO local timestamp of the oldest capture
  last: string | null; // newest capture
  apps: number; // distinct app count
  /** Captures moved out by ltm_prune.py (memory_pruned table), if any. */
  pruned: { total: number; duplicate: number; watching: number; other: number } | null;
}

export interface LtmAppCount {
  app: string;
  count: number;
}

export interface LtmDay {
  date: string; // yyyy-mm-dd (local)
  count: number;
  firstTs: string;
  lastTs: string;
  apps: LtmAppCount[]; // top apps that day, desc
}

/** Lightweight row for lists and the day timeline (no OCR body). */
export interface LtmCaptureSummary {
  id: number;
  ts: string; // ISO local, e.g. 2026-10-23T22:44:16.802998
  app: string;
  title: string;
  snippet: string; // ~240 chars, centred on the search match when there is one
  hasFrame: boolean;
}

export interface LtmCapture extends LtmCaptureSummary {
  content: string; // full OCR text
  framePath: string | null;
  prevId: number | null;
  nextId: number | null;
}

export interface LtmCaptureList {
  items: LtmCaptureSummary[];
  total: number; // matches before limit
}

/** A Pieces-Vault LTM session note (Ollama summary of a capture range). */
export interface LtmSessionNote {
  file: string; // vault-relative path, e.g. ltm/2026-10/2026-10-15 Foo.md
  title: string;
  date: string; // yyyy-mm-dd
  timeLabel: string | null; // "Oct 15, 2026 04:26–04:28 (3 min, 4 captures)"
  captureFrom: number | null;
  captureTo: number | null;
  tldr: string | null;
  tags: string[];
  apps: string[];
  obsidianUrl: string | null;
}

export interface ObsidianVault {
  id: string;
  name: string;
  path: string;
  location: 'icloud' | 'local';
  notes: number;
  lastEdited: string | null; // ISO date
  open: boolean; // currently open in Obsidian
  obsidianUrl: string;
}
