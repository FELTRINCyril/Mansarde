/*
 * Stage 3 of the models build (spec 4.2, 4.3, 5): merges the staged models with the curation,
 * renders the icons at the catalog size, and publishes
 *   public/models/<id>.glb, public/models/icons/<id>.webp, public/models/LICENSES/*.txt,
 *   public/models/top/<id>.webp (plan top view), src/catalog/generated/models.json, src/catalog/generated/credits.json,
 *   tools/models/ids.lock (published ids, never shrinks), tools/models/report.md.
 *   node publish.ts [--sheets]   (--sheets: also contact sheets of the published models, stage/review/)
 */
import { createHash } from 'node:crypto';
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import { cleanName, slug } from './lib/names.ts';
import { autoExclusion, categoryOf, CEILING_HEIGHT, flagsOf, normalizeLicense, poseOf, type Category, type Pose } from './lib/rules.ts';
import type { StagedItem } from './lib/types.ts';
import { contactSheets, renderAll } from './render/render.ts';

const ROOT = import.meta.dirname;
const APP = path.resolve(ROOT, '..', '..');
const STAGE = path.join(ROOT, 'stage');
const PUBLIC = path.join(APP, 'public', 'models');
const GENERATED = path.join(APP, 'src', 'catalog', 'generated');
const ICON_CACHE = path.join(STAGE, 'icons');
const ICON_SIZE = 96;
/** Top view of the plan: rendered at TOP_RENDER px on its longest side, published at TOP_SIZE px. */
const TOP_RENDER = 768;
const TOP_SIZE = 384;

interface Entry {
  /** Explicit catalog id, when the default one collides with another model's. */
  id?: string;
  name?: string;
  category?: Category;
  width?: number;
  depth?: number;
  height?: number;
  pose?: Pose;
  elevation?: number;
  ceiling?: boolean;
  acceptsUnder?: boolean;
  carriesOnTop?: boolean;
}
interface Curation {
  keep?: Record<string, Entry>;
  /** By source reference (key, or <library>/<key> for Sweet Home 3D): reason. */
  exclude?: Record<string, string>;
  /** By catalog id (as shown on the review sheets): reason. */
  excludeIds?: Record<string, string>;
  override?: Record<string, Entry & { rotateY?: number }>;
}
const curation = (name: string): Curation => {
  const f = path.join(ROOT, 'curation', `${name}.json`);
  return existsSync(f) ? (JSON.parse(readFileSync(f, 'utf8')) as Curation) : {};
};

export interface Published {
  id: string;
  name: string;
  category: Category;
  width: number;
  depth: number;
  height: number;
  pose: Pose;
  elevation?: number;
  acceptsUnder?: boolean;
  carriesOnTop?: boolean;
  style: 'simple' | 'realiste';
  credit: { source: string; library: string; author: string; license: string; url?: string };
  glb: string;
  bytes: number;
  priority: number;
  /** The source model: source/library/catalog id in its source (locked with the id). */
  sourceRef: string;
}

const SH3D_LIBS: Record<string, { short: string; label: string }> = {
  'blendswap-cc0': { short: 'bs0', label: 'BlendSwap CC-0' },
  'blendswap-ccby': { short: 'bsby', label: 'BlendSwap CC-BY' },
  scopia: { short: 'scopia', label: 'Scopia' },
  katorlegaz: { short: 'kl', label: 'KatorLegaz' },
  contributions: { short: 'contrib', label: 'Contributions' },
  lucapresidente: { short: 'lp', label: 'LucaPresidente' },
};
/** Kept first when two sources give the same object. */
const PRIORITY: Record<string, number> = { kenney: 0, quaternius: 1, polyhaven: 2, 'blendswap-cc0': 3, katorlegaz: 4, scopia: 5, 'blendswap-ccby': 6, contributions: 7, lucapresidente: 8 };
/**
 * What the credits show for each library (spec 9): its license and the attribution the license
 * requires, read in the notice the library ships (copied to public/models/LICENSES), its page.
 * Every model is an adaptation (converted, simplified, textures reduced): the dialog says so.
 */
interface LibraryCredit { source: string; license: string; licenseUrl: string; attribution?: string; notice?: string; page: string }
const CC0 = 'https://creativecommons.org/publicdomain/zero/1.0/deed.fr';
const CCBY3 = 'https://creativecommons.org/licenses/by/3.0/deed.fr';
const FAL = 'https://artlibre.org/licence/lal/';
const SH3D_PAGE = 'https://www.sweethome3d.com/importModels.jsp';
const LIBRARIES: Record<string, LibraryCredit> = {
  'Kenney Furniture Kit': { source: 'Kenney', license: 'CC0', licenseUrl: CC0, attribution: 'Kenney (www.kenney.nl)', notice: 'kenney.txt', page: 'https://kenney.nl/assets/furniture-kit' },
  'Quaternius Furniture Pack': { source: 'Quaternius', license: 'CC0', licenseUrl: CC0, attribution: 'Quaternius', page: 'https://opengameart.org/content/furniture-low-poly' },
  'Poly Haven': { source: 'Poly Haven', license: 'CC0', licenseUrl: CC0, page: 'https://polyhaven.com/models' },
  'BlendSwap CC-0': { source: 'Sweet Home 3D', license: 'CC0', licenseUrl: CC0, notice: 'sweethome3d-blendswap-cc0.txt', page: SH3D_PAGE },
  'BlendSwap CC-BY': { source: 'Sweet Home 3D', license: 'CC-BY 3.0', licenseUrl: CCBY3, notice: 'sweethome3d-blendswap-ccby.txt', page: SH3D_PAGE },
  Scopia: { source: 'Sweet Home 3D', license: 'CC-BY 3.0', licenseUrl: CCBY3, attribution: 'Space Mushrooms <info@sweethome3d.com> et Scopia Visual Interfaces Systems, s.l. (http://www.scopia.es)', notice: 'sweethome3d-scopia.txt', page: SH3D_PAGE },
  KatorLegaz: { source: 'Sweet Home 3D', license: 'CC-BY 3.0 US', licenseUrl: 'https://creativecommons.org/licenses/by/3.0/us/', attribution: '(C) Copyright Andrew Kator & Jennifer Legaz', notice: 'sweethome3d-katorlegaz.txt', page: SH3D_PAGE },
  Contributions: { source: 'Sweet Home 3D', license: 'Free Art License 1.3', licenseUrl: FAL, notice: 'sweethome3d-contributions.txt', page: SH3D_PAGE },
  LucaPresidente: { source: 'Sweet Home 3D', license: 'Free Art License 1.3', licenseUrl: FAL, notice: 'sweethome3d-lucapresidente.txt', page: SH3D_PAGE },
};

const SOURCE_LABEL: Record<string, string> = { kenney: 'Kenney Furniture Kit', quaternius: 'Quaternius Furniture Pack', polyhaven: 'Poly Haven', sh3d: 'Sweet Home 3D' };

/** excludeIds entries that matched a model (the others are reported as typos). */
const usedExcludeIds = new Set<string>();

const round = (v: number): number => Math.round(v * 10) / 10;

/** The catalog entry of a staged model, or the reason it is left out. */
function toEntry(s: StagedItem, problems: string[]): Published | string {
  const cur = curation(s.source);
  const ref = s.source === 'sh3d' ? `${s.library}/${s.key}` : s.key;
  if (cur.exclude?.[ref]) return `curation: ${cur.exclude[ref]}`;
  let e: Required<Pick<Entry, 'name' | 'category' | 'width' | 'depth' | 'height' | 'pose'>> & Entry;
  if (s.source === 'sh3d') {
    const category = categoryOf(s);
    if (!category) return `category ${s.category}`;
    const why = autoExclusion(s);
    if (why) return why;
    const over = cur.override?.[ref] ?? {};
    const cat = over.category ?? category;
    const merged = { ...s, width: over.width ?? s.width, depth: over.depth ?? s.depth, height: over.height ?? s.height };
    const p = poseOf(merged, cat);
    e = { name: cleanName(s.nameFr ?? s.name), category: cat, width: merged.width!, depth: merged.depth!, height: merged.height!, pose: p.pose, ...(p.elevation !== undefined ? { elevation: p.elevation } : {}), ...flagsOf(merged, cat, p.pose), ...over };
  } else {
    const k = cur.keep?.[s.key];
    if (!k) {
      problems.push(`${s.source}/${s.key}: neither kept nor excluded in curation/${s.source}.json`);
      return 'uncurated';
    }
    const n = s.natural!;
    const size = s.source === 'polyhaven' ? { width: round(n.w * 100), depth: round(n.d * 100), height: round(n.h * 100) } : {};
    e = { pose: 'floor', ...size, ...k } as typeof e;
    if (!(e.width > 0 && e.depth > 0 && e.height > 0)) {
      problems.push(`${s.source}/${s.key}: no size`);
      return 'no size';
    }
  }
  if (e.ceiling) e = { ...e, pose: 'floor', elevation: Math.max(0, CEILING_HEIGHT - e.height) };
  const lib = SH3D_LIBS[s.library];
  const id = e.id ?? (s.source === 'kenney' ? `kn-${slug(s.key)}` : s.source === 'quaternius' ? `qt-${slug(s.key)}` : s.source === 'polyhaven' ? `ph-${s.key.toLowerCase().replace(/[^a-z0-9]+/g, '-')}` : `sh-${lib!.short}-${slug(s.key)}`);
  if (cur.excludeIds?.[id]) {
    usedExcludeIds.add(id);
    return `curation: ${cur.excludeIds[id]}`;
  }
  const normalized = normalizeLicense(s.license);
  // KatorLegaz: Creative Commons Attribution 3.0 United States (its notice), not the unported 3.0
  const license = normalized === 'CC-BY 3.0' && s.library === 'katorlegaz' ? 'CC-BY 3.0 US' : normalized;
  if (!license) return `license ${s.license}`;
  return {
    id,
    name: cleanName(e.name),
    category: e.category,
    width: round(e.width),
    depth: round(e.depth),
    height: round(e.height),
    pose: e.pose,
    ...(e.elevation !== undefined && e.elevation > 0 ? { elevation: round(e.elevation) } : {}),
    ...(e.acceptsUnder ? { acceptsUnder: true } : {}),
    ...(e.carriesOnTop ? { carriesOnTop: true } : {}),
    style: s.source === 'kenney' || s.source === 'quaternius' ? 'simple' : 'realiste',
    credit: { source: SOURCE_LABEL[s.source]!, library: lib?.label ?? SOURCE_LABEL[s.source]!, author: s.creator ?? '', license, ...(s.pageUrl ? { url: s.pageUrl } : {}) },
    glb: path.join(STAGE, s.glb!),
    bytes: s.bytes!,
    priority: PRIORITY[s.library] ?? 9,
    sourceRef: `${s.source}/${s.library}/${s.sourceId}`,
  };
}

const fold = (s: string): string => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
const close = (a: number, b: number): boolean => Math.abs(a - b) <= 0.05 * Math.max(a, b);

/** Drops the same object found in several sources (same name, sizes within 5 %), keeping the best source. */
function dedupe(list: Published[]): { kept: Published[]; dropped: Array<[Published, Published]> } {
  const sorted = [...list].sort((a, b) => a.priority - b.priority || a.id.localeCompare(b.id));
  const kept: Published[] = [];
  const dropped: Array<[Published, Published]> = [];
  for (const p of sorted) {
    const twin = kept.find((k) => fold(k.name) === fold(p.name) && close(k.width, p.width) && close(k.depth, p.depth) && close(k.height, p.height));
    if (twin) dropped.push([p, twin]);
    else kept.push(p);
  }
  return { kept, dropped };
}

/** "Chaise", "Chaise 2", ... when one category holds several objects of the same name. */
function numberNames(list: Published[]): void {
  const groups = new Map<string, Published[]>();
  for (const p of list) {
    const k = `${p.category}|${fold(p.name)}`;
    groups.set(k, [...(groups.get(k) ?? []), p]);
  }
  for (const g of groups.values()) {
    if (g.length < 2) continue;
    g.sort((a, b) => a.priority - b.priority || a.id.localeCompare(b.id));
    g.forEach((p, i) => {
      if (i > 0) p.name = `${p.name} ${i + 1}`;
    });
  }
}

/** Icons (3/4 view) or plan top views of the models, rendered once and cached by model and size. */
async function renders(list: Published[], top: boolean): Promise<Map<string, Buffer>> {
  const cache = top ? path.join(STAGE, 'tops') : ICON_CACHE;
  mkdirSync(cache, { recursive: true });
  const keyOf = (p: Published) => createHash('sha1').update(readFileSync(p.glb)).update(`${p.width}|${p.height}|${p.depth}|${top ? `top-${TOP_RENDER}-v1` : 'v1'}`).digest('hex');
  const out = new Map<string, Buffer>();
  const missing: Published[] = [];
  for (const p of list) {
    const f = path.join(cache, `${keyOf(p)}.png`);
    if (existsSync(f)) out.set(p.id, readFileSync(f));
    else missing.push(p);
  }
  if (missing.length) {
    console.log(`rendering ${missing.length} ${top ? 'top views' : 'icons'}`);
    const res = await renderAll(
      missing.map((p) => ({ glb: p.glb, w: p.width, h: p.height, d: p.depth, ...(top ? { top: TOP_RENDER } : {}) })),
      (n) => n % 100 === 0 && console.log(`  ${n} / ${missing.length}`),
    );
    missing.forEach((p, i) => {
      const png = res[i]!.png;
      if (!png) return;
      writeFileSync(path.join(cache, `${keyOf(p)}.png`), png);
      out.set(p.id, png);
    });
  }
  return out;
}

function tsLiteral(v: unknown): string {
  return JSON.stringify(v);
}

async function main(): Promise<void> {
  const index: StagedItem[] = JSON.parse(readFileSync(path.join(STAGE, 'index.json'), 'utf8'));
  const problems: string[] = [];
  const rejected: Array<[string, string]> = [];
  const candidates: Published[] = [];
  const seen = new Set<string>();
  for (const s of index) {
    const ref = `${s.source}/${s.library}/${s.key}`;
    if (seen.has(ref)) continue; // listed twice by its library
    seen.add(ref);
    if (!s.ok) {
      rejected.push([ref, s.reason ?? 'not staged']);
      continue;
    }
    const r = toEntry(s, problems);
    if (typeof r === 'string') rejected.push([ref, r]);
    else candidates.push(r);
  }
  for (const [name, c] of Object.entries({ kenney: curation('kenney'), quaternius: curation('quaternius'), polyhaven: curation('polyhaven') })) {
    for (const key of Object.keys(c.keep ?? {})) if (!index.some((s) => s.source === name && s.key === key && s.ok)) rejected.push([`${name}/${key}`, 'kept in curation but not staged']);
  }
  // an exclusion that matches no model is a typo: the object it meant is still in the catalog
  for (const [name, c] of Object.entries({ kenney: curation('kenney'), quaternius: curation('quaternius'), polyhaven: curation('polyhaven'), sh3d: curation('sh3d') })) {
    for (const id of Object.keys(c.excludeIds ?? {})) if (!usedExcludeIds.has(id)) problems.push(`curation/${name}.json: excludeIds ${id} matches no model`);
  }
  if (problems.length) {
    console.error(problems.join('\n'));
    process.exit(1);
  }
  const { kept, dropped } = dedupe(candidates);
  for (const [p, twin] of dropped) rejected.push([p.id, `duplicate of ${twin.id}`]);
  const ids = new Set<string>();
  for (const p of kept) {
    if (ids.has(p.id)) throw new Error(`duplicate id ${p.id}: give one of the models an explicit id in its curation`);
    ids.add(p.id);
  }
  numberNames(kept);
  const pngs = await renders(kept, false);
  const tops = await renders(kept, true);
  const published = kept.filter((p) => {
    if (pngs.has(p.id) && tops.has(p.id)) return true;
    rejected.push([p.id, pngs.has(p.id) ? 'top view render failed' : 'icon render failed']);
    return false;
  });
  published.sort((a, b) => a.category.localeCompare(b.category, 'fr') || a.name.localeCompare(b.name, 'fr') || a.id.localeCompare(b.id));

  // files
  mkdirSync(path.join(PUBLIC, 'icons'), { recursive: true });
  mkdirSync(path.join(PUBLIC, 'top'), { recursive: true });
  const want = new Set(published.map((p) => p.id));
  for (const f of readdirSync(path.join(PUBLIC, 'top'))) if (f.endsWith('.webp') && !want.has(f.slice(0, -5))) rmSync(path.join(PUBLIC, 'top', f));
  // the plan used to draw outlines (public/models/outlines.json): replaced by the top views
  rmSync(path.join(PUBLIC, 'outlines.json'), { force: true });
  for (const f of readdirSync(PUBLIC)) if (f.endsWith('.glb') && !want.has(f.slice(0, -4))) rmSync(path.join(PUBLIC, f));
  for (const f of readdirSync(path.join(PUBLIC, 'icons'))) if (f.endsWith('.webp') && !want.has(f.slice(0, -5))) rmSync(path.join(PUBLIC, 'icons', f));
  // integrity: each published GLB is the one staged for its model, and no two models share one
  const seenGlb = new Map<string, string>();
  for (const p of published) {
    const bytes = readFileSync(p.glb);
    if (bytes.length !== p.bytes) throw new Error(`${p.id}: ${p.glb} has ${bytes.length} bytes, its model was staged with ${p.bytes}`);
    const hash = createHash('sha1').update(bytes).digest('hex');
    if (seenGlb.has(hash)) throw new Error(`${p.id} and ${seenGlb.get(hash)} would publish the same GLB`);
    seenGlb.set(hash, p.id);
  }
  for (const p of published) {
    copyFileSync(p.glb, path.join(PUBLIC, `${p.id}.glb`));
    await sharp(pngs.get(p.id)!).resize(ICON_SIZE, ICON_SIZE).webp({ quality: 82, alphaQuality: 90 }).toFile(path.join(PUBLIC, 'icons', `${p.id}.webp`));
    // the image covers the footprint exactly: the plan stretches it to the object's w x d
    await sharp(tops.get(p.id)!).resize(TOP_SIZE, TOP_SIZE, { fit: 'inside', withoutEnlargement: true }).webp({ quality: 80, alphaQuality: 90 }).toFile(path.join(PUBLIC, 'top', `${p.id}.webp`));
  }
  mkdirSync(path.join(PUBLIC, 'LICENSES'), { recursive: true });
  for (const lib of Object.keys(SH3D_LIBS)) copyFileSync(path.join(ROOT, '.cache', `sh3d-${lib}`, 'LICENSE.TXT'), path.join(PUBLIC, 'LICENSES', `sweethome3d-${lib}.txt`));
  copyFileSync(path.join(ROOT, '.cache', 'kenney', 'License.txt'), path.join(PUBLIC, 'LICENSES', 'kenney.txt'));

  // generated modules
  mkdirSync(GENERATED, { recursive: true });
  const rows = published.map((p) =>
    tsLiteral({ id: p.id, name: p.name, category: p.category, width: p.width, depth: p.depth, height: p.height, pose: p.pose, ...(p.elevation !== undefined ? { elevation: p.elevation } : {}), ...(p.acceptsUnder ? { acceptsUnder: true } : {}), ...(p.carriesOnTop ? { carriesOnTop: true } : {}), style: p.style }),
  );
  // JSON (not TS literals): typed loosely by TypeScript, parsed fast by the browser (JSON.parse)
  writeFileSync(path.join(GENERATED, 'models.json'), `[\n${rows.join(',\n')}\n]\n`);
  for (const old of ['models.ts', 'credits.ts']) rmSync(path.join(GENERATED, old), { force: true });
  const credits = published.map((p) => `  ${tsLiteral(p.id)}: ${tsLiteral(p.credit)}`);
  const libraries = Object.entries(LIBRARIES).filter(([name]) => published.some((p) => p.credit.library === name));
  for (const p of published) if (!LIBRARIES[p.credit.library]) throw new Error(`no LIBRARIES entry for ${p.credit.library}`);
  writeFileSync(
    path.join(GENERATED, 'credits.json'),
    `{\n"libraries": {\n${libraries.map(([k, v]) => `  ${tsLiteral(k)}: ${tsLiteral(v)}`).join(',\n')}\n},\n"models": {\n${credits.join(',\n')}\n}\n}\n`,
  );

  // ids.lock: every id ever published stays, and keeps naming the same source model (a saved
  // project must never open another object under the same id). One line: id <TAB> source model.
  const lockFile = path.join(ROOT, 'ids.lock');
  const lock = new Map<string, string>();
  if (existsSync(lockFile)) {
    for (const line of readFileSync(lockFile, 'utf8').split('\n').filter(Boolean)) {
      const [id, ref = ''] = line.split('\t');
      lock.set(id!, ref);
    }
  }
  for (const p of published) {
    const was = lock.get(p.id);
    if (was && was !== p.sourceRef) throw new Error(`ids.lock: ${p.id} was ${was}, now ${p.sourceRef}: give the new model another id`);
    lock.set(p.id, p.sourceRef);
  }
  writeFileSync(lockFile, [...lock].sort(([a], [b]) => a.localeCompare(b)).map(([id, ref]) => `${id}\t${ref}`).join('\n') + '\n');

  writeReport(published, rejected);
  if (process.argv.includes('--sheets')) {
    const dir = path.join(STAGE, 'review');
    rmSync(dir, { recursive: true, force: true });
    mkdirSync(dir, { recursive: true });
    const groups = new Map<string, Published[]>();
    for (const p of published) {
      const g = p.id.split('-').slice(0, p.id.startsWith('sh-') ? 2 : 1).join('-');
      groups.set(g, [...(groups.get(g) ?? []), p]);
    }
    for (const [g, list] of groups) await contactSheets(list.map((p) => ({ label: `${p.id.slice(g.length + 1)} | ${p.name}`, png: pngs.get(p.id)! })), (n) => path.join(dir, `${g}-${n}.png`));
  }
  console.log(`published ${published.length} models`);
}

function writeReport(published: Published[], rejected: Array<[string, string]>): void {
  const bytes = published.map((p) => p.bytes).sort((a, b) => a - b);
  const kb = (b: number) => `${Math.round(b / 1024)} Ko`;
  const count = (key: (p: Published) => string) => {
    const m = new Map<string, number>();
    for (const p of published) m.set(key(p), (m.get(key(p)) ?? 0) + 1);
    return [...m].sort((a, b) => b[1] - a[1]).map(([k, n]) => `| ${k} | ${n} |`).join('\n');
  };
  const reasons = new Map<string, number>();
  for (const [, r] of rejected) {
    const k = r.replace(/:.*/, '').replace(/ of .*/, '');
    reasons.set(k, (reasons.get(k) ?? 0) + 1);
  }
  const md = `# Modèles 3D publiés

Généré par \`tools/models/publish.ts\`.

- Objets publiés : ${published.length}
- Poids total des GLB : ${kb(bytes.reduce((s, b) => s + b, 0))}, médiane ${kb(bytes[Math.floor(bytes.length / 2)] ?? 0)}, maximum ${kb(bytes.at(-1) ?? 0)}

## Par source

| Source | Objets |
|---|---|
${count((p) => p.credit.library)}

## Par catégorie

| Catégorie | Objets |
|---|---|
${count((p) => p.category)}

## Écartés (${rejected.length})

| Raison | Nombre |
|---|---|
${[...reasons].sort((a, b) => b[1] - a[1]).map(([k, n]) => `| ${k} | ${n} |`).join('\n')}

<details><summary>Détail</summary>

${rejected.map(([ref, r]) => `- \`${ref}\` : ${r}`).join('\n')}

</details>
`;
  writeFileSync(path.join(ROOT, 'report.md'), md);
}

if (process.argv[1] === import.meta.filename) await main();
