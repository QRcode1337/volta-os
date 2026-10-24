import { BookOpen, Brain, CalendarClock, Code2, FileText, FolderKanban, MessagesSquare, NotebookPen, type LucideIcon } from 'lucide-react';
import type { RecentNote } from '@/types/sources';

// Note Ring model: the 36 ring slots are the most recently edited Obsidian notes (/api/notes/recent).
// RecentNote rows are mapped onto this ring-item shape here; src/types/os.ts stays untouched.

export type NoteKind = 'conversation' | 'ltm' | 'recap' | 'wiki' | 'daily' | 'project' | 'snippet' | 'note';

export interface NoteKindMeta {
  label: string;
  icon: LucideIcon;
  color: string;
}

/** Icon + accent per note kind (derived from vault folder / path). Accents come from the /robo palette. */
export const NOTE_KIND_META: Record<NoteKind, NoteKindMeta> = {
  conversation: { label: 'Conversation', icon: MessagesSquare, color: '#14B8A6' },
  ltm: { label: 'LTM summary', icon: Brain, color: '#A855F7' },
  recap: { label: 'Day recap', icon: CalendarClock, color: '#F5A623' },
  wiki: { label: 'Wiki', icon: BookOpen, color: '#FF6B2B' },
  daily: { label: 'Daily note', icon: NotebookPen, color: '#06B6D4' },
  project: { label: 'Project', icon: FolderKanban, color: '#3B82F6' },
  snippet: { label: 'Snippet', icon: Code2, color: '#22C55E' },
  note: { label: 'Note', icon: FileText, color: '#A39E93' },
};

/** One ring slot. `id` is the /api/brain/note id (`<vaultId>:<relPath>`). */
export interface NoteRingItem {
  id: string;
  title: string;
  tag: string; // "Pieces-Vault · ltm"
  kind: NoteKind;
  vault: string;
  folder: string;
  relPath: string;
  path: string; // "<vault>/<relPath>" — what COPY PATH copies
  mtime: string; // ISO (UTC) from the filesystem
  obsidianUrl: string;
  angleDeg: number; // 0–360, clockwise from 12 o'clock; newest note sits at 0°
}

export function noteKind(n: Pick<RecentNote, 'folder' | 'relPath' | 'title'>): NoteKind {
  const f = n.folder.toLowerCase().trim();
  const p = n.relPath.toLowerCase();
  const t = n.title.toLowerCase();
  if (/conversation|chat|copilot/.test(f)) return 'conversation';
  if (f === 'ltm' || f === 'summaries' || p.startsWith('ltm/') || p.startsWith('summaries/')) return t.includes('day recap') ? 'recap' : 'ltm';
  if (/wiki|synthesis|index|dossier|meta/.test(f)) return 'wiki';
  if (/daily|journal/.test(f) || /^\d{4}-\d{2}-\d{2}$/.test(n.title.trim())) return 'daily';
  if (/project/.test(f)) return 'project';
  if (/snippet|textgenerator|code/.test(f)) return 'snippet';
  return 'note';
}

/** RecentNote[] (newest first) → evenly spaced ring items, newest at 12 o'clock going clockwise. */
export function toRingItems(notes: RecentNote[]): NoteRingItem[] {
  const n = notes.length || 1;
  return notes.map((note, i) => ({
    id: `${note.vaultId}:${note.relPath}`,
    title: note.title,
    tag: `${note.vault} · ${note.folder}`,
    kind: noteKind(note),
    vault: note.vault,
    folder: note.folder,
    relPath: note.relPath,
    path: `${note.vault}/${note.relPath}`,
    mtime: note.mtime,
    obsidianUrl: note.obsidianUrl,
    angleDeg: Math.round(i * (360 / n) * 100) / 100,
  }));
}

/** Case-insensitive token match on title, vault, folder and kind label. */
export function matchesNote(item: NoteRingItem, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  const hay = `${item.title} ${item.vault} ${item.folder} ${NOTE_KIND_META[item.kind].label}`.toLowerCase();
  return q.split(/\s+/).every((tok) => hay.includes(tok));
}

/** "3m ago" / "5h ago" / "4d ago" from an ISO timestamp. Call only after mount (needs the clock). */
export function relTime(iso: string, nowMs: number): string {
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return '—';
  const mins = Math.max(0, Math.round((nowMs - t) / 60_000));
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const h = Math.round(mins / 60);
  if (h < 48) return `${h}h ago`;
  const d = Math.round(h / 24);
  if (d < 60) return `${d}d ago`;
  return `${Math.round(d / 30)}mo ago`;
}

/** Absolute local date-time for tooltips ("Oct 15, 2026, 11:41 AM"). Client-only. */
export function absTime(iso: string): string {
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return iso;
  return new Date(t).toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' });
}

export async function copyText(text: string): Promise<void> {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return;
  }
  const ta = document.createElement('textarea');
  ta.value = text;
  ta.style.position = 'fixed';
  ta.style.opacity = '0';
  document.body.appendChild(ta);
  ta.select();
  const ok = document.execCommand('copy');
  ta.remove();
  if (!ok) throw new Error('copy command rejected');
}
