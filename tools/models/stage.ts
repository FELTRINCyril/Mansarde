/*
 * Stage 1 of the models build (spec 4.1): fetches every source, converts each model into a
 * normalized, optimized GLB under stage/, and writes stage/index.json (one StagedItem per model,
 * with the reason of each rejection). Already converted models are kept unless their conversion
 * options changed; `--force` converts everything again.
 *   node stage.ts [--force] [--only=<source>]
 */
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import sharp, { type OverlayOptions } from 'sharp';
import { BUDGET, convertModel, type ConvertOptions } from './lib/convert.ts';
import { CACHE, fetchCached, unzipTo } from './lib/fetch.ts';
import { fetchPolyhaven, listPolyhaven } from './lib/polyhaven.ts';
import { readSh3fLibrary } from './lib/sh3f.ts';
import type { RawItem, StagedItem } from './lib/types.ts';

const ROOT = import.meta.dirname;
export const STAGE = path.join(ROOT, 'stage');
const sources = JSON.parse(readFileSync(path.join(ROOT, 'sources.json'), 'utf8'));
const force = process.argv.includes('--force');
const only = process.argv.find((a) => a.startsWith('--only='))?.slice(7);

interface Curation {
  /** Per key: conversion overrides. */
  override?: Record<string, { rotateY?: number }>;
  /** Base colors by material name (Quaternius). */
  materialColors?: Record<string, string>;
  /** Poly Haven: ids to fetch. */
  keep?: Record<string, unknown>;
}
const curation = (name: string): Curation => {
  const f = path.join(ROOT, 'curation', `${name}.json`);
  return existsSync(f) ? (JSON.parse(readFileSync(f, 'utf8')) as Curation) : {};
};

async function kenney(): Promise<RawItem[]> {
  const s = sources.kenney;
  const dir = unzipTo(await fetchCached(s.url, 'kenney.zip'), path.join(CACHE, 'kenney'));
  const models = path.join(dir, 'Models', 'GLTF format');
  return readdirSync(models)
    .filter((f) => f.endsWith('.glb'))
    .sort()
    .map((f) => ({ source: 'kenney', library: 'kenney', key: path.basename(f, '.glb'), sourceId: path.basename(f, '.glb'), name: path.basename(f, '.glb'), creator: s.author, license: s.license, pageUrl: s.page, modelPath: path.join(models, f) }));
}

async function quaternius(): Promise<RawItem[]> {
  const s = sources.quaternius;
  const dir = unzipTo(await fetchCached(s.url, 'quaternius.zip'), path.join(CACHE, 'quaternius'));
  const objDir = path.join(dir, 'Furniture Pack by @Quaternius', 'OBJ');
  return readdirSync(objDir)
    .filter((f) => f.endsWith('.obj'))
    .sort()
    .map((f) => ({ source: 'quaternius', library: 'quaternius', key: path.basename(f, '.obj'), sourceId: path.basename(f, '.obj'), name: path.basename(f, '.obj'), creator: s.author, license: s.license, pageUrl: s.page, modelPath: path.join(objDir, f) }));
}

async function sh3d(): Promise<RawItem[]> {
  const out: RawItem[] = [];
  for (const [lib, l] of Object.entries(sources.sh3d.libraries) as Array<[string, { url: string; license: string }]>) {
    const zip = await fetchCached(l.url, `sh3d-${lib}.zip`);
    out.push(...readSh3fLibrary(zip, path.join(CACHE, `sh3d-${lib}`), lib, l.license));
  }
  return out;
}

async function polyhaven(): Promise<RawItem[]> {
  const assets = await listPolyhaven();
  mkdirSync(STAGE, { recursive: true });
  writeFileSync(path.join(STAGE, 'polyhaven-candidates.json'), JSON.stringify(assets, null, 1));
  await candidateSheets(assets);
  const keep = Object.keys(curation('polyhaven').keep ?? {});
  const out: RawItem[] = [];
  for (const id of keep) {
    const a = assets[id];
    if (!a) {
      console.warn(`polyhaven: ${id} is no longer listed`);
      continue;
    }
    try {
      out.push(await fetchPolyhaven(id, a, sources.polyhaven.resolution));
    } catch (e) {
      console.warn(`polyhaven: ${id} skipped: ${(e as Error).message}`);
    }
  }
  return out;
}

/** Contact sheets of the Poly Haven thumbnails, to choose what to keep (stage/sheets/ph-candidates-<n>.png). */
export async function candidateSheets(assets: Record<string, { thumbnail_url: string; polycount?: number }>): Promise<void> {
  const ids = Object.keys(assets).sort();
  const dir = path.join(STAGE, 'sheets');
  mkdirSync(dir, { recursive: true });
  const cell = 128, cols = 8, rows = 6, label = 16;
  for (let page = 0; page * cols * rows < ids.length; page++) {
    const file = path.join(dir, `ph-candidates-${page + 1}.png`);
    if (existsSync(file) && !force) continue;
    const slice = ids.slice(page * cols * rows, (page + 1) * cols * rows);
    const composites: OverlayOptions[] = [];
    for (const [i, id] of slice.entries()) {
      const url = assets[id]!.thumbnail_url.replace(/width=\d+&height=\d+/, 'width=128&height=128').replace('format=webp', 'format=png');
      const thumb = await fetchCached(url, path.join('ph-thumbs', `${id}.png`)).catch(() => null);
      const x = (i % cols) * cell, y = Math.floor(i / cols) * (cell + label);
      if (thumb) composites.push({ input: await sharp(thumb).resize(cell, cell, { fit: 'contain', background: '#ffffff' }).toBuffer(), left: x, top: y });
      composites.push({ input: Buffer.from(textSvg(`${id} ${assets[id]!.polycount ?? ''}`, cell, label)), left: x, top: y + cell });
    }
    await sharp({ create: { width: cols * cell, height: rows * (cell + label), channels: 3, background: '#ffffff' } }).composite(composites).png().toFile(file);
  }
}

export function textSvg(text: string, w: number, h: number): string {
  const esc = text.replace(/&/g, '&amp;').replace(/</g, '&lt;');
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}"><text x="2" y="${h - 4}" font-family="Helvetica" font-size="9" fill="#000">${esc}</text></svg>`;
}

// the budget is part of the key: changing it converts every model again
const optsHash = (o: ConvertOptions): string => createHash('sha1').update(JSON.stringify({ ...o, budget: BUDGET })).digest('hex').slice(0, 10);

async function stageItem(item: RawItem, prev: StagedItem | undefined): Promise<StagedItem> {
  const over = curation(item.source).override?.[item.library === item.source ? item.key : `${item.library}/${item.key}`] ?? {};
  const opts: ConvertOptions = { textureSize: item.source === 'polyhaven' ? 512 : 256, modelRotation: item.modelRotation, rotateY: over.rotateY, materialColors: curation(item.source).materialColors };
  const glbRel = path.join(item.source, item.library === item.source ? '' : item.library, `${item.key}.glb`);
  const glbAbs = path.join(STAGE, glbRel);
  const hash = optsHash(opts) + ':' + createHash('sha1').update(readFileSync(item.modelPath)).digest('hex').slice(0, 10);
  if (!force && prev && (prev as StagedItem & { hash?: string }).hash === hash && (prev.ok ? existsSync(glbAbs) : true)) return { ...prev, ...item, ok: prev.ok, reason: prev.reason };
  if (item.doorOrWindow) return { ...item, ok: false, reason: 'door or window', hash } as StagedItem;
  try {
    let r = await convertModel(item.modelPath, opts);
    if (r.glb.byteLength > BUDGET.bytes) r = await convertModel(item.modelPath, { ...opts, textureSize: 128 });
    const base = { ...item, hash, bytes: r.glb.byteLength, tris: r.tris, materials: r.materials, outline: r.outline, detail: r.detail, natural: r.natural };
    if (r.glb.byteLength > BUDGET.bytes) return { ...base, ok: false, reason: `too heavy: ${Math.round(r.glb.byteLength / 1024)} KB` };
    if (r.materials > BUDGET.materials) return { ...base, ok: false, reason: `too many materials: ${r.materials}` };
    if (r.outline.length === 0) return { ...base, ok: false, reason: 'empty outline' };
    mkdirSync(path.dirname(glbAbs), { recursive: true });
    writeFileSync(glbAbs, r.glb);
    return { ...base, ok: true, glb: glbRel };
  } catch (e) {
    return { ...item, ok: false, reason: `conversion failed: ${(e as Error).message.split('\n')[0]}`, hash } as StagedItem;
  }
}

async function pool<T, R>(items: T[], n: number, fn: (t: T, i: number) => Promise<R>): Promise<R[]> {
  const out = new Array<R>(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: n }, async () => {
      while (next < items.length) {
        const i = next++;
        out[i] = await fn(items[i]!, i);
      }
    }),
  );
  return out;
}

async function main(): Promise<void> {
  const indexFile = path.join(STAGE, 'index.json');
  const previous: StagedItem[] = existsSync(indexFile) ? JSON.parse(readFileSync(indexFile, 'utf8')) : [];
  const prevByKey = new Map(previous.map((p) => [`${p.source}/${p.library}/${p.key}`, p]));
  const fetchers: Record<string, () => Promise<RawItem[]>> = { kenney, quaternius, sh3d, polyhaven };
  const raw: RawItem[] = [];
  for (const [name, f] of Object.entries(fetchers)) {
    if (only && only !== name) {
      raw.push(...previous.filter((p) => p.source === name));
      continue;
    }
    const items = await f();
    console.log(`${name}: ${items.length} models`);
    raw.push(...items);
  }
  // two models writing the same GLB would mix one's catalog data with the other's model
  const files = new Map<string, string>();
  for (const item of raw) {
    const f = `${item.source}/${item.library}/${item.key}`;
    if (files.has(f)) throw new Error(`two models share ${f}: ${files.get(f)} and ${item.sourceId}`);
    files.set(f, item.sourceId);
  }
  let done = 0;
  const staged = await pool(raw, 4, async (item) => {
    const prev = prevByKey.get(`${item.source}/${item.library}/${item.key}`);
    const r = only && only !== item.source ? (prev as StagedItem) : await stageItem(item, prev);
    if (++done % 50 === 0) console.log(`  ${done} / ${raw.length}`);
    return r;
  });
  mkdirSync(STAGE, { recursive: true });
  writeFileSync(indexFile, JSON.stringify(staged, null, 1));
  const bySource = new Map<string, { ok: number; ko: number }>();
  for (const s of staged) {
    const c = bySource.get(s.source) ?? { ok: 0, ko: 0 };
    if (s.ok) c.ok++;
    else c.ko++;
    bySource.set(s.source, c);
  }
  for (const [k, c] of bySource) console.log(`${k}: ${c.ok} staged, ${c.ko} rejected`);
}

if (process.argv[1] === import.meta.filename) await main();
