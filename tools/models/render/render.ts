/*
 * Renders models to PNG/WebP with three.js in headless Chromium (Playwright): the icons of the
 * catalog and the contact sheets used to triage the staged models. A model that fails to load or
 * renders (almost) nothing is reported, never shipped.
 *   node render/render.ts            contact sheets of every staged model (stage/sheets/)
 */
import { createReadStream, existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { chromium } from 'playwright';
import sharp, { type OverlayOptions } from 'sharp';
import type { StagedItem } from '../lib/types.ts';

const ROOT = path.resolve(import.meta.dirname, '..');
const STAGE = path.join(ROOT, 'stage');
const MIN_COVERAGE = 0.01;

export interface RenderJob {
  /** Absolute path of the GLB. */
  glb: string;
  /** Size (cm) the model is shown at. */
  w: number;
  h: number;
  d: number;
}
export interface RenderResult { png: Buffer | null; reason?: string }

const TYPES: Record<string, string> = { '.html': 'text/html', '.js': 'text/javascript', '.glb': 'model/gltf-binary', '.wasm': 'application/wasm' };

/** Renders every job; results in the same order. */
export async function renderAll(jobs: RenderJob[], onProgress?: (n: number) => void): Promise<RenderResult[]> {
  const files = new Map<string, string>();
  const server = http.createServer((req, res) => {
    const url = decodeURIComponent((req.url ?? '/').split('?')[0]!);
    let file: string | undefined;
    if (url === '/') file = path.join(import.meta.dirname, 'page.html');
    else if (url.startsWith('/three/')) file = path.join(ROOT, 'node_modules', 'three', url.slice(7));
    else if (url.startsWith('/model/')) file = files.get(url.slice(7));
    if (!file || !file.startsWith(ROOT) || !existsSync(file) || !statSync(file).isFile()) {
      res.writeHead(404).end();
      return;
    }
    res.writeHead(200, { 'content-type': TYPES[path.extname(file)] ?? 'application/octet-stream' });
    createReadStream(file).pipe(res);
  });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  const port = (server.address() as { port: number }).port;
  const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const page = await browser.newPage();
  await page.goto(`http://127.0.0.1:${port}/`);
  await page.waitForFunction(() => (window as unknown as { ready?: boolean }).ready === true);
  const out: RenderResult[] = [];
  try {
    for (const [i, job] of jobs.entries()) {
      files.set(String(i), job.glb);
      try {
        const r = await page.evaluate(
          ([url, w, h, d]) => (window as unknown as { renderModel: (u: string, w: number, h: number, d: number) => Promise<{ data: string; coverage: number }> }).renderModel(url, w, h, d),
          [`/model/${i}`, job.w, job.h, job.d] as [string, number, number, number],
        );
        if (r.coverage < MIN_COVERAGE) out.push({ png: null, reason: `empty render (${(r.coverage * 100).toFixed(2)} %)` });
        else out.push({ png: Buffer.from(r.data.split(',')[1]!, 'base64') });
      } catch (e) {
        out.push({ png: null, reason: `render failed: ${(e as Error).message.split('\n')[0]}` });
      }
      onProgress?.(i + 1);
    }
  } finally {
    await browser.close();
    server.close();
  }
  return out;
}

/** Contact sheets of labeled renders, `cols` x `rows` per page. */
export async function contactSheets(items: Array<{ label: string; png: Buffer | null }>, file: (page: number) => string, cols = 10, rows = 10): Promise<number> {
  const cell = 128, label = 14;
  let pages = 0;
  for (let p = 0; p * cols * rows < items.length; p++) {
    const slice = items.slice(p * cols * rows, (p + 1) * cols * rows);
    const composites: OverlayOptions[] = [];
    for (const [i, it] of slice.entries()) {
      const x = (i % cols) * cell, y = Math.floor(i / cols) * (cell + label);
      if (it.png) composites.push({ input: await sharp(it.png).resize(cell, cell).toBuffer(), left: x, top: y });
      const esc = it.label.replace(/&/g, '&amp;').replace(/</g, '&lt;');
      composites.push({ input: Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${cell}" height="${label}"><text x="2" y="${label - 3}" font-family="Helvetica" font-size="9" fill="#000">${esc}</text></svg>`), left: x, top: y + cell });
    }
    await sharp({ create: { width: cols * cell, height: rows * (cell + label), channels: 3, background: '#f4f4f4' } }).composite(composites).png().toFile(file(p + 1));
    pages++;
  }
  return pages;
}

/** Size (cm) a staged model is shown at before curation: the source size, else its natural proportions. */
export function stagedSize(s: StagedItem): { w: number; h: number; d: number } {
  if (s.width && s.depth && s.height) return { w: s.width, h: s.height, d: s.depth };
  const n = s.natural!;
  const k = s.source === 'polyhaven' ? 100 : 100 / Math.max(n.w, n.h, n.d); // Kenney, Quaternius: not metric
  return { w: n.w * k, h: n.h * k, d: n.d * k };
}

async function main(): Promise<void> {
  const index: StagedItem[] = JSON.parse(readFileSync(path.join(STAGE, 'index.json'), 'utf8'));
  const ok = index.filter((s) => s.ok);
  const results = await renderAll(
    ok.map((s) => ({ glb: path.join(STAGE, s.glb!), ...stagedSize(s) })),
    (n) => n % 100 === 0 && console.log(`  ${n} / ${ok.length}`),
  );
  const sheets = path.join(STAGE, 'sheets');
  mkdirSync(sheets, { recursive: true });
  const groups = new Map<string, Array<{ label: string; png: Buffer | null }>>();
  ok.forEach((s, i) => {
    const r = results[i]!;
    s.rendered = r.png !== null;
    if (!r.png) {
      s.ok = false;
      s.reason = r.reason;
    }
    const g = s.source === 'sh3d' ? `sh-${s.library}` : s.source;
    const list = groups.get(g) ?? [];
    list.push({ label: s.key, png: r.png });
    groups.set(g, list);
  });
  for (const [g, items] of groups) console.log(`${g}: ${await contactSheets(items, (p) => path.join(sheets, `${g}-${p}.png`))} sheets`);
  writeFileSync(path.join(STAGE, 'index.json'), JSON.stringify(index, null, 1));
  const failed = ok.filter((s) => !s.ok);
  console.log(`rendered ${ok.length - failed.length}, failed ${failed.length}`);
  for (const f of failed) console.log(`  ${f.source}/${f.library}/${f.key}: ${f.reason}`);
}

if (process.argv[1] === import.meta.filename) await main();
