// Shared (client + server) shapes for the Notion-backed apps: Scripts, Carousels, Recos and the Editor episode tag.
// Everything here is plain JSON; the Notion token and raw API payloads never cross to the client.

export interface NotionPageRef {
  id: string; // 32-char hex, no dashes
  title: string;
  url: string; // https://www.notion.so/<id>
}

/** One chapter of a page: the text between two headings of the chapter level (plus an "Overview" lead-in). */
export interface NotionSection {
  id: string;
  title: string;
  level: number; // heading level of the title (0 for the lead-in)
  markdown: string; // body without the heading line
}

export interface NotionPageDoc extends NotionPageRef {
  lastEdited: string | null;
  markdown: string; // whole page
  sections: NotionSection[];
  children: NotionPageRef[]; // child pages / mentioned pages found in the body
  truncated: boolean; // block budget hit: the page is longer than what we fetched
  fetchedAt: string;
}

export type VpItemKind = 'outline' | 'ledger' | 'evidence' | 'page';

export interface VpItem extends NotionPageRef {
  kind: VpItemKind;
  /** Heading it sits under in the Video Production index (e.g. "OPERATIVE ACTION ITEMS"), when the index listed it. */
  section?: string;
}

export type VpGroupKind = 'series' | 'project' | 'ideas' | 'playbooks' | 'shorts' | 'other';

export interface VpGroup {
  key: string;
  label: string;
  kind: VpGroupKind;
  items: VpItem[];
}

export interface VpEpisode {
  key: string; // "ep3"
  number: number;
  series: string;
  title: string; // short label ("Ep 3 · CAIMEO")
  outline: VpItem | null;
  ledger: VpItem | null;
  evidence: VpItem[];
}

export interface NotionNoAccess {
  id: string;
  title: string;
  url: string;
  status: number;
  hint: string;
}

export interface VpCatalog {
  groups: VpGroup[];
  episodes: VpEpisode[];
  inaccessible: NotionNoAccess[];
  source: 'index' | 'fallback';
  fetchedAt: string;
  indexUrl: string;
}

export interface NotionLink {
  label: string;
  url: string;
  kind: 'database' | 'page';
}

export interface DreamEntry {
  id: string;
  title: string;
  date: string | null; // ISO date from the Date property, else created time
  dateSource: 'date' | 'created';
  url: string;
}

export interface NotionStatus {
  configured: boolean;
  ok: boolean;
  message: string;
}
