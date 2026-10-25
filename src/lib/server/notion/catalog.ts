import 'server-only';
import type { NotionNoAccess, VpCatalog, VpEpisode, VpGroup, VpGroupKind, VpItem, VpItemKind } from '@/types/notion';
import { cached } from '../sources/cache';
import { NotionError, notionConfigured, pageUrl, stripDashes } from './client';
import { blockPageMentions, blockPlainText } from './markdown';
import { fetchPageMeta, fetchTopBlocks, NO_ACCESS_HINT, TTL_MS } from './pages';

// The "Video Production" page is an index: headings group child pages (or links to pages). We parse it on every
// refresh so new episodes/ideas appear without a code change. The ids below are only a fallback (index unreadable,
// or an expected page missing from it) and a cross-check; titles in the live index always win.

export const VIDEO_PRODUCTION_ID = '0f001eb37cd3417e8ba827621bb94c66';

interface Known {
  id: string;
  title: string;
  group: string; // group label it belongs to when the index does not list it
  kind: VpGroupKind;
}

const KNOWN: Known[] = [
  { id: '4005432465df8113b10ecf878603c57f', title: 'Internet Lore Series — Ep 1 Source Ledger: Discordia / Operation Mindfuck', group: 'The Internet Lore series', kind: 'series' },
  { id: '4005432465df81089ac2d777f3ccdcdd', title: 'Internet Lore Series — Ep 1 Script Outline v0.1: The Joke Religion That Hacked Reality', group: 'The Internet Lore series', kind: 'series' },
  { id: '4005432465df8141b952e1e79ad32e19', title: 'Internet Lore Series — Ep 2 Source Ledger: Tyler / Project Mayhem / #TheGame23', group: 'The Internet Lore series', kind: 'series' },
  { id: '4005432465df81a8bccee879f8b67e96', title: 'Ep 2 Script Outline v0.1 — Tyler: The AI Anonymous Promised', group: 'The Internet Lore series', kind: 'series' },
  { id: '4005432465df81aaa104fd787e339da8', title: 'Internet Lore Series — Ep 3 Source Ledger: CAIMEO / Project Cappuccino', group: 'The Internet Lore series', kind: 'series' },
  { id: '4005432465df81f89899f0f62d6ec131', title: 'Internet Lore Series — Ep 3 Script Outline v0.1: CAIMEO, The Cappuccino Files', group: 'The Internet Lore series', kind: 'series' },
  { id: '4005432465df81f49504ded06a978f78', title: 'CAIMEO_Ep3_Evidence_Insert_Pack', group: 'The Internet Lore series', kind: 'series' },
  { id: '4005432465df81168f81ff1d57a30f53', title: 'Internet Lore Series — Ep 4 Source Ledger: NRO SENTIENT', group: 'The Internet Lore series', kind: 'series' },
  { id: '4005432465df8141a88afac61c322a88', title: 'Ep 4 Script Outline v0.1 — The Machine They Imagined Was Real', group: 'The Internet Lore series', kind: 'series' },
  { id: '3df5432465df805891a4fb8d0cca7129', title: 'The Strangest Times Master Project', group: 'THE STRANGEST TIMES', kind: 'project' },
  { id: '32e5432465df836eb459012222572443', title: 'Agent-Ready (TST-YT) Script Production Specification', group: 'THE STRANGEST TIMES', kind: 'project' },
  { id: '3fc5432465df810d8291f353e696697c', title: 'OMNI_VEO Channel Plan — 90 Days', group: 'THE STRANGEST TIMES', kind: 'project' },
  { id: '3fe5432465df8155846dd7124014448f', title: 'Shorts Batch 1 — Topics, Scripts, Books', group: 'Shorts', kind: 'shorts' },
  { id: '3b45432465df80dbbfa6cb66b70cfb32', title: 'ALIENS AND ANGELS v3 BEAT SEQUENCE S01 S03', group: 'IDEAS', kind: 'ideas' },
  { id: '3df5432465df80e2a2f1d8e5bb0dbea6', title: 'FIVE ANCIENT TEMPLES THAT BEHAVE LIKE MACHINES', group: 'IDEAS', kind: 'ideas' },
  { id: '3df5432465df8041a48ce96d64cf4faf', title: 'THE RULERS', group: 'IDEAS', kind: 'ideas' },
  { id: '3c55432465df81a1b71bd7b6a18bd4fa', title: 'EPSILON YouTube Packet (THE RULERS + THE OTHER SEVEN)', group: 'IDEAS', kind: 'ideas' },
  { id: '3fc5432465df802b9698e7c09a24ad1d', title: 'How to Build an AI Video Business That Pays You Every Month (Full A–Z Guide)', group: 'OPERATIVE ACTION ITEMS', kind: 'playbooks' },
  { id: '3fa5432465df80f9ad4eebc8072a641c', title: 'Faceless Explainer Replication Playbook', group: 'OPERATIVE ACTION ITEMS', kind: 'playbooks' },
  { id: '3df5432465df8085bd9ed9f48bf60380', title: 'Narrative Cadence', group: 'OPERATIVE ACTION ITEMS', kind: 'playbooks' },
];

const itemKind = (title: string): VpItemKind =>
  /source\s+ledger|\bledger\b/i.test(title) ? 'ledger' : /script\s+outline|\boutline\b/i.test(title) ? 'outline' : /evidence/i.test(title) ? 'evidence' : 'page';

function groupKind(label: string, fallback: VpGroupKind): VpGroupKind {
  if (/internet\s*lore/i.test(label)) return 'series';
  if (/operative|action|playbook|youtube\s*\+/i.test(label)) return 'playbooks';
  if (/ideas?/i.test(label)) return 'ideas';
  if (/strangest/i.test(label)) return 'project';
  if (/short|tiktok|reel/i.test(label)) return 'shorts';
  return fallback;
}

const niceLabel = (s: string) =>
  s
    .replace(/^\[|\]$/g, '')
    .trim()
    .replace(/^THE STRANGEST TIMES$/, 'The Strangest Times')
    .replace(/^OPERATIVE ACTION ITEMS$/, 'Operative action items & playbooks')
    .replace(/^IDEAS$/, 'Ideas')
    .replace(/^YOUTUBE \+ EPSILON TIK TOK$/i, 'Operative action items & playbooks')
    .replace(/^INTERNET LORE series$/i, 'The Internet Lore series');

interface Raw {
  group: string;
  heading: string; // heading text exactly as written in Notion
  fallbackKind: VpGroupKind;
  id: string;
  title: string;
  viaMention: boolean; // came from a text link, so its accessibility is unproven
}

async function parseIndex(): Promise<Raw[]> {
  const blocks = await fetchTopBlocks(VIDEO_PRODUCTION_ID);
  const raws: Raw[] = [];
  let group = 'Video Production';
  let heading = '';
  let kind: VpGroupKind = 'other';
  for (const b of blocks) {
    if (b.type === 'heading_1' || b.type === 'heading_2' || b.type === 'heading_3') {
      const text = blockPlainText(b);
      if (/^episode\s*\d+/i.test(text)) continue; // sub-heading of the series; the episode number is read from page titles
      if (!text) continue;
      group = niceLabel(text);
      heading = text.trim();
      kind = groupKind(group, 'other');
      continue;
    }
    if (b.type === 'child_page') {
      raws.push({ group, heading, fallbackKind: kind, id: stripDashes(b.id), title: blockPlainText(b), viaMention: false });
      continue;
    }
    if (b.type === 'paragraph' || b.type === 'bulleted_list_item' || b.type === 'numbered_list_item') {
      for (const m of blockPageMentions(b)) {
        if (m.id === VIDEO_PRODUCTION_ID) continue;
        raws.push({ group, heading, fallbackKind: kind, id: m.id, title: m.title, viaMention: true });
      }
    }
  }
  return raws;
}

async function probe(id: string): Promise<{ ok: true; title: string } | { ok: false; status: number }> {
  try {
    const m = await fetchPageMeta(id);
    return { ok: true, title: m.title };
  } catch (err) {
    if (err instanceof NotionError && err.noAccess) return { ok: false, status: err.status };
    throw err;
  }
}

async function buildCatalog(): Promise<VpCatalog> {
  const inaccessible: NotionNoAccess[] = [];
  let raws: Raw[] = [];
  let source: VpCatalog['source'] = 'index';
  try {
    raws = await parseIndex();
  } catch (err) {
    if (!(err instanceof NotionError)) throw err;
    source = 'fallback';
    inaccessible.push({ id: VIDEO_PRODUCTION_ID, title: 'Video Production (index)', url: pageUrl(VIDEO_PRODUCTION_ID), status: err.status, hint: NO_ACCESS_HINT });
    console.error('[volta notion] could not read the Video Production index; using the built-in page list:', err.message);
  }

  const seen = new Set<string>();
  const byGroup = new Map<string, VpGroup>();
  const addItem = (label: string, kind: VpGroupKind, id: string, title: string, section?: string) => {
    if (seen.has(id)) return;
    seen.add(id);
    const k = /short|tiktok|reel/i.test(title) ? 'shorts' : kind;
    const gLabel = k === 'shorts' ? 'Shorts' : label;
    const key = gLabel.toLowerCase().replace(/[^a-z0-9]+/g, '-');
    const g = byGroup.get(key) ?? { key, label: gLabel, kind: k === 'shorts' ? 'shorts' : groupKind(gLabel, kind), items: [] };
    byGroup.set(key, g);
    g.items.push({ id, title, url: pageUrl(id), kind: itemKind(title), ...(section ? { section } : {}) });
  };

  // Resolve untitled child pages and check text-linked pages are actually readable.
  for (const r of raws) {
    let title = r.title;
    if (!title || r.viaMention) {
      const p = await probe(r.id);
      if (!p.ok) {
        inaccessible.push({ id: r.id, title: title || 'Linked page', url: pageUrl(r.id), status: p.status, hint: NO_ACCESS_HINT });
        continue;
      }
      title = p.title || title;
    }
    addItem(r.group, r.fallbackKind, r.id, title, r.heading);
  }

  // Fallback / cross-check: expected pages the index did not yield.
  for (const k of KNOWN) {
    if (seen.has(k.id)) continue;
    if (source === 'index') {
      const p = await probe(k.id);
      if (!p.ok) {
        inaccessible.push({ id: k.id, title: k.title, url: pageUrl(k.id), status: p.status, hint: NO_ACCESS_HINT });
        continue;
      }
      addItem(niceLabel(k.group), k.kind, k.id, p.title || k.title, k.group);
    } else {
      addItem(niceLabel(k.group), k.kind, k.id, k.title, k.group);
    }
  }

  // Merge groups that map to the same rail section (OPERATIVE ACTION ITEMS + its YouTube sub-heading).
  const groups = [...byGroup.values()].filter((g) => g.items.length);

  // Episodes: every item of a series group whose title says "Ep N".
  const eps = new Map<number, VpEpisode>();
  for (const g of groups) {
    if (g.kind !== 'series') continue;
    const rest: VpItem[] = [];
    for (const it of g.items) {
      const m = it.title.match(/(?:^|[^A-Za-z])Ep(?:isode)?\.?\s*(\d+)/i);
      if (!m) {
        rest.push(it);
        continue;
      }
      const n = Number(m[1]);
      const e = eps.get(n) ?? { key: `ep${n}`, number: n, series: 'Internet Lore', title: '', outline: null, ledger: null, evidence: [] };
      if (it.kind === 'outline') e.outline = it;
      else if (it.kind === 'ledger') e.ledger = it;
      else e.evidence.push(it);
      eps.set(n, e);
    }
    g.items = rest;
  }
  const episodes = [...eps.values()].sort((a, b) => a.number - b.number);
  for (const e of episodes) e.title = `Ep ${e.number} · ${episodeSubject(e)}`;

  const order: VpGroupKind[] = ['series', 'project', 'shorts', 'ideas', 'playbooks', 'other'];
  groups.sort((a, b) => order.indexOf(a.kind) - order.indexOf(b.kind));
  return { groups: groups.filter((g) => g.items.length), episodes, inaccessible, source, fetchedAt: new Date().toISOString(), indexUrl: pageUrl(VIDEO_PRODUCTION_ID) };
}

/** "Ep 3 Source Ledger: CAIMEO / Project Cappuccino" → "CAIMEO"; outline titles carry the subject after ":" or "—". */
function episodeSubject(e: VpEpisode): string {
  const t = (e.ledger ?? e.outline)?.title ?? '';
  const after = t.replace(/^.*?(?:^|[^A-Za-z])Ep(?:isode)?\.?\s*\d+\s*(?:Source Ledger|Script Outline(?: v[\d.]+)?)?\s*[:—–-]\s*/i, '');
  const head = after.split(/\s*[/:,—–]\s*/)[0].trim();
  return head || `Episode ${e.number}`;
}

export function getCatalog(opts: { force?: boolean } = {}): Promise<VpCatalog> {
  if (!notionConfigured()) throw new NotionError('NOTION_TOKEN is not set in .env.local.', 503, 'not_configured');
  return cached('notion:catalog', TTL_MS, buildCatalog, { maxStaleMs: 24 * 3_600_000, force: opts.force });
}

export const KNOWN_PAGE_IDS = KNOWN.map((k) => k.id);
