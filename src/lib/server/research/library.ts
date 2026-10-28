import 'server-only';
import fs from 'node:fs/promises';
import path from 'node:path';
import { mapLimit } from '../proc';
import { brctlCommand } from '@/lib/media-ids';
import { bestLabel, tagKey, type Facets, type FileKind, type LibraryRow } from '@/components/research/types';
import { loadConfig } from './config';
import { getInventory, inventoryGen, kindOf, type InvEntry, type Inventory } from './inventory';
import { getStageA, type StageAData, type StageARec } from './stagea';
import { getVault, mentionsOf, noteObsidianUrl, norm, type Note, type VaultData } from './vault';

// The library: the file inventory joined to Voltamachine Stage A records, plus vault-note mentions.
// Join rule: Stage A recorded /Volumes/Voltamachina/<root>/<rel>; the same relative path under ~/Documents/<root> is
// the same file. Failing an exact (Unicode-normalised, case-insensitive) match, a basename that is unique within the
// root also joins ("name"). Records with no file under ~/Documents become rows of their own (storage "external").

export interface LibRow extends LibraryRow {
  nameN: string;
  titleN: string;
  tagsN: string;
  pathN: string;
  summaryN: string;
  claimsN: string;
  tagKeys: string[];
  matchedBy: 'path' | 'name' | 'none';
  /** All Stage A ids that joined this row (usually one). */
  sids: string[];
}
export interface Library {
  key: string;
  inv: Inventory;
  stageA: StageAData;
  vault: VaultData;
  rows: LibRow[];
  byId: Map<string, LibRow>;
  bySid: Map<string, LibRow>;
  rootLabels: Map<string, string>;
  facets: Facets;
  match: { path: number; name: number; none: number };
  mentions: Map<string, Note[]>;
  builtAt: number;
}

const g = globalThis as unknown as { __voltaResearchLib?: { lib: Library | null; inflight: Promise<Library | null> | null; mirror: Map<string, boolean> } };
const M = (g.__voltaResearchLib ??= { lib: null, inflight: null, mirror: new Map() });

const nfc = (s: string) => s.normalize('NFC').toLowerCase();
const stemOf = (name: string) => name.replace(/\.[A-Za-z0-9]{1,6}$/, '');
const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 3).trimEnd()}...` : s);

async function mirrorExists(files: string[]): Promise<void> {
  const todo = files.filter((f) => !M.mirror.has(f));
  await mapLimit(todo, 16, async (f) => {
    try {
      await fs.stat(f);
      M.mirror.set(f, true);
    } catch {
      M.mirror.set(f, false);
    }
  });
}

function searchFields(r: Omit<LibRow, 'nameN' | 'titleN' | 'tagsN' | 'pathN' | 'summaryN' | 'claimsN'>, rec: StageARec | null) {
  return {
    nameN: norm(stemOf(r.name)),
    titleN: norm(r.title),
    tagsN: norm(r.tags.join(' ')),
    pathN: norm(r.rel),
    summaryN: rec ? norm(rec.summary) : '',
    claimsN: rec ? norm(`${rec.keyClaims.join(' ')} ${rec.methods.join(' ')} ${rec.crossDomainLinks.join(' ')}`) : '',
  };
}

function build(inv: Inventory, stageA: StageAData, vault: VaultData, key: string): Library {
  const cfg = loadConfig();
  const rootLabels = new Map(cfg.roots.map((r) => [r.id, r.label]));
  rootLabels.set('external', 'Other locations');
  const rootPath = new Map(cfg.roots.map((r) => [r.id, r.path]));

  const byKey = new Map<string, InvEntry>();
  const byNfc = new Map<string, InvEntry>();
  const byBase = new Map<string, InvEntry[]>();
  for (const e of inv.entries) {
    byKey.set(`${e.root}\0${e.rel}`, e);
    byNfc.set(`${e.root}\0${nfc(e.rel)}`, e);
    const bk = `${e.root}\0${nfc(e.name)}`;
    (byBase.get(bk) ?? byBase.set(bk, []).get(bk)!).push(e);
  }

  // join
  const joined = new Map<string, { rec: StageARec; by: 'path' | 'name' }[]>();
  const orphans: StageARec[] = [];
  for (const rec of stageA.recs) {
    let e: InvEntry | undefined;
    let by: 'path' | 'name' = 'path';
    if (rec.root && rec.rel) {
      e = byKey.get(`${rec.root}\0${rec.rel}`) ?? byNfc.get(`${rec.root}\0${nfc(rec.rel)}`);
      if (!e) {
        const cands = byBase.get(`${rec.root}\0${nfc(path.basename(rec.rel))}`);
        if (cands?.length === 1) {
          e = cands[0];
          by = 'name';
        }
      }
    }
    if (e) (joined.get(e.id) ?? joined.set(e.id, []).get(e.id)!).push({ rec, by });
    else orphans.push(rec);
  }

  const mirrorOf = (rec: StageARec | undefined): LibraryRow['mirror'] => (rec && rec.sourcePdf ? { path: rec.sourcePdf, exists: M.mirror.get(rec.sourcePdf) === true } : null);

  const rows: LibRow[] = [];
  const match = { path: 0, name: 0, none: 0 };
  const fill = (base: Omit<LibRow, 'nameN' | 'titleN' | 'tagsN' | 'pathN' | 'summaryN' | 'claimsN'>, rec: StageARec | null): LibRow => ({ ...base, ...searchFields(base, rec) });

  for (const e of inv.entries) {
    const js = joined.get(e.id);
    const first = js?.[0];
    const rec = first?.rec ?? null;
    for (const j of js ?? []) match[j.by]++;
    const abs = path.join(rootPath.get(e.root) ?? '', e.rel);
    const storage = e.st === 'i' ? 'icloud' : 'local';
    rows.push(
      fill(
        {
          id: e.id,
          root: e.root,
          rootLabel: rootLabels.get(e.root) ?? e.root,
          rel: e.rel,
          path: abs,
          name: e.name,
          title: rec?.title ?? stemOf(e.name),
          folder: e.folder,
          sub: e.sub,
          ext: e.ext,
          kind: e.kind,
          size: e.size,
          mtime: e.mtime,
          storage,
          brctl: storage === 'icloud' ? brctlCommand(abs) : null,
          sid: rec?.sid ?? null,
          tags: rec?.domainTags ?? [],
          novelty: rec?.novelty ?? null,
          action: rec?.action ?? null,
          contradiction: rec?.hasContradiction ?? false,
          crossDomain: rec?.crossDomainCount ?? null,
          priority: rec?.stageB?.priority ?? null,
          summary: rec ? clip(rec.summary, 320) : null,
          mirror: mirrorOf(rec ?? undefined),
          obsidian: null,
          vaultNotes: 0,
          tagKeys: rec?.tagKeys ?? [],
          matchedBy: first?.by ?? 'none',
          sids: js?.map((x) => x.rec.sid) ?? [],
        },
        rec,
      ),
    );
  }
  for (const rec of orphans) {
    match.none++;
    const rel = rec.rel ?? path.basename(rec.sourcePdf);
    const segs = rel.split('/');
    const ext = path.extname(rel).toLowerCase();
    const root = rec.root ?? 'external';
    rows.push(
      fill(
        {
          id: `a_${rec.sid}`,
          root,
          rootLabel: rootLabels.get(root) ?? root,
          rel,
          path: rec.sourcePdf,
          name: path.basename(rel),
          title: rec.title,
          folder: segs.length > 1 ? segs[0] : '(root)',
          sub: segs.length > 2 ? segs[1] : '',
          ext: ext.replace(/^\./, ''),
          kind: kindOf(ext) as FileKind,
          size: 0,
          mtime: 0,
          storage: 'external',
          brctl: null,
          sid: rec.sid,
          tags: rec.domainTags,
          novelty: rec.novelty,
          action: rec.action,
          contradiction: rec.hasContradiction,
          crossDomain: rec.crossDomainCount,
          priority: rec.stageB?.priority ?? null,
          summary: clip(rec.summary, 320),
          mirror: mirrorOf(rec),
          obsidian: null,
          vaultNotes: 0,
          tagKeys: rec.tagKeys,
          matchedBy: 'none',
          sids: [rec.sid],
        },
        rec,
      ),
    );
  }

  const byId = new Map(rows.map((r) => [r.id, r]));
  const bySid = new Map<string, LibRow>();
  for (const r of rows) for (const sid of r.sids) bySid.set(sid, r);

  // vault mentions (Stage A papers only: title / file-stem matches)
  const mentions = new Map<string, Note[]>();
  for (const rec of stageA.recs) {
    const row = bySid.get(rec.sid);
    const stem = row ? stemOf(row.name) : stemOf(path.basename(rec.sourcePdf));
    const found = mentionsOf(vault, { title: rec.title, stem });
    if (!found.length) continue;
    mentions.set(rec.sid, found);
    if (row) {
      row.vaultNotes = Math.max(row.vaultNotes, found.length);
      row.obsidian ??= noteObsidianUrl(found.find((n) => n.source === 'vault') ?? found[0]);
    }
  }

  return { key, inv, stageA, vault, rows, byId, bySid, rootLabels, facets: facetsOf(rows, rootLabels), match, mentions, builtAt: Date.now() };
}

function facetsOf(rows: LibRow[], rootLabels: Map<string, string>): Facets {
  const roots = new Map<string, number>();
  const folders = new Map<string, number>();
  const kinds = new Map<string, number>();
  const storage = new Map<string, number>();
  const tags = new Map<string, { n: number; variants: Map<string, number> }>();
  const inc = (m: Map<string, number>, k: string) => m.set(k, (m.get(k) ?? 0) + 1);
  for (const r of rows) {
    inc(roots, r.root);
    inc(folders, `${r.root}\0${r.folder}`);
    inc(kinds, r.kind);
    inc(storage, r.storage);
    const seen = new Set<string>();
    for (const t of r.tags) {
      const k = tagKey(t);
      if (!k || seen.has(k)) continue;
      seen.add(k);
      const e = tags.get(k) ?? { n: 0, variants: new Map() };
      e.n++;
      e.variants.set(t, (e.variants.get(t) ?? 0) + 1);
      tags.set(k, e);
    }
  }
  const sorted = <T extends { count: number }>(a: T[]) => a.sort((x, y) => y.count - x.count);
  return {
    roots: sorted([...roots].map(([key, count]) => ({ key, label: rootLabels.get(key) ?? key, count }))),
    folders: sorted([...folders].map(([k, count]) => ({ root: k.split('\0')[0], key: k.split('\0')[1], label: k.split('\0')[1], count }))),
    kinds: sorted([...kinds].map(([key, count]) => ({ key, label: key, count }))),
    storage: sorted([...storage].map(([key, count]) => ({ key, label: key, count }))),
    tags: sorted(
      [...tags].map(([key, e]) => ({ key, label: bestLabel(e.variants, key), count: e.n })),
    ).slice(0, 120),
  };
}

/** The joined library, or null while the very first inventory build is still running. */
export async function getLibrary(opts: { refresh?: boolean; waitMs?: number } = {}): Promise<Library | null> {
  const inv = await getInventory({ refresh: opts.refresh, waitMs: opts.waitMs });
  if (!inv) return null;
  const [stageA, vault] = await Promise.all([getStageA(!!opts.refresh), getVault(!!opts.refresh)]);
  const key = [
    inventoryGen(),
    stageA.recs.length,
    Math.round(stageA.recs.reduce((m, r) => Math.max(m, r.mtimeMs), 0)),
    vault.notes.length,
    vault.notes.reduce((n, x) => n + x.words, 0),
  ].join(':');
  if (M.lib?.key === key) return M.lib;
  if (M.inflight) {
    const l = await M.inflight;
    if (l?.key === key) return l;
  }
  const p = (async () => {
    await mirrorExists([...new Set(stageA.recs.map((r) => r.sourcePdf).filter(Boolean))]);
    const lib = build(inv, stageA, vault, key);
    M.lib = lib;
    return lib;
  })().finally(() => {
    M.inflight = null;
  });
  M.inflight = p;
  return p;
}
